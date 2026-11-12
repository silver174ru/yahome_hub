"""Persistent device database for YaHome Hub."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN, VERSION
from .models import YahomeData
from .views import serialize_data

STORAGE_KEY = f"{DOMAIN}.devices"
STORAGE_VERSION = 1


class YahomeDeviceStore:
    """Store the full Yandex device catalog in Home Assistant storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self) -> dict[str, Any] | None:
        """Load the saved device database."""
        return await self._store.async_load()

    async def async_save(self, data: YahomeData) -> None:
        """Save the device database immediately."""
        await self._store.async_save(serialize_data(data))

    def async_delay_save(self, data: YahomeData, delay: int = 30) -> None:
        """Schedule a delayed save."""
        self._store.async_delay_save(lambda: serialize_data(data), delay)

    async def async_export(
        self, data: YahomeData, path: str
    ) -> dict[str, str]:
        """Export the device database to JSON and SQLite."""
        base = Path(self._hass.config.path("yahome_hub")).resolve()
        target = Path(path)
        if not target.is_absolute():
            target = base / target
        target = target.resolve()
        if target != base and base not in target.parents:
            raise ValueError(
                "Путь экспорта должен находиться внутри папки yahome_hub"
            )
        target.parent.mkdir(parents=True, exist_ok=True)
        serialized = serialize_data(data)
        payload = {
            "version": VERSION,
            "generated": serialized["updated"],
            "database": serialized,
        }
        sqlite_path = target.with_suffix(".db")

        def _write() -> None:
            with target.open("w", encoding="utf-8") as file:
                json.dump(payload, file, ensure_ascii=False, indent=2)
            self._write_sqlite(serialized, sqlite_path)

        await self._hass.async_add_executor_job(_write)
        return {"path": str(target), "json": str(target), "sqlite": str(sqlite_path)}

    @staticmethod
    def _write_sqlite(serialized: dict[str, Any], target: Path) -> None:
        """Write a normalized SQLite database."""
        connection = sqlite3.connect(target)
        try:
            cursor = connection.cursor()
            cursor.executescript(
                """
                DROP TABLE IF EXISTS capabilities;
                DROP TABLE IF EXISTS properties;
                DROP TABLE IF EXISTS devices;
                DROP TABLE IF EXISTS scenarios;
                DROP TABLE IF EXISTS rooms;
                CREATE TABLE devices (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    type TEXT,
                    type_label TEXT,
                    primary_domain TEXT,
                    room TEXT,
                    room_name TEXT,
                    online INTEGER,
                    state TEXT
                );
                CREATE TABLE capabilities (
                    device_id TEXT,
                    type TEXT,
                    kind TEXT,
                    instance TEXT,
                    name TEXT,
                    value TEXT,
                    parameters TEXT
                );
                CREATE TABLE properties (
                    device_id TEXT,
                    type TEXT,
                    instance TEXT,
                    name TEXT,
                    value TEXT,
                    unit TEXT,
                    device_class TEXT
                );
                CREATE TABLE scenarios (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    is_active INTEGER
                );
                CREATE TABLE rooms (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    count INTEGER
                );
                """
            )
            for device in serialized.get("devices", []):
                cursor.execute(
                    "INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        device.get("id"),
                        device.get("name"),
                        device.get("type"),
                        device.get("type_label"),
                        device.get("primary_domain"),
                        device.get("room"),
                        device.get("room_name"),
                        1 if device.get("online") else 0,
                        device.get("state"),
                    ),
                )
                for capability in device.get("capabilities", []):
                    cursor.execute(
                        "INSERT INTO capabilities VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            device.get("id"),
                            capability.get("type"),
                            capability.get("kind"),
                            capability.get("instance"),
                            capability.get("name"),
                            json.dumps(
                                capability.get("value"), ensure_ascii=False
                            ),
                            json.dumps(
                                capability.get("parameters"),
                                ensure_ascii=False,
                            ),
                        ),
                    )
                for prop in device.get("properties", []):
                    cursor.execute(
                        "INSERT INTO properties VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            device.get("id"),
                            prop.get("type"),
                            prop.get("instance"),
                            prop.get("name"),
                            json.dumps(prop.get("value"), ensure_ascii=False),
                            prop.get("unit"),
                            prop.get("device_class"),
                        ),
                    )
            for scenario in serialized.get("scenarios", []):
                cursor.execute(
                    "INSERT OR REPLACE INTO scenarios VALUES (?, ?, ?)",
                    (
                        scenario.get("id"),
                        scenario.get("name"),
                        1 if scenario.get("is_active") else 0,
                    ),
                )
            for room in serialized.get("rooms", []):
                cursor.execute(
                    "INSERT OR REPLACE INTO rooms VALUES (?, ?, ?)",
                    (room.get("id"), room.get("name"), room.get("count")),
                )
            connection.commit()
        finally:
            connection.close()


def default_export_path(hass: HomeAssistant) -> str:
    """Return the default export path."""
    return str(Path(hass.config.path("yahome_hub")) / "devices.json")
