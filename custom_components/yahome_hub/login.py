"""Yandex Passport login helpers for YaHome Hub."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Any

from aiohttp import ClientError, ClientSession
from yarl import URL

from .const import (
    MOBILE_CLIENT_ID,
    MOBILE_CLIENT_SECRET,
    MUSIC_CLIENT_ID,
    MUSIC_CLIENT_SECRET,
    MUSIC_TOKEN_URL,
    PASSPORT_TOKEN_URL,
)


@dataclass
class LoginResult:
    """Result of a Yandex Passport login."""

    ok: bool = False
    x_token: str | None = None
    display_login: str | None = None
    error: str | None = None


def generate_qr_code(data: str) -> str:
    """Return an inline SVG QR code, when the HA TOTP dependency is present."""
    try:
        from homeassistant.auth.mfa_modules import totp

        return totp._generate_qr_code(data)  # noqa: SLF001
    except Exception:  # noqa: BLE001
        return ""


class YandexLogin:
    """Login to Yandex Passport via QR-code or cookies."""

    def __init__(self, session: ClientSession) -> None:
        self._session = session
        self._auth_headers: dict[str, str] | None = None
        self._auth_json: dict[str, Any] | None = None
        try:
            session.cookie_jar._quote_cookie = False  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass

    def cookie_header(self) -> str:
        """Return a Cookie header with all Yandex cookies from the session."""
        parts: list[str] = []
        try:
            for cookie in self._session.cookie_jar:
                domain = str(cookie.get("domain") or "")
                if domain.endswith(("yandex.ru", "yandex.net", "yandex.com")):
                    parts.append(f"{cookie.key}={cookie.value}")
        except Exception:  # noqa: BLE001
            return ""
        return "; ".join(parts)

    async def get_qr(self) -> str:
        """Create a Yandex QR login link."""
        async with self._session.get(
            "https://passport.yandex.ru/pwl-yandex"
        ) as response:
            if response.status >= 400:
                raise ValueError(f"Passport HTTP {response.status}")
            html = await response.text()

        match = re.search(r'__CSRF__ = "([^"]+)', html)
        if not match:
            raise ValueError("Passport CSRF token not found")
        self._auth_headers = {"X-CSRF-Token": match.group(1)}

        async with self._session.post(
            "https://passport.yandex.ru/pwl-yandex/api/passport/auth/password/submit",
            json={"retpath": "https://passport.yandex.ru/"},
            headers=self._auth_headers,
        ) as response:
            if response.status >= 400:
                raise ValueError(f"Passport HTTP {response.status}")
            self._auth_json = await response.json()

        async with self._session.post(
            "https://passport.yandex.ru/pwl-yandex/api/passport/auth/magic/code",
            data={
                "location_id": "0",
                "magic_track_id": self._auth_json["track_id"],
                "track_id": "",
            },
            headers=self._auth_headers,
        ) as response:
            if response.status >= 400:
                raise ValueError(f"Passport HTTP {response.status}")
            payload = await response.json()

        link = payload.get("link")
        if not link:
            raise ValueError("Passport did not return a QR link")
        return link

    async def login_qr(self) -> LoginResult:
        """Check the QR login state and finish the session."""
        if not self._auth_json or not self._auth_headers:
            return LoginResult(error="qr_not_started")
        try:
            async with self._session.post(
                "https://passport.yandex.ru/pwl-yandex/api/passport/auth/magic/code/status",
                json=self._auth_json,
                headers=self._auth_headers,
            ) as response:
                payload = await response.json()
        except (ClientError, ValueError):
            return LoginResult(error="cannot_connect")

        if payload.get("state") != "otp_auth_finished":
            return LoginResult(error="qr_pending")

        try:
            async with self._session.post(
                "https://passport.yandex.ru/pwl-yandex/api/passport/sessions/get_session",
                data={"track_id": payload["trackId"]},
                headers=self._auth_headers,
            ) as response:
                if response.status >= 400:
                    return LoginResult(error="unauthorised")
        except (ClientError, KeyError, ValueError):
            return LoginResult(error="unauthorised")

        return await self.login_cookies(None)

    async def login_cookies(self, cookies: str | None = None) -> LoginResult:
        """Exchange browser cookies for a Passport x-token."""
        host = "passport.yandex.ru"
        if cookies is None:
            cookies = self.cookie_header()
        elif cookies.strip().startswith("["):
            try:
                raw = json.loads(cookies)
                host = next(
                    item["domain"]
                    for item in raw
                    if str(item.get("domain", "")).startswith(".yandex.")
                )
                cookies = "; ".join(
                    f"{item['name']}={item['value']}" for item in raw
                )
            except (KeyError, StopIteration, ValueError, TypeError):
                return LoginResult(error="cookies")

        if not cookies:
            return LoginResult(error="cookies")

        try:
            parsed = SimpleCookie()
            parsed.load(cookies)
            for morsel in parsed.values():
                morsel["domain"] = ".yandex.ru"
                morsel["path"] = "/"
            self._session.cookie_jar.update_cookies(
                parsed, response_url=URL("https://yandex.ru")
            )
        except Exception:  # noqa: BLE001
            pass

        try:
            async with self._session.post(
                PASSPORT_TOKEN_URL,
                data={
                    "client_id": MOBILE_CLIENT_ID,
                    "client_secret": MOBILE_CLIENT_SECRET,
                },
                headers={"Ya-Client-Host": host, "Ya-Client-Cookie": cookies},
            ) as response:
                payload = await response.json(content_type=None)
        except (ClientError, ValueError):
            return LoginResult(error="cannot_connect")

        x_token = payload.get("access_token") if isinstance(payload, dict) else None
        if not x_token:
            return LoginResult(error="cookies")
        return await self.validate_token(x_token)

    async def validate_token(self, x_token: str) -> LoginResult:
        """Validate an x-token and return the Yandex login."""
        try:
            async with self._session.get(
                "https://mobileproxy.passport.yandex.net/1/bundle/account/short_info/",
                params={"avatar_size": "islands-300"},
                headers={"Authorization": f"OAuth {x_token}"},
            ) as response:
                payload = await response.json(content_type=None)
        except (ClientError, ValueError):
            return LoginResult(error="cannot_connect")

        if not isinstance(payload, dict) or payload.get("status") != "ok":
            return LoginResult(error="invalid_auth")
        return LoginResult(
            ok=True,
            x_token=x_token,
            display_login=payload.get("display_login"),
        )

    async def get_music_token(self, x_token: str) -> str | None:
        """Exchange a Passport x-token for a music/glagol token."""
        try:
            async with self._session.post(
                MUSIC_TOKEN_URL,
                data={
                    "client_id": MUSIC_CLIENT_ID,
                    "client_secret": MUSIC_CLIENT_SECRET,
                    "grant_type": "x-token",
                    "access_token": x_token,
                },
            ) as response:
                payload = await response.json(content_type=None)
        except (ClientError, ValueError):
            return None
        if isinstance(payload, dict):
            token = payload.get("access_token")
            return token if isinstance(token, str) else None
        return None
