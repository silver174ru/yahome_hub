"""Fan platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.fan import FanEntity, FanEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAP_MODE, CAP_ON_OFF, CAP_RANGE, CAP_TOGGLE
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    find_mode_capability,
    find_range_capability,
    find_toggle_capability,
    get_capability,
    get_capability_instance,
    get_capability_state,
    mode_options,
    primary_domain,
    range_bounds,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up fans and purifiers."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeFan(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "fan"
    ]
    async_add_entities(entities)


class YahomeFan(YahomeDeviceEntity, FanEntity):
    """A Yandex fan, purifier or ventilation device."""

    _attr_name = None
    _enable_turn_on_off_backwards_compatibility = False

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "fan")
        device = self.device
        self._speed_cap = self._range_capability(device, "fan_speed")
        self._mode_cap = self._mode_capability(device)
        self._mode_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(self._mode_cap)
            }
            if self._mode_cap
            else {}
        )
        self._osc_toggle = self._toggle_instance(
            device, ("oscillation", "swing")
        )
        self._osc_mode = self._mode_instance(device, ("swing",))
        self._osc_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(self._osc_mode)
            }
            if self._osc_mode
            else {}
        )
        self._direction_mode = self._mode_instance(device, ("direction",))
        self._direction_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(self._direction_mode)
            }
            if self._direction_mode
            else {}
        )

        features = FanEntityFeature(0)
        if self._speed_cap or self._mode_cap:
            features |= FanEntityFeature.SET_SPEED
        if self._mode_cap:
            features |= FanEntityFeature.PRESET_MODE
        if self._osc_toggle or self._osc_mode:
            features |= FanEntityFeature.OSCILLATE
        if self._direction_mode:
            features |= FanEntityFeature.DIRECTION
        if get_capability(self.device, CAP_ON_OFF):
            features |= FanEntityFeature.TURN_ON | FanEntityFeature.TURN_OFF
        self._attr_supported_features = features

    @staticmethod
    def _range_capability(
        device: dict[str, Any], instance: str
    ) -> dict[str, Any] | None:
        return find_range_capability(device, instance)

    @staticmethod
    def _mode_capability(device: dict[str, Any]) -> dict[str, Any] | None:
        return find_mode_capability(device, "fan_speed")

    @staticmethod
    def _mode_instance(
        device: dict[str, Any], instances: tuple[str, ...]
    ) -> dict[str, Any] | None:
        for kind in instances:
            capability = find_mode_capability(device, kind)
            if capability:
                return capability
        return None

    @staticmethod
    def _toggle_instance(
        device: dict[str, Any], instances: tuple[str, ...]
    ) -> str | None:
        return find_toggle_capability(device, instances)

    @property
    def is_on(self) -> bool | None:
        """Return the current state."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value) if value is not None else None

    @property
    def percentage(self) -> int | None:
        """Return speed percentage."""
        if not self._speed_cap:
            return None
        instance = get_capability_instance(self._speed_cap) or "fan_speed"
        value = get_capability_state(self.device, CAP_RANGE, instance)
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        minimum, maximum, _, _ = range_bounds(self._speed_cap)
        if maximum <= minimum:
            return None
        return max(0, min(100, round((number - minimum) / (maximum - minimum) * 100)))

    @property
    def preset_mode(self) -> str | None:
        """Return the current preset mode."""
        if not self._mode_cap:
            return None
        instance = get_capability_instance(self._mode_cap)
        value = get_capability_state(self.device, CAP_MODE, instance)
        if value is None:
            return None
        return self._mode_options.get(str(value), str(value))

    @property
    def preset_modes(self) -> list[str] | None:
        """Return available preset modes."""
        return list(self._mode_options.values()) or None

    @property
    def oscillating(self) -> bool | None:
        """Return oscillation state."""
        if self._osc_toggle:
            value = get_capability_state(
                self.device, CAP_TOGGLE, self._osc_toggle
            )
            return bool(value) if value is not None else None
        if self._osc_mode:
            instance = get_capability_instance(self._osc_mode)
            value = str(
                get_capability_state(self.device, CAP_MODE, instance) or ""
            ).lower()
            if value in ("on", "true", "enabled", "1"):
                return True
            if value in ("off", "false", "disabled", "0"):
                return False
        return None

    @property
    def direction(self) -> str | None:
        """Return fan direction."""
        if not self._direction_mode:
            return None
        instance = get_capability_instance(self._direction_mode)
        value = get_capability_state(self.device, CAP_MODE, instance)
        if value is None:
            return None
        return self._direction_options.get(str(value), str(value))

    @property
    def direction_list(self) -> list[str] | None:
        """Return available directions."""
        return list(self._direction_options.values()) or None

    async def async_turn_on(
        self,
        percentage: int | None = None,
        preset_mode: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Turn the fan on."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )
        if percentage is not None:
            await self.async_set_percentage(percentage)
        if preset_mode is not None:
            await self.async_set_preset_mode(preset_mode)

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the fan off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )

    async def async_set_percentage(self, percentage: int) -> None:
        """Set fan speed percentage."""
        if not self._speed_cap:
            return
        minimum, maximum, _, _ = range_bounds(self._speed_cap)
        value = round(
            minimum
            + (maximum - minimum) * max(0, min(100, percentage)) / 100
        )
        instance = get_capability_instance(self._speed_cap) or "fan_speed"
        await self.coordinator.async_device_action(
            self._device_id, CAP_RANGE, instance, value
        )

    async def async_set_preset_mode(self, preset_mode: str) -> None:
        """Set a preset mode."""
        if not self._mode_cap:
            return
        value = next(
            (
                option_value
                for option_value, option_name in self._mode_options.items()
                if option_name == preset_mode
            ),
            preset_mode,
        )
        await self.coordinator.async_device_action(
            self._device_id,
            CAP_MODE,
            get_capability_instance(self._mode_cap) or "fan_speed",
            value,
        )

    async def async_oscillate(self, oscillating: bool) -> None:
        """Set oscillation."""
        if self._osc_toggle:
            await self.coordinator.async_device_action(
                self._device_id, CAP_TOGGLE, self._osc_toggle, oscillating
            )
            return
        if self._osc_mode:
            value = next(
                (
                    option_value
                    for option_value, option_name in self._osc_options.items()
                    if option_name.lower()
                    in (("вкл", "on") if oscillating else ("выкл", "off"))
                ),
                "on" if oscillating else "off",
            )
            await self.coordinator.async_device_action(
                self._device_id,
                CAP_MODE,
                get_capability_instance(self._osc_mode) or "oscillation",
                value,
            )

    async def async_set_direction(self, direction: str) -> None:
        """Set fan direction."""
        if not self._direction_mode:
            return
        value = next(
            (
                option_value
                for option_value, option_name in self._direction_options.items()
                if option_name == direction
            ),
            direction,
        )
        await self.coordinator.async_device_action(
            self._device_id,
            CAP_MODE,
            get_capability_instance(self._direction_mode) or "direction",
            value,
        )
