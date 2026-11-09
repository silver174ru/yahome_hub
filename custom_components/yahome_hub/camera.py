"""Camera platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAP_ON_OFF, CONF_MUSIC_TOKEN
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_capability_instance, get_capability_state, primary_domain
from .music import async_get_lyrics, parse_lyrics_line
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up camera placeholders for Yandex cameras."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[Camera] = [
        YahomeCamera(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "camera"
    ]
    entities.extend(
        YahomeSpeakerLyricsCamera(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
    )
    async_add_entities(entities)


class YahomeCamera(YahomeDeviceEntity, Camera):
    """A Yandex camera.

    Yandex does not expose a public still-image endpoint through the IoT API.
    The entity keeps the device in Home Assistant and shows its capabilities
    and state; a video stream can be added later through Quasar/WebRTC.
    """

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        Camera.__init__(self)
        super().__init__(coordinator, device_id, "camera")

    @property
    def is_recording(self) -> bool:
        """Return True when the camera is on."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value)

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a still image.

        The Yandex IoT API does not provide a public snapshot endpoint.
        """
        return None

    async def stream_source(self) -> str | None:
        """Return a stream source.

        A WebRTC/RTSP source can be added when Quasar stream support is wired.
        """
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return raw capabilities."""
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


class YahomeSpeakerLyricsCamera(YahomeSpeakerEntity, Camera):
    """Cover art and synchronized lyrics for a Yandex Station."""

    _attr_name = "Текст"
    _attr_icon = "mdi:text-box-music"

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        Camera.__init__(self)
        super().__init__(coordinator, speaker_id, "lyrics")
        self._cover_url: str | None = None
        self._cover: bytes | None = None
        self._lyrics_track: str | None = None
        self._lyrics: str | None = None

    @property
    def _media_state(self):
        entity_id = self.speaker.get("entity_id")
        return self.hass.states.get(entity_id) if entity_id else None

    @property
    def _media_attrs(self) -> dict[str, Any]:
        state = self._media_state
        return dict(state.attributes) if state else {}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        await self._async_refresh_lyrics()

    def _handle_coordinator_update(self) -> None:
        async def refresh() -> None:
            await self._async_refresh_lyrics()
            self.async_write_ha_state()

        self.hass.async_create_task(refresh())
        super()._handle_coordinator_update()

    async def _async_refresh_lyrics(self) -> None:
        attrs = self._media_attrs
        track_id = str(attrs.get("media_content_id") or "")
        if not track_id or track_id == self._lyrics_track:
            return
        self._lyrics_track = track_id
        self._lyrics = await async_get_lyrics(
            async_get_clientsession(self.hass),
            track_id,
            self.coordinator.entry.data.get(CONF_MUSIC_TOKEN),
        )

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return the current cover art."""
        url = self._media_attrs.get("entity_picture")
        if not url or not str(url).startswith("http"):
            return None
        if url == self._cover_url:
            return self._cover
        try:
            async with async_get_clientsession(self.hass).get(url) as response:
                if response.status != 200:
                    return None
                data = await response.read()
        except Exception:  # noqa: BLE001
            return None
        self._cover_url = url
        self._cover = data
        return data

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose lyrics and the current line as attributes."""
        attrs = self._media_attrs
        position = attrs.get("media_position")
        if position is not None and attrs.get("media_position_updated_at"):
            try:
                from datetime import datetime

                updated = datetime.fromisoformat(
                    str(attrs["media_position_updated_at"]).replace("Z", "+00:00")
                )
                position += max(
                    0, (datetime.now(updated.tzinfo) - updated).total_seconds()
                )
            except (TypeError, ValueError):
                pass
        return {
            "media_title": attrs.get("media_title"),
            "media_artist": attrs.get("media_artist"),
            "media_content_id": attrs.get("media_content_id"),
            "lyrics": self._lyrics,
            "current_line": parse_lyrics_line(self._lyrics, position),
        }
