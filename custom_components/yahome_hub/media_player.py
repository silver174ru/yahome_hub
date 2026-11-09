"""Media player platform for Yandex Stations and media devices."""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CAP_MEDIA_PLAYBACK, CAP_ON_OFF, CAP_VOLUME, DOMAIN
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    get_capability,
    get_capability_state,
    is_online,
    primary_domain,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up speakers and media devices."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[MediaPlayerEntity] = []
    for speaker_id, speaker in coordinator.data.speakers.items():
        entities.append(YahomeSpeaker(coordinator, speaker_id, speaker))

    for device_id, device in coordinator.data.devices.items():
        if not coordinator.is_device_visible(device_id):
            continue
        if primary_domain(device) != "media_player":
            continue
        if device.get("quasar_info"):
            continue
        if not any(
            get_capability(device, capability_type)
            for capability_type in (CAP_ON_OFF, CAP_VOLUME, CAP_MEDIA_PLAYBACK)
        ):
            continue
        entities.append(YahomeMediaPlayer(coordinator, device_id))
    async_add_entities(entities)


class YahomeSpeaker(
    CoordinatorEntity[YahomeDataUpdateCoordinator], MediaPlayerEntity
):
    """A Yandex Station controlled through Quasar."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_supported_features = (
        MediaPlayerEntityFeature.TURN_ON
        | MediaPlayerEntityFeature.TURN_OFF
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.STOP
    )

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        speaker_id: str,
        speaker: dict[str, Any],
    ) -> None:
        super().__init__(coordinator)
        self._speaker_id = speaker_id
        self._speaker = speaker
        self._attr_unique_id = f"speaker_{speaker_id}_media_player"

    @property
    def _iot_device_id(self) -> str | None:
        return self.coordinator.data.quasar_to_iot.get(self._speaker_id)

    @property
    def _iot_device(self) -> dict[str, Any] | None:
        device_id = self._iot_device_id
        return self.coordinator.data.devices.get(device_id) if device_id else None

    @property
    def device_info(self) -> DeviceInfo:
        """Return HA device registry metadata."""
        iot_device = self._iot_device
        if iot_device:
            info = iot_device.get("device_info") or {}
            return DeviceInfo(
                identifiers={(DOMAIN, self._iot_device_id)},
                name=iot_device.get("name") or self._speaker.get("name"),
                manufacturer=info.get("manufacturer") or "Yandex",
                model=info.get("model") or self._speaker.get("platform"),
                sw_version=info.get("sw_version"),
            )
        return DeviceInfo(
            identifiers={(DOMAIN, f"speaker_{self._speaker_id}")},
            name=self._speaker.get("name") or "Yandex Station",
            manufacturer="Yandex",
            model=self._speaker.get("platform"),
        )

    @property
    def state(self) -> MediaPlayerState:
        """Return the speaker state."""
        iot_device = self._iot_device
        if iot_device and not is_online(iot_device):
            return MediaPlayerState.OFF
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float | None:
        """Return volume 0..1."""
        if not self._iot_device:
            return None
        value = get_capability_state(self._iot_device, CAP_VOLUME, "volume")
        try:
            return float(value) / 100 if value is not None else None
        except (TypeError, ValueError):
            return None

    async def async_turn_on(self) -> None:
        """Turn the speaker on."""
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", True
            )
            return
        await self._send_action(CAP_ON_OFF, "on", True)

    async def async_turn_off(self) -> None:
        """Turn the speaker off."""
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", False
            )
            return
        await self._send_action(CAP_ON_OFF, "on", False)

    async def async_set_volume_level(self, volume: float) -> None:
        """Set the speaker volume."""
        value = round(float(volume) * 100)
        if self._iot_device and get_capability(self._iot_device, CAP_VOLUME):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_VOLUME, "volume", value
            )
            return
        await self._send_action(CAP_VOLUME, "volume", value)

    async def async_media_play(self) -> None:
        """Start playback."""
        await self._send_action(CAP_MEDIA_PLAYBACK, "play", True)

    async def async_media_pause(self) -> None:
        """Pause playback."""
        await self._send_action(CAP_MEDIA_PLAYBACK, "pause", True)

    async def async_media_stop(self) -> None:
        """Stop playback."""
        await self._send_action(CAP_MEDIA_PLAYBACK, "stop", True)

    async def _send_action(
        self, capability_type: str, instance: str, value: Any
    ) -> None:
        await self.coordinator.async_speaker_action(
            self._speaker_id,
            [
                {
                    "type": capability_type,
                    "state": {"instance": instance, "value": value},
                }
            ],
        )


class YahomeMediaPlayer(YahomeDeviceEntity, MediaPlayerEntity):
    """A Yandex media device or TV controlled through the IoT API."""

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "media_player")
        features = MediaPlayerEntityFeature(0)
        if get_capability(self.device, CAP_ON_OFF):
            features |= (
                MediaPlayerEntityFeature.TURN_ON
                | MediaPlayerEntityFeature.TURN_OFF
            )
        if get_capability(self.device, CAP_VOLUME):
            features |= MediaPlayerEntityFeature.VOLUME_SET
        if get_capability(self.device, CAP_MEDIA_PLAYBACK):
            features |= (
                MediaPlayerEntityFeature.PLAY
                | MediaPlayerEntityFeature.PAUSE
                | MediaPlayerEntityFeature.STOP
            )
        self._attr_supported_features = features

    @property
    def state(self) -> MediaPlayerState:
        """Return the media device state."""
        if not is_online(self.device):
            return MediaPlayerState.OFF
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        if value is False:
            return MediaPlayerState.OFF
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float | None:
        """Return volume 0..1."""
        value = get_capability_state(self.device, CAP_VOLUME, "volume")
        try:
            return float(value) / 100 if value is not None else None
        except (TypeError, ValueError):
            return None

    async def async_turn_on(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", True
        )

    async def async_turn_off(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_ON_OFF, "on", False
        )

    async def async_set_volume_level(self, volume: float) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_VOLUME, "volume", round(float(volume) * 100)
        )

    async def async_media_play(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_MEDIA_PLAYBACK, "play", True
        )

    async def async_media_pause(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_MEDIA_PLAYBACK, "pause", True
        )

    async def async_media_stop(self) -> None:
        await self.coordinator.async_device_action(
            self._device_id, CAP_MEDIA_PLAYBACK, "stop", True
        )
