"""Switch platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAPABILITY_NAMES,
    CAP_ON_OFF,
    CAP_TOGGLE,
    LED_SPEAKER_PLATFORMS,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    get_capability,
    get_capability_instance,
    get_capability_state,
    get_toggle_capabilities,
    is_primary_capability,
    primary_domain,
)
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up switches."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[SwitchEntity] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        domain = primary_domain(device)
        if domain in ("switch", "camera") and get_capability(
            device, CAP_ON_OFF
        ):
            entities.append(YahomeSwitch(coordinator, device_id))

        for capability in get_toggle_capabilities(device):
            instance = get_capability_instance(capability)
            if not instance:
                continue
            if is_primary_capability(device, CAP_TOGGLE, instance):
                continue
            entities.append(
                YahomeToggleSwitch(coordinator, device_id, instance)
            )
    entities.extend(
        YahomeSpeakerLedAutoSwitch(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("platform") in LED_SPEAKER_PLATFORMS
    )
    async_add_entities(entities)


class YahomeSwitch(YahomeDeviceEntity, SwitchEntity):
    """A switch backed by a Yandex on_off capability."""

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "switch")

    @property
    def is_on(self) -> bool | None:
        """Return the current state."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value) if value is not None else None

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the device on."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the device off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )


class YahomeToggleSwitch(YahomeDeviceEntity, SwitchEntity):
    """A switch backed by a Yandex toggle capability."""

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        instance: str,
    ) -> None:
        super().__init__(coordinator, device_id, f"toggle_{instance}")
        self._instance = instance
        self._attr_name = CAPABILITY_NAMES.get(
            instance, instance.replace("_", " ").title()
        )

    @property
    def is_on(self) -> bool | None:
        """Return the current toggle state."""
        value = get_capability_state(self.device, CAP_TOGGLE, self._instance)
        if isinstance(value, bool):
            return value
        if value is None:
            return None
        return bool(value)

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the toggle on."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_TOGGLE, self._instance, True
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the toggle off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_TOGGLE, self._instance, False
        )


class YahomeSpeakerLedAutoSwitch(YahomeSpeakerEntity, SwitchEntity):
    """Automatic brightness mode for a Yandex Station LED."""

    _attr_name = "Подсветка: авто"
    _attr_icon = "mdi:brightness-auto"

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "led_auto")

    @property
    def is_on(self) -> bool:
        """Return True while the LED brightness is automatic."""
        return self.coordinator.led_auto(self._speaker_id)

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Enable automatic LED brightness."""
        await self.coordinator.async_set_speaker_led_by_id(
            self._speaker_id, auto=True
        )
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Switch the LED to manual brightness."""
        await self.coordinator.async_set_speaker_led_by_id(
            self._speaker_id, auto=False
        )
        self.async_write_ha_state()
