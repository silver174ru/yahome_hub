"""Data coordinator for YaHome Hub."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    YahomeApiError,
    YahomeAuthError,
    YandexIoTClient,
    YandexQuasarClient,
)
from .const import (
    CONF_COOKIES,
    CONF_MUSIC_TOKEN,
    CONF_ONLY_STATION_DEVICES,
    CONF_SCAN_INTERVAL,
    CONF_TOKEN,
    DEFAULT_ONLY_STATION_DEVICES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)
from .store import YahomeDeviceStore, default_export_path
from .models import YahomeData

_LOGGER = logging.getLogger(__name__)


class YahomeDataUpdateCoordinator(DataUpdateCoordinator[YahomeData]):
    """Poll Yandex account and Quasar Station data."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self._session = async_get_clientsession(hass)
        self._iot = YandexIoTClient(self._session, entry.data[CONF_TOKEN])

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
        self._store = YahomeDeviceStore(hass)

        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.async_add_listener(self._async_data_updated)

    def _async_data_updated(self) -> None:
        """Persist the catalog and notify the panel."""
        if self.data is None:
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

    async def _async_update_data(self) -> YahomeData:
        try:
            payload = await self._iot.get_user_info()
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
                if speaker_id:
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
                media_entity = registry.async_get_entity_id(
                    "media_player", "yandex_station", speaker_id
                )
                if media_entity:
                    speaker["entity_id"] = media_entity
                equalizer_entity = registry.async_get_entity_id(
                    "select", "yandex_station", f"{speaker_id}_equalizer"
                )
                if equalizer_entity:
                    speaker["equalizer_entity"] = equalizer_entity

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
            await self._iot.send_actions(
                [{"id": device_id, "actions": [action]}]
            )
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex IoT token expired or rejected"
            ) from err
        except YahomeApiError as err:
            raise HomeAssistantError(str(err)) from err
        await self.async_request_refresh()

    async def async_execute_scenario(self, scenario_id: str) -> None:
        """Execute a Yandex scenario."""
        try:
            await self._iot.execute_scenario(scenario_id)
        except YahomeAuthError as err:
            raise ConfigEntryAuthFailed(
                "Yandex IoT token expired or rejected"
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

    async def async_export(self, path: str | None = None) -> dict[str, str]:
        """Export the full device database to JSON and SQLite."""
        return await self._store.async_export(
            self.data, path or default_export_path(self.hass)
        )
