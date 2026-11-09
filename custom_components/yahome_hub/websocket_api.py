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


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel WebSocket commands."""
    websocket_api.async_register_command(hass, websocket_devices)
    websocket_api.async_register_command(hass, websocket_action)
    websocket_api.async_register_command(hass, websocket_scenario)
    websocket_api.async_register_command(hass, websocket_refresh)
    websocket_api.async_register_command(hass, websocket_export)
    websocket_api.async_register_command(hass, websocket_track_info)
