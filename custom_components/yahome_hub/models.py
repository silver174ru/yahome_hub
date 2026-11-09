"""Data models for YaHome Hub."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class YahomeData:
    """Data returned by the coordinator."""

    devices: dict[str, dict[str, Any]] = field(default_factory=dict)
    rooms: dict[str, str] = field(default_factory=dict)
    scenarios: dict[str, dict[str, Any]] = field(default_factory=dict)
    speakers: dict[str, dict[str, Any]] = field(default_factory=dict)
    stations: dict[str, dict[str, Any]] = field(default_factory=dict)
    child_to_station: dict[str, str] = field(default_factory=dict)
    quasar_to_iot: dict[str, str] = field(default_factory=dict)
