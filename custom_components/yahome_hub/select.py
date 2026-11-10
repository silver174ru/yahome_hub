"""Select platform for generic Yandex mode capabilities."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAPABILITY_NAMES,
    CAP_MODE,
    CAP_WORK_SPEED,
    MUSIC_SPEAKER_PLATFORMS,
)
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
from .speaker_entity import YahomeSpeakerEntity

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
    """Set up generic mode selects and speaker equalizers."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[SelectEntity] = [
        YahomeEqualizerSelect(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
        and speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
    ]
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


EQUALIZER_BANDS = (
    (60, 90),
    (230, 340),
    (910, 1340),
    (3600, 5200),
    (14000, 13000),
)

EQUALIZER_PRESETS: dict[str, tuple[int, int, int, int, int] | None] = {
    "off": None,
    "lessbass": (-6, 0, 0, 0, 0),
    "movie": (-3, -1, 0, 0, 3),
    "voice": (0, 0, 2, 2, 3),
    "custom": None,
    "pop": (0, 1, 2, 1, 0),
    "hiphop": (3, 2, 0, 3, 3),
    "dance": (5, 3, 0, 3, 0),
    "rock": (3, 0, -1, 2, 4),
    "electro": (3, 1, -1, 1, 2),
    "metal": (4, -2, -2, -2, 4),
    "rnb": (5, 2, -1, 2, 4),
    "classic": (0, 0, 0, 0, -3),
    "acoustics": (3, 0, 1, 1, 3),
    "jazz": (2, 0, 1, 0, 2),
    "concert": (1, 0, 0, 0, 1),
    "party": (4, 1, -2, 1, 4),
    "morebass": (5, 0, 0, 0, 0),
    "morehigh": (0, 0, 0, 0, 5),
    "morebasshigh": (5, 0, 0, 0, 5),
    "lesshigh": (0, 0, 0, 0, -5),
}


class YahomeEqualizerSelect(YahomeSpeakerEntity, SelectEntity):
    """Five-band equalizer exposed by Yandex Stations."""

    _attr_name = "Эквалайзер"
    _attr_icon = "mdi:equalizer"
    _attr_options = list(EQUALIZER_PRESETS)

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "equalizer")
        self._attr_current_option = None
        self._version: str | None = None

    async def async_added_to_hass(self) -> None:
        """Read the current preset from the speaker."""
        await super().async_added_to_hass()
        await self._async_refresh()

    @property
    def _config_id(self) -> str:
        return self.coordinator.data.quasar_to_iot.get(
            self._speaker_id, self._speaker_id
        )

    async def _async_refresh(self) -> None:
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None:
            return
        try:
            config, version = await quasar.get_device_config(self._config_id)
        except Exception:  # noqa: BLE001
            return
        self._version = version
        equalizer = config.get("equalizer") or {}
        if equalizer.get("enabled"):
            preset = equalizer.get("active_preset_id")
            self._attr_current_option = (
                preset if preset in EQUALIZER_PRESETS else "custom"
            )
        else:
            self._attr_current_option = "off"

    async def async_select_option(self, option: str) -> None:
        """Apply an equalizer preset."""
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None or option not in EQUALIZER_PRESETS:
            return
        try:
            config, version = await quasar.get_device_config(self._config_id)
        except Exception:  # noqa: BLE001
            return

        equalizer = config.get("equalizer")
        if not isinstance(equalizer, dict):
            equalizer = {
                "bands": [
                    {"freq": freq, "width": width, "gain": 0}
                    for freq, width in EQUALIZER_BANDS
                ],
                "custom_preset_bands": [0, 0, 0, 0, 0],
                "active_preset_id": "custom",
            }
            config["equalizer"] = equalizer

        if option == "off":
            equalizer["enabled"] = False
        else:
            gains = EQUALIZER_PRESETS[option]
            if gains is None:
                gains = tuple(equalizer.get("custom_preset_bands") or (0,) * 5)
            equalizer["enabled"] = True
            equalizer["active_preset_id"] = option
            for band, gain in zip(equalizer["bands"], gains, strict=False):
                band["gain"] = gain

        try:
            await quasar.set_device_config(
                self._config_id, config, version or self._version
            )
        except Exception:  # noqa: BLE001
            return

        self._attr_current_option = option
        self.async_write_ha_state()
