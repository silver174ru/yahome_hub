"""Humidifier platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.humidifier import (
    HumidifierEntity,
    HumidifierEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAP_MODE, CAP_ON_OFF, CAP_RANGE
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    get_capability_instance,
    get_capability_state,
    get_property_value,
    mode_options,
    primary_domain,
    range_bounds,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up humidifiers and dehumidifiers."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeHumidifier(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "humidifier"
    ]
    async_add_entities(entities)


class YahomeHumidifier(YahomeDeviceEntity, HumidifierEntity):
    """A Yandex humidifier or dehumidifier."""

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "humidifier")
        device = self.device
        self._mode_cap = self._mode_capability(device)
        self._mode_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(self._mode_cap)
            }
            if self._mode_cap
            else {}
        )
        self._attr_available_modes = list(self._mode_options.values()) or None
        self._attr_supported_features = (
            HumidifierEntityFeature.MODES if self._mode_cap else 0
        )
        humidity_cap = self._range_capability(device, "humidity")
        if humidity_cap:
            minimum, maximum, _, _ = range_bounds(humidity_cap)
            self._attr_min_humidity = int(minimum)
            self._attr_max_humidity = int(maximum)

    @staticmethod
    def _mode_capability(device: dict[str, Any]) -> dict[str, Any] | None:
        for capability in device.get("capabilities") or []:
            if capability.get("type") != CAP_MODE:
                continue
            instance = get_capability_instance(capability) or ""
            if instance in ("mode", "humidity", "program"):
                return capability
        for capability in device.get("capabilities") or []:
            if capability.get("type") == CAP_MODE:
                return capability
        return None

    @staticmethod
    def _range_capability(
        device: dict[str, Any], instance: str
    ) -> dict[str, Any] | None:
        for capability in device.get("capabilities") or []:
            if capability.get("type") != CAP_RANGE:
                continue
            if get_capability_instance(capability) == instance:
                return capability
        return None

    @property
    def is_on(self) -> bool | None:
        """Return the current state."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value) if value is not None else None

    @property
    def target_humidity(self) -> int | None:
        """Return target humidity."""
        value = get_capability_state(self.device, CAP_RANGE, "humidity")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def current_humidity(self) -> float | None:
        """Return current humidity."""
        value = get_property_value(self.device, "humidity")
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def mode(self) -> str | None:
        """Return the current mode."""
        if not self._mode_cap:
            return None
        value = get_capability_state(self.device, CAP_MODE)
        if value is None:
            return None
        return self._mode_options.get(str(value), str(value))

    async def async_turn_on(self) -> None:
        """Turn the humidifier on."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_turn_off(self) -> None:
        """Turn the humidifier off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )

    async def async_set_humidity(self, humidity: int) -> None:
        """Set target humidity."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_RANGE, "humidity", int(humidity)
        )

    async def async_set_mode(self, mode: str) -> None:
        """Set humidifier mode."""
        value = next(
            (
                option_value
                for option_value, option_name in self._mode_options.items()
                if option_name == mode
            ),
            mode,
        )
        await self.coordinator.async_device_action(
            self._device_id,
            CAP_MODE,
            get_capability_instance(self._mode_cap) or "mode",
            value,
        )
