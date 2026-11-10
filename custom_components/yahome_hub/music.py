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


def _cover_url(cover: str | None) -> str:
    """Normalize a Yandex Music cover URI."""
    value = str(cover or "")
    if value and "://" not in value:
        return "https://" + value.replace("%%", "400x400")
    return value


def _track_item(track: dict[str, Any]) -> dict[str, Any]:
    """Convert a Yandex Music track into a lightweight panel item."""
    artists = ", ".join(
        artist.get("name", "") for artist in track.get("artists") or []
    )
    albums = track.get("albums") or []
    album = albums[0].get("title", "") if albums else ""
    return {
        "id": str(track.get("id")),
        "title": track.get("title") or "",
        "artist": artists,
        "album": album,
        "duration": int((track.get("durationMs") or 0) / 1000),
        "cover": _cover_url(track.get("coverUri")),
    }


def _headers(music_token: str | None) -> dict[str, str]:
    headers = dict(MUSIC_HEADERS)
    if music_token:
        headers["Authorization"] = f"OAuth {music_token}"
    return headers


async def _music_get(
    session: ClientSession,
    path: str,
    music_token: str | None,
    params: dict[str, Any] | None = None,
) -> Any:
    try:
        async with session.get(
            f"{MUSIC_API}{path}",
            params=params,
            headers=_headers(music_token),
        ) as response:
            if response.status != 200:
                return None
            return await response.json(content_type=None)
    except (ClientError, ValueError):
        return None


async def async_get_account_uid(
    session: ClientSession, music_token: str | None
) -> int | None:
    """Return the Yandex Music account UID."""
    payload = await _music_get(session, "/account/status", music_token)
    account = (((payload or {}).get("result") or {}).get("account") or {})
    uid = account.get("uid")
    try:
        return int(uid) if uid is not None else None
    except (TypeError, ValueError):
        return None


async def async_get_tracks(
    session: ClientSession,
    track_ids: list[str],
    music_token: str | None,
) -> list[dict[str, Any]]:
    """Fetch full track details for a list of IDs, preserving their order."""
    ids = [str(item) for item in track_ids if str(item).isdigit()]
    if not ids:
        return []
    result_map: dict[str, dict[str, Any]] = {}
    for start in range(0, len(ids), 100):
        chunk = ids[start : start + 100]
        try:
            async with session.post(
                f"{MUSIC_API}/tracks",
                data={"track-ids": ",".join(chunk)},
                headers=_headers(music_token),
            ) as response:
                if response.status != 200:
                    continue
                payload = await response.json(content_type=None)
        except (ClientError, ValueError):
            continue
        tracks = payload.get("result") if isinstance(payload, dict) else None
        if not isinstance(tracks, list):
            continue
        for track in tracks:
            item = _track_item(track)
            result_map[item["id"]] = item
    return [result_map[item] for item in ids if item in result_map]


async def async_get_liked_tracks(
    session: ClientSession,
    music_token: str | None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Return the user's liked tracks."""
    uid = await async_get_account_uid(session, music_token)
    if not uid:
        return []
    payload = await _music_get(
        session, f"/users/{uid}/likes/tracks", music_token
    )
    library = (((payload or {}).get("result") or {}).get("library") or {})
    ids = [
        str(item.get("id"))
        for item in library.get("tracks") or []
        if item.get("id")
    ][: max(1, int(limit))]
    return await async_get_tracks(session, ids, music_token)


async def async_get_playlists(
    session: ClientSession, music_token: str | None
) -> list[dict[str, Any]]:
    """Return the user's playlists."""
    uid = await async_get_account_uid(session, music_token)
    if not uid:
        return []
    payload = await _music_get(
        session, f"/users/{uid}/playlists/list", music_token
    )
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, list):
        return []
    items: list[dict[str, Any]] = []
    for playlist in result:
        cover_data = playlist.get("cover") or {}
        cover = (cover_data.get("itemsUri") or [""])[0]
        owner = (playlist.get("owner") or {}).get("name") or ""
        items.append(
            {
                "kind": str(playlist.get("kind")),
                "title": playlist.get("title") or "Плейлист",
                "track_count": int(playlist.get("trackCount") or 0),
                "cover": _cover_url(cover),
                "owner": owner,
            }
        )
    return items


async def async_get_playlist_tracks(
    session: ClientSession,
    music_token: str | None,
    kind: str,
) -> list[dict[str, Any]]:
    """Return the tracks of one playlist."""
    uid = await async_get_account_uid(session, music_token)
    if not uid:
        return []
    payload = await _music_get(
        session, f"/users/{uid}/playlists/{kind}", music_token
    )
    result = payload.get("result") if isinstance(payload, dict) else None
    if not isinstance(result, dict):
        return []
    items: list[dict[str, Any]] = []
    for entry in result.get("tracks") or []:
        track = entry.get("track") if isinstance(entry, dict) else None
        if not isinstance(track, dict):
            track = entry if isinstance(entry, dict) else None
        if track and track.get("id"):
            items.append(_track_item(track))
    return items


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
    payload = await _music_get(
        session,
        "/search",
        music_token,
        {
            "text": query,
            "type": "track",
            "page": 0,
            "nocorrect": "false",
        },
    )
    result = payload.get("result") if isinstance(payload, dict) else None
    tracks = ((result or {}).get("tracks") or {}).get("results") or []
    return [
        _track_item(track)
        for track in tracks[: max(1, int(limit))]
        if track.get("id")
    ]


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


def parse_lyrics_triplet(
    lyrics: str | None, position: float | None
) -> dict[str, Any]:
    """Return previous/current/next lyric lines and the next line timing."""
    empty = {
        "prev": None,
        "current": None,
        "next": None,
        "remaining": None,
        "start": None,
        "end": None,
    }
    if not lyrics:
        return empty
    timed: list[tuple[float, str]] = []
    plain: list[str] = []
    for raw in lyrics.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("[") and "]" in line:
            stamp, _, text = line[1:].partition("]")
            try:
                minutes, seconds = stamp.split(":")
                seconds_value = int(minutes) * 60 + float(seconds)
            except ValueError:
                continue
            timed.append((seconds_value, text.strip()))
        elif not line.startswith("["):
            plain.append(line)
    pos = max(0.0, float(position or 0.0))
    if timed:
        index = 0
        for i, (seconds_value, _) in enumerate(timed):
            if seconds_value <= pos:
                index = i
            else:
                break
        start, current_text = timed[index]
        next_time = timed[index + 1][0] if index + 1 < len(timed) else None
        return {
            "prev": timed[index - 1][1] if index > 0 else None,
            "current": current_text or None,
            "next": timed[index + 1][1] if index + 1 < len(timed) else None,
            "remaining": (
                max(0.0, next_time - pos) if next_time is not None else None
            ),
            "start": start,
            "end": next_time,
        }
    if plain:
        index = int(pos // 4) % len(plain)
        start = index * 4
        return {
            "prev": plain[index - 1] if index > 0 else None,
            "current": plain[index],
            "next": plain[index + 1] if index + 1 < len(plain) else None,
            "remaining": max(0.0, start + 4 - pos),
            "start": start,
            "end": start + 4,
        }
    return empty


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
