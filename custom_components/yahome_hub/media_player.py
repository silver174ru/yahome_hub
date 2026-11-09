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
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

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

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        speaker_id: str,
        speaker: dict[str, Any],
    ) -> None:
        super().__init__(coordinator)
        self._speaker_id = speaker_id
        self._speaker = speaker
        self._linked_entity_id: str | None = None
        self._attr_unique_id = f"speaker_{speaker_id}_media_player"

    async def async_added_to_hass(self) -> None:
        """Resolve the matching media_player entity from Yandex Station."""
        await super().async_added_to_hass()
        registry = er.async_get(self.hass)
        self._linked_entity_id = registry.async_get_entity_id(
            "media_player", "yandex_station", self._speaker_id
        )

    @property
    def _linked_state(self):
        """Return the live state of the Yandex Station media player."""
        if not self._linked_entity_id:
            return None
        return self.hass.states.get(self._linked_entity_id)

    @property
    def _linked_attrs(self) -> dict[str, Any]:
        state = self._linked_state
        return dict(state.attributes) if state else {}

    @property
    def supported_features(self) -> MediaPlayerEntityFeature:
        features = (
            MediaPlayerEntityFeature.TURN_ON
            | MediaPlayerEntityFeature.TURN_OFF
            | MediaPlayerEntityFeature.PLAY
            | MediaPlayerEntityFeature.PAUSE
            | MediaPlayerEntityFeature.STOP
        )
        if self.volume_level is not None:
            features |= (
                MediaPlayerEntityFeature.VOLUME_SET
                | MediaPlayerEntityFeature.VOLUME_MUTE
            )
        if self._linked_state:
            features |= (
                MediaPlayerEntityFeature.PREVIOUS_TRACK
                | MediaPlayerEntityFeature.NEXT_TRACK
                | MediaPlayerEntityFeature.SEEK
            )
        return features

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
        linked = self._linked_state
        if linked:
            try:
                return MediaPlayerState(linked.state)
            except ValueError:
                pass
        iot_device = self._iot_device
        if iot_device and not is_online(iot_device):
            return MediaPlayerState.OFF
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float | None:
        """Return volume 0..1."""
        linked = self._linked_attrs.get("volume_level")
        if linked is not None:
            try:
                return float(linked)
            except (TypeError, ValueError):
                pass
        if not self._iot_device:
            return None
        value = get_capability_state(self._iot_device, CAP_VOLUME, "volume")
        try:
            return float(value) / 100 if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def is_volume_muted(self) -> bool:
        linked = self._linked_attrs.get("is_volume_muted")
        return bool(linked) if linked is not None else False

    @property
    def media_title(self) -> str | None:
        return self._linked_attrs.get("media_title")

    @property
    def media_artist(self) -> str | None:
        return self._linked_attrs.get("media_artist")

    @property
    def media_album_name(self) -> str | None:
        return self._linked_attrs.get("media_album_name")

    @property
    def media_image_url(self) -> str | None:
        return self._linked_attrs.get("entity_picture")

    @property
    def media_content_id(self) -> str | None:
        return self._linked_attrs.get("media_content_id")

    @property
    def media_content_type(self) -> str | None:
        return self._linked_attrs.get("media_content_type")

    @property
    def media_duration(self) -> int | None:
        value = self._linked_attrs.get("media_duration")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def media_position(self) -> int | None:
        value = self._linked_attrs.get("media_position")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def media_position_updated_at(self):
        value = self._linked_attrs.get("media_position_updated_at")
        if isinstance(value, str):
            return dt_util.parse_datetime(value)
        return value

    async def _call_linked(self, service: str, **data: Any) -> bool:
        """Call a media_player service on the linked Station entity."""
        if not self._linked_entity_id:
            return False
        state = self._linked_state
        if state is None or state.state in ("unavailable", "unknown"):
            return False
        await self.hass.services.async_call(
            "media_player",
            service,
            {"entity_id": self._linked_entity_id, **data},
            blocking=True,
        )
        return True

    async def async_turn_on(self) -> None:
        """Turn the speaker on."""
        if await self._call_linked("turn_on"):
            return
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", True
            )
            return
        await self._send_action(CAP_ON_OFF, "on", True)

    async def async_turn_off(self) -> None:
        """Turn the speaker off."""
        if await self._call_linked("turn_off"):
            return
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", False
            )
            return
        await self._send_action(CAP_ON_OFF, "on", False)

    async def async_set_volume_level(self, volume: float) -> None:
        """Set the speaker volume."""
        volume = max(0.0, min(1.0, float(volume)))
        if await self._call_linked("volume_set", volume_level=volume):
            return
        value = round(volume * 100)
        if self._iot_device and get_capability(self._iot_device, CAP_VOLUME):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_VOLUME, "volume", value
            )
            return
        await self._send_action(CAP_VOLUME, "volume", value)

    async def async_mute_volume(self, mute: bool) -> None:
        """Mute or unmute the speaker."""
        if mute:
            await self.async_set_volume_level(0.0)
            return
        await self.async_set_volume_level(self.volume_level or 0.5)

    async def async_media_play(self) -> None:
        """Start playback."""
        if await self._call_linked("media_play"):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "play", True)

    async def async_media_pause(self) -> None:
        """Pause playback."""
        if await self._call_linked("media_pause"):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "pause", True)

    async def async_media_stop(self) -> None:
        """Stop playback."""
        if await self._call_linked("media_stop"):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "stop", True)

    async def async_media_next_track(self) -> None:
        """Play the next track."""
        await self._call_linked("media_next_track")

    async def async_media_previous_track(self) -> None:
        """Play the previous track."""
        await self._call_linked("media_previous_track")

    async def async_media_seek(self, position: float) -> None:
        """Seek to a position in the current track."""
        await self._call_linked("media_seek", seek_position=float(position))

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
