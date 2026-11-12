"""Stable, short HTTP proxy for Yandex Music streams."""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import NoURLAvailableError, get_url

from .const import DOMAIN
from .music import MusicStreamError, MusicStreamInfo, async_get_track_stream

_LOGGER = logging.getLogger(__name__)
STREAM_PATH = f"/api/{DOMAIN}/stream"
REGISTRY_KEY = "stream_registry"


@dataclass
class StreamProxyEntry:
    """One track exposed behind a stable local URL."""

    track_id: str
    music_token: str
    title: str = ""
    info: MusicStreamInfo | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class StreamProxyRegistry:
    """In-memory registry of unguessable proxy tokens."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.entries: dict[str, StreamProxyEntry] = {}

    def create(
        self, track_id: str, music_token: str, title: str = ""
    ) -> str:
        """Register a track and return its random token."""
        token = secrets.token_urlsafe(24)
        self.entries[token] = StreamProxyEntry(
            track_id=str(track_id),
            music_token=music_token,
            title=title,
        )
        return token

    def get(self, token: str) -> StreamProxyEntry | None:
        """Return a token entry."""
        return self.entries.get(token)

    def remove(self, token: str) -> None:
        """Forget a token."""
        self.entries.pop(token, None)

    def invalidate(self, entry: StreamProxyEntry) -> None:
        """Force the next request to resolve a fresh CDN URL."""
        entry.info = None

    async def async_get_info(
        self, entry: StreamProxyEntry, *, force: bool = False
    ) -> MusicStreamInfo:
        """Return a cached or freshly resolved upstream URL."""
        now = time.time()
        if not force and entry.info and entry.info.expires_at > now + 3:
            return entry.info
        async with entry.lock:
            now = time.time()
            if not force and entry.info and entry.info.expires_at > now + 3:
                return entry.info
            entry.info = await async_get_track_stream(
                async_get_clientsession(self.hass),
                entry.track_id,
                entry.music_token,
            )
            return entry.info

    def url(self, token: str) -> str:
        """Build the device-facing proxy URL."""
        base = _base_url(self.hass)
        return f"{base}{STREAM_PATH}/{token}/track.mp3"


def async_get_registry(hass: HomeAssistant) -> StreamProxyRegistry:
    """Return the process-wide registry, creating it on first use."""
    data = hass.data.setdefault(DOMAIN, {})
    registry = data.get(REGISTRY_KEY)
    if not isinstance(registry, StreamProxyRegistry):
        registry = StreamProxyRegistry(hass)
        data[REGISTRY_KEY] = registry
    return registry


def _base_url(hass: HomeAssistant) -> str:
    """Return an address that LAN media players can reach."""
    try:
        return get_url(
            hass,
            prefer_external=False,
            allow_internal=True,
            allow_cloud=False,
            allow_ip=True,
        ).rstrip("/")
    except NoURLAvailableError:
        pass
    try:
        return get_url(
            hass,
            prefer_external=True,
            allow_internal=True,
            allow_cloud=True,
            allow_ip=True,
        ).rstrip("/")
    except NoURLAvailableError:
        api = getattr(hass.config, "api", None)
        local_ip = getattr(api, "local_ip", None)
        port = getattr(api, "port", 8123)
        if local_ip:
            return f"http://{local_ip}:{port}"
    raise MusicStreamError(
        "Home Assistant has no internal or external URL for media playback"
    )


class StreamProxyView(HomeAssistantView):
    """Serve a stable URL and refresh the upstream Yandex URL on demand."""

    url = f"{STREAM_PATH}/{{token}}/{{filename}}"
    name = f"api:{DOMAIN}:stream"
    requires_auth = False
    cors_allowed = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(
        self, request: web.Request, token: str, filename: str
    ) -> web.StreamResponse:
        """Proxy a GET or HEAD request with Range support."""
        registry = async_get_registry(self.hass)
        entry = registry.get(token)
        if entry is None:
            return web.Response(status=404, text="Stream not found")

        session = async_get_clientsession(self.hass)
        headers: dict[str, str] = {}
        range_header = request.headers.get("Range")
        if range_header:
            headers["Range"] = range_header

        try:
            info = await registry.async_get_info(entry)
            upstream = await session.get(
                info.url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=30),
            )
            if upstream.status in (401, 403, 410):
                upstream.release()
                info = await registry.async_get_info(entry, force=True)
                upstream = await session.get(
                    info.url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                )
        except (aiohttp.ClientError, asyncio.TimeoutError, MusicStreamError) as err:
            _LOGGER.warning(
                "Stream proxy failed for track %s: %s", entry.track_id, err
            )
            return web.Response(status=502, text="Stream unavailable")

        async with upstream:
            if upstream.status not in (200, 206):
                _LOGGER.warning(
                    "Stream upstream HTTP %s for track %s",
                    upstream.status,
                    entry.track_id,
                )
                return web.Response(status=502, text="Stream unavailable")

            response_headers = {
                "Content-Type": "audio/mpeg",
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            }
            content_length = upstream.headers.get("Content-Length")
            if content_length:
                response_headers["Content-Length"] = content_length
            content_range = upstream.headers.get("Content-Range")
            if content_range:
                response_headers["Content-Range"] = content_range

            response = web.StreamResponse(
                status=upstream.status, headers=response_headers
            )
            if request.method == "HEAD":
                return web.Response(
                    status=upstream.status,
                    headers={
                        key: value
                        for key, value in response_headers.items()
                        if key != "Content-Length"
                    },
                )
            await response.prepare(request)
            try:
                async for chunk in upstream.content.iter_chunked(64 * 1024):
                    await response.write(chunk)
                await response.write_eof()
            except (ConnectionResetError, asyncio.CancelledError):
                pass
            return response

    async def head(
        self, request: web.Request, token: str, filename: str
    ) -> web.StreamResponse:
        """Answer HEAD without downloading the body."""
        return await self.get(request, token, filename)
