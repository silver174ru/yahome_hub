"""Stable HTTP proxy for Yandex Music and arbitrary audio/HLS URLs."""

from __future__ import annotations

import asyncio
import logging
import re
import secrets
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlparse

import aiohttp
import jwt
from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.components.media_player import async_process_play_media_url
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.network import NoURLAvailableError, get_url

from .const import DOMAIN
from .music import MusicStreamError, MusicStreamInfo, async_get_track_stream

_LOGGER = logging.getLogger(__name__)
STREAM_PATH = f"/api/{DOMAIN}/stream"
REGISTRY_KEY = "stream_registry"

MIME_TYPES = {
    "flac": "audio/x-flac",
    "aac": "audio/aac",
    "he.aac": "audio/aac",
    "mp3": "audio/mpeg",
    "flac.mp4": "audio/mp4",
    "aac.mp4": "audio/mp4",
    "he.aac.mp4": "audio/mp4",
    "m3u8": "application/vnd.apple.mpegurl",
    "ts": "video/MP2T",
    "gif": "image/gif",
    "mp4": "video/mp4",
    "wav": "audio/wav",
}
CONTENT_TYPES = {
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/x-flac": "flac",
    "application/vnd.apple.mpegurl": "m3u8",
    "application/x-mpegurl": "m3u8",
}
REQUEST_HEADERS = ("Range",)
RESPONSE_HEADERS = ("Accept-Ranges", "Content-Length", "Content-Range")


def get_ext(url: str) -> str | None:
    """Return a file extension from a URL path."""
    path = urlparse(url).path
    match = re.search(r"\.([a-z0-9]{3,4})$", path, re.IGNORECASE)
    return match.group(1).lower() if match else None


def get_content_type(url: str) -> str:
    """Return a MIME type for an extension."""
    ext = get_ext(url) or "mp3"
    return MIME_TYPES.get(ext, "audio/mpeg")


@dataclass
class StreamProxyEntry:
    """One track or arbitrary URL exposed behind a stable local URL."""

    track_id: str = ""
    music_token: str = ""
    quality: str = "high"
    codecs: str = "mp3"
    url: str = ""
    ext: str = "mp3"
    title: str = ""
    info: MusicStreamInfo | None = None
    created_at: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class StreamProxyRegistry:
    """In-memory registry of unguessable proxy tokens and signed URLs."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.entries: dict[str, StreamProxyEntry] = {}
        self.key = secrets.token_hex(32)

    def _prune(self) -> None:
        """Drop stale entries to keep memory bounded."""
        if len(self.entries) < 512:
            return
        cutoff = time.time() - 7200
        for token, entry in list(self.entries.items()):
            if entry.created_at < cutoff:
                self.entries.pop(token, None)

    def create(
        self,
        track_id: str,
        music_token: str,
        title: str = "",
        ext: str = "mp3",
        quality: str = "high",
        codecs: str = "mp3",
    ) -> str:
        """Register a Yandex Music track and return its random token."""
        self._prune()
        token = secrets.token_urlsafe(24)
        self.entries[token] = StreamProxyEntry(
            track_id=str(track_id),
            music_token=music_token,
            quality=quality,
            codecs=codecs,
            title=title,
            ext=ext,
        )
        return token

    def create_url(
        self, url: str, ext: str | None = None, title: str = ""
    ) -> str:
        """Register an arbitrary URL and return its random token."""
        self._prune()
        token = secrets.token_urlsafe(24)
        self.entries[token] = StreamProxyEntry(
            url=url,
            ext=(ext or get_ext(url) or "mp3").lower(),
            title=title,
        )
        return token

    def create_jwt(
        self, url: str, ext: str | None = None, expires: int = 3600
    ) -> str:
        """Create a signed URL token for HLS playlists and segments."""
        ext = (ext or get_ext(url) or "mp3").lower()
        payload: dict[str, str | int] = {"url": url, "ext": ext}
        if expires:
            payload["exp"] = int(time.time()) + expires
        token = jwt.encode(payload, self.key, algorithm="HS256")
        return self.url_for_token(token, ext)

    def get(self, token: str) -> StreamProxyEntry | None:
        """Return a registry entry."""
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
        """Return a cached or freshly resolved Yandex Music URL."""
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
                quality=entry.quality,
                codecs=entry.codecs,
            )
            return entry.info

    def url(self, token: str) -> str:
        """Build a device-facing proxy URL for a registry entry."""
        entry = self.entries.get(token)
        ext = entry.ext if entry else "mp3"
        return self.url_for_token(token, ext)

    def url_for_token(self, token: str, ext: str) -> str:
        """Build a device-facing proxy URL for any token."""
        base = _base_url(self.hass)
        return f"{base}{STREAM_PATH}/{token}/stream.{ext}"


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
    """Serve stable URLs, refresh Yandex URLs and rewrite HLS playlists."""

    url = f"{STREAM_PATH}/{{token}}/{{filename}}"
    name = f"api:{DOMAIN}:stream"
    requires_auth = False
    cors_allowed = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.session = async_get_clientsession(hass)

    async def _resolve(
        self, registry: StreamProxyRegistry, token: str
    ) -> tuple[str, str, StreamProxyEntry | None] | None:
        """Resolve a registry token or a signed JWT to an upstream URL."""
        entry = registry.get(token)
        if entry is not None:
            if entry.track_id:
                info = await registry.async_get_info(entry)
                return info.url, info.ext, entry
            return entry.url, entry.ext, entry
        try:
            payload = jwt.decode(token, registry.key, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return None
        url = str(payload.get("url") or "")
        ext = str(payload.get("ext") or get_ext(url) or "mp3").lower()
        if not url.startswith(("http://", "https://", "/")):
            return None
        return url, ext, None

    async def _hls(
        self, registry: StreamProxyRegistry, url: str
    ) -> str:
        """Rewrite HLS playlist entries through the proxy."""
        if url.startswith("/"):
            url = async_process_play_media_url(self.hass, url)
        async with self.session.get(
            url, timeout=aiohttp.ClientTimeout(total=20)
        ) as response:
            text = await response.text()
            base = str(response.url)
        lines: list[str] = []
        for line in text.splitlines():
            item = line.strip()
            if not item or item.startswith("#"):
                lines.append(line)
                continue
            absolute = urljoin(base, item)
            ext = get_ext(absolute) or "ts"
            lines.append(registry.create_jwt(absolute, ext))
        return "\n".join(lines)

    async def get(
        self, request: web.Request, token: str, filename: str
    ) -> web.StreamResponse:
        """Proxy a GET or HEAD request with Range support."""
        registry = async_get_registry(self.hass)
        try:
            resolved = await self._resolve(registry, token)
        except (MusicStreamError, aiohttp.ClientError, asyncio.TimeoutError):
            return web.Response(status=502, text="Stream unavailable")
        if resolved is None:
            return web.Response(status=404, text="Stream not found")
        url, ext, entry = resolved

        if ext in ("m3u8", "m3u"):
            try:
                body = await self._hls(registry, url)
            except (aiohttp.ClientError, asyncio.TimeoutError):
                return web.Response(status=502, text="Playlist unavailable")
            return web.Response(
                body=body,
                headers={
                    "Content-Type": MIME_TYPES["m3u8"],
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store",
                },
            )

        headers: dict[str, str] = {}
        if range_header := request.headers.get("Range"):
            headers["Range"] = range_header

        async def _open() -> aiohttp.ClientResponse:
            if url.startswith("/"):
                target = async_process_play_media_url(self.hass, url)
            else:
                target = url
            return await self.session.get(
                target,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60),
            )

        try:
            upstream = await _open()
            if upstream.status in (401, 403, 410) and entry is not None:
                upstream.release()
                registry.invalidate(entry)
                info = await registry.async_get_info(entry, force=True)
                url, ext = info.url, info.ext
                upstream = await _open()
        except (
            aiohttp.ClientError,
            asyncio.TimeoutError,
            MusicStreamError,
        ) as err:
            _LOGGER.warning("Stream proxy failed: %s", err)
            return web.Response(status=502, text="Stream unavailable")

        async with upstream:
            if upstream.status not in (200, 206):
                _LOGGER.warning(
                    "Stream upstream HTTP %s", upstream.status
                )
                return web.Response(status=502, text="Stream unavailable")

            response_headers = {
                "Content-Type": MIME_TYPES.get(ext, "audio/mpeg"),
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            }
            for name in RESPONSE_HEADERS:
                if value := upstream.headers.get(name):
                    response_headers[name] = value

            if request.method == "HEAD":
                return web.Response(
                    status=upstream.status,
                    headers={
                        key: value
                        for key, value in response_headers.items()
                        if key != "Content-Length"
                    },
                )

            response = web.StreamResponse(
                status=upstream.status, headers=response_headers
            )
            response.force_close()
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
