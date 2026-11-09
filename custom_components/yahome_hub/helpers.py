"""Helpers for working with Yandex Smart Home device payloads."""

from __future__ import annotations

from typing import Any, Iterable

from .const import (
    ACTIVE_EVENT_VALUES,
    CAP_COLOR_SETTING,
    CAP_MODE,
    CAP_ON_OFF,
    CAP_OPEN,
    CAP_RANGE,
    CAP_TOGGLE,
    CAP_VOLUME,
    CAP_WORK_SPEED,
    CLIMATE_TYPES,
    COVER_TYPES,
    DEVICE_TYPE_ICONS,
    DEVICE_TYPE_LABELS,
    EVENT_MAP,
    FAN_TYPES,
    HUMIDIFIER_TYPES,
    INACTIVE_EVENT_VALUES,
    MEDIA_TYPES,
    MODE_VALUE_LABELS,
    PROP_EVENT,
    PROP_FLOAT,
    PROP_STRING,
    SENSOR_MAP,
)


def get_capabilities(device: dict[str, Any]) -> list[dict[str, Any]]:
    """Return all capabilities of a device."""
    capabilities = device.get("capabilities")
    return capabilities if isinstance(capabilities, list) else []


def get_capability(
    device: dict[str, Any], capability_type: str
) -> dict[str, Any] | None:
    """Return the first capability by its full type."""
    for capability in get_capabilities(device):
        if capability.get("type") == capability_type:
            return capability
    return None


def get_capability_instance(capability: dict[str, Any]) -> str | None:
    """Return the state or parameter instance of a capability."""
    state = capability.get("state") or {}
    if state.get("instance"):
        return state["instance"]
    parameters = capability.get("parameters") or {}
    if parameters.get("instance"):
        return parameters["instance"]
    return None


def get_capability_state(
    device: dict[str, Any], capability_type: str, instance: str | None = None
) -> Any:
    """Return the state value of a capability."""
    if instance is None:
        capability = get_capability(device, capability_type)
        if not capability:
            return None
        state = capability.get("state") or {}
        return state.get("value")

    for capability in get_capabilities(device):
        if capability.get("type") != capability_type:
            continue
        state = capability.get("state") or {}
        if state.get("instance") == instance:
            return state.get("value")
    return None


def get_capability_parameters(
    device: dict[str, Any], capability_type: str
) -> dict[str, Any]:
    """Return capability parameters or an empty dict."""
    capability = get_capability(device, capability_type)
    if not capability:
        return {}
    parameters = capability.get("parameters") or {}
    return parameters if isinstance(parameters, dict) else {}


def iter_capabilities(
    device: dict[str, Any], capability_type: str | None = None
) -> Iterable[dict[str, Any]]:
    """Iterate capabilities, optionally filtered by type."""
    for capability in get_capabilities(device):
        if capability_type is None or capability.get("type") == capability_type:
            yield capability


def get_range_capabilities(device: dict[str, Any]) -> list[dict[str, Any]]:
    """Return range capabilities."""
    return list(iter_capabilities(device, CAP_RANGE))


def get_mode_capabilities(device: dict[str, Any]) -> list[dict[str, Any]]:
    """Return mode capabilities."""
    return list(iter_capabilities(device, CAP_MODE))


def get_toggle_capabilities(device: dict[str, Any]) -> list[dict[str, Any]]:
    """Return toggle capabilities."""
    return list(iter_capabilities(device, CAP_TOGGLE))


UNIT_MAP = {
    "unit.percent": "%",
    "unit.temperature.celsius": "°C",
    "unit.temperature.kelvin": "K",
    "unit.pressure.mmhg": "mmHg",
    "unit.pressure.pascal": "Pa",
    "unit.power.watt": "W",
    "unit.power.kilowatt": "kW",
    "unit.energy.kilowatt_hour": "kWh",
    "unit.illumination.lux": "lx",
    "unit.volume.liters": "L",
    "unit.speed.mps": "m/s",
    "unit.time.seconds": "s",
    "unit.time.minutes": "min",
}


def range_bounds(capability: dict[str, Any]) -> tuple[float, float, float, str | None]:
    """Return min, max, step and unit for a range capability."""
    parameters = capability.get("parameters") or {}
    range_info = parameters.get("range") or {}
    minimum = range_info.get("min", parameters.get("min", 0))
    maximum = range_info.get("max", parameters.get("max", 100))
    precision = range_info.get("precision", parameters.get("precision", 1))
    unit = parameters.get("unit")
    if isinstance(unit, str):
        unit = UNIT_MAP.get(unit, unit)
    try:
        return float(minimum), float(maximum), float(precision), unit
    except (TypeError, ValueError):
        return 0.0, 100.0, 1.0, unit


def mode_options(capability: dict[str, Any]) -> list[dict[str, str]]:
    """Return mode options as value/name dicts."""
    parameters = capability.get("parameters") or {}
    modes = parameters.get("modes")
    if not isinstance(modes, list):
        return []
    result: list[dict[str, str]] = []
    for mode in modes:
        if not isinstance(mode, dict):
            continue
        value = mode.get("value")
        if not value:
            continue
        result.append(
            {
                "value": str(value),
                "name": MODE_VALUE_LABELS.get(str(value).lower())
                or str(mode.get("name") or value),
            }
        )
    return result


def work_speed_options(capability: dict[str, Any]) -> list[dict[str, str]]:
    """Return options for a work_speed capability."""
    parameters = capability.get("parameters") or {}
    fan_speed = parameters.get("fan_speed") or {}
    values = fan_speed.get("values") if isinstance(fan_speed, dict) else None
    if not isinstance(values, list):
        return []
    return [
        {
            "value": str(value),
            "name": MODE_VALUE_LABELS.get(str(value).lower(), str(value)),
        }
        for value in values
    ]


HVAC_MODE_VALUES = {"heat", "cool", "dry", "fan_only", "heat_cool"}
FAN_SPEED_VALUES = {
    "quiet",
    "low",
    "medium",
    "high",
    "turbo",
    "max",
    "min",
    "silent",
    "strong",
    "1",
    "2",
    "3",
    "4",
    "5",
}
SWING_VALUES = {
    "on",
    "off",
    "horizontal",
    "vertical",
    "both",
    "swing",
    "fixed",
}
DIRECTION_VALUES = {
    "forward",
    "reverse",
    "left",
    "right",
    "up",
    "down",
}


def mode_values(capability: dict[str, Any]) -> list[str]:
    """Return lower-case mode option values."""
    return [option["value"].lower() for option in mode_options(capability)]


def classify_mode_capability(capability: dict[str, Any]) -> str:
    """Classify a Yandex mode capability by its option values."""
    values = set(mode_values(capability))
    if values & HVAC_MODE_VALUES:
        return "hvac"
    if values & SWING_VALUES and values <= (SWING_VALUES | {"on", "off"}):
        return "swing"
    if values & DIRECTION_VALUES:
        return "direction"
    if values & FAN_SPEED_VALUES:
        return "fan_speed"
    return "mode"


def find_mode_capability(
    device: dict[str, Any], kind: str
) -> dict[str, Any] | None:
    """Find a mode capability by classification."""
    for capability in get_mode_capabilities(device):
        if classify_mode_capability(capability) == kind:
            return capability
    return None


def find_range_capability(
    device: dict[str, Any], instance: str
) -> dict[str, Any] | None:
    """Find a range capability by instance."""
    for capability in get_range_capabilities(device):
        if get_capability_instance(capability) == instance:
            return capability
    return None


def find_toggle_capability(
    device: dict[str, Any], instances: tuple[str, ...]
) -> str | None:
    """Find a toggle capability instance."""
    for capability in get_toggle_capabilities(device):
        instance = get_capability_instance(capability)
        if instance in instances:
            return instance
    return None


def iter_properties(
    device: dict[str, Any], property_type: str
) -> list[dict[str, Any]]:
    """Return properties of the specified type."""
    result: list[dict[str, Any]] = []
    for prop in device.get("properties") or []:
        if prop.get("type") != property_type:
            continue
        state = prop.get("state") or {}
        if not state.get("instance"):
            continue
        result.append(prop)
    return result


def get_property_state(
    device: dict[str, Any], instance: str
) -> dict[str, Any] | None:
    """Return a property state by instance."""
    for prop in device.get("properties") or []:
        state = prop.get("state") or {}
        if state.get("instance") == instance:
            return state
    return None


def get_property_value(device: dict[str, Any], instance: str) -> Any:
    """Return a property value by instance."""
    state = get_property_state(device, instance)
    return state.get("value") if state else None


def get_property_type(device: dict[str, Any], instance: str) -> str | None:
    """Return the property type for an instance."""
    for prop in device.get("properties") or []:
        state = prop.get("state") or {}
        if state.get("instance") == instance:
            return prop.get("type")
    return None


def is_online(device: dict[str, Any]) -> bool:
    """Return True when the device is not explicitly offline."""
    return device.get("state") != "offline"


def device_name(device: dict[str, Any]) -> str:
    """Return a readable device name."""
    return device.get("name") or f"Yandex device {device.get('id', '')}"


def device_type(device: dict[str, Any]) -> str:
    """Return the Yandex device type."""
    return device.get("type") or ""


def device_type_label(device: dict[str, Any]) -> str:
    """Return a Russian device type label."""
    device_type_value = device_type(device)
    if device_type_value in DEVICE_TYPE_LABELS:
        return DEVICE_TYPE_LABELS[device_type_value]
    if "smart_speaker" in device_type_value or "speaker" in device_type_value:
        return "Колонка"
    if "sensor.climate" in device_type_value:
        return "Датчик климата"
    if "fan" in device_type_value:
        return "Вентилятор"
    if "hub" in device_type_value:
        return "Хаб"
    for key, label in DEVICE_TYPE_LABELS.items():
        if device_type_value.startswith(key + "."):
            return label
    if "light" in device_type_value:
        return "Свет"
    if "vacuum" in device_type_value:
        return "Пылесос"
    if "sensor" in device_type_value:
        return "Датчик"
    if "switch" in device_type_value or "socket" in device_type_value:
        return "Выключатель"
    return "Устройство"


def device_icon(device: dict[str, Any]) -> str:
    """Return an MDI icon for a device."""
    device_type_value = device_type(device)
    if device_type_value in DEVICE_TYPE_ICONS:
        return DEVICE_TYPE_ICONS[device_type_value]
    if "smart_speaker" in device_type_value or "speaker" in device_type_value:
        return "mdi:speaker"
    if "fan" in device_type_value:
        return "mdi:fan"
    if "hub" in device_type_value:
        return "mdi:hub"
    for key, icon in DEVICE_TYPE_ICONS.items():
        if device_type_value.startswith(key + "."):
            return icon
    if "light" in device_type_value:
        return "mdi:lightbulb"
    if "vacuum" in device_type_value:
        return "mdi:robot-vacuum"
    if "sensor" in device_type_value:
        return "mdi:access-point"
    return "mdi:home-automation"


def primary_domain(device: dict[str, Any]) -> str:
    """Return the primary Home Assistant domain for a device."""
    device_type_value = device_type(device)
    if "light" in device_type_value:
        return "light"
    if "sensor" in device_type_value:
        return "sensor"
    if "vacuum" in device_type_value:
        return "vacuum"
    if device_type_value in CLIMATE_TYPES or any(
        marker in device_type_value
        for marker in ("climate", "air_conditioner", "thermostat")
    ):
        return "climate"
    if device_type_value in HUMIDIFIER_TYPES or any(
        marker in device_type_value
        for marker in ("humidifier", "dehumidifier")
    ):
        return "humidifier"
    if device_type_value in FAN_TYPES or any(
        marker in device_type_value for marker in ("fan", "ventilation", "purifier")
    ):
        return "fan"
    if device_type_value in COVER_TYPES or any(
        marker in device_type_value
        for marker in ("curtain", "blind", "gate", "door", "window", "openable")
    ):
        return "cover"
    if device_type_value in MEDIA_TYPES or any(
        marker in device_type_value for marker in ("media", "tv", "receiver", "speaker")
    ):
        return "media_player"
    if "camera" in device_type_value:
        return "camera"
    if "sensor" in device_type_value and not get_capability(device, CAP_ON_OFF):
        return "sensor"
    if "socket" in device_type_value or "switch" in device_type_value:
        return "switch"
    if any(
        marker in device_type_value
        for marker in (
            "kettle",
            "coffee",
            "cooking",
            "iron",
            "washing",
            "dishwasher",
            "refrigerator",
        )
    ):
        return "switch"
    if get_capability(device, CAP_ON_OFF):
        return "switch"
    return "sensor"


def is_primary_capability(
    device: dict[str, Any], capability_type: str, instance: str | None
) -> bool:
    """Return True if a capability is already exposed by the primary entity."""
    domain = primary_domain(device)
    if domain == "light":
        return (
            capability_type == CAP_ON_OFF
            or capability_type == CAP_COLOR_SETTING
            or (capability_type == CAP_RANGE and instance == "brightness")
        )
    if domain == "vacuum":
        if capability_type == CAP_MODE:
            return instance in ("work_speed", "fan_speed")
        return capability_type in (CAP_ON_OFF, CAP_WORK_SPEED)
    if domain == "climate":
        return (
            capability_type in (CAP_ON_OFF, CAP_MODE)
            or (
                capability_type == CAP_RANGE
                and instance in ("temperature", "humidity")
            )
            or (
                capability_type == CAP_TOGGLE
                and instance in ("swing", "oscillation")
            )
        )
    if domain == "fan":
        return (
            capability_type in (CAP_ON_OFF, CAP_MODE)
            or (capability_type == CAP_RANGE and instance == "fan_speed")
            or (capability_type == CAP_TOGGLE and instance == "oscillation")
        )
    if domain == "humidifier":
        return (
            capability_type in (CAP_ON_OFF, CAP_MODE)
            or (capability_type == CAP_RANGE and instance == "humidity")
        )
    if domain == "cover":
        return capability_type == CAP_OPEN
    if domain == "media_player":
        return capability_type in (CAP_ON_OFF, CAP_VOLUME)
    if domain == "switch":
        return capability_type == CAP_ON_OFF
    return False


def is_light(device: dict[str, Any]) -> bool:
    """Return True for light devices."""
    return primary_domain(device) == "light"


def is_cover(device: dict[str, Any]) -> bool:
    """Return True for openable devices."""
    return primary_domain(device) == "cover"


def is_media_device(device: dict[str, Any]) -> bool:
    """Return True for media devices."""
    return primary_domain(device) == "media_player"


def get_device_room(device: dict[str, Any], rooms: dict[str, str]) -> str | None:
    """Return the room name for a device."""
    room_id = device.get("room")
    if not room_id:
        return None
    return rooms.get(room_id)


def state_to_bool(value: Any, *, active_values: set[str] | None = None) -> bool | None:
    """Convert a Yandex event value to a boolean."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in (active_values or ACTIVE_EVENT_VALUES):
        return True
    if normalized in INACTIVE_EVENT_VALUES:
        return False
    return None


def to_float(value: Any) -> float | None:
    """Convert a value to float, if possible."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", "."))
        except ValueError:
            return None
    return None


def property_meta(prop: dict[str, Any]) -> dict[str, object]:
    """Return display metadata for a property."""
    state = prop.get("state") or {}
    instance = state.get("instance") or ""
    if prop.get("type") == PROP_EVENT:
        return EVENT_MAP.get(instance, {})
    return SENSOR_MAP.get(instance, {})


def property_platform(prop: dict[str, Any]) -> str | None:
    """Return the HA platform name for a Yandex property."""
    prop_type = prop.get("type")
    if prop_type in (PROP_FLOAT, PROP_STRING):
        return "sensor"
    if prop_type in (PROP_EVENT,):
        return "binary_sensor"
    return None
