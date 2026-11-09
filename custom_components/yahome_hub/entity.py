"""Base entities for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import YahomeDataUpdateCoordinator
from .helpers import device_name, is_online


class YahomeDeviceEntity(CoordinatorEntity[YahomeDataUpdateCoordinator]):
    """Base entity bound to one Yandex device."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        device_id: str,
        entity_key: str,
    ) -> None:
        super().__init__(coordinator)
        self._device_id = device_id
        self._attr_unique_id = f"{device_id}_{entity_key}"

    @property
    def device(self) -> dict[str, Any]:
        """Return the current device payload."""
        return self.coordinator.data.devices.get(self._device_id, {})

    @property
    def available(self) -> bool:
        """Return True when the device is online."""
        return super().available and is_online(self.device)

    @property
    def device_info(self) -> DeviceInfo:
        """Return HA device registry metadata."""
        device = self.device
        info = device.get("device_info") or {}
        room_id = device.get("room")
        room_name = self.coordinator.data.rooms.get(room_id) if room_id else None
        via_device_id = None
        station_id = self.coordinator.station_for_device(self._device_id)
        if station_id:
            parent_identifier = self.coordinator.station_identifier(station_id)
            parent = dr.async_get(self.hass).async_get_device(
                identifiers={parent_identifier}
            )
            if parent:
                via_device_id = parent.id
        return DeviceInfo(
            identifiers={(DOMAIN, self._device_id)},
            name=device_name(device),
            manufacturer=info.get("manufacturer") or "Yandex",
            model=info.get("model"),
            sw_version=info.get("sw_version"),
            hw_version=info.get("hw_version"),
            via_device_id=via_device_id,
            suggested_area=room_name,
        )
