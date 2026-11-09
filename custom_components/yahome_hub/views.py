"""Serializable views for the YaHome Hub panel and WebSocket API."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from .const import (
    CAP_COLOR_SETTING,
    CAP_MODE,
    CAP_ON_OFF,
    CAP_OPEN,
    CAP_RANGE,
    CAP_TOGGLE,
    CAP_VOLUME,
    CAP_WORK_SPEED,
    CAPABILITY_NAMES,
    EVENT_MAP,
    SENSOR_MAP,
)
from .helpers import (
    device_icon,
    device_name,
    device_type,
    device_type_label,
    get_capability_instance,
    get_capability_state,
    mode_options,
    primary_domain,
    range_bounds,
    work_speed_options,
)
from .models import YahomeData

HIDDEN_CAPABILITY_TYPES = {
    "devices.capabilities.zigbee_node",
    "devices.capabilities.motion_setting",
    "devices.capabilities.identify",
}


def _capability_kind(capability_type: str) -> str:
    if capability_type == CAP_ON_OFF:
        return "on_off"
    if capability_type == CAP_RANGE:
        return "range"
    if capability_type == CAP_MODE:
        return "mode"
    if capability_type == CAP_TOGGLE:
        return "toggle"
    if capability_type == CAP_OPEN:
        return "open"
    if capability_type == CAP_COLOR_SETTING:
        return "color"
    if capability_type == CAP_WORK_SPEED:
        return "work_speed"
    if capability_type == "devices.capabilities.media_playback":
        return "media"
    if capability_type == "devices.capabilities.volume":
        return "volume"
    if capability_type == "devices.capabilities.channel":
        return "channel"
    return "other"


def capability_view(capability: dict[str, Any]) -> dict[str, Any]:
    """Return a normalized capability view for the UI."""
    capability_type = capability.get("type") or ""
    state = capability.get("state") or {}
    parameters = capability.get("parameters") or {}
    instance = get_capability_instance(capability)
    name = CAPABILITY_NAMES.get(instance or "") or (
        instance
        or capability_type.rsplit(".", 1)[-1]
    ).replace("_", " ").title()
    view: dict[str, Any] = {
        "type": capability_type,
        "kind": _capability_kind(capability_type),
        "instance": instance,
        "name": name,
        "value": state.get("value"),
        "parameters": parameters,
    }
    if capability_type == CAP_RANGE:
        minimum, maximum, step, unit = range_bounds(capability)
        view.update(
            {
                "min": minimum,
                "max": maximum,
                "step": step,
                "unit": unit,
            }
        )
    if capability_type == CAP_MODE:
        view["options"] = mode_options(capability)
    if capability_type == CAP_WORK_SPEED:
        view["options"] = work_speed_options(capability)
        view["action_instance"] = instance or "fan_speed"
    if capability_type == CAP_MODE:
        view["options"] = mode_options(capability)
        view["action_instance"] = instance or "mode"
    if capability_type == CAP_COLOR_SETTING:
        color_scenes = parameters.get("color_scenes")
        if isinstance(color_scenes, list):
            view["color_scenes"] = [
                {
                    "id": scene.get("id"),
                    "name": scene.get("name") or scene.get("id"),
                }
                for scene in color_scenes
                if isinstance(scene, dict) and scene.get("id")
            ]
        temperature = parameters.get("temperature_k") or {}
        if isinstance(temperature, dict):
            view["temperature_k"] = {
                "min": temperature.get("min", 2700),
                "max": temperature.get("max", 6500),
            }
        view["color_model"] = parameters.get("color_model")
    return view


def property_view(prop: dict[str, Any]) -> dict[str, Any]:
    """Return a normalized property view for the UI."""
    state = prop.get("state") or {}
    instance = state.get("instance") or ""
    prop_type = prop.get("type") or ""
    meta = (
        EVENT_MAP.get(instance, {})
        if prop_type == "devices.properties.event"
        else SENSOR_MAP.get(instance, {})
    )
    return {
        "type": prop_type,
        "instance": instance,
        "name": meta.get("name") or instance.replace("_", " ").title(),
        "value": state.get("value"),
        "unit": meta.get("unit"),
        "device_class": meta.get("device_class"),
    }


def device_view(
    device: dict[str, Any],
    rooms: dict[str, str],
    child_to_station: dict[str, str],
) -> dict[str, Any]:
    """Return a normalized device view."""
    room_id = device.get("room")
    return {
        "id": device.get("id"),
        "name": device_name(device),
        "type": device_type(device),
        "type_label": device_type_label(device),
        "icon": device_icon(device),
        "primary_domain": primary_domain(device),
        "online": device.get("state") != "offline",
        "state": device.get("state"),
        "room": room_id,
        "room_name": rooms.get(room_id) if room_id else None,
        "station_id": child_to_station.get(device.get("id")),
        "household_id": device.get("household_id") or device.get("household"),
        "groups": device.get("groups") or [],
        "capabilities": [
            capability_view(capability)
            for capability in device.get("capabilities") or []
            if capability.get("type") not in HIDDEN_CAPABILITY_TYPES
            and not (
                primary_domain(device) == "media_player"
                and _capability_kind(capability.get("type") or "") == "other"
            )
        ],
        "properties": [
            property_view(prop)
            for prop in device.get("properties") or []
            if (prop.get("state") or {}).get("instance")
        ],
    }


def _speaker_view(
    data: YahomeData, speaker: dict[str, Any]
) -> dict[str, Any]:
    speaker_id = speaker.get("id")
    iot_id = data.quasar_to_iot.get(speaker_id)
    iot_device = data.devices.get(iot_id) if iot_id else None
    return {
        "id": speaker_id,
        "name": speaker.get("name") or "Колонка",
        "platform": speaker.get("platform"),
        "iot_id": iot_id,
        "entity_id": speaker.get("entity_id"),
        "equalizer_entity": speaker.get("equalizer_entity"),
        "volume": (
            get_capability_state(iot_device, CAP_VOLUME, "volume")
            if iot_device
            else None
        ),
        "on": (
            get_capability_state(iot_device, CAP_ON_OFF, "on")
            if iot_device
            else None
        ),
    }


def serialize_data(data: YahomeData) -> dict[str, Any]:
    """Serialize coordinator data for the panel, database and WebSocket."""
    devices = [
        device_view(device, data.rooms, data.child_to_station)
        for device in data.devices.values()
    ]
    devices.sort(
        key=lambda item: (
            (item.get("room_name") or "Без комнаты").lower(),
            (item.get("name") or "").lower(),
        )
    )
    room_counts = Counter(
        item.get("room_name") or "Без комнаты" for item in devices
    )
    type_counts = Counter(item.get("type_label") or "Устройство" for item in devices)
    online_count = sum(1 for item in devices if item.get("online"))
    return {
        "updated": datetime.now().isoformat(timespec="seconds"),
        "counts": {
            "devices": len(devices),
            "online": online_count,
            "offline": len(devices) - online_count,
            "scenarios": len(data.scenarios),
            "speakers": len(data.speakers),
            "stations": len(data.stations),
            "rooms": len(data.rooms),
        },
        "rooms": [
            {"id": room_id, "name": name, "count": room_counts.get(name, 0)}
            for room_id, name in sorted(data.rooms.items(), key=lambda x: x[1].lower())
        ],
        "types": [
            {"name": name, "count": count}
            for name, count in type_counts.most_common()
        ],
        "devices": devices,
        "scenarios": [
            {
                "id": scenario.get("id"),
                "name": scenario.get("name") or "Сценарий",
                "is_active": scenario.get("is_active", False),
                "icon": scenario.get("icon"),
                "devices": scenario.get("devices") or [],
            }
            for scenario in data.scenarios.values()
        ],
        "speakers": [
            _speaker_view(data, speaker)
            for speaker in data.speakers.values()
        ],
        "stations": [
            {
                "id": station_id,
                "name": station.get("name") or "Станция",
                "model": station.get("model"),
                "children": [
                    {
                        "id": child.get("id"),
                        "name": child.get("name"),
                        "type": child.get("device_type"),
                        "link_type": child.get("link_type"),
                    }
                    for child in station.get("child_items") or []
                ],
            }
            for station_id, station in data.stations.items()
        ],
    }
