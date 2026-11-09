"""Binary sensor platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import EVENT_ICONS, EVENT_MAP, PROP_BOOL, PROP_EVENT
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_property_value, state_to_bool


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up binary sensors."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeBinarySensor] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        for prop in device.get("properties") or []:
            if prop.get("type") not in (PROP_EVENT, PROP_BOOL):
                continue
            state = prop.get("state") or {}
            instance = state.get("instance")
            if instance:
                entities.append(
                    YahomeBinarySensor(coordinator, device_id, instance)
                )
    async_add_entities(entities)


class YahomeBinarySensor(YahomeDeviceEntity, BinarySensorEntity):
    """A Yandex event property exposed as a binary sensor."""

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        instance: str,
    ) -> None:
        super().__init__(coordinator, device_id, f"binary_{instance}")
        self._instance = instance
        meta = EVENT_MAP.get(instance, {})
        self._attr_name = meta.get("name") or instance.replace("_", " ").title()
        self._attr_icon = EVENT_ICONS.get(instance)
        device_class = meta.get("device_class")
        try:
            self._attr_device_class = (
                BinarySensorDeviceClass(device_class) if device_class else None
            )
        except ValueError:
            self._attr_device_class = None

    @property
    def is_on(self) -> bool | None:
        """Return the current event state."""
        value = get_property_value(self.device, self._instance)
        return state_to_bool(value)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return the raw Yandex event value."""
        return {
            "yandex_instance": self._instance,
            "yandex_value": get_property_value(self.device, self._instance),
        }
