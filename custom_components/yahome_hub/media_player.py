"""Media player platform for Yandex Stations and media devices."""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    BrowseMedia,
    MediaClass,
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    RepeatMode,
    SearchMedia,
    SearchMediaQuery,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    CAP_MEDIA_PLAYBACK,
    CAP_ON_OFF,
    CAP_VOLUME,
    CONF_MUSIC_TOKEN,
    DOMAIN,
    HDMI_SPEAKER_PLATFORMS,
    MUSIC_SPEAKER_PLATFORMS,
    SPEAKER_SOURCE_HDMI,
    SPEAKER_SOURCE_STATION,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    get_capability,
    get_capability_state,
    is_online,
    primary_domain,
)
from .music import (
    async_get_liked_tracks,
    async_get_playlist_tracks,
    async_get_playlists,
    async_search_tracks,
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
        if speaker.get("platform") in HDMI_SPEAKER_PLATFORMS:
            self._attr_device_class = MediaPlayerDeviceClass.TV

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
    def _local_video(self) -> dict[str, Any]:
        """Return metadata for a video started from the panel."""
        return self.coordinator.local_video(self._speaker_id) or {}

    VIDEO_TYPES = {
        "video",
        "youtube",
        "episode",
        "movie",
        "tvshow",
        "tv_show",
        "clip",
        "trailer",
        "film",
    }
    VIDEO_PROVIDERS = {"youtube", "kinopoisk", "yavideo", "strm"}

    @property
    def _is_video(self) -> bool:
        """Return True when the current media is video/TV content."""
        player = self._player
        if not player:
            return False
        kind = str(player.get("type") or "").strip().lower()
        if kind in self.VIDEO_TYPES:
            return True
        extra = self._extra
        item = extra.get("item")
        if isinstance(item, dict):
            item_type = str(item.get("type") or "").strip().lower()
            if item_type in self.VIDEO_TYPES:
                return True
        player_type = str(player.get("playerType") or "").strip().lower()
        if player_type == "video":
            return True
        if player.get("playerType") == "ru.yandex.quasar.app":
            return bool(player.get("title") or player.get("duration"))
        if player.get("liveStreamText") == "Прямой эфир":
            return True
        for key in ("providerName", "provider", "videoProvider"):
            if str(extra.get(key) or "").lower() in self.VIDEO_PROVIDERS:
                return True
        descriptor = extra.get("videoDescriptor")
        if isinstance(descriptor, dict) and descriptor:
            return True
        marker = self._local_video
        if marker and player:
            if str(player.get("type") or "") == "FmRadio":
                return False
            if str(player.get("id") or "").isdigit():
                return False
            return True
        return False

    @property
    def _video_provider(self) -> str | None:
        """Return the detected video provider name."""
        extra = self._extra
        for key in ("providerName", "provider", "videoProvider"):
            value = extra.get(key)
            if value:
                return str(value).lower()
        descriptor = extra.get("videoDescriptor")
        if isinstance(descriptor, dict):
            value = descriptor.get("providerName") or descriptor.get("provider")
            if value:
                return str(value).lower()
        item = extra.get("item")
        if isinstance(item, dict):
            for key in ("provider", "providerName", "service"):
                value = item.get(key)
                if value:
                    return str(value).lower()
        marker = self._local_video
        if marker.get("provider"):
            return str(marker["provider"]).lower()
        content = str(self.media_content_id or "")
        if "youtu" in content:
            return "youtube"
        if "kinopoisk" in content:
            return "kinopoisk"
        if "vk.com" in content or "ok.ru" in content:
            return "yavideo"
        return None

    @property
    def _video_id(self) -> str | None:
        """Return the provider item id for the current video."""
        extra = self._extra
        descriptor = extra.get("videoDescriptor")
        if isinstance(descriptor, dict):
            value = descriptor.get("providerItemId") or descriptor.get(
                "provider_item_id"
            )
            if value:
                return str(value)
        item = extra.get("item")
        if isinstance(item, dict):
            value = item.get("id") or item.get("providerItemId")
            if value:
                return str(value)
        marker = self._local_video
        if marker.get("video_id"):
            return str(marker["video_id"])
        value = self._player.get("id")
        return str(value) if value else None

    @property
    def _video_thumbnail(self) -> str | None:
        """Return a 16:9 thumbnail for video content."""
        cover = self._extra.get("coverURI")
        if cover:
            cover = str(cover)
            if "://" not in cover:
                cover = "https://" + cover
            if "%%" in cover:
                cover = cover.replace("%%", "1200x675")
            return cover
        marker = self._local_video
        if marker.get("thumbnail"):
            return str(marker["thumbnail"])
        if self._video_provider == "youtube" and self._video_id:
            return f"https://i.ytimg.com/vi/{self._video_id}/mqdefault.jpg"
        return None

    @property
    def _video_url(self) -> str | None:
        """Return a browser URL for the current video when known."""
        marker = self._local_video
        if marker.get("url"):
            return str(marker["url"])
        provider = self._video_provider
        video_id = self._video_id
        if provider == "youtube" and video_id:
            return f"https://youtu.be/{video_id}"
        content = str(self.media_content_id or "")
        if content.startswith("http"):
            return content
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose live player and video metadata to the panel."""
        attrs: dict[str, Any] = {}
        state = self._glagol_state
        if state:
            alice = state.get("aliceState")
            if alice is not None:
                attrs["alice_state"] = alice
            attrs["can_stop"] = bool(state.get("canStop"))
            player = self._player
            if player:
                attrs["player_engine"] = player.get("playerType") or ""
                attrs["player_type"] = player.get("type") or ""
            live = player.get("liveStreamText")
            if not live and player.get("type") == "FmRadio":
                live = "Прямой эфир"
            if live:
                attrs["live_stream"] = live
                attrs["live_stream_subtitle"] = (
                    player.get("title") or player.get("subtitle") or ""
                )
        if self._is_video:
            attrs.update(
                {
                    "yahome_video": True,
                    "video_provider": self._video_provider,
                    "video_id": self._video_id,
                    "video_thumbnail": self._video_thumbnail,
                    "video_url": self._video_url,
                }
            )
        return attrs

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
        glagol = self.coordinator.glagol(self._speaker_id)
        if self._glagol_state or (glagol is not None and glagol.connected):
            features |= (
                MediaPlayerEntityFeature.PREVIOUS_TRACK
                | MediaPlayerEntityFeature.NEXT_TRACK
                | MediaPlayerEntityFeature.SEEK
                | MediaPlayerEntityFeature.PLAY_MEDIA
                | MediaPlayerEntityFeature.SHUFFLE_SET
                | MediaPlayerEntityFeature.REPEAT_SET
                | MediaPlayerEntityFeature.BROWSE_MEDIA
                | MediaPlayerEntityFeature.SEARCH_MEDIA
            )
        if self.source_list:
            features |= MediaPlayerEntityFeature.SELECT_SOURCE
        return features

    @property
    def source_list(self) -> list[str] | None:
        """Return the available Station audio sources."""
        if self._speaker.get("platform") not in HDMI_SPEAKER_PLATFORMS:
            return None
        return [SPEAKER_SOURCE_STATION, SPEAKER_SOURCE_HDMI]

    @property
    def source(self) -> str | None:
        """Return the active audio source (Station speakers or HDMI)."""
        if not self.source_list:
            return None
        known = self.coordinator.hdmi_audio_known(self._speaker_id)
        if known is not None:
            return SPEAKER_SOURCE_HDMI if known else SPEAKER_SOURCE_STATION
        hdmi = self._glagol_state.get("hdmi")
        if isinstance(hdmi, dict) and hdmi.get("present") is not None:
            return (
                SPEAKER_SOURCE_HDMI
                if hdmi.get("present")
                else SPEAKER_SOURCE_STATION
            )
        return SPEAKER_SOURCE_STATION

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
        if self._is_video:
            thumbnail = self._video_thumbnail
            if thumbnail:
                return thumbnail
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
        if self._is_video:
            return "video"
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

    async def async_select_source(self, source: str) -> None:
        """Switch audio between the Station speakers and HDMI."""
        if source not in (self.source_list or []):
            return
        await self.coordinator.async_set_speaker_hdmi(
            self._speaker_id, source == SPEAKER_SOURCE_HDMI
        )
        self.async_write_ha_state()

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

    def _music_token(self) -> str | None:
        return self.coordinator.entry.data.get(CONF_MUSIC_TOKEN)

    def _browse_dir(
        self, title: str, content_id: str, media_class: MediaClass
    ) -> BrowseMedia:
        return BrowseMedia(
            title=title,
            media_class=media_class,
            media_content_id=content_id,
            media_content_type="directory",
            can_play=False,
            can_expand=True,
        )

    def _browse_track(self, track: dict[str, Any]) -> BrowseMedia:
        title = track.get("title") or "Трек"
        artist = track.get("artist") or ""
        return BrowseMedia(
            title=f"{title} — {artist}".strip(" —"),
            media_class=MediaClass.TRACK,
            media_content_id=str(track.get("id")),
            media_content_type="music",
            can_play=True,
            can_expand=False,
            thumbnail=track.get("cover"),
        )

    def _browse_tracks(
        self, title: str, content_id: str, tracks: list[dict[str, Any]]
    ) -> BrowseMedia:
        children = [
            self._browse_track(track)
            for track in tracks
            if track.get("id")
        ]
        return BrowseMedia(
            title=title,
            media_class=MediaClass.PLAYLIST,
            media_content_id=content_id,
            media_content_type="playlist",
            can_play=False,
            can_expand=True,
            children=children,
            children_media_class=MediaClass.TRACK,
        )

    async def async_browse_media(
        self,
        media_content_type: str | None = None,
        media_content_id: str | None = None,
    ) -> BrowseMedia:
        """Browse Yandex Music likes, playlists and the local queue."""
        session = async_get_clientsession(self.hass)
        token = self._music_token()
        if media_content_id in (None, "", "root"):
            return BrowseMedia(
                title=self.name or "Яндекс Музыка",
                media_class=MediaClass.DIRECTORY,
                media_content_id="root",
                media_content_type="root",
                can_play=False,
                can_expand=True,
                children_media_class=MediaClass.DIRECTORY,
                children=[
                    self._browse_dir(
                        "Лайки", "likes", MediaClass.PLAYLIST
                    ),
                    self._browse_dir(
                        "Плейлисты", "playlists", MediaClass.DIRECTORY
                    ),
                    self._browse_dir(
                        "Очередь", "queue", MediaClass.PLAYLIST
                    ),
                ],
                can_search=True,
                search_media_classes=[MediaClass.TRACK],
            )
        if media_content_id == "likes":
            tracks = await async_get_liked_tracks(session, token)
            return self._browse_tracks("Лайки", "likes", tracks)
        if media_content_id == "playlists":
            playlists = await async_get_playlists(session, token)
            children = [
                BrowseMedia(
                    title=playlist.get("title") or "Плейлист",
                    media_class=MediaClass.PLAYLIST,
                    media_content_id=f"playlist:{playlist.get('kind')}",
                    media_content_type="playlist",
                    can_play=False,
                    can_expand=True,
                    thumbnail=playlist.get("cover"),
                )
                for playlist in playlists
            ]
            return BrowseMedia(
                title="Плейлисты",
                media_class=MediaClass.DIRECTORY,
                media_content_id="playlists",
                media_content_type="directory",
                can_play=False,
                can_expand=True,
                children=children,
                children_media_class=MediaClass.PLAYLIST,
            )
        if media_content_id.startswith("playlist:"):
            kind = media_content_id.split(":", 1)[1]
            tracks = await async_get_playlist_tracks(session, token, kind)
            return self._browse_tracks(
                "Плейлист", media_content_id, tracks
            )
        if media_content_id == "queue":
            queue = self.coordinator.music_queue(self._speaker_id)
            return self._browse_tracks(
                "Очередь", "queue", queue.get("tracks") or []
            )
        return self._browse_tracks("Яндекс Музыка", "root", [])

    async def async_search_media(
        self, query: SearchMediaQuery
    ) -> SearchMedia:
        """Search Yandex Music for the HA media browser."""
        tracks = await async_search_tracks(
            async_get_clientsession(self.hass),
            query.search_query,
            self._music_token(),
            25,
        )
        return SearchMedia(
            result=[
                self._browse_track(track)
                for track in tracks
                if track.get("id")
            ]
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
