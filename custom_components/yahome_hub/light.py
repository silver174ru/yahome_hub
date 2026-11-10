"""Light platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_COLOR_TEMP_KELVIN,
    ATTR_EFFECT,
    ColorMode,
    LightEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAP_COLOR_SETTING,
    CAP_ON_OFF,
    CAP_RANGE,
    LED_SPEAKER_PLATFORMS,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .speaker_entity import YahomeSpeakerEntity
from .helpers import (
    get_capability,
    get_capability_parameters,
    get_capability_state,
    is_light,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up lights."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeLight] = []
    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id) or not is_light(device):
            continue
        if not any(
            get_capability(device, capability_type)
            for capability_type in (CAP_ON_OFF, CAP_RANGE, CAP_COLOR_SETTING)
        ):
            continue
        entities.append(YahomeLight(coordinator, device_id))
    entities.extend(
        YahomeSpeakerLedLight(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("platform") in LED_SPEAKER_PLATFORMS
    )
    async_add_entities(entities)


class YahomeLight(YahomeDeviceEntity, LightEntity):
    """A Yandex light, strip or lamp."""

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "light")
        device = coordinator.data.devices.get(device_id, {})
        color_parameters = get_capability_parameters(device, CAP_COLOR_SETTING)
        modes: set[ColorMode] = set()
        has_temperature = bool(
            color_parameters.get("temperature_k")
            or get_capability_state(
                device, CAP_COLOR_SETTING, "temperature_k"
            )
            is not None
        )
        if has_temperature:
            modes.add(ColorMode.COLOR_TEMP)
        elif get_capability(device, CAP_RANGE) or get_capability(
            device, CAP_COLOR_SETTING
        ):
            modes.add(ColorMode.BRIGHTNESS)
        else:
            modes.add(ColorMode.ONOFF)
        self._attr_supported_color_modes = modes

        temperature = color_parameters.get("temperature_k") or {}
        self._attr_min_color_temp_kelvin = int(
            temperature.get("min", 2700)
        )
        self._attr_max_color_temp_kelvin = int(
            temperature.get("max", 6500)
        )
        scenes = color_parameters.get("color_scenes")
        self._attr_effect_list = [
            scene.get("name") or scene.get("id")
            for scene in scenes or []
            if isinstance(scene, dict) and scene.get("id")
        ]
        self._scenes = {
            str(scene.get("id")): scene.get("name") or scene.get("id")
            for scene in scenes or []
            if isinstance(scene, dict) and scene.get("id")
        }

    @property
    def is_on(self) -> bool | None:
        """Return the current state."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value) if value is not None else None

    @property
    def brightness(self) -> int | None:
        """Return brightness 0..255."""
        value = get_capability_state(self.device, CAP_RANGE, "brightness")
        if value is None:
            return None
        try:
            return round(float(value) / 100 * 255)
        except (TypeError, ValueError):
            return None

    @property
    def color_temp_kelvin(self) -> int | None:
        """Return color temperature in Kelvin."""
        value = get_capability_state(
            self.device, CAP_COLOR_SETTING, "temperature_k"
        )
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def effect(self) -> str | None:
        """Return the active color scene."""
        value = get_capability_state(
            self.device, CAP_COLOR_SETTING, "color_scene"
        )
        if value is None:
            return None
        return self._scenes.get(str(value))

    @property
    def color_mode(self) -> ColorMode:
        """Return the active color mode."""
        if ColorMode.COLOR_TEMP in self._attr_supported_color_modes:
            return ColorMode.COLOR_TEMP
        if ColorMode.BRIGHTNESS in self._attr_supported_color_modes:
            return ColorMode.BRIGHTNESS
        return ColorMode.ONOFF

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the light on and apply optional attributes."""
        if ATTR_EFFECT in kwargs:
            scene_id = None
            effect = kwargs[ATTR_EFFECT]
            for scene, name in self._scenes.items():
                if name == effect:
                    scene_id = scene
                    break
            if scene_id:
                await self.coordinator.async_device_action(
                    self._device_id,
                    CAP_COLOR_SETTING,
                    "color_scene",
                    scene_id,
                )
        if ATTR_BRIGHTNESS in kwargs:
            value = round(int(kwargs[ATTR_BRIGHTNESS]) / 255 * 100)
            await self.coordinator.async_device_action(
                self._device_id, CAP_RANGE, "brightness", value
            )
        if ATTR_COLOR_TEMP_KELVIN in kwargs:
            await self.coordinator.async_device_action(
                self._device_id,
                CAP_COLOR_SETTING,
                "temperature_k",
                int(kwargs[ATTR_COLOR_TEMP_KELVIN]),
            )
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the light off."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )


class YahomeSpeakerLedLight(YahomeSpeakerEntity, LightEntity):
    """LED brightness of a Yandex Station."""

    _attr_name = "Подсветка"
    _attr_supported_color_modes = {ColorMode.BRIGHTNESS}
    _attr_color_mode = ColorMode.BRIGHTNESS

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "led")

    @property
    def is_on(self) -> bool:
        """Return True while the LED is lit."""
        return (self.brightness or 0) > 0

    @property
    def brightness(self) -> int:
        """Return LED brightness 0..255."""
        return round(self.coordinator.led_brightness(self._speaker_id) * 255)

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Turn the LED on or set its brightness."""
        brightness = kwargs.get(ATTR_BRIGHTNESS)
        value = (
            int(brightness) / 255 if brightness is not None else 1.0
        )
        await self.coordinator.async_set_speaker_led_by_id(
            self._speaker_id, brightness=value
        )

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Turn the LED off."""
        await self.coordinator.async_set_speaker_led_by_id(
            self._speaker_id, brightness=0.0
        )
