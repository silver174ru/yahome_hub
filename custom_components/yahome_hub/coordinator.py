"""Data coordinator for YaHome Hub."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
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
from .music import async_search_tracks

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
        self._excluded_speaker_ids: set[str] = set()
        self._local_speakers: dict[str, dict[str, Any]] = {}
        self._glagols: dict[str, YahomeGlagol] = {}
        self._glagol_states: dict[str, dict[str, Any]] = {}
        self._glagol_state_ts: dict[str, Any] = {}
        self._track_meta: dict[str, dict[str, Any]] = {}
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
        self._discovery = YahomeLocalDiscovery(hass, self._async_local_found)
        self._store = YahomeDeviceStore(hass)

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.async_add_listener(self._async_data_updated)

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
        self, speakers: dict[str, dict[str, Any]]
    ) -> None:
        """Remove music-only entities from speakers that do not support music."""
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
        """Start mDNS discovery and local speaker connections."""
        try:
            await self._discovery.async_start()
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Local speaker discovery failed: %s", err)

    async def async_stop_local(self) -> None:
        """Stop discovery and all local connections."""
        self._discovery.stop()
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
        self._glagol_states[speaker_id] = state
        self._glagol_state_ts[speaker_id] = dt_util.utcnow()
        player = state.get("playerState") or {}
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
                except YahomeApiError as err:
                    message = str(err).lower()
                    if "429" in message or "limited" in message:
                        _LOGGER.warning(
                            "Quasar rate limit; speaker refresh postponed"
                        )
                        self._speaker_cache_until = time.time() + 300
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
            self._remove_non_music_speaker_entities(speakers)

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

    def led_brightness(self, speaker_id: str) -> float:
        """Return the last known LED brightness (0..1)."""
        return self._led_brightness.get(speaker_id, 0.5)

    def led_visualization(self, speaker_id: str) -> str:
        """Return the last known screen mode."""
        return self._led_visualization.get(speaker_id, "clock")

    def led_auto(self, speaker_id: str) -> bool:
        """Return True while the LED brightness is managed automatically."""
        return self._led_auto.get(speaker_id, True)

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
            await self.async_play_track(entity_id, value)
            return
        if "music.yandex" in value:
            match = re.search(r"(track|album|artist|playlist)/(\d+)", value)
            if match:
                if match.group(1) == "track":
                    await self.async_play_track(entity_id, match.group(2))
                    return
                payload = {
                    "command": "playMusic",
                    "type": match.group(1),
                    "id": match.group(2),
                }
        elif "youtu" in value:
            match = re.search(
                r"(?:youtu\.be/|v=)([0-9A-Za-z_-]{11})", value
            )
            if match:
                payload = {
                    "command": "serverAction",
                    "serverActionEventPayload": {
                        "type": "server_action",
                        "name": "bass_action",
                        "payload": {
                            "data": {
                                "video_descriptor": {
                                    "provider_item_id": match.group(1),
                                    "provider_name": "youtube",
                                }
                            },
                            "name": "quasar.play_video_by_descriptor",
                        },
                    },
                }
        if payload is None:
            tracks = await async_search_tracks(
                self._session,
                value,
                self.entry.data.get(CONF_MUSIC_TOKEN),
                1,
            )
            if tracks:
                await self.async_play_track(entity_id, tracks[0]["id"])
                return
        if payload is None:
            raise HomeAssistantError("Could not resolve media")
        await glagol.send(payload, wait=False)
        if payload.get("command") == "playMusic":
            await asyncio.sleep(0.5)
            await glagol.send({"command": "play"}, wait=False)

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
