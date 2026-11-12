"""Resolve video links into local glagol playback commands."""

from __future__ import annotations

import base64
import ipaddress
import json
import logging
import re
import socket
from typing import Any
from urllib.parse import urlparse

import aiohttp
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

RUTUBE_RE = re.compile(r"rutube\.ru/(?:video|shorts)/([0-9a-fA-F]{32})")
DIRECT_RE = re.compile(r"\.(mp4|m3u8|webm|mov)(?:$|[?#])", re.IGNORECASE)

VIDEO_PROVIDERS: dict[str, re.Pattern[str]] = {
    "ivi": re.compile(r"ivi\.ru/(?:watch|series|movie)/([^/?#]+)"),
    "okko": re.compile(r"okko\.tv/(?:movie|serial|anime|sport)/([^/?#]+)"),
    "wink": re.compile(r"wink\.ru/(?:movies|series|tv|cartoons|doc)/([^/?#]+)"),
    "start": re.compile(r"start\.ru/(?:watch|series|movie)/([^/?#]+)"),
    "premier": re.compile(r"premier\.one/(?:show|movies|series)/([^/?#]+)"),
}

DESCRIPTOR_PAYLOAD = {
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "bass_action",
        "payload": {
            "data": {
                "video_descriptor": {
                    "provider_item_id": "",
                    "provider_name": "",
                }
            },
            "name": "quasar.play_video_by_descriptor",
        },
    },
}


def _varint(value: int) -> bytes:
    out = bytearray()
    while value >= 0x80:
        out.append(0x80 | (value & 0x7F))
        value >>= 7
    out.append(value)
    return bytes(out)


def _protobuf_strings(data: dict[int, str]) -> bytes:
    out = bytearray()
    for tag, value in data.items():
        raw = value.encode("utf-8")
        out.append((tag << 3) | 2)
        out.extend(_varint(len(raw)))
        out.extend(raw)
    return bytes(out)


def external_command(name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Build the externalCommandBypass payload used by station firmware."""
    data = {1: name, 2: json.dumps(payload, ensure_ascii=False)}
    return {
        "command": "externalCommandBypass",
        "data": base64.b64encode(_protobuf_strings(data)).decode(),
    }


def audio_play_payload(
    url: str,
    title: str,
    subtitle: str = "",
    image: str = "",
    hls: bool = False,
) -> dict[str, Any]:
    """Build an audio_play command for a direct media stream."""
    stream = {
        "url": url,
        "format": "HLS" if hls else "MP3",
        "type": "Track",
    }
    metadata: dict[str, Any] = {}
    if title:
        metadata["title"] = title
    if subtitle:
        metadata["subtitle"] = subtitle
    if image:
        metadata["art_image_url"] = image
    return external_command(
        "audio_play",
        {"stream": stream, "metadata": metadata, "set_pause": False},
    )


def video_descriptor(provider: str, item_id: str) -> dict[str, Any]:
    """Build a video descriptor payload without mutating the template."""
    payload = json.loads(json.dumps(DESCRIPTOR_PAYLOAD))
    descriptor = payload["serverActionEventPayload"]["payload"]["data"][
        "video_descriptor"
    ]
    descriptor["provider_item_id"] = str(item_id)
    descriptor["provider_name"] = provider
    return payload


def is_public_http_url(value: str) -> bool:
    """Reject non-http and obvious local targets before extraction."""
    try:
        parsed = urlparse(value)
    except Exception:  # noqa: BLE001
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
    )


async def async_is_public_http_url(
    hass: HomeAssistant, value: str
) -> bool:
    """Validate a URL and every resolved address before yt-dlp fetches it."""
    if not is_public_http_url(value):
        return False
    host = urlparse(value).hostname
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return True
    try:
        infos = await hass.loop.getaddrinfo(
            host, None, type=socket.SOCK_STREAM
        )
    except OSError:
        return False
    for info in infos:
        address_value = info[4][0]
        try:
            address = ipaddress.ip_address(address_value)
        except ValueError:
            return False
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
        ):
            return False
    return True


async def _async_rutube(
    session: aiohttp.ClientSession, video_id: str
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Resolve a Rutube video through its public play-options API."""
    try:
        async with session.get(
            f"https://rutube.ru/api/play/options/{video_id}/",
            params={"format": "json"},
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://rutube.ru/",
            },
            timeout=aiohttp.ClientTimeout(total=15),
        ) as response:
            if response.status != 200:
                return None, {}
            data = await response.json(content_type=None)
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Rutube resolve failed: %s", err)
        return None, {}

    if not isinstance(data, dict):
        return None, {}
    balancer = data.get("video_balancer")
    stream_url = balancer.get("default") if isinstance(balancer, dict) else None
    if not stream_url:
        stream_url = data.get("video_url")
    if not stream_url:
        return None, {}

    author = data.get("author")
    author_name = author.get("name") if isinstance(author, dict) else ""
    title = str(data.get("title") or "Rutube")
    thumbnail = str(data.get("thumbnail_url") or "")
    payload = audio_play_payload(
        str(stream_url),
        title,
        str(author_name or ""),
        thumbnail,
        ".m3u8" in str(stream_url),
    )
    info = {
        "provider": "rutube",
        "video_id": video_id,
        "title": title,
        "subtitle": str(author_name or ""),
        "thumbnail": thumbnail,
        "url": f"https://rutube.ru/video/{video_id}/",
    }
    return payload, info


def _extract_with_ytdlp(url: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Extract a direct stream URL with yt-dlp (blocking)."""
    try:
        import yt_dlp
    except Exception:  # noqa: BLE001
        return None, {}

    options = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "socket_timeout": 15,
        "format": "best[acodec!=none][vcodec!=none]/best",
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            data = ydl.extract_info(url, download=False)
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("yt-dlp extract failed for %s: %s", url, err)
        return None, {}

    if not isinstance(data, dict):
        return None, {}
    entries = data.get("entries")
    if entries:
        data = next((entry for entry in entries if entry), None)
        if not isinstance(data, dict):
            return None, {}

    stream_url = data.get("url")
    if not stream_url:
        return None, {}
    stream_url = str(stream_url)
    hls = data.get("protocol") in ("m3u8", "m3u8_native") or ".m3u8" in stream_url
    title = str(data.get("title") or "Видео")
    subtitle = str(data.get("uploader") or data.get("channel") or "")
    thumbnail = str(data.get("thumbnail") or "")
    webpage = str(data.get("webpage_url") or url)
    provider = str(data.get("extractor_key") or "video").lower()
    payload = audio_play_payload(
        stream_url, title, subtitle, thumbnail, hls
    )
    info = {
        "provider": provider,
        "video_id": str(data.get("id") or ""),
        "title": title,
        "subtitle": subtitle,
        "thumbnail": thumbnail,
        "url": webpage,
    }
    return payload, info


async def async_resolve_video(
    hass: HomeAssistant, session: aiohttp.ClientSession, value: str
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Resolve Rutube and third-party video links to a station command."""
    rutube = RUTUBE_RE.search(value)
    if rutube:
        payload, info = await _async_rutube(session, rutube.group(1))
        if payload is not None:
            return payload, info

    for provider, pattern in VIDEO_PROVIDERS.items():
        match = pattern.search(value)
        if match:
            item_id = match.group(1)
            return video_descriptor(provider, item_id), {
                "provider": provider,
                "video_id": item_id,
                "title": provider.capitalize(),
                "subtitle": "",
                "thumbnail": "",
                "url": value,
            }

    parsed = urlparse(value)
    if DIRECT_RE.search(parsed.path + "?" + parsed.query):
        title = parsed.path.rsplit("/", 1)[-1] or "Видео"
        hls = ".m3u8" in parsed.path.lower()
        return audio_play_payload(value, title, "", "", hls), {
            "provider": "video",
            "video_id": "",
            "title": title,
            "subtitle": "",
            "thumbnail": "",
            "url": value,
        }

    if await async_is_public_http_url(hass, value):
        payload, info = await hass.async_add_executor_job(
            _extract_with_ytdlp, value
        )
        if payload is not None:
            return payload, info

    return None, {}
