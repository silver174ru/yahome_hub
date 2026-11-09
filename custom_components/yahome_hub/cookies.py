"""Automatic cookie discovery from existing Yandex integrations."""

from __future__ import annotations

import base64
import json
import pickle
import re
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Any

from homeassistant.core import HomeAssistant

COOKIE_DOMAINS = ("yandex_station", "yandex_station_intents")


@dataclass
class FoundCookies:
    """Cookies and tokens found in another Yandex integration."""

    cookies: str = ""
    music_token: str | None = None
    x_token: str | None = None
    source: str | None = None


def _cookie_header_from_object(value: Any) -> str | None:
    """Build a Cookie header from a cookie jar or list of cookies."""
    if isinstance(value, SimpleCookie):
        parts = [
            f"{key}={morsel.value}"
            for key, morsel in value.items()
            if morsel.value
        ]
        return "; ".join(parts) if parts else None

    if isinstance(value, dict):
        parts = []
        for key, item in value.items():
            if hasattr(item, "value"):
                item = item.value
            if item:
                parts.append(f"{key}={item}")
        return "; ".join(parts) if parts else None

    if isinstance(value, (list, tuple)):
        parts = []
        for item in value:
            if isinstance(item, dict):
                name = item.get("name")
                item_value = item.get("value")
                if name and item_value:
                    parts.append(f"{name}={item_value}")
            elif (
                hasattr(item, "name")
                and hasattr(item, "value")
                and item.name
                and item.value
            ):
                parts.append(f"{item.name}={item.value}")
        return "; ".join(parts) if parts else None

    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)):
        parts = []
        try:
            for item in value:
                if (
                    hasattr(item, "name")
                    and hasattr(item, "value")
                    and item.name
                    and item.value
                ):
                    parts.append(f"{item.name}={item.value}")
        except TypeError:
            return None
        return "; ".join(parts) if parts else None

    return None


def _sanitize_cookie_header(header: str | None) -> str | None:
    """Remove control characters and malformed pairs from a Cookie header."""
    if not header:
        return None
    header = header.replace("\r", "").replace("\n", "").replace("\t", "")
    parts: list[str] = []
    for part in header.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        value = re.sub(r"[\x00-\x1f\x7f]", "", value.strip())
        if name:
            parts.append(f"{name}={value}")
    return "; ".join(parts) if parts else None


def decode_cookie_data(value: Any) -> str | None:
    """Decode a cookie value stored by another integration."""
    return _sanitize_cookie_header(_decode_cookie_data(value))


def _decode_cookie_data(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return _cookie_header_from_object(value)

    raw = value.strip()
    if not raw:
        return None

    # Already a Cookie header.
    if "=" in raw and ";" in raw:
        return raw

    # JSON string.
    try:
        header = _cookie_header_from_object(json.loads(raw))
        if header:
            return header
    except (TypeError, ValueError):
        pass

    # Base64-encoded pickle or JSON.
    try:
        decoded = base64.b64decode(raw)
    except (ValueError, TypeError):
        decoded = None

    if decoded:
        # Data comes from Home Assistant's local config entry storage.
        try:
            header = _cookie_header_from_object(pickle.loads(decoded))
            if header:
                return header
        except Exception:  # noqa: BLE001
            pass
        try:
            header = _cookie_header_from_object(
                json.loads(decoded.decode("utf-8"))
            )
            if header:
                return header
        except (UnicodeDecodeError, ValueError, TypeError):
            pass

    # Single cookie pair.
    if "=" in raw:
        return raw
    return None


async def async_find_cookies(
    hass: HomeAssistant,
) -> FoundCookies | None:
    """Find Yandex cookies or tokens in configured Yandex integrations."""
    entries: list[tuple[str, Any]] = []
    for domain in COOKIE_DOMAINS:
        for entry in hass.config_entries.async_entries(domain):
            entries.append((domain, entry))

    # Prefer an integration that actually has cookies.
    for domain, entry in entries:
        data = entry.data or {}
        for key in ("cookie", "cookies"):
            header = decode_cookie_data(data.get(key))
            if header:
                return FoundCookies(
                    cookies=header,
                    music_token=data.get("music_token"),
                    x_token=data.get("x_token"),
                    source=domain,
                )

    # Fall back to a saved speaker token.
    for domain, entry in entries:
        data = entry.data or {}
        music_token = data.get("music_token")
        x_token = data.get("x_token")
        if music_token or x_token:
            return FoundCookies(
                music_token=music_token,
                x_token=x_token,
                source=domain,
            )
    return None
