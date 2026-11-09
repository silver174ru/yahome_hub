"""Number platform for generic Yandex range capabilities."""

from __future__ import annotations

from typing import Any

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAPABILITY_NAMES, CAP_RANGE
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    get_capability_instance,
    get_capability_state,
    get_range_capabilities,
    is_primary_capability,
    range_bounds,
    to_float,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up generic range controls."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeNumber] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        for capability in get_range_capabilities(device):
            instance = get_capability_instance(capability)
            if not instance:
                continue
            if is_primary_capability(device, CAP_RANGE, instance):
                continue
            entities.append(
                YahomeNumber(coordinator, device_id, capability, instance)
            )
    async_add_entities(entities)


class YahomeNumber(YahomeDeviceEntity, NumberEntity):
    """A generic Yandex range capability."""

    _attr_mode = NumberMode.AUTO

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        capability: dict[str, Any],
        instance: str,
    ) -> None:
        super().__init__(coordinator, device_id, f"range_{instance}")
        self._instance = instance
        self._attr_name = CAPABILITY_NAMES.get(
            instance, instance.replace("_", " ").title()
        )
        minimum, maximum, step, unit = range_bounds(capability)
        self._attr_native_min_value = minimum
        self._attr_native_max_value = maximum
        self._attr_native_step = step
        self._attr_native_unit_of_measurement = unit

    @property
    def native_value(self) -> float | None:
        """Return the current range value."""
        return to_float(
            get_capability_state(self.device, CAP_RANGE, self._instance)
        )

    async def async_set_native_value(self, value: float) -> None:
        """Set the range value."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_RANGE, self._instance, value
        )
