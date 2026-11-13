"""Services for YaHome Hub."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .websocket_api import get_coordinator

SERVICE_SEND_ACTION = "send_action"
SERVICE_EXECUTE_SCENARIO = "execute_scenario"
SERVICE_REFRESH = "refresh"
SERVICE_EXPORT = "export"
SERVICE_SAY = "say"
SERVICE_SET_LED = "set_led"
SERVICE_SET_SPEAKER_CONFIG = "set_speaker_config"
SERVICE_STREAM_MUSIC = "stream_music"
SERVICE_STOP_STREAM = "stop_stream_music"

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
STREAM_MUSIC_SCHEMA = vol.Schema(
    {
        vol.Required("source_entity_id"): cv.entity_id,
        vol.Optional("target_entity_ids"): vol.All(
            cv.ensure_list, [cv.entity_id]
        ),
        vol.Optional(ATTR_ENTITY_ID): vol.All(
            cv.ensure_list, [cv.entity_id]
        ),
        vol.Optional("sync_volume", default=True): vol.Any(
            cv.boolean, cv.template
        ),
        vol.Optional("use_proxy", default=True): cv.boolean,
        vol.Optional("start", default=True): cv.boolean,
        vol.Optional("stop_targets", default=True): cv.boolean,
        vol.Optional("quality", default="high"): vol.In(
            ["high", "medium", "low"]
        ),
        vol.Optional("codecs", default="mp3"): vol.In(
            ["mp3", "aac", "flac"]
        ),
        vol.Optional("media_content_type"): str,
        vol.Optional("mute_source", default=True): cv.boolean,
        vol.Optional("bidirectional", default=True): cv.boolean,
    }
)
STOP_STREAM_SCHEMA = vol.Schema(
    {
        vol.Optional("session_id"): str,
        vol.Optional("source_entity_id"): cv.entity_id,
        vol.Optional("target_entity_ids"): vol.All(
            cv.ensure_list, [cv.entity_id]
        ),
        vol.Optional("stop_playback", default=True): cv.boolean,
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
    async def handle_stream_music(call: ServiceCall) -> dict[str, Any]:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub не настроен")
        targets = call.data.get("target_entity_ids") or call.data.get(
            ATTR_ENTITY_ID
        ) or []
        if isinstance(targets, str):
            targets = [targets]
        if not targets:
            raise ValueError("Укажите хотя бы одну колонку-получатель")
        return await coordinator.async_start_music_stream(
            call.data["source_entity_id"],
            list(targets),
            sync_volume=call.data.get("sync_volume", True),
            use_proxy=call.data.get("use_proxy", True),
            start=call.data.get("start", True),
            stop_targets=call.data.get("stop_targets", True),
            quality=call.data.get("quality", "high"),
            codecs=call.data.get("codecs", "mp3"),
            media_content_type=call.data.get("media_content_type"),
            mute_source=call.data.get("mute_source", True),
            bidirectional=call.data.get("bidirectional", True),
            context=call.context,
        )

    async def handle_stop_stream(call: ServiceCall) -> dict[str, int]:
        await _require_admin(hass, call)
        coordinator = get_coordinator(hass)
        if coordinator is None:
            raise ValueError("YaHome Hub не настроен")
        targets = call.data.get("target_entity_ids") or []
        if isinstance(targets, str):
            targets = [targets]
        stopped = await coordinator.async_stop_music_stream(
            session_id=call.data.get("session_id"),
            source_entity_id=call.data.get("source_entity_id"),
            target_entity_ids=list(targets) if targets else None,
            stop_playback=call.data.get("stop_playback", True),
        )
        return {"stopped": stopped}

    if not hass.services.has_service(DOMAIN, SERVICE_STREAM_MUSIC):
        hass.services.async_register(
            DOMAIN,
            SERVICE_STREAM_MUSIC,
            handle_stream_music,
            schema=STREAM_MUSIC_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )
    if not hass.services.has_service(DOMAIN, SERVICE_STOP_STREAM):
        hass.services.async_register(
            DOMAIN,
            SERVICE_STOP_STREAM,
            handle_stop_stream,
            schema=STOP_STREAM_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

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
