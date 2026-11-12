"""Services for YaHome Hub."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import Unauthorized

from .const import DOMAIN
from .websocket_api import get_coordinator

SERVICE_SEND_ACTION = "send_action"
SERVICE_EXECUTE_SCENARIO = "execute_scenario"
SERVICE_REFRESH = "refresh"
SERVICE_EXPORT = "export"
SERVICE_SAY = "say"
SERVICE_SET_LED = "set_led"
SERVICE_SET_SPEAKER_CONFIG = "set_speaker_config"

SEND_ACTION_SCHEMA = vol.Schema(
    {
        vol.Required("device_id"): str,
        vol.Required("capability_type"): str,
        vol.Optional("instance", default=""): str,
        vol.Required("value"): vol.Any(bool, int, float, str, None),
    }
)

SCENARIO_SCHEMA = vol.Schema({vol.Required("scenario_id"): str})
EXPORT_SCHEMA = vol.Schema({vol.Optional("path"): str})
SAY_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("message"): str,
        vol.Optional("volume_level"): vol.Coerce(float),
    }
)
LED_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Optional("brightness"): vol.Coerce(float),
        vol.Optional("visualization"): vol.In(["clock", "equalizer"]),
        vol.Optional("auto"): bool,
    }
)
SPEAKER_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("entity_id"): str,
        vol.Required("config"): dict,
    }
)


async def _require_admin(hass: HomeAssistant, call: ServiceCall) -> None:
    """Reject calls made by non-admin users.

    Calls from automations and scripts have no user context and stay allowed.
    """
    user_id = call.context.user_id
    if not user_id:
        return
    user = await hass.auth.async_get_user(user_id)
    if user is None or not user.is_admin:
        raise Unauthorized(context=call.context)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register integration services."""
    if hass.services.has_service(DOMAIN, SERVICE_SEND_ACTION):
        return

    async def handle_send_action(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        await coordinator.async_device_action(
            call.data["device_id"],
            call.data["capability_type"],
            call.data.get("instance", ""),
            call.data.get("value"),
        )

    async def handle_execute_scenario(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        await coordinator.async_execute_scenario(call.data["scenario_id"])

    async def handle_refresh(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        await coordinator.async_request_refresh()

    async def handle_export(call: ServiceCall) -> dict[str, Any]:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        path = await coordinator.async_export(call.data.get("path"))
        return path

    async def handle_say(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        await coordinator.async_say(
            call.data["entity_id"],
            call.data["message"],
            call.data.get("volume_level"),
        )

    async def handle_set_led(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        await coordinator.async_set_speaker_led(
            call.data["entity_id"],
            call.data.get("brightness"),
            call.data.get("visualization"),
            call.data.get("auto"),
        )

    async def handle_set_speaker_config(call: ServiceCall) -> None:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub is not configured")
        speaker_id = coordinator.speaker_id_for_entity(
            call.data["entity_id"]
        )
        if not speaker_id:
            raise ValueError("Speaker not found")
        await coordinator.async_set_speaker_config(
            speaker_id, call.data["config"]
        )

    hass.services.async_register(
        DOMAIN, SERVICE_SEND_ACTION, handle_send_action, schema=SEND_ACTION_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_EXECUTE_SCENARIO,
        handle_execute_scenario,
        schema=SCENARIO_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REFRESH, handle_refresh, schema=vol.Schema({})
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_EXPORT,
        handle_export,
        schema=EXPORT_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SAY, handle_say, schema=SAY_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_LED, handle_set_led, schema=LED_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_SPEAKER_CONFIG,
        handle_set_speaker_config,
        schema=SPEAKER_CONFIG_SCHEMA,
    )
