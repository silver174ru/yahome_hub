"""Media player platform for Yandex Stations and media devices."""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    RepeatMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CAP_MEDIA_PLAYBACK,
    CAP_ON_OFF,
    CAP_VOLUME,
    DOMAIN,
    MUSIC_SPEAKER_PLATFORMS,
)
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
        if speaker.get("platform") not in MUSIC_SPEAKER_PLATFORMS:
            continue
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
    """A Yandex Station with local playback control."""

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
        self._attr_unique_id = f"speaker_{speaker_id}_media_player"

    @property
    def _glagol_state(self) -> dict[str, Any]:
        return self.coordinator.glagol_state(self._speaker_id)

    @property
    def _player(self) -> dict[str, Any]:
        player = self._glagol_state.get("playerState")
        return player if isinstance(player, dict) else {}

    @property
    def _extra(self) -> dict[str, Any]:
        extra = self._player.get("extra")
        return extra if isinstance(extra, dict) else {}

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
        if self._glagol_state:
            features |= (
                MediaPlayerEntityFeature.PREVIOUS_TRACK
                | MediaPlayerEntityFeature.NEXT_TRACK
                | MediaPlayerEntityFeature.SEEK
                | MediaPlayerEntityFeature.PLAY_MEDIA
                | MediaPlayerEntityFeature.SHUFFLE_SET
                | MediaPlayerEntityFeature.REPEAT_SET
            )
        return features

    @property
    def state(self) -> MediaPlayerState:
        """Return the local or cloud speaker state."""
        if self._glagol_state:
            if self._glagol_state.get("playing"):
                return MediaPlayerState.PLAYING
            if self._player:
                return MediaPlayerState.PAUSED
            return MediaPlayerState.IDLE
        iot_device = self._iot_device
        if iot_device and not is_online(iot_device):
            return MediaPlayerState.OFF
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float | None:
        """Return volume 0..1."""
        value = self._glagol_state.get("volume")
        if value is not None:
            try:
                return round(float(value), 2)
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
        return self.volume_level == 0

    @property
    def shuffle(self) -> bool | None:
        """Return the current shuffle state."""
        value = (self._player.get("entityInfo") or {}).get("shuffled")
        return bool(value) if value is not None else None

    @property
    def repeat(self) -> RepeatMode | None:
        """Return the current repeat mode."""
        value = (self._player.get("entityInfo") or {}).get("repeatMode")
        if value == "All":
            return RepeatMode.ALL
        if value == "One":
            return RepeatMode.ONE
        if value == "None":
            return RepeatMode.OFF
        return None

    @property
    def media_title(self) -> str | None:
        return self._player.get("title") or self.coordinator.track_meta(
            self.media_content_id
        ).get("title")

    @property
    def media_artist(self) -> str | None:
        return self._player.get("subtitle") or self.coordinator.track_meta(
            self.media_content_id
        ).get("artist")

    @property
    def media_album_name(self) -> str | None:
        return (
            self._extra.get("album")
            or self._extra.get("albumName")
            or self.coordinator.track_meta(self.media_content_id).get("album")
        )

    @property
    def media_playlist(self) -> str | None:
        return self._extra.get("playlistTitle")

    @property
    def media_image_url(self) -> str | None:
        cover = self._extra.get("coverURI")
        if not cover:
            cover = self.coordinator.track_meta(self.media_content_id).get(
                "cover"
            )
        if not cover:
            return None
        cover = str(cover)
        if "://" not in cover:
            cover = "https://" + cover.replace("%%", "400x400")
        return cover

    @property
    def entity_picture(self) -> str | None:
        """Expose cover art through Home Assistant's entity picture."""
        return self.media_image_url

    @property
    def media_content_id(self) -> str | None:
        value = self._player.get("id")
        return str(value) if value else None

    @property
    def media_content_type(self) -> str | None:
        if self._player.get("type") == "Track":
            return "music"
        if self._player.get("type") == "FmRadio":
            return "radio"
        return None

    @property
    def media_duration(self) -> int | None:
        value = self._player.get("duration")
        try:
            return int(value) if value else None
        except (TypeError, ValueError):
            return None

    @property
    def media_position(self) -> int | None:
        value = self._player.get("progress")
        if value is None:
            value = self._player.get("position")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def media_position_updated_at(self):
        return self.coordinator.glagol_state_updated_at(self._speaker_id)

    async def _glagol_send(self, payload: dict[str, Any]) -> bool:
        glagol = self.coordinator.glagol(self._speaker_id)
        if glagol is None or not glagol.connected:
            return False
        return await glagol.send(payload, wait=False) is not None

    async def async_turn_on(self) -> None:
        """Turn the speaker on."""
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", True
            )
            return
        await self.async_media_play()

    async def async_turn_off(self) -> None:
        """Turn the speaker off."""
        if self._iot_device and get_capability(self._iot_device, CAP_ON_OFF):
            await self.coordinator.async_device_action(
                self._iot_device_id, CAP_ON_OFF, "on", False
            )
            return
        await self.async_media_pause()

    async def async_set_volume_level(self, volume: float) -> None:
        """Set the speaker volume."""
        volume = max(0.0, min(1.0, float(volume)))
        if await self._glagol_send(
            {"command": "setVolume", "volume": round(volume, 1)}
        ):
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
        if await self._glagol_send({"command": "play"}):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "play", True)

    async def async_media_pause(self) -> None:
        """Pause playback."""
        if await self._glagol_send({"command": "stop"}):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "pause", True)

    async def async_media_stop(self) -> None:
        """Stop playback."""
        if await self._glagol_send({"command": "stop"}):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "stop", True)

    async def async_media_next_track(self) -> None:
        """Play the next track."""
        if await self._glagol_send({"command": "next"}):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "next", True)

    async def async_media_previous_track(self) -> None:
        """Play the previous track."""
        if await self._glagol_send({"command": "prev"}):
            return
        await self._send_action(CAP_MEDIA_PLAYBACK, "previous", True)

    async def async_media_seek(self, position: float) -> None:
        """Seek to a position in the current track."""
        await self._glagol_send(
            {"command": "rewind", "position": float(position)}
        )

    async def async_set_shuffle(self, shuffle: bool) -> None:
        """Enable or disable shuffle."""
        await self._glagol_send(
            {"command": "shuffle", "enable": bool(shuffle)}
        )

    async def async_set_repeat(self, repeat: RepeatMode) -> None:
        """Set the repeat mode."""
        modes = {
            RepeatMode.OFF: "None",
            RepeatMode.ALL: "All",
            RepeatMode.ONE: "One",
        }
        if mode := modes.get(repeat):
            await self._glagol_send({"command": "repeat", "mode": mode})

    async def async_play_media(
        self, media_type: str, media_id: str, **kwargs: Any
    ) -> None:
        """Play a Yandex Music track, YouTube link or search query."""
        await self.coordinator.async_play_speaker_media(
            self.entity_id, media_id, media_type
        )

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
