"""WebSocket API for the YaHome Hub panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import async_get_music_track
from .const import DOMAIN
from .coordinator import YahomeDataUpdateCoordinator
from .music import (
    async_get_liked_tracks,
    async_get_lyrics,
    async_get_playlist_tracks,
    async_get_playlists,
)
from .views import serialize_data

NOT_CONFIGURED = "YaHome Hub is not configured"


def get_coordinator(hass: HomeAssistant) -> YahomeDataUpdateCoordinator | None:
    """Return the active coordinator."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        coordinator = getattr(entry, "runtime_data", None)
        if isinstance(coordinator, YahomeDataUpdateCoordinator):
            return coordinator
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/devices",
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_devices(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the full device catalog."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    connection.send_result(msg["id"], serialize_data(coordinator.data))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/sensor_values",
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_sensor_values(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the device catalog after a lightweight sensor refresh."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_fast_sensor_refresh()
    except Exception:  # noqa: BLE001
        pass
    connection.send_result(msg["id"], serialize_data(coordinator.data))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/speaker_diagnostics",
        vol.Required("speaker_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_speaker_diagnostics(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return live state and config for one speaker."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        result = await coordinator.async_speaker_diagnostics(
            msg["speaker_id"]
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "diagnostics_failed", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/speaker_command",
        vol.Required("speaker_id"): str,
        vol.Required("payload"): dict,
        vol.Optional("wait", default=False): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_speaker_command(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send a raw local glagol command for diagnostics."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        result = await coordinator.async_send_speaker_command(
            msg["speaker_id"], msg["payload"], msg.get("wait", False)
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "command_failed", str(err))
        return
    connection.send_result(msg["id"], result or {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/speaker_config_set",
        vol.Required("speaker_id"): str,
        vol.Required("config"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_speaker_config_set(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Write experimental speaker configuration."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_set_speaker_config(
            msg["speaker_id"], msg["config"]
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "config_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/video_close",
        vol.Required("speaker_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_video_close(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Stop video playback and leave video mode."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_close_video(msg["speaker_id"])
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "video_close_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/action",
        vol.Required("device_id"): str,
        vol.Required("capability_type"): str,
        vol.Optional("instance", default=""): str,
        vol.Required("value"): vol.Any(bool, int, float, str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_action(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send a capability action."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_device_action(
            msg["device_id"],
            msg["capability_type"],
            msg["instance"],
            msg["value"],
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "action_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/scenario",
        vol.Required("scenario_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_scenario(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Execute a Yandex scenario."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_execute_scenario(msg["scenario_id"])
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "scenario_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/refresh",
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_refresh(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Force a data refresh."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    await coordinator.async_request_refresh()
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/export",
        vol.Optional("path"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_export(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Export the device database to JSON."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    path = await coordinator.async_export(msg.get("path"))
    connection.send_result(msg["id"], path)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/track_info",
        vol.Required("track_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_track_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return public Yandex Music metadata for a track."""
    info = await async_get_music_track(
        async_get_clientsession(hass), msg["track_id"]
    )
    connection.send_result(msg["id"], info or {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/lyrics",
        vol.Required("track_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_lyrics(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return synchronized lyrics for a track."""
    coordinator = get_coordinator(hass)
    token = (
        coordinator.entry.data.get("music_token")
        if coordinator is not None
        else None
    )
    lyrics = await async_get_lyrics(
        async_get_clientsession(hass), msg["track_id"], token
    )
    connection.send_result(msg["id"], {"lyrics": lyrics or ""})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/lyrics_offset",
        vol.Required("offset"): vol.Coerce(float),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_lyrics_offset(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Set the manual lyrics sync offset."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    coordinator.lyrics_offset = msg["offset"]
    connection.send_result(msg["id"], {"offset": coordinator.lyrics_offset})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_search",
        vol.Required("query"): str,
        vol.Optional("limit", default=10): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_search(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Search Yandex Music tracks for the player."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    tracks = await coordinator.async_search_music(msg["query"], msg["limit"])
    connection.send_result(msg["id"], {"tracks": tracks})


TRACK_SCHEMA = vol.Schema(
    {
        vol.Required("id"): str,
        vol.Optional("title"): str,
        vol.Optional("artist"): str,
        vol.Optional("album"): str,
        vol.Optional("cover"): str,
        vol.Optional("duration"): vol.Coerce(int),
    },
    extra=vol.ALLOW_EXTRA,
)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_play",
        vol.Required("entity_id"): str,
        vol.Required("track_id"): str,
        vol.Optional("queue"): [TRACK_SCHEMA],
        vol.Optional("index", default=0): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_play(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Play a track and optionally set the local queue."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    try:
        await coordinator.async_play_track(
            msg["entity_id"],
            msg["track_id"],
            msg.get("queue"),
            msg.get("index", 0),
        )
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "play_failed", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_queue",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_queue(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the local queue for a speaker."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    speaker_id = coordinator.speaker_id_for_entity(msg["entity_id"])
    connection.send_result(
        msg["id"],
        (
            coordinator.music_queue(speaker_id)
            if speaker_id
            else {"tracks": [], "index": -1}
        ),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_queue_add",
        vol.Required("entity_id"): str,
        vol.Required("track"): TRACK_SCHEMA,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_queue_add(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a track to the local queue."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    queue = await coordinator.async_queue_add(msg["entity_id"], msg["track"])
    connection.send_result(msg["id"], queue)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_queue_remove",
        vol.Required("entity_id"): str,
        vol.Required("index"): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_queue_remove(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Remove a track from the local queue."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    queue = await coordinator.async_queue_remove(
        msg["entity_id"], msg["index"]
    )
    connection.send_result(msg["id"], queue)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_queue_clear",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_queue_clear(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Clear the local queue."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    await coordinator.async_queue_clear(msg["entity_id"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_queue_play",
        vol.Required("entity_id"): str,
        vol.Required("index"): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_queue_play(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Play a queue item by index."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    await coordinator.async_queue_play_index(msg["entity_id"], msg["index"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_next",
        vol.Required("entity_id"): str,
        vol.Optional("delta", default=1): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_next(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Play the next/previous local queue item."""
    coordinator = get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_configured", NOT_CONFIGURED)
        return
    await coordinator.async_queue_next(msg["entity_id"], msg.get("delta", 1))
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_likes",
        vol.Optional("limit", default=100): vol.Coerce(int),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_likes(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the user's liked Yandex Music tracks."""
    coordinator = get_coordinator(hass)
    token = (
        coordinator.entry.data.get("music_token")
        if coordinator is not None
        else None
    )
    tracks = await async_get_liked_tracks(
        async_get_clientsession(hass), token, msg.get("limit", 100)
    )
    connection.send_result(msg["id"], {"tracks": tracks})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_playlists",
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_playlists(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the user's Yandex Music playlists."""
    coordinator = get_coordinator(hass)
    token = (
        coordinator.entry.data.get("music_token")
        if coordinator is not None
        else None
    )
    playlists = await async_get_playlists(
        async_get_clientsession(hass), token
    )
    connection.send_result(msg["id"], {"playlists": playlists})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/music_playlist",
        vol.Required("kind"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_music_playlist(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the tracks of one Yandex Music playlist."""
    coordinator = get_coordinator(hass)
    token = (
        coordinator.entry.data.get("music_token")
        if coordinator is not None
        else None
    )
    tracks = await async_get_playlist_tracks(
        async_get_clientsession(hass), token, msg["kind"]
    )
    connection.send_result(msg["id"], {"tracks": tracks})


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel WebSocket commands."""
    websocket_api.async_register_command(hass, websocket_lyrics)
    websocket_api.async_register_command(hass, websocket_lyrics_offset)
    websocket_api.async_register_command(hass, websocket_music_search)
    websocket_api.async_register_command(hass, websocket_music_play)
    websocket_api.async_register_command(hass, websocket_music_queue)
    websocket_api.async_register_command(hass, websocket_music_queue_add)
    websocket_api.async_register_command(hass, websocket_music_queue_remove)
    websocket_api.async_register_command(hass, websocket_music_queue_clear)
    websocket_api.async_register_command(hass, websocket_music_queue_play)
    websocket_api.async_register_command(hass, websocket_music_next)
    websocket_api.async_register_command(hass, websocket_music_likes)
    websocket_api.async_register_command(hass, websocket_music_playlists)
    websocket_api.async_register_command(hass, websocket_music_playlist)
    websocket_api.async_register_command(hass, websocket_devices)
    websocket_api.async_register_command(hass, websocket_sensor_values)
    websocket_api.async_register_command(
        hass, websocket_speaker_diagnostics
    )
    websocket_api.async_register_command(
        hass, websocket_speaker_config_set
    )
    websocket_api.async_register_command(hass, websocket_speaker_command)
    websocket_api.async_register_command(hass, websocket_video_close)
    websocket_api.async_register_command(hass, websocket_action)
    websocket_api.async_register_command(hass, websocket_scenario)
    websocket_api.async_register_command(hass, websocket_refresh)
    websocket_api.async_register_command(hass, websocket_export)
    websocket_api.async_register_command(hass, websocket_track_info)
