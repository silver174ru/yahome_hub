"""Select platform for generic Yandex mode capabilities."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAPABILITY_NAMES, CAP_MODE, CAP_WORK_SPEED
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    classify_mode_capability,
    get_capability,
    get_capability_instance,
    get_capability_state,
    get_mode_capabilities,
    is_primary_capability,
    mode_options,
    work_speed_options,
)

MODE_NAMES = {
    "hvac": "Режим",
    "mode": "Режим",
    "fan_speed": "Скорость",
    "swing": "Качание",
    "direction": "Направление",
    "cleanup_mode": "Режим уборки",
    "work_speed": "Мощность",
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up generic mode selects."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeSelect] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        used_keys: set[str] = set()
        for capability in get_mode_capabilities(device):
            kind = classify_mode_capability(capability)
            state_instance = get_capability_instance(capability) or kind
            key = state_instance
            if key in used_keys:
                key = f"{state_instance}_{len(used_keys)}"
            used_keys.add(key)
            if is_primary_capability(device, CAP_MODE, state_instance):
                continue
            entities.append(
                YahomeSelect(
                    coordinator,
                    device_id,
                    capability,
                    CAP_MODE,
                    key,
                    state_instance,
                )
            )

        work_speed = get_capability(device, CAP_WORK_SPEED)
        if work_speed:
            state_instance = (
                get_capability_instance(work_speed) or "fan_speed"
            )
            if not is_primary_capability(
                device, CAP_WORK_SPEED, state_instance
            ):
                entities.append(
                    YahomeSelect(
                        coordinator,
                        device_id,
                        work_speed,
                        CAP_WORK_SPEED,
                        "fan_speed",
                        state_instance,
                    )
                )
    async_add_entities(entities)


class YahomeSelect(YahomeDeviceEntity, SelectEntity):
    """A generic Yandex mode or work_speed capability."""

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        capability: dict[str, Any],
        capability_type: str,
        key: str,
        state_instance: str,
    ) -> None:
        super().__init__(
            coordinator,
            device_id,
            f"{capability_type.rsplit('.', 1)[-1]}_{key}",
        )
        self._capability_type = capability_type
        self._state_instance = state_instance
        options = (
            work_speed_options(capability)
            if capability_type == CAP_WORK_SPEED
            else mode_options(capability)
        )
        self._value_to_name = {
            option["value"]: option["name"] for option in options
        }
        self._name_to_value = {
            option["name"]: option["value"] for option in options
        }
        self._attr_options = list(self._name_to_value)
        self._attr_name = (
            CAPABILITY_NAMES.get(state_instance)
            or MODE_NAMES.get(key)
            or key.replace("_", " ").title()
        )

    @property
    def current_option(self) -> str | None:
        """Return the current option."""
        value = get_capability_state(
            self.device, self._capability_type, self._state_instance
        )
        if value is None:
            return None
        return self._value_to_name.get(str(value), str(value))

    async def async_select_option(self, option: str) -> None:
        """Select an option."""
        value = self._name_to_value.get(option, option)
        await self.coordinator.async_device_action(
            self._device_id,
            self._capability_type,
            self._state_instance,
            value,
        )
