"""HTTP clients for Yandex IoT and Quasar APIs."""

from __future__ import annotations

import asyncio
import re
from typing import Any

from aiohttp import ClientError, ClientSession

from .const import (
    API_BASE,
    MOBILE_CLIENT_ID,
    MOBILE_CLIENT_SECRET,
    MUSIC_CLIENT_ID,
    MUSIC_CLIENT_SECRET,
    MUSIC_TOKEN_URL,
    PASSPORT_TOKEN_URL,
    QUASAR_BASE,
    QUASAR_IOT_BASE,
)


class YahomeError(Exception):
    """Base error for YaHome Hub."""


class YahomeAuthError(YahomeError):
    """Raised when Yandex rejects the token or cookies."""


class YahomeApiError(YahomeError):
    """Raised for non-auth API errors."""


def _clean_cookies(cookies: str | None) -> str:
    """Normalize a pasted Cookie header."""
    if not cookies:
        return ""
    value = cookies.strip()
    if value.lower().startswith("cookie:"):
        value = value.split(":", 1)[1].strip()
    return value


async def exchange_cookies_for_tokens(
    session: ClientSession, cookies: str
) -> tuple[str, str]:
    """Exchange Yandex browser cookies for x-token and music/glagol token.

    The flow mirrors the official mobile application:
    cookies -> passport x-token -> music/glagol OAuth token.
    """
    cookie_header = _clean_cookies(cookies)
    if not cookie_header:
        raise YahomeAuthError("Empty cookies")

    headers = {
        "Ya-Client-Host": "passport.yandex.ru",
        "Ya-Client-Cookie": cookie_header,
        "Accept": "application/json",
    }
    try:
        async with asyncio.timeout(30):
            async with session.post(
                PASSPORT_TOKEN_URL,
                headers=headers,
                data={
                    "client_id": MOBILE_CLIENT_ID,
                    "client_secret": MOBILE_CLIENT_SECRET,
                },
            ) as response:
                if response.status in (401, 403):
                    raise YahomeAuthError("Cookies rejected by passport")
                if response.status >= 400:
                    body = (await response.text())[:300]
                    raise YahomeApiError(
                        f"Passport HTTP {response.status}: {body}"
                    )
                payload = await response.json(content_type=None)
    except ClientError as err:
        raise YahomeApiError(f"Passport connection error: {err}") from err

    x_token = payload.get("access_token")
    if not x_token:
        raise YahomeAuthError("Passport did not return an x-token")

    try:
        async with asyncio.timeout(30):
            async with session.post(
                MUSIC_TOKEN_URL,
                data={
                    "client_id": MUSIC_CLIENT_ID,
                    "client_secret": MUSIC_CLIENT_SECRET,
                    "grant_type": "x-token",
                    "access_token": x_token,
                },
            ) as response:
                if response.status in (401, 403):
                    raise YahomeAuthError("x-token rejected by music OAuth")
                if response.status >= 400:
                    body = (await response.text())[:300]
                    raise YahomeApiError(
                        f"Music OAuth HTTP {response.status}: {body}"
                    )
                payload = await response.json(content_type=None)
    except ClientError as err:
        raise YahomeApiError(f"Music OAuth connection error: {err}") from err

    music_token = payload.get("access_token")
    if not music_token:
        raise YahomeAuthError("Music OAuth did not return a token")

    return x_token, music_token


class YandexIoTClient:
    """Minimal client for https://api.iot.yandex.net/v1.0."""

    def __init__(self, session: ClientSession, token: str) -> None:
        self._session = session
        self._token = token

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }
        headers.update(kwargs.pop("headers", {}))
        try:
            async with asyncio.timeout(30):
                async with self._session.request(
                    method,
                    f"{API_BASE}{path}",
                    headers=headers,
                    **kwargs,
                ) as response:
                    if response.status in (401, 403):
                        raise YahomeAuthError("Yandex IoT token rejected")
                    if response.status >= 400:
                        body = await response.text()
                        raise YahomeApiError(
                            f"Yandex IoT HTTP {response.status}: {body[:300]}"
                        )
                    if response.status == 204:
                        return {}
                    return await response.json(content_type=None)
        except ClientError as err:
            raise YahomeApiError(f"Yandex IoT connection error: {err}") from err

    async def get_user_info(self) -> dict[str, Any]:
        return await self._request("GET", "/user/info")

    async def get_device(self, device_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/devices/{device_id}")

    async def send_actions(self, devices: list[dict[str, Any]]) -> Any:
        return await self._request(
            "POST", "/devices/actions", json={"devices": devices}
        )

    async def send_device_actions(
        self, device_id: str, actions: list[dict[str, Any]]
    ) -> Any:
        return await self._request(
            "POST", f"/devices/{device_id}/actions", json={"actions": actions}
        )

    async def execute_scenario(self, scenario_id: str) -> Any:
        return await self._request(
            "POST", f"/scenarios/{scenario_id}/actions", json={}
        )


class YandexQuasarClient:
    """Client for Quasar speaker discovery and Station-local configuration.

    glagol endpoints use the music OAuth token. The internal
    iot.quasar.yandex.ru endpoints require browser cookies and a CSRF token.
    """

    def __init__(
        self, session: ClientSession, music_token: str, cookies: str | None = None
    ) -> None:
        self._session = session
        self._music_token = music_token
        self._cookies = _clean_cookies(cookies)
        self._csrf: str | None = None

    @property
    def can_read_configuration(self) -> bool:
        """Return True when cookies are available for internal Quasar calls."""
        return bool(self._cookies)

    def _headers(self, url: str, *, json_body: bool = False) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        }
        if "quasar.yandex.net" in url:
            headers["Authorization"] = f"OAuth {self._music_token}"
        else:
            if self._cookies:
                headers["Cookie"] = self._cookies
            headers["Referer"] = "https://quasar.yandex.ru/"
            headers["Origin"] = "https://quasar.yandex.ru"
        if json_body:
            headers["Content-Type"] = "application/json"
        return headers

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json: Any = None,
        need_csrf: bool = False,
    ) -> Any:
        headers = self._headers(url, json_body=json is not None)
        if need_csrf and self._cookies:
            csrf = await self._get_csrf()
            if csrf:
                headers["x-csrf-token"] = csrf

        try:
            async with asyncio.timeout(30):
                async with self._session.request(
                    method, url, headers=headers, json=json
                ) as response:
                    if response.status in (401, 403):
                        self._csrf = None
                        raise YahomeAuthError("Quasar request rejected")
                    if response.status >= 400:
                        body = await response.text()
                        raise YahomeApiError(
                            f"Quasar HTTP {response.status}: {body[:300]}"
                        )
                    content_type = response.headers.get("Content-Type", "")
                    if "json" in content_type:
                        return await response.json(content_type=None)
                    return await response.text()
        except ClientError as err:
            raise YahomeApiError(f"Quasar connection error: {err}") from err

    async def _get_csrf(self) -> str | None:
        if self._csrf:
            return self._csrf
        if not self._cookies:
            return None
        try:
            async with asyncio.timeout(20):
                async with self._session.get(
                    "https://yandex.ru/iot",
                    headers={
                        "Cookie": self._cookies,
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/131.0.0.0 Safari/537.36"
                        ),
                    },
                ) as response:
                    html = await response.text()
        except ClientError as err:
            raise YahomeApiError(f"CSRF request failed: {err}") from err
        match = re.search(r'"csrfToken2"\s*:\s*"(.+?)"', html)
        if match:
            self._csrf = match.group(1)
        return self._csrf

    async def get_speakers(self) -> list[dict[str, Any]]:
        """Return all speakers available to the account."""
        payload = await self._request(
            "GET", f"{QUASAR_BASE}/glagol/device_list"
        )
        if not isinstance(payload, dict):
            return []
        devices = payload.get("devices")
        return devices if isinstance(devices, list) else []

    async def get_glagol_token(self, device_id: str, platform: str) -> str | None:
        """Return a local glagol token for a speaker."""
        payload = await self._request(
            "GET",
            f"{QUASAR_BASE}/glagol/token"
            f"?device_id={device_id}&platform={platform}",
        )
        if isinstance(payload, dict):
            token = payload.get("token")
            return token if isinstance(token, str) else None
        return None

    async def get_configuration(self, device_id: str) -> dict[str, Any] | None:
        """Return Station configuration including child_items."""
        if not self._cookies:
            return None
        payload = await self._request(
            "GET",
            f"{QUASAR_IOT_BASE}/m/v2/user/devices/{device_id}/configuration",
        )
        return payload if isinstance(payload, dict) else None

    async def send_actions(
        self, device_id: str, actions: list[dict[str, Any]]
    ) -> Any:
        """Send actions to a Station through the internal Quasar API."""
        if not self._cookies:
            raise YahomeAuthError(
                "Cookies are required for Station actions"
            )
        return await self._request(
            "POST",
            f"{QUASAR_IOT_BASE}/m/v3/user/devices/{device_id}/actions",
            json={"actions": actions},
            need_csrf=True,
        )
