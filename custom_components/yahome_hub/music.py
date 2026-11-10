"""Yandex Music helpers used by the speaker lyrics camera."""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Any

from aiohttp import ClientError, ClientSession

MUSIC_API = "https://api.music.yandex.net"
MUSIC_HEADERS = {"X-Yandex-Music-Client": "YandexMusicAndroid/24023621"}
SIGN_KEY = b"p93jhgh689SBReK6ghtw62"


def _sign(*parts: Any) -> str:
    """Build the short-lived signature required by the lyrics endpoint."""
    message = "".join(str(part) for part in parts).replace(",", "").encode()
    digest = hmac.new(SIGN_KEY, message, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


async def async_search_tracks(
    session: ClientSession,
    query: str,
    music_token: str | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Search Yandex Music tracks and return lightweight results."""
    query = str(query or "").strip()
    if not query:
        return []
    headers = dict(MUSIC_HEADERS)
    if music_token:
        headers["Authorization"] = f"OAuth {music_token}"
    try:
        async with session.get(
            f"{MUSIC_API}/search",
            params={
                "text": query,
                "type": "track",
                "page": 0,
                "nocorrect": "false",
            },
            headers=headers,
        ) as response:
            if response.status != 200:
                return []
            payload = await response.json(content_type=None)
    except (ClientError, ValueError):
        return []
    result = payload.get("result") if isinstance(payload, dict) else None
    tracks = ((result or {}).get("tracks") or {}).get("results") or []
    items: list[dict[str, Any]] = []
    for track in tracks[: max(1, int(limit))]:
        artists = ", ".join(
            artist.get("name", "") for artist in track.get("artists") or []
        )
        albums = track.get("albums") or []
        album = albums[0].get("title", "") if albums else ""
        cover = track.get("coverUri") or ""
        if cover and "://" not in cover:
            cover = "https://" + cover.replace("%%", "400x400")
        items.append(
            {
                "id": str(track.get("id")),
                "title": track.get("title") or "",
                "artist": artists,
                "album": album,
                "duration": int((track.get("durationMs") or 0) / 1000),
                "cover": cover,
            }
        )
    return items


async def async_get_lyrics(
    session: ClientSession,
    track_id: str,
    music_token: str | None = None,
) -> str | None:
    """Return plain or LRC lyrics for a Yandex Music track."""
    if not track_id or not str(track_id).isdigit():
        return None

    headers = dict(MUSIC_HEADERS)
    if music_token:
        headers["Authorization"] = f"OAuth {music_token}"

    try:
        async with session.post(
            f"{MUSIC_API}/tracks",
            data={"track-ids": str(track_id)},
            headers=headers,
        ) as response:
            if response.status != 200:
                return None
            payload = await response.json(content_type=None)
    except (ClientError, ValueError):
        return None

    tracks = payload.get("result") if isinstance(payload, dict) else None
    if not tracks:
        return None
    info = tracks[0].get("lyricsInfo") or {}
    if not (
        info.get("hasAvailableSyncLyrics")
        or info.get("hasAvailableTextLyrics")
    ):
        return None

    timestamp = int(time.time())
    params = {"timeStamp": timestamp, "sign": _sign(track_id, timestamp)}
    try:
        async with session.get(
            f"{MUSIC_API}/tracks/{track_id}/lyrics",
            params=params,
            headers=headers,
        ) as response:
            if response.status != 200:
                return None
            payload = await response.json(content_type=None)
    except (ClientError, ValueError):
        return None

    result = payload.get("result") if isinstance(payload, dict) else None
    url = result.get("downloadUrl") if isinstance(result, dict) else None
    if not url:
        return None

    try:
        async with session.get(url) as response:
            if response.status != 200:
                return None
            return (await response.read()).decode("utf-8", errors="replace")
    except ClientError:
        return None


def parse_lyrics_line(lyrics: str | None, position: float | None) -> str | None:
    """Return the LRC line that matches a playback position."""
    if not lyrics:
        return None
    current: str | None = None
    for raw in lyrics.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("[") and "]" in line:
            stamp, _, text = line[1:].partition("]")
            try:
                minutes, seconds = stamp.split(":")
                line_time = int(minutes) * 60 + float(seconds)
            except ValueError:
                continue
            if position is not None and line_time > position:
                break
            current = text.strip() or current
        elif current is None:
            current = line
    return current
