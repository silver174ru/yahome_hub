"""Sensor platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import PROP_FLOAT, PROP_STRING, SENSOR_ICONS, SENSOR_MAP
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_property_value, to_float


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up sensors."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeSensor] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        for prop in device.get("properties") or []:
            prop_type = prop.get("type")
            if prop_type not in (PROP_FLOAT, PROP_STRING):
                continue
            state = prop.get("state") or {}
            instance = state.get("instance")
            if not instance:
                continue
            entities.append(
                YahomeSensor(coordinator, device_id, instance, prop_type)
            )
    async_add_entities(entities)


class YahomeSensor(YahomeDeviceEntity, SensorEntity):
    """A Yandex property exposed as a sensor."""

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        instance: str,
        prop_type: str,
    ) -> None:
        super().__init__(coordinator, device_id, f"sensor_{instance}")
        self._instance = instance
        self._numeric = prop_type == PROP_FLOAT
        meta = SENSOR_MAP.get(instance, {})
        self._attr_name = meta.get("name") or instance.replace("_", " ").title()
        self._attr_icon = SENSOR_ICONS.get(instance)
        self._attr_native_unit_of_measurement = meta.get("unit")
        device_class = meta.get("device_class")
        try:
            self._attr_device_class = (
                SensorDeviceClass(device_class) if device_class else None
            )
        except ValueError:
            self._attr_device_class = None
        state_class = meta.get("state_class")
        try:
            self._attr_state_class = (
                SensorStateClass(state_class) if state_class else None
            )
        except ValueError:
            self._attr_state_class = None

    @property
    def native_value(self) -> float | str | None:
        """Return the current value."""
        value = get_property_value(self.device, self._instance)
        if value is None:
            return None
        if self._numeric:
            return to_float(value)
        if isinstance(value, str):
            return value
        return str(value)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the raw Yandex property type."""
        return {"yandex_instance": self._instance}
