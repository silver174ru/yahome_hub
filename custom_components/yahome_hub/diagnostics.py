"""Diagnostics support for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_COOKIES, CONF_MUSIC_TOKEN, CONF_TOKEN, CONF_X_TOKEN
from .coordinator import YahomeDataUpdateCoordinator

TO_REDACT = {
    CONF_TOKEN,
    CONF_COOKIES,
    CONF_MUSIC_TOKEN,
    CONF_X_TOKEN,
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    data = coordinator.data
    return {
        "entry": {
            "data": async_redact_data(dict(entry.data), TO_REDACT),
            "options": dict(entry.options),
        },
        "counts": {
            "devices": len(data.devices),
            "speakers": len(data.speakers),
            "stations": len(data.stations),
            "station_children": len(data.child_to_station),
            "scenarios": len(data.scenarios),
        },
        "devices": [
            {
                "id": device.get("id"),
                "name": device.get("name"),
                "type": device.get("type"),
                "room": device.get("room"),
                "state": device.get("state"),
                "capabilities": [
                    cap.get("type") for cap in device.get("capabilities") or []
                ],
                "properties": [
                    (prop.get("state") or {}).get("instance")
                    for prop in device.get("properties") or []
                ],
            }
            for device in data.devices.values()
        ],
        "stations": [
            {
                "id": station_id,
                "name": station.get("name"),
                "children": [
                    {
                        "id": child.get("id"),
                        "name": child.get("name"),
                        "device_type": child.get("device_type"),
                        "link_type": child.get("link_type"),
                    }
                    for child in station.get("child_items") or []
                ],
            }
            for station_id, station in data.stations.items()
        ],
    }
