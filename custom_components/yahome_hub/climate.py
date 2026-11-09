"""Climate platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.climate import (
    ATTR_TEMPERATURE,
    ClimateEntity,
    ClimateEntityFeature,
    HVACAction,
    HVACMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAP_MODE,
    CAP_ON_OFF,
    CAP_RANGE,
    CAP_TOGGLE,
    DEVICE_TYPE_AIR_CONDITIONER,
    DEVICE_TYPE_THERMOSTAT,
    DEVICE_TYPE_THERMOSTAT_AC,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    device_type,
    find_mode_capability,
    find_range_capability,
    find_toggle_capability,
    get_capability,
    get_capability_instance,
    get_capability_state,
    get_property_value,
    mode_options,
    primary_domain,
    range_bounds,
)

HVAC_ALIASES: dict[str, HVACMode] = {
    "heat": HVACMode.HEAT,
    "heating": HVACMode.HEAT,
    "cool": HVACMode.COOL,
    "cooling": HVACMode.COOL,
    "auto": HVACMode.AUTO,
    "automatic": HVACMode.AUTO,
    "dry": HVACMode.DRY,
    "fan": HVACMode.FAN_ONLY,
    "fan_only": HVACMode.FAN_ONLY,
    "fan_speed": HVACMode.FAN_ONLY,
    "heat_cool": HVACMode.HEAT_COOL,
    "off": HVACMode.OFF,
}

DEFAULT_MODES: dict[str, list[HVACMode]] = {
    DEVICE_TYPE_AIR_CONDITIONER: [
        HVACMode.OFF,
        HVACMode.COOL,
        HVACMode.HEAT,
        HVACMode.DRY,
        HVACMode.FAN_ONLY,
        HVACMode.AUTO,
    ],
    DEVICE_TYPE_THERMOSTAT: [HVACMode.OFF, HVACMode.HEAT],
    DEVICE_TYPE_THERMOSTAT_AC: [HVACMode.OFF, HVACMode.HEAT, HVACMode.COOL],
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up climate devices."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeClimate(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "climate"
    ]
    async_add_entities(entities)


class YahomeClimate(YahomeDeviceEntity, ClimateEntity):
    """A Yandex climate device."""

    _attr_name = None
    _attr_native_temperature_unit = UnitOfTemperature.CELSIUS
    _enable_turn_on_off_backwards_compatibility = False

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "climate")
        device = self.device
        mode_cap = self._mode_capability(device)
        self._mode_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(mode_cap)
            }
            if mode_cap
            else {}
        )
        modes: list[HVACMode] = []
        for value in self._mode_options:
            mode = HVAC_ALIASES.get(value)
            if mode and mode not in modes:
                modes.append(mode)
        if not modes:
            modes = list(
                DEFAULT_MODES.get(
                    device_type(device), [HVACMode.OFF, HVACMode.HEAT]
                )
            )
        if get_capability(device, CAP_ON_OFF) and HVACMode.OFF not in modes:
            modes.insert(0, HVACMode.OFF)
        self._attr_hvac_modes = modes

        fan_cap = self._fan_mode_capability(device)
        self._fan_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(fan_cap)
            }
            if fan_cap
            else {}
        )
        self._attr_fan_modes = list(self._fan_options.values()) or None

        swing_cap = self._swing_mode_capability(device)
        self._swing_options = (
            {
                option["value"]: option["name"]
                for option in mode_options(swing_cap)
            }
            if swing_cap
            else {}
        )
        self._swing_toggle = self._swing_toggle_instance(device)
        self._attr_swing_modes = (
            list(self._swing_options.values())
            if self._swing_options
            else (["Вкл", "Выкл"] if self._swing_toggle else None)
        )

        temperature_cap = self._range_capability(device, "temperature")
        if temperature_cap:
            minimum, maximum, step, _ = range_bounds(temperature_cap)
            self._attr_min_temp = minimum
            self._attr_max_temp = maximum
            self._attr_target_temperature_step = step
        self._attr_supported_features = self._supported_features()

    def _supported_features(self) -> ClimateEntityFeature:
        features = ClimateEntityFeature(0)
        if self._range_capability(self.device, "temperature"):
            features |= ClimateEntityFeature.TARGET_TEMPERATURE
        if self._range_capability(self.device, "humidity"):
            features |= ClimateEntityFeature.TARGET_HUMIDITY
        if self._fan_mode_capability(self.device):
            features |= ClimateEntityFeature.FAN_MODE
        if self._swing_mode_capability(self.device) or self._swing_toggle_instance(
            self.device
        ):
            features |= ClimateEntityFeature.SWING_MODE
        if get_capability(self.device, CAP_ON_OFF):
            features |= (
                ClimateEntityFeature.TURN_ON | ClimateEntityFeature.TURN_OFF
            )
        return features

    @staticmethod
    def _mode_capability(device: dict[str, Any]) -> dict[str, Any] | None:
        capability = find_mode_capability(device, "hvac")
        if capability:
            return capability
        for candidate in device.get("capabilities") or []:
            if candidate.get("type") == CAP_MODE:
                return candidate
        return None

    @staticmethod
    def _fan_mode_capability(device: dict[str, Any]) -> dict[str, Any] | None:
        return find_mode_capability(device, "fan_speed")

    @staticmethod
    def _swing_mode_capability(device: dict[str, Any]) -> dict[str, Any] | None:
        return find_mode_capability(device, "swing")

    @staticmethod
    def _swing_toggle_instance(device: dict[str, Any]) -> str | None:
        return find_toggle_capability(device, ("swing", "oscillation"))

    @staticmethod
    def _range_capability(
        device: dict[str, Any], instance: str
    ) -> dict[str, Any] | None:
        return find_range_capability(device, instance)

    @property
    def hvac_mode(self) -> HVACMode:
        """Return the current HVAC mode."""
        if not get_capability_state(self.device, CAP_ON_OFF, "on"):
            return HVACMode.OFF
        mode_cap = self._mode_capability(self.device)
        if mode_cap:
            value = get_capability_state(
                self.device, CAP_MODE, get_capability_instance(mode_cap)
            )
            if isinstance(value, str):
                return HVAC_ALIASES.get(value, self._attr_hvac_modes[-1])
        if device_type(self.device) in (
            DEVICE_TYPE_THERMOSTAT,
            DEVICE_TYPE_THERMOSTAT_AC,
        ):
            return HVACMode.HEAT
        return HVACMode.AUTO

    @property
    def hvac_action(self) -> HVACAction | None:
        """Return the current action."""
        if self.hvac_mode == HVACMode.OFF:
            return HVACAction.OFF
        if self.hvac_mode == HVACMode.HEAT:
            return HVACAction.HEATING
        if self.hvac_mode == HVACMode.COOL:
            return HVACAction.COOLING
        if self.hvac_mode == HVACMode.DRY:
            return HVACAction.DRYING
        if self.hvac_mode == HVACMode.FAN_ONLY:
            return HVACAction.FAN
        return HVACAction.IDLE

    @property
    def native_current_temperature(self) -> float | None:
        """Return the current temperature."""
        value = get_property_value(self.device, "temperature")
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def native_target_temperature(self) -> float | None:
        """Return the target temperature."""
        value = get_capability_state(self.device, CAP_RANGE, "temperature")
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def current_humidity(self) -> float | None:
        """Return the current humidity."""
        value = get_property_value(self.device, "humidity")
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def target_humidity(self) -> int | None:
        """Return the target humidity."""
        value = get_capability_state(self.device, CAP_RANGE, "humidity")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def fan_mode(self) -> str | None:
        """Return the current fan mode."""
        fan_cap = self._fan_mode_capability(self.device)
        if not fan_cap:
            return None
        value = get_capability_state(
            self.device, CAP_MODE, get_capability_instance(fan_cap)
        )
        return self._fan_options.get(str(value), str(value) if value else None)

    @property
    def swing_mode(self) -> str | None:
        """Return the current swing mode."""
        swing_cap = self._swing_mode_capability(self.device)
        if swing_cap:
            value = get_capability_state(
                self.device, CAP_MODE, get_capability_instance(swing_cap)
            )
            return self._swing_options.get(
                str(value), str(value) if value else None
            )
        if self._swing_toggle:
            value = get_capability_state(
                self.device, CAP_TOGGLE, self._swing_toggle
            )
            return "Вкл" if value else "Выкл"
        return None

    async def async_set_temperature(self, **kwargs: Any) -> None:
        """Set the target temperature."""
        if ATTR_TEMPERATURE in kwargs:
            await self.coordinator.async_device_action(
                self._device_id,
                CAP_RANGE,
                "temperature",
                float(kwargs[ATTR_TEMPERATURE]),
            )

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        """Set the HVAC mode."""
        if hvac_mode == HVACMode.OFF:
            await self.async_turn_off()
            return
        await self.async_turn_on()
        for value, name in self._mode_options.items():
            if HVAC_ALIASES.get(value) == hvac_mode or name == hvac_mode:
                await self.coordinator.async_device_action(
                    self._device_id,
                    CAP_MODE,
                    get_capability_instance(self._mode_capability(self.device))
                    or "mode",
                    value,
                )
                return

    async def async_set_fan_mode(self, fan_mode: str) -> None:
        """Set the fan mode."""
        fan_cap = self._fan_mode_capability(self.device)
        if not fan_cap:
            return
        value = next(
            (
                option_value
                for option_value, option_name in self._fan_options.items()
                if option_name == fan_mode
            ),
            fan_mode,
        )
        await self.coordinator.async_device_action(
            self._device_id,
            CAP_MODE,
            get_capability_instance(fan_cap) or "fan_speed",
            value,
        )

    async def async_set_humidity(self, humidity: int) -> None:
        """Set the target humidity."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_RANGE, "humidity", int(humidity)
        )

    async def async_set_swing_mode(self, swing_mode: str) -> None:
        """Set the swing mode."""
        swing_cap = self._swing_mode_capability(self.device)
        if swing_cap:
            value = next(
                (
                    option_value
                    for option_value, option_name in self._swing_options.items()
                    if option_name == swing_mode
                ),
                swing_mode,
            )
            await self.coordinator.async_device_action(
                self._device_id,
                CAP_MODE,
                get_capability_instance(swing_cap) or "swing",
                value,
            )
            return
        if self._swing_toggle:
            await self.coordinator.async_device_action(
                self._device_id,
                CAP_TOGGLE,
                self._swing_toggle,
                swing_mode == "Вкл",
            )

    async def async_turn_on(self) -> None:
        """Turn the climate device on."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_turn_off(self) -> None:
        """Turn the climate device off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )
