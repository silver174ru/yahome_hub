"""Vacuum platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.vacuum import (
    StateVacuumEntity,
    VacuumEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAP_MODE,
    CAP_ON_OFF,
    CAP_TOGGLE,
    CAP_WORK_SPEED,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    find_mode_capability,
    get_capability,
    get_capability_instance,
    get_capability_state,
    get_property_value,
    mode_options,
    primary_domain,
    work_speed_options,
)

try:  # Home Assistant 2025.1+
    from homeassistant.components.vacuum import VacuumActivity
except ImportError:  # pragma: no cover
    VacuumActivity = None  # type: ignore[assignment]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Yandex vacuum cleaners."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeVacuum(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "vacuum"
    ]
    async_add_entities(entities)


class YahomeVacuum(YahomeDeviceEntity, StateVacuumEntity):
    """A Yandex vacuum cleaner."""

    _attr_name = None
    _attr_supported_features = (
        VacuumEntityFeature.START
        | VacuumEntityFeature.PAUSE
        | VacuumEntityFeature.STOP
        | VacuumEntityFeature.RETURN_HOME
        | VacuumEntityFeature.LOCATE
        | VacuumEntityFeature.FAN_SPEED
    )

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "vacuum")

    @property
    def _on(self) -> bool:
        return bool(get_capability_state(self.device, CAP_ON_OFF, "on"))

    @property
    def state(self) -> Any:
        """Return the vacuum activity."""
        if not self._on:
            return getattr(VacuumActivity, "DOCKED", "docked")
        paused = False
        for capability in self.device.get("capabilities") or []:
            if capability.get("type") != CAP_TOGGLE:
                continue
            if get_capability_instance(capability) == "pause":
                paused = bool((capability.get("state") or {}).get("value"))
                break
        if paused:
            return getattr(VacuumActivity, "PAUSED", "paused")
        return getattr(VacuumActivity, "CLEANING", "cleaning")

    @property
    def battery_level(self) -> int | None:
        """Return battery percentage."""
        value = get_property_value(self.device, "battery_level")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def fan_speed(self) -> str | None:
        """Return the current fan speed."""
        capability, capability_type = self._work_speed_capability()
        if not capability or not capability_type:
            return None
        instance = get_capability_instance(capability) or "fan_speed"
        value = get_capability_state(self.device, capability_type, instance)
        if value is None:
            return None
        for name, option_value in self._fan_speed_options().items():
            if option_value == str(value):
                return name
        return str(value)

    @property
    def fan_speed_list(self) -> list[str]:
        """Return available fan speeds."""
        return list(self._fan_speed_options())

    def _fan_speed_options(self) -> dict[str, str]:
        """Return display name -> Yandex value."""
        capability, capability_type = self._work_speed_capability()
        if not capability:
            return {}
        options = (
            mode_options(capability)
            if capability_type == CAP_MODE
            else work_speed_options(capability)
        )
        return {option["name"]: option["value"] for option in options}

    def _work_speed_capability(
        self,
    ) -> tuple[dict[str, Any] | None, str | None]:
        """Return the capability that controls suction power."""
        work_speed = get_capability(self.device, CAP_WORK_SPEED)
        if work_speed:
            return work_speed, CAP_WORK_SPEED
        mode = find_mode_capability(self.device, "fan_speed")
        if mode:
            return mode, CAP_MODE
        for capability in self.device.get("capabilities") or []:
            if capability.get("type") == CAP_MODE and get_capability_instance(
                capability
            ) in ("work_speed", "fan_speed"):
                return capability, CAP_MODE
        return None, None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return raw capabilities for diagnostics."""
        return {
            "capabilities": [
                {
                    "type": capability.get("type"),
                    "instance": get_capability_instance(capability),
                    "value": (capability.get("state") or {}).get("value"),
                }
                for capability in self.device.get("capabilities") or []
            ]
        }

    async def async_start(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_pause(self) -> None:
        if get_capability(self.device, CAP_TOGGLE):
            await self.coordinator.async_device_action(
                self._device_id, CAP_TOGGLE, "pause", True
            )
            return
        await self.async_stop()

    async def async_stop(self, **kwargs: Any) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )

    async def async_return_to_base(self, **kwargs: Any) -> None:
        mode = get_capability(self.device, CAP_MODE)
        if mode:
            for option in mode_options(mode):
                if option["value"] in (
                    "dock",
                    "return_to_base",
                    "home",
                    "charging",
                    "return",
                ):
                    await self.coordinator.async_device_action(
                        self._device_id,
                        CAP_MODE,
                        option["value"],
                        option["value"],
                    )
                    return
        await self.async_stop()

    async def async_locate(self, **kwargs: Any) -> None:
        if get_capability(self.device, CAP_TOGGLE):
            await self.coordinator.async_device_action(
                self._device_id, CAP_TOGGLE, "locate", True
            )

    async def async_set_fan_speed(
        self, fan_speed: str, **kwargs: Any
    ) -> None:
        capability, capability_type = self._work_speed_capability()
        if not capability or not capability_type:
            return
        instance = get_capability_instance(capability) or "fan_speed"
        value = self._fan_speed_options().get(fan_speed, fan_speed)
        await self.coordinator.async_device_action(
            self._device_id, capability_type, instance, value
        )
