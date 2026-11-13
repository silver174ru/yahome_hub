"""Data coordinator for YaHome Hub."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import timedelta
from typing import Any

import aiohttp

from homeassistant.components.media_player import MediaPlayerEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import (
    YahomeApiError,
    YahomeAuthError,
    YandexIoTClient,
    YandexQuasarClient,
    async_get_music_track,
)
from .cookies import async_find_cookies
from .glagol import YahomeGlagol, YahomeLocalDiscovery
from .const import (
    CONF_COOKIES,
    CONF_MUSIC_TOKEN,
    CONF_ONLY_STATION_DEVICES,
    CONF_SCAN_INTERVAL,
    CONF_TOKEN,
    DEFAULT_ONLY_STATION_DEVICES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    EXCLUDED_SPEAKER_PLATFORMS,
    HDMI_SPEAKER_PLATFORMS,
    LED_SPEAKER_PLATFORMS,
    MUSIC_SPEAKER_PLATFORMS,
)
from .store import YahomeDeviceStore, default_export_path
from .models import YahomeData
from .video import async_resolve_video
from .music import async_search_tracks
from .stream import MusicStreamManager

_LOGGER = logging.getLogger(__name__)


class YahomeDataUpdateCoordinator(DataUpdateCoordinator[YahomeData]):
    """Poll Yandex account and Quasar Station data."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self._session = async_get_clientsession(hass)
        token = entry.data.get(CONF_TOKEN)
        self._iot = (
            YandexIoTClient(self._session, token) if token else None
        )

        music_token = entry.data.get(CONF_MUSIC_TOKEN)
        cookies = entry.data.get(CONF_COOKIES)
        self._quasar = (
            YandexQuasarClient(self._session, music_token, cookies)
            if music_token
            else None
        )

        options = entry.options
        scan_interval = options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        self._only_station_devices = options.get(
            CONF_ONLY_STATION_DEVICES, DEFAULT_ONLY_STATION_DEVICES
        )
        self._station_iot_ids: set[str] = set()
        self._station_cache: dict[str, dict[str, Any]] = {}
        self._station_cache_until = 0.0
        self._speaker_cache: dict[str, dict[str, Any]] = {}
        self._speaker_cache_until = 0.0
        self._speaker_rate_limited_until = 0.0
        self._quasar_auth_error_until = 0.0
        self._last_success_ts = 0.0
        self._excluded_speaker_ids: set[str] = set()
        self._local_speakers: dict[str, dict[str, Any]] = {}
        self._glagols: dict[str, YahomeGlagol] = {}
        self._glagol_states: dict[str, dict[str, Any]] = {}
        self._glagol_state_ts: dict[str, Any] = {}
        self._track_meta: dict[str, dict[str, Any]] = {}
        self._local_video: dict[str, dict[str, Any]] = {}
        self._video_latch: dict[str, dict[str, Any]] = {}
        self._glagol_nonempty_ts: dict[str, float] = {}
        self._music_quality: dict[str, str] = {}
        self._lyrics_offset = 0.0
        self._suppress_panel_event = False
        self._music_queues: dict[str, dict[str, Any]] = {}
        self._music_queue_tasks: dict[str, asyncio.Task] = {}
        self._led_brightness: dict[str, float] = {}
        self._led_visualization: dict[str, str] = {}
        self._led_auto: dict[str, bool] = {}
        self._hdmi_audio: dict[str, bool] = {}
        self._tts_messages: dict[str, str] = {}
        self._hdmi_load_tasks: set[str] = set()
        self._speaker_config_loaded: set[str] = set()
        self._sensor_unsub = None
        self._sensor_lock = asyncio.Lock()
        self._last_sensor_poll = 0.0
        self._discovery = YahomeLocalDiscovery(hass, self._async_local_found)
        self._store = YahomeDeviceStore(hass)

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.async_add_listener(self._async_data_updated)
        self._stream_manager = MusicStreamManager(self)

    def _remove_excluded_speaker_entities(self) -> None:
        """Remove media_player entities for Yandex app pseudo-speakers."""
        registry = er.async_get(self.hass)
        slugs = (
            "ustroistvo_s_alisoi",
            "prilozhenie_iandeks_360_pochta",
            "alice_app",
            "iot_app",
            "ya360",
        )
        for entry in list(registry.entities.values()):
            if entry.platform != DOMAIN:
                continue
            if not entry.entity_id.startswith("media_player."):
                continue
            excluded = entry.unique_id in {
                f"speaker_{speaker_id}_media_player"
                for speaker_id in self._excluded_speaker_ids
            }
            if excluded or any(slug in entry.entity_id for slug in slugs):
                registry.async_remove(entry.entity_id)

    def _remove_non_music_speaker_entities(
        self, speakers: dict[str, dict[str, Any]], fresh: bool = True
    ) -> None:
        """Remove music-only entities from speakers that do not support music."""
        if not fresh:
            # A cached or rate-limited speaker list is incomplete. Removing
            # entities here would make them disappear and reappear with new
            # entity_ids, breaking automations.
            return
        registry = er.async_get(self.hass)
        valid_media = {
            f"speaker_{speaker_id}_media_player"
            for speaker_id, speaker in speakers.items()
            if speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
        }
        for entry in list(registry.entities.values()):
            if entry.platform != DOMAIN:
                continue
            if not entry.entity_id.startswith("media_player."):
                continue
            if not entry.unique_id.startswith("speaker_"):
                continue
            if entry.unique_id not in valid_media:
                registry.async_remove(entry.entity_id)

        for speaker_id, speaker in speakers.items():
            if speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS:
                continue
            for domain, unique_id in (
                ("media_player", f"speaker_{speaker_id}_media_player"),
                ("calendar", f"{speaker_id}_calendar"),
                ("camera", f"{speaker_id}_lyrics"),
                ("conversation", f"{speaker_id}_conversation"),
                ("select", f"{speaker_id}_equalizer"),
            ):
                entity_id = registry.async_get_entity_id(
                    domain, DOMAIN, unique_id
                )
                if entity_id:
                    registry.async_remove(entity_id)

    def _async_data_updated(self) -> None:
        """Persist the catalog and notify the panel."""
        if self.data is None or self._suppress_panel_event:
            return
        self._store.async_delay_save(self.data, 30)
        self.hass.bus.async_fire(
            f"{DOMAIN}_updated",
            {
                "devices": len(self.data.devices),
                "scenarios": len(self.data.scenarios),
                "speakers": len(self.data.speakers),
            },
        )

    async def async_start_local(self) -> None:
        """Start mDNS discovery, local speakers and fast sensor polling."""
        try:
            await self._discovery.async_start()
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Local speaker discovery failed: %s", err)
        if self._sensor_unsub is None:
            self._sensor_unsub = async_track_time_interval(
                self.hass,
                self._async_sensor_tick,
                timedelta(seconds=5),
            )

    async def async_stop_local(self) -> None:
        """Stop discovery and all local connections."""
        if self._sensor_unsub is not None:
            self._sensor_unsub()
            self._sensor_unsub = None
        self._discovery.stop()
        await self._stream_manager.async_shutdown()
        for glagol in list(self._glagols.values()):
            await glagol.stop()
        self._glagols.clear()
        self._glagol_states.clear()
        self._glagol_state_ts.clear()
        for task in list(self._music_queue_tasks.values()):
            if not task.done():
                task.cancel()
        self._music_queue_tasks.clear()
        self._music_queues.clear()

    @callback
    def _async_local_found(self, info: dict[str, Any]) -> None:
        self._local_speakers[info["device_id"]] = info
        self.hass.async_create_task(self._async_start_glagol(info))

    async def _async_start_glagol(self, info: dict[str, Any]) -> None:
        device_id = info["device_id"]
        if device_id in self._glagols:
            return
        quasar = await self.async_live_quasar()
        if quasar is None:
            return
        glagol = YahomeGlagol(
            self._session,
            quasar,
            device_id,
            info.get("platform") or "",
            info["host"],
            info["port"],
            lambda state: self._async_glagol_state(device_id, state),
        )
        self._glagols[device_id] = glagol
        await glagol.start()

    @callback
    def _async_glagol_state(
        self, speaker_id: str, state: dict[str, Any]
    ) -> None:
        now = time.time()
        player = state.get("playerState") or {}
        previous = self._glagol_states.get(speaker_id) or {}
        prev_player = previous.get("playerState") or {}
        if (not player or not player.get("title")) and prev_player:
            last_nonempty = self._glagol_nonempty_ts.get(speaker_id, 0.0)
            if now - last_nonempty < 6:
                state = dict(state)
                state["playerState"] = prev_player
                if previous.get("playing"):
                    state["playing"] = True
                player = prev_player
            else:
                latch = self._video_latch.get(speaker_id)
                if latch and isinstance(latch.get("info"), dict):
                    latch["info"]["playing"] = False
        if player.get("title"):
            self._glagol_nonempty_ts[speaker_id] = now
        video_player = self._is_video_player(player)
        if video_player:
            extra = player.get("extra")
            extra = extra if isinstance(extra, dict) else {}
            marker = self._local_video.get(speaker_id)
            info = dict(marker) if marker else {}
            info["provider"] = info.get("provider") or "video"
            info["video_id"] = info.get("video_id") or ""
            info["title"] = (
                info.get("title") or player.get("title") or ""
            )
            info["subtitle"] = (
                info.get("subtitle") or player.get("subtitle") or ""
            )
            info["thumbnail"] = (
                info.get("thumbnail") or extra.get("coverURI") or ""
            )
            info["url"] = info.get("url") or ""
            info["engine"] = "video"
            info["player_type"] = player.get("type") or "video"
            info["playing"] = bool(state.get("playing"))
            info["duration"] = player.get("duration") or 0
            info["position"] = player.get("progress") or 0
            self._video_latch[speaker_id] = {
                "info": info,
                "until": now + 1800,
                "set_at": now,
                "mismatch_since": None,
            }
        else:
            latch = self._video_latch.get(speaker_id)
            if latch:
                raw_title = str(player.get("title") or "").strip()
                latch_title = str(
                    (latch.get("info") or {}).get("title") or ""
                ).strip()
                if raw_title and latch_title and raw_title != latch_title:
                    if latch.get("mismatch_since") is None:
                        latch["mismatch_since"] = now
                    else:
                        elapsed = now - float(latch["mismatch_since"])
                        info = latch.get("info")
                        if elapsed > 8 and isinstance(info, dict):
                            info["playing"] = False
                        # A long, actively playing non-video state means the
                        # user really switched to music/radio. Exit video mode
                        # instead of keeping a paused video for 30 minutes.
                        if (
                            elapsed > 12
                            and speaker_id not in self._local_video
                            and (
                                state.get("playing")
                                or str(player.get("id") or "").isdigit()
                            )
                        ):
                            self._video_latch.pop(speaker_id, None)
                else:
                    latch["mismatch_since"] = None
        self._glagol_states[speaker_id] = state
        self._glagol_state_ts[speaker_id] = dt_util.utcnow()
        track_id = player.get("id")
        if track_id and str(track_id) not in self._track_meta:
            self.hass.async_create_task(
                self._async_enrich_track(str(track_id))
            )
        self._suppress_panel_event = True
        try:
            self.async_update_listeners()
        finally:
            self._suppress_panel_event = False

    async def _async_enrich_track(self, track_id: str) -> None:
        info = await async_get_music_track(self._session, track_id)
        self._track_meta[track_id] = info or {}
        self._suppress_panel_event = True
        try:
            self.async_update_listeners()
        finally:
            self._suppress_panel_event = False

    def track_meta(self, track_id: str | None) -> dict[str, Any]:
        """Return cached public Yandex Music metadata for a track."""
        return self._track_meta.get(str(track_id), {}) if track_id else {}

    async def _async_sync_glagols(
        self, speakers: dict[str, dict[str, Any]]
    ) -> None:
        for speaker_id in speakers:
            info = self._local_speakers.get(speaker_id)
            if info and speaker_id not in self._glagols:
                await self._async_start_glagol(info)

    def glagol(self, speaker_id: str) -> YahomeGlagol | None:
        """Return the local glagol connection for a speaker."""
        return self._glagols.get(speaker_id)

    def glagol_state(self, speaker_id: str) -> dict[str, Any]:
        """Return the latest local playback state for a speaker."""
        return self._glagol_states.get(speaker_id, {})

    def glagol_state_updated_at(self, speaker_id: str):
        """Return when the local playback state was received."""
        return self._glagol_state_ts.get(speaker_id)

    def local_video(self, speaker_id: str) -> dict[str, Any] | None:
        """Return local metadata for a video started by this integration."""
        return self._local_video.get(speaker_id)

    @staticmethod
    def _is_video_player(player: dict[str, Any]) -> bool:
        """Return True for a transient video player state."""
        if not player:
            return False
        kind = str(player.get("type") or "").strip().lower()
        if kind in {
            "video",
            "youtube",
            "episode",
            "movie",
            "tvshow",
            "tv_show",
            "clip",
            "trailer",
            "film",
        }:
            return True
        player_type = str(player.get("playerType") or "").strip().lower()
        if player_type in {"video", "ru.yandex.quasar.app"}:
            return True
        extra = player.get("extra")
        if isinstance(extra, dict):
            item = extra.get("item")
            if isinstance(item, dict) and str(
                item.get("type") or ""
            ).strip().lower() in {
                "video",
                "youtube",
                "episode",
                "movie",
                "tvshow",
                "tv_show",
                "clip",
                "trailer",
                "film",
            }:
                return True
            descriptor = extra.get("videoDescriptor")
            if isinstance(descriptor, dict) and descriptor:
                return True
        return False

    def video_latch(self, speaker_id: str) -> dict[str, Any] | None:
        """Return stable video metadata for the speaker, if any."""
        marker = self._local_video.get(speaker_id)
        if marker:
            return marker
        latch = self._video_latch.get(speaker_id)
        if latch and float(latch.get("until") or 0) > time.time():
            return latch.get("info") or {"provider": "video"}
        if latch:
            self._video_latch.pop(speaker_id, None)
        return None

    def health(self) -> dict[str, Any]:
        """Return a compact health snapshot for the panel."""
        now = time.time()
        speakers = []
        for speaker_id, speaker in (self.data.speakers.items() if self.data else []):
            if str(speaker.get("platform") or "").lower() == "saturn":
                continue
            glagol = self._glagols.get(speaker_id)
            last_state = self._glagol_state_ts.get(speaker_id)
            age = (
                round((dt_util.utcnow() - last_state).total_seconds(), 1)
                if last_state is not None
                else None
            )
            speakers.append(
                {
                    "id": speaker_id,
                    "name": speaker.get("name") or "Колонка",
                    "platform": speaker.get("platform"),
                    "local_connected": bool(
                        glagol is not None and glagol.connected
                    ),
                    "last_state_age": age,
                    "entity_id": speaker.get("entity_id"),
                }
            )
        return {
            "updated": dt_util.utcnow().isoformat(),
            "last_success_age": (
                round(now - self._last_success_ts, 1)
                if self._last_success_ts
                else None
            ),
            "cloud": {
                "configured": bool(self._quasar),
                "rate_limited_for": max(
                    0, round(self._speaker_rate_limited_until - now)
                ),
                "auth_error_for": max(
                    0, round(self._quasar_auth_error_until - now)
                ),
            },
            "speakers": speakers,
        }

    def _clear_video(self, speaker_id: str) -> None:
        """Forget local and detected video state for a speaker."""
        self._local_video.pop(speaker_id, None)
        self._video_latch.pop(speaker_id, None)

    async def async_close_video(self, speaker_id: str) -> None:
        """Stop video playback and leave video mode."""
        self._clear_video(speaker_id)
        glagol = self._glagols.get(speaker_id)
        if glagol is not None and glagol.connected:
            await glagol.send({"command": "stop"}, wait=False)
        self.async_update_listeners()

    @property
    def lyrics_offset(self) -> float:
        """Return the manual lyrics sync offset in seconds."""
        return self._lyrics_offset

    @lyrics_offset.setter
    def lyrics_offset(self, value: float) -> None:
        """Set the manual lyrics sync offset in seconds."""
        self._lyrics_offset = max(-5.0, min(5.0, float(value)))

    async def async_live_quasar(self) -> YandexQuasarClient | None:
        """Return a Quasar client built from the freshest available cookies."""
        found = await async_find_cookies(self.hass)
        if found and found.cookies and found.music_token:
            return YandexQuasarClient(
                self._session, found.music_token, found.cookies
            )
        return self._quasar

    async def _async_refresh_live_credentials(self) -> None:
        """Prefer fresh cookies/tokens from Yandex.Station when available."""
        if self._quasar is None:
            return
        found = await async_find_cookies(self.hass)
        if not found:
            return
        if found.cookies:
            self._quasar.update_cookies(found.cookies)
        if found.music_token:
            self._quasar.update_music_token(found.music_token)

    async def _async_update_data(self) -> YahomeData:
        await self._async_refresh_live_credentials()
        try:
            if self._iot:
                payload = await self._iot.get_user_info()
            elif self._quasar:
                payload = await self._quasar.get_user_info()
            else:
                raise UpdateFailed("Neither IoT token nor Yandex cookies are set")
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex IoT token expired or rejected"
            ) from err
        except YahomeApiError as err:
            raise UpdateFailed(str(err)) from err

        self._last_success_ts = time.time()
        devices = {
            device["id"]: device
            for device in payload.get("devices") or []
            if device.get("id")
        }
        rooms = {
            room["id"]: room.get("name") or room["id"]
            for room in payload.get("rooms") or []
            if room.get("id")
        }
        scenarios = {
            scenario["id"]: scenario
            for scenario in payload.get("scenarios") or []
            if scenario.get("id")
        }

        quasar_to_iot: dict[str, str] = {}
        for device_id, device in devices.items():
            quasar_info = device.get("quasar_info") or {}
            quasar_id = quasar_info.get("device_id")
            if quasar_id:
                quasar_to_iot[quasar_id] = device_id

        speakers: dict[str, dict[str, Any]] = {}
        stations: dict[str, dict[str, Any]] = {}
        child_to_station: dict[str, str] = {}
        speakers_fresh = False

        if self._quasar:
            if time.time() >= self._speaker_cache_until:
                try:
                    speaker_list = await self._quasar.get_speakers()
                except YahomeAuthError:
                    _LOGGER.warning(
                        "Quasar token rejected: speakers are unavailable until reauth"
                    )
                    speaker_list = []
                    self._speaker_cache_until = time.time() + 300
                    self._quasar_auth_error_until = time.time() + 300
                except YahomeApiError as err:
                    message = str(err).lower()
                    if "429" in message or "limited" in message:
                        _LOGGER.warning(
                            "Quasar rate limit; speaker refresh postponed"
                        )
                        self._speaker_cache_until = time.time() + 300
                        self._speaker_rate_limited_until = time.time() + 300
                    else:
                        _LOGGER.warning(
                            "Unable to fetch Yandex speakers: %s", err
                        )
                        self._speaker_cache_until = time.time() + 120
                    speaker_list = []
                else:
                    self._speaker_cache = {
                        speaker["id"]: speaker
                        for speaker in speaker_list
                        if speaker.get("id")
                    }
                    self._speaker_cache_until = time.time() + 600
                    self._speaker_rate_limited_until = 0.0
                    self._quasar_auth_error_until = 0.0
                    speakers_fresh = bool(speaker_list)
            else:
                speaker_list = list(self._speaker_cache.values())

            for speaker in speaker_list:
                speaker_id = speaker.get("id")
                if not speaker_id:
                    continue
                if speaker.get("platform") in EXCLUDED_SPEAKER_PLATFORMS:
                    self._excluded_speaker_ids.add(speaker_id)
                    continue
                speakers[speaker_id] = speaker

            # Quasar can be rate-limited. Keep speakers that are already known
            # to the IoT account, so they do not disappear from the panel.
            for device_id, device in devices.items():
                quasar_info = device.get("quasar_info") or {}
                quasar_id = quasar_info.get("device_id")
                if quasar_id and quasar_id not in speakers:
                    speakers[quasar_id] = {
                        "id": quasar_id,
                        "name": device.get("name") or "Колонка",
                        "platform": quasar_info.get("platform"),
                        "iot_id": device_id,
                    }

            # Reuse the rich media state and equalizer entities from the
            # Yandex Station integration when it is installed. This keeps the
            # panel and the media_player entity fully functional even when the
            # speaker has no IoT device or when Quasar cloud control is stale.
            registry = er.async_get(self.hass)
            for entry in registry.entities.values():
                if entry.platform != "yandex_station":
                    continue
                if not entry.entity_id.startswith("media_player."):
                    continue
                unique_id = entry.unique_id
                if not unique_id or unique_id in speakers:
                    continue
                state = self.hass.states.get(entry.entity_id)
                platform = None
                if state:
                    icon = state.attributes.get("icon") or ""
                    if icon.startswith("yandex:"):
                        platform = icon.split(":", 1)[1]
                speakers[unique_id] = {
                    "id": unique_id,
                    "name": entry.original_name
                    or (state.attributes.get("friendly_name") if state else None)
                    or unique_id,
                    "platform": platform,
                    "entity_id": entry.entity_id,
                }

            for speaker_id, speaker in speakers.items():
                iot_id = quasar_to_iot.get(speaker_id)
                if iot_id:
                    speaker.setdefault(
                        "type", devices.get(iot_id, {}).get("type")
                    )
                if speaker.get("platform") not in MUSIC_SPEAKER_PLATFORMS:
                    speaker.pop("entity_id", None)
                    speaker.pop("equalizer_entity", None)
                    continue
                media_entity = registry.async_get_entity_id(
                    "media_player", DOMAIN, f"speaker_{speaker_id}_media_player"
                ) or registry.async_get_entity_id(
                    "media_player", "yandex_station", speaker_id
                )
                if media_entity:
                    speaker["entity_id"] = media_entity
                equalizer_entity = registry.async_get_entity_id(
                    "select", DOMAIN, f"{speaker_id}_equalizer"
                ) or registry.async_get_entity_id(
                    "select", "yandex_station", f"{speaker_id}_equalizer"
                )
                if equalizer_entity:
                    speaker["equalizer_entity"] = equalizer_entity
                lyrics_entity = registry.async_get_entity_id(
                    "camera", DOMAIN, f"{speaker_id}_lyrics"
                )
                if lyrics_entity:
                    speaker["lyrics_entity"] = lyrics_entity
                calendar_entity = registry.async_get_entity_id(
                    "calendar", DOMAIN, f"{speaker_id}_calendar"
                ) or registry.async_get_entity_id(
                    "calendar", "yandex_station", f"{speaker_id}_calendar"
                )
                if calendar_entity:
                    speaker["calendar_entity"] = calendar_entity
                conversation_entity = registry.async_get_entity_id(
                    "conversation", DOMAIN, f"{speaker_id}_conversation"
                ) or registry.async_get_entity_id(
                    "conversation",
                    "yandex_station",
                    f"{speaker_id}_conversation",
                )
                if conversation_entity:
                    speaker["conversation_entity"] = conversation_entity
                led_auto_entity = registry.async_get_entity_id(
                    "switch", DOMAIN, f"{speaker_id}_led_auto"
                )
                if led_auto_entity:
                    speaker["led_auto_entity"] = led_auto_entity
                led_entity = registry.async_get_entity_id(
                    "light", DOMAIN, f"{speaker_id}_led"
                )
                if led_entity:
                    speaker["led_entity"] = led_entity
                screen_entity = registry.async_get_entity_id(
                    "select", DOMAIN, f"{speaker_id}_screen"
                )
                if screen_entity:
                    speaker["screen_entity"] = screen_entity

            self._remove_excluded_speaker_entities()
            self._remove_non_music_speaker_entities(
                speakers, fresh=speakers_fresh
            )

            if (
                self._quasar.can_read_configuration
                and speakers
                and time.time() >= self._station_cache_until
            ):
                semaphore = asyncio.Semaphore(5)
                fetched: dict[str, dict[str, Any]] = {}

                async def fetch_station(
                    speaker_id: str,
                ) -> tuple[str, dict[str, Any] | None]:
                    async with semaphore:
                        try:
                            return speaker_id, await self._quasar.get_configuration(
                                speaker_id
                            )
                        except (YahomeApiError, YahomeAuthError) as err:
                            _LOGGER.debug(
                                "Station configuration %s failed: %s",
                                speaker_id,
                                err,
                            )
                            return speaker_id, None

                results = await asyncio.gather(
                    *(fetch_station(speaker_id) for speaker_id in speakers)
                )
                for speaker_id, configuration in results:
                    if configuration:
                        fetched[speaker_id] = configuration
                self._station_cache = fetched
                self._station_cache_until = time.time() + 300

            stations = {
                speaker_id: configuration
                for speaker_id, configuration in self._station_cache.items()
                if speaker_id in speakers
            }
            for speaker_id, configuration in stations.items():
                for child in configuration.get("child_items") or []:
                    child_id = child.get("id")
                    if child_id:
                        child_to_station[child_id] = speaker_id

        self._station_iot_ids = {
            quasar_to_iot.get(speaker_id, speaker_id) for speaker_id in speakers
        }
        await self._async_sync_glagols(speakers)
        for speaker_id, speaker in speakers.items():
            platform = speaker.get("platform")
            if (
                platform in HDMI_SPEAKER_PLATFORMS
                or platform in LED_SPEAKER_PLATFORMS
            ) and (
                speaker_id not in self._speaker_config_loaded
                and speaker_id not in self._hdmi_load_tasks
            ):
                self._hdmi_load_tasks.add(speaker_id)
                self.hass.async_create_task(
                    self._async_load_hdmi_state(
                        speaker_id,
                        quasar_to_iot.get(speaker_id, speaker_id),
                        platform in HDMI_SPEAKER_PLATFORMS,
                        platform in LED_SPEAKER_PLATFORMS,
                    )
                )

        for speaker_id, quality in self._music_quality.items():
            if speaker_id in speakers:
                speakers[speaker_id]["music_quality"] = quality

        return YahomeData(
            devices=devices,
            rooms=rooms,
            scenarios=scenarios,
            speakers=speakers,
            stations=stations,
            child_to_station=child_to_station,
            quasar_to_iot=quasar_to_iot,
        )

    @property
    def quasar(self) -> YandexQuasarClient | None:
        """Return the Quasar client, if configured."""
        return self._quasar

    @property
    def only_station_devices(self) -> bool:
        """Return whether only Station-connected devices are exposed."""
        return self._only_station_devices

    def is_device_visible(self, device_id: str) -> bool:
        """Return True when a device should be exposed."""
        if not self._only_station_devices:
            return True
        return (
            device_id in self._station_iot_ids
            or device_id in self.data.child_to_station
        )

    def station_identifier(self, station_id: str) -> tuple[str, str]:
        """Return the HA device identifier for a Station."""
        return (
            DOMAIN,
            self.data.quasar_to_iot.get(station_id, f"speaker_{station_id}"),
        )

    def station_for_device(self, device_id: str) -> str | None:
        """Return the Station ID for a child device."""
        return self.data.child_to_station.get(device_id)

    async def async_device_action(
        self,
        device_id: str,
        capability_type: str,
        instance: str,
        value: Any,
    ) -> None:
        """Send one capability action to a device."""
        action = {
            "type": capability_type,
            "state": {"instance": instance, "value": value},
        }
        try:
            if self._iot:
                await self._iot.send_actions(
                    [{"id": device_id, "actions": [action]}]
                )
            elif self._quasar:
                await self._quasar.send_device_actions(device_id, [action])
            else:
                raise HomeAssistantError(
                    "Neither IoT token nor Yandex cookies are set"
                )
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex IoT token or cookies expired"
            ) from err
        except YahomeApiError as err:
            raise HomeAssistantError(str(err)) from err
        await self.async_request_refresh()

    async def async_execute_scenario(self, scenario_id: str) -> None:
        """Execute a Yandex scenario."""
        try:
            if self._iot:
                await self._iot.execute_scenario(scenario_id)
            elif self._quasar:
                await self._quasar.execute_scenario(scenario_id)
            else:
                raise HomeAssistantError(
                    "Neither IoT token nor Yandex cookies are set"
                )
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex IoT token or cookies expired"
            ) from err
        except YahomeApiError as err:
            raise HomeAssistantError(str(err)) from err

    async def async_speaker_action(
        self, speaker_id: str, actions: list[dict[str, Any]]
    ) -> None:
        """Send an action to a Station through Quasar."""
        if not self._quasar:
            raise HomeAssistantError("Quasar client is not configured")
        try:
            await self._quasar.send_actions(speaker_id, actions)
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex cookies expired; reauthenticate the integration"
            ) from err
        except YahomeApiError as err:
            raise HomeAssistantError(str(err)) from err
        await self.async_request_refresh()

    def speaker_id_for_entity(self, entity_id: str) -> str | None:
        """Return the local speaker ID for a media_player entity."""
        for speaker_id, speaker in self.data.speakers.items():
            if speaker.get("entity_id") == entity_id:
                return speaker_id
        return None

    def speaker_entity_id(self, speaker_id: str) -> str | None:
        """Return the media_player entity ID for a local speaker."""
        speaker = self.data.speakers.get(speaker_id)
        return speaker.get("entity_id") if speaker else None

    async def async_say(
        self,
        entity_id: str,
        message: str,
        volume_level: float | None = None,
    ) -> None:
        """Announce a phrase through the local speaker connection."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        glagol = self._glagols.get(speaker_id)
        if glagol is None or not glagol.connected:
            raise HomeAssistantError("Local speaker connection is not ready")
        if volume_level is not None:
            await glagol.send(
                {
                    "command": "setVolume",
                    "volume": max(0.0, min(1.0, float(volume_level))),
                }
            )
        payload = {
            "command": "serverAction",
            "serverActionEventPayload": {
                "type": "server_action",
                "name": "update_form",
                "payload": {
                    "form_update": {
                        "name": (
                            "personal_assistant.scenarios.quasar.iot.repeat_phrase"
                        ),
                        "slots": [
                            {
                                "type": "string",
                                "name": "phrase_to_repeat",
                                "value": str(message)[:500],
                            }
                        ],
                    },
                    "resubmit": True,
                },
            },
        }
        await glagol.send(payload, wait=False)

    async def async_set_speaker_led(
        self,
        entity_id: str,
        brightness: float | None = None,
        visualization: str | None = None,
        auto: bool | None = None,
    ) -> None:
        """Set the LED brightness, screen visualization or auto mode."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        await self.async_set_speaker_led_by_id(
            speaker_id, brightness, visualization, auto
        )

    async def async_set_speaker_led_by_id(
        self,
        speaker_id: str,
        brightness: float | None = None,
        visualization: str | None = None,
        auto: bool | None = None,
    ) -> None:
        """Set the LED brightness, screen mode or auto mode by speaker ID."""
        quasar = await self.async_live_quasar()
        if quasar is None:
            raise HomeAssistantError("Yandex cookies are not available")
        device_id = self.data.quasar_to_iot.get(speaker_id, speaker_id)
        config, version = await quasar.get_device_config(device_id)
        led = config.setdefault("led", {})
        if brightness is not None:
            value = max(0.0, min(1.0, float(brightness)))
            item = led.setdefault("brightness", {"auto": True, "value": 0.5})
            item["auto"] = False
            item["value"] = value
            self._led_brightness[speaker_id] = value
            self._led_auto[speaker_id] = False
        if auto is not None:
            item = led.setdefault("brightness", {"auto": True, "value": 0.5})
            item["auto"] = bool(auto)
            self._led_auto[speaker_id] = bool(auto)
        if visualization is not None:
            item = led.setdefault(
                "music_equalizer_visualization",
                {"style": "showClock", "auto": False},
            )
            item["auto"] = visualization != "clock"
            self._led_visualization[speaker_id] = visualization
        await quasar.set_device_config(device_id, config, version)
        self.async_update_listeners()

    def led_brightness(self, speaker_id: str) -> float:
        """Return the last known LED brightness (0..1)."""
        return self._led_brightness.get(speaker_id, 0.5)

    def led_visualization(self, speaker_id: str) -> str:
        """Return the last known screen mode."""
        return self._led_visualization.get(speaker_id, "clock")

    def led_auto(self, speaker_id: str) -> bool:
        """Return True while the LED brightness is managed automatically."""
        return self._led_auto.get(speaker_id, True)

    async def async_set_speaker_config(
        self, speaker_id: str, patch: dict[str, Any]
    ) -> None:
        """Write experimental Quasar configuration keys for one speaker."""
        allowed = {
            "audio_player",
            "dndMode",
            "led",
            "locale",
            "timezone",
            "location",
            "calls_settings",
            "radio_nanny_enabled",
            "allow_non_self_calls",
            "intonationSpotting",
            "tv_beta",
            "tv_max",
            "beta",
            "standby",
        }
        cleaned = {
            key: value
            for key, value in (patch or {}).items()
            if key in allowed
        }
        if not cleaned:
            raise HomeAssistantError("No supported speaker settings supplied")
        quasar = await self.async_live_quasar()
        if quasar is None:
            raise HomeAssistantError("Yandex cookies are not available")
        device_id = self.data.quasar_to_iot.get(speaker_id, speaker_id)
        config, version = await quasar.get_device_config(device_id)

        def merge(target: dict[str, Any], source: dict[str, Any]) -> None:
            for key, value in source.items():
                if isinstance(value, dict) and isinstance(
                    target.get(key), dict
                ):
                    merge(target[key], value)
                else:
                    target[key] = value

        merge(config, cleaned)
        quality = (config.get("audio_player") or {}).get("music_quality")
        if quality:
            self._music_quality[speaker_id] = str(quality)
            if speaker_id in self.data.speakers:
                self.data.speakers[speaker_id]["music_quality"] = str(quality)
        led = config.get("led") or {}
        brightness = led.get("brightness") or {}
        if isinstance(brightness, dict):
            self._led_auto[speaker_id] = bool(brightness.get("auto", True))
            value = brightness.get("value")
            if isinstance(value, (int, float)):
                self._led_brightness[speaker_id] = max(
                    0.0, min(1.0, float(value))
                )
        visualization = led.get("music_equalizer_visualization") or {}
        if isinstance(visualization, dict):
            self._led_visualization[speaker_id] = (
                "equalizer" if visualization.get("auto") else "clock"
            )
        await quasar.set_device_config(device_id, config, version)
        self.async_update_listeners()

    async def async_set_speaker_hdmi(
        self, speaker_id: str, enabled: bool
    ) -> None:
        """Route the Station HDMI audio output on or off."""
        quasar = await self.async_live_quasar()
        if quasar is None:
            raise HomeAssistantError("Yandex cookies are not available")
        device_id = self.data.quasar_to_iot.get(speaker_id, speaker_id)
        config, version = await quasar.get_device_config(device_id)
        if enabled:
            config["hdmiAudio"] = True
        else:
            config.pop("hdmiAudio", None)
        await quasar.set_device_config(device_id, config, version)
        self._hdmi_audio[speaker_id] = bool(enabled)
        self.async_update_listeners()

    async def async_send_speaker_command(
        self,
        speaker_id: str,
        payload: dict[str, Any],
        wait: bool = False,
    ) -> dict[str, Any] | None:
        """Send a raw glagol command to a speaker (diagnostics only)."""
        glagol = self._glagols.get(speaker_id)
        if glagol is None or not glagol.connected:
            raise HomeAssistantError("Local speaker connection is not ready")
        return await glagol.send(payload, timeout=4.0, wait=wait)

    async def async_speaker_diagnostics(
        self, speaker_id: str
    ) -> dict[str, Any]:
        """Return live glagol state and Quasar config for one speaker."""
        speaker = self.data.speakers.get(speaker_id, {}) if self.data else {}
        config: dict[str, Any] = {}
        try:
            quasar = await self.async_live_quasar()
            if quasar is not None:
                device_id = (
                    self.data.quasar_to_iot.get(speaker_id, speaker_id)
                    if self.data
                    else speaker_id
                )
                config, _ = await quasar.get_device_config(device_id)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Speaker diagnostics config failed: %s", err)
        safe_speaker = {
            key: value
            for key, value in speaker.items()
            if key
            not in {
                "glagol",
                "config",
                "activation_code",
                "promocode_activated",
                "networkInfo",
            }
        }
        return {
            "speaker_id": speaker_id,
            "speaker": safe_speaker,
            "state": self.glagol_state(speaker_id),
            "video": self._local_video.get(speaker_id),
            "latch": self.video_latch(speaker_id),
            "config": config,
            "local": self._local_speakers.get(speaker_id, {}),
            "updated": self.glagol_state_updated_at(speaker_id),
            "hdmi_available": speaker.get("platform")
            in HDMI_SPEAKER_PLATFORMS,
            "led_available": speaker.get("platform")
            in LED_SPEAKER_PLATFORMS,
        }

    async def _async_sensor_tick(self, now=None) -> None:
        """Timer callback for the five-second sensor refresh."""
        try:
            await self.async_fast_sensor_refresh()
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Fast sensor refresh failed: %s", err)

    async def async_fast_sensor_refresh(self, force: bool = False) -> None:
        """Refresh only device properties and capability states."""
        if self._iot is None or self.data is None:
            return
        async with self._sensor_lock:
            now = time.time()
            if not force and now - self._last_sensor_poll < 4.0:
                return
            self._last_sensor_poll = now
            try:
                payload = await self._iot.get_user_info()
            except (YahomeApiError, YahomeAuthError) as err:
                _LOGGER.debug("Fast sensor poll failed: %s", err)
                return
            fresh_devices = (
                payload.get("devices") if isinstance(payload, dict) else None
            )
            if not isinstance(fresh_devices, list):
                return
            fresh_by_id = {
                item.get("id"): item
                for item in fresh_devices
                if isinstance(item, dict) and item.get("id")
            }
            changed = False
            for device_id, device in self.data.devices.items():
                fresh = fresh_by_id.get(device_id)
                if not fresh:
                    continue
                if isinstance(fresh.get("properties"), list):
                    if device.get("properties") != fresh["properties"]:
                        device["properties"] = fresh["properties"]
                        changed = True
                fresh_caps: dict[tuple[str, str], dict[str, Any]] = {}
                for capability in fresh.get("capabilities") or []:
                    state = capability.get("state") or {}
                    key = (
                        capability.get("type") or "",
                        state.get("instance") or "",
                    )
                    fresh_caps[key] = capability
                for capability in device.get("capabilities") or []:
                    state = capability.get("state") or {}
                    key = (
                        capability.get("type") or "",
                        state.get("instance") or "",
                    )
                    replacement = fresh_caps.get(key)
                    if replacement and replacement.get("state") != state:
                        capability["state"] = replacement["state"]
                        changed = True
                if fresh.get("state") and fresh["state"] != device.get("state"):
                    device["state"] = fresh["state"]
                    changed = True
            if changed:
                self._suppress_panel_event = True
                try:
                    self.async_update_listeners()
                finally:
                    self._suppress_panel_event = False

    def hdmi_audio(self, speaker_id: str) -> bool:
        """Return the last known HDMI audio switch state."""
        return self._hdmi_audio.get(speaker_id, False)

    def hdmi_audio_known(self, speaker_id: str) -> bool | None:
        """Return the cached HDMI state, or None when it was never read."""
        return self._hdmi_audio.get(speaker_id)

    async def _async_load_hdmi_state(
        self,
        speaker_id: str,
        device_id: str,
        load_hdmi: bool,
        load_led: bool,
    ) -> None:
        """Read initial HDMI and LED settings from the Quasar config."""
        try:
            quasar = await self.async_live_quasar()
            if quasar is None:
                return
            config, _ = await quasar.get_device_config(device_id)
            quality = (config.get("audio_player") or {}).get(
                "music_quality"
            )
            if quality:
                self._music_quality[speaker_id] = str(quality)
                if self.data is not None and speaker_id in self.data.speakers:
                    self.data.speakers[speaker_id]["music_quality"] = str(
                        quality
                    )
            if load_hdmi:
                self._hdmi_audio[speaker_id] = bool(
                    config.get("hdmiAudio", False)
                )
            if load_led:
                led = config.get("led") or {}
                brightness = led.get("brightness") or {}
                if isinstance(brightness, dict):
                    self._led_auto[speaker_id] = bool(
                        brightness.get("auto", True)
                    )
                    value = brightness.get("value")
                    if isinstance(value, (int, float)):
                        self._led_brightness[speaker_id] = max(
                            0.0, min(1.0, float(value))
                        )
                visualization = (
                    led.get("music_equalizer_visualization") or {}
                )
                if isinstance(visualization, dict):
                    self._led_visualization[speaker_id] = (
                        "equalizer" if visualization.get("auto") else "clock"
                    )
            self.async_update_listeners()
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Speaker config read failed for %s: %s", speaker_id, err)
        finally:
            self._hdmi_load_tasks.discard(speaker_id)
            self._speaker_config_loaded.add(speaker_id)

    def set_tts_message(self, speaker_id: str, message: str) -> None:
        """Store the pending TTS message for a speaker."""
        self._tts_messages[speaker_id] = str(message)

    def tts_message(self, speaker_id: str) -> str:
        """Return the pending TTS message for a speaker."""
        return self._tts_messages.get(speaker_id, "")

    async def async_play_speaker_media(
        self,
        entity_id: str,
        media_id: str,
        media_type: str = "music",
    ) -> None:
        """Play a Yandex Music track, YouTube link or search query locally."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        glagol = self._glagols.get(speaker_id)
        if glagol is None or not glagol.connected:
            raise HomeAssistantError("Local speaker connection is not ready")
        value = str(media_id or "").strip()
        if not value:
            return
        payload: dict[str, Any] | None = None
        if value.isdigit():
            self._clear_video(speaker_id)
            await self.async_play_track(entity_id, value)
            return
        if "music.yandex" in value:
            match = re.search(r"(track|album|artist|playlist)/(\d+)", value)
            if match:
                if match.group(1) == "track":
                    self._clear_video(speaker_id)
                    await self.async_play_track(entity_id, match.group(2))
                    return
                payload = {
                    "command": "playMusic",
                    "type": match.group(1),
                    "id": match.group(2),
                }
        elif "youtu" in value:
            match = re.search(
                r"(?:youtu\.be/|youtube\.com/(?:watch\?[^#]*v=|shorts/|embed/))"
                r"([0-9A-Za-z_-]{11})",
                value,
            )
            if match:
                video_id = match.group(1)
                payload = self._video_descriptor("youtube", video_id)
                self._local_video[speaker_id] = {
                    "provider": "youtube",
                    "video_id": video_id,
                    "title": "",
                    "subtitle": "",
                    "thumbnail": (
                        f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
                    ),
                    "url": f"https://youtu.be/{video_id}",
                }
        elif "kinopoisk" in value:
            match = re.search(r"hd\.kinopoisk\.ru/.*?([0-9a-z]{32})", value)
            if match:
                item_id = match.group(1)
                payload = self._video_descriptor("kinopoisk", item_id)
                self._local_video[speaker_id] = {
                    "provider": "kinopoisk",
                    "video_id": item_id,
                    "title": "",
                    "subtitle": "",
                    "thumbnail": "",
                    "url": value,
                }
            else:
                match = re.search(r"kinopoisk\.ru/film/(\d+)", value)
                if match:
                    uuid = await self._async_kinopoisk_uuid(match.group(1))
                    if uuid:
                        payload = self._video_descriptor("kinopoisk", uuid)
                        self._local_video[speaker_id] = {
                            "provider": "kinopoisk",
                            "video_id": uuid,
                            "title": "",
                            "subtitle": "",
                            "thumbnail": "",
                            "url": value,
                        }
        elif "yandex.ru/efir" in value:
            match = re.search(r"stream_id=([^&]+)", value)
            if match:
                payload = self._video_descriptor("strm", match.group(1))
                self._local_video[speaker_id] = {
                    "provider": "strm",
                    "video_id": match.group(1),
                    "title": "",
                    "subtitle": "",
                    "thumbnail": "",
                    "url": value,
                }
        elif "vk.com/video" in value or "ok.ru/video" in value:
            payload = self._video_descriptor("yavideo", value)
            self._local_video[speaker_id] = {
                "provider": "yavideo",
                "video_id": "",
                "title": "",
                "subtitle": "",
                "thumbnail": "",
                "url": value,
            }
        if payload is None and re.match(r"^https?://", value):
            payload, info = await async_resolve_video(
                self.hass, self._session, value
            )
            if payload is not None:
                self._local_video[speaker_id] = info
        if payload is None:
            if re.match(r"^https?://", value):
                raise HomeAssistantError(
                    "Не удалось распознать ссылку. Поддерживаются YouTube, "
                    "Кинопоиск, Rutube, IVI, Okko, Wink, Start, Premier, "
                    "VK Видео, Яндекс Эфир, прямые mp4/m3u8 и другие сервисы "
                    "через yt-dlp."
                )
            tracks = await async_search_tracks(
                self._session,
                value,
                self.entry.data.get(CONF_MUSIC_TOKEN),
                1,
            )
            if tracks:
                self._clear_video(speaker_id)
                await self.async_play_track(entity_id, tracks[0]["id"])
                return
        if payload is None:
            raise HomeAssistantError("Could not resolve media")
        if payload.get("command") == "playMusic":
            self._clear_video(speaker_id)
        await glagol.send(payload, wait=False)
        if payload.get("command") == "playMusic":
            await asyncio.sleep(0.5)
            await glagol.send({"command": "play"}, wait=False)

    @staticmethod
    def _video_descriptor(provider: str, item_id: str) -> dict[str, Any]:
        """Build a glagol directive that opens a video on the station."""
        return {
            "command": "serverAction",
            "serverActionEventPayload": {
                "type": "server_action",
                "name": "bass_action",
                "payload": {
                    "data": {
                        "video_descriptor": {
                            "provider_item_id": str(item_id),
                            "provider_name": provider,
                        }
                    },
                    "name": "quasar.play_video_by_descriptor",
                },
            },
        }

    async def _async_kinopoisk_uuid(self, film_id: str) -> str | None:
        """Resolve a Kinopoisk film id to the UUID used by the station."""
        try:
            async with self._session.get(
                "https://ott-widget.kinopoisk.ru/ott/api/kp-film-status/",
                params={"kpFilmId": str(film_id)},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as response:
                if response.status != 200:
                    return None
                data = await response.json(content_type=None)
        except Exception:  # noqa: BLE001
            return None
        value = data.get("uuid") if isinstance(data, dict) else None
        return str(value) if value else None

    async def async_search_music(
        self, query: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Search Yandex Music tracks."""
        return await async_search_tracks(
            self._session,
            query,
            self.entry.data.get(CONF_MUSIC_TOKEN),
            limit,
        )

    async def async_start_music_stream(
        self,
        source_entity_id: str,
        target_entity_ids: list[str],
        *,
        sync_volume: Any = True,
        use_proxy: bool = True,
        start: bool = True,
        stop_targets: bool = True,
        quality: str = "high",
        codecs: str = "mp3",
        media_content_type: str | None = None,
        mute_source: bool = True,
        bidirectional: bool = True,
        context: Context | None = None,
    ) -> dict[str, Any]:
        """Start mirroring a Yandex Station to other media players."""
        return await self._stream_manager.async_start(
            source_entity_id,
            target_entity_ids,
            sync_volume=sync_volume,
            use_proxy=use_proxy,
            start=start,
            stop_targets=stop_targets,
            quality=quality,
            codecs=codecs,
            media_content_type=media_content_type,
            mute_source=mute_source,
            bidirectional=bidirectional,
            context=context,
        )

    async def async_stop_music_stream(
        self,
        *,
        session_id: str | None = None,
        source_entity_id: str | None = None,
        target_entity_ids: list[str] | None = None,
        stop_playback: bool = True,
    ) -> int:
        """Stop one or more music mirroring sessions."""
        return await self._stream_manager.async_stop(
            session_id=session_id,
            source_entity_id=source_entity_id,
            target_entity_ids=target_entity_ids,
            stop_playback=stop_playback,
        )

    def music_streams(self) -> list[dict[str, Any]]:
        """Return active music stream sessions."""
        return self._stream_manager.snapshot()

    def stream_targets(
        self, exclude_entity_id: str | None = None
    ) -> list[dict[str, str]]:
        """Return external media players that can receive a stream."""
        registry = er.async_get(self.hass)
        targets: list[dict[str, str]] = []
        used_names: set[str] = set()
        for state in self.hass.states.async_all("media_player"):
            entity_id = state.entity_id
            if entity_id == exclude_entity_id:
                continue
            if state.state in ("unavailable", "unknown"):
                continue
            features = int(state.attributes.get("supported_features") or 0)
            if not features & MediaPlayerEntityFeature.PLAY_MEDIA:
                continue
            entry = registry.async_get(entity_id)
            platform = entry.platform if entry else ""
            name = str(
                state.attributes.get("friendly_name") or entity_id
            )
            if platform == "cast":
                name = f"{name} · Cast"
            elif platform in {"androidtv_remote", "androidtv", "firetv"}:
                name = f"{name} · TV"
            if name in used_names:
                name = f"{name} ({entity_id})"
            used_names.add(name)
            targets.append(
                {
                    "entity_id": entity_id,
                    "name": name,
                    "platform": platform,
                }
            )
        return targets

    def music_queue(self, speaker_id: str) -> dict[str, Any]:
        """Return a copy of the local music queue for a speaker."""
        queue = self._music_queues.get(speaker_id)
        if not queue:
            return {"tracks": [], "index": -1, "current": None}
        tracks = list(queue.get("tracks") or [])
        index = int(queue.get("index", -1))
        current = tracks[index] if 0 <= index < len(tracks) else None
        return {"tracks": tracks, "index": index, "current": current}

    async def _play_music_id(self, speaker_id: str, track_id: str) -> None:
        glagol = self._glagols.get(speaker_id)
        if glagol is None or not glagol.connected:
            raise HomeAssistantError("Local speaker connection is not ready")
        self._clear_video(speaker_id)
        await glagol.send(
            {"command": "playMusic", "id": str(track_id), "type": "track"},
            wait=False,
        )

    async def async_play_track(
        self,
        entity_id: str,
        track_id: str,
        queue: list[dict[str, Any]] | None = None,
        index: int = 0,
    ) -> None:
        """Play a track and optionally replace the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        self._clear_video(speaker_id)
        if queue is not None:
            index = max(0, min(len(queue) - 1, int(index))) if queue else -1
            self._music_queues[speaker_id] = {
                "tracks": list(queue),
                "index": index,
            }
            self._start_queue_monitor(speaker_id)
        await self._play_music_id(speaker_id, track_id)

    async def async_queue_add(
        self, entity_id: str, track: dict[str, Any]
    ) -> dict[str, Any]:
        """Append a track to the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        queue = self._music_queues.setdefault(
            speaker_id, {"tracks": [], "index": -1}
        )
        queue["tracks"].append(track)
        if queue["index"] < 0:
            queue["index"] = 0
        return self.music_queue(speaker_id)

    async def async_queue_remove(
        self, entity_id: str, index: int
    ) -> dict[str, Any]:
        """Remove one track from the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        queue = self._music_queues.get(speaker_id)
        if not queue:
            return self.music_queue(speaker_id)
        tracks = queue.get("tracks") or []
        if 0 <= int(index) < len(tracks):
            tracks.pop(int(index))
            if queue["index"] >= len(tracks):
                queue["index"] = len(tracks) - 1
            if queue["index"] < 0:
                queue["index"] = 0 if tracks else -1
        return self.music_queue(speaker_id)

    async def async_queue_clear(self, entity_id: str) -> None:
        """Clear the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        self._music_queues.pop(speaker_id, None)
        task = self._music_queue_tasks.pop(speaker_id, None)
        if task and not task.done():
            task.cancel()

    async def async_queue_play_index(
        self, entity_id: str, index: int
    ) -> None:
        """Play a track from the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        if not speaker_id:
            raise HomeAssistantError("Speaker not found")
        queue = self._music_queues.get(speaker_id)
        tracks = (queue or {}).get("tracks") or []
        if not tracks:
            return
        index = max(0, min(len(tracks) - 1, int(index)))
        queue["index"] = index
        await self._play_music_id(speaker_id, tracks[index]["id"])
        self._start_queue_monitor(speaker_id)

    async def async_queue_next(self, entity_id: str, delta: int = 1) -> None:
        """Play the next or previous track from the local queue."""
        speaker_id = self.speaker_id_for_entity(entity_id)
        queue = self._music_queues.get(speaker_id or "")
        if not queue:
            return
        tracks = queue.get("tracks") or []
        if not tracks:
            return
        index = int(queue.get("index", 0)) + int(delta)
        await self.async_queue_play_index(entity_id, index)

    def _start_queue_monitor(self, speaker_id: str) -> None:
        task = self._music_queue_tasks.get(speaker_id)
        if task and not task.done():
            return
        self._music_queue_tasks[speaker_id] = self.hass.async_create_task(
            self._queue_monitor(speaker_id)
        )

    async def _queue_monitor(self, speaker_id: str) -> None:
        """Advance the local queue when the speaker stops at the end."""
        try:
            while speaker_id in self._music_queues:
                queue = self._music_queues.get(speaker_id)
                tracks = (queue or {}).get("tracks") or []
                index = int((queue or {}).get("index", -1))
                if not tracks or index < 0 or index >= len(tracks):
                    break
                state = self._glagol_states.get(speaker_id, {})
                player = state.get("playerState") or {}
                current_id = str(player.get("id") or "")
                expected = str(tracks[index].get("id") or "")
                if current_id and current_id != expected:
                    for i, track in enumerate(tracks):
                        if str(track.get("id")) == current_id:
                            queue["index"] = i
                            break
                progress = player.get("progress")
                duration = player.get("duration")
                playing = bool(state.get("playing"))
                if (
                    current_id == expected
                    and progress is not None
                    and duration
                    and progress >= duration - 1
                    and not playing
                ):
                    entity_id = self.speaker_entity_id(speaker_id)
                    if entity_id:
                        await self.async_queue_next(entity_id, 1)
                await asyncio.sleep(2)
        finally:
            self._music_queue_tasks.pop(speaker_id, None)

    async def async_export(self, path: str | None = None) -> dict[str, str]:
        """Export the full device database to JSON and SQLite."""
        return await self._store.async_export(
            self.data, path or default_export_path(self.hass)
        )
