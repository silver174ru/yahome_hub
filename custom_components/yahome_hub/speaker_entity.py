"""Shared base entities for Yandex speakers."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import YahomeDataUpdateCoordinator


class YahomeSpeakerEntity(CoordinatorEntity[YahomeDataUpdateCoordinator]):
    """A Home Assistant entity attached to one Yandex speaker."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        speaker_id: str,
        entity_key: str,
    ) -> None:
        super().__init__(coordinator)
        self._speaker_id = speaker_id
        self._attr_unique_id = f"{speaker_id}_{entity_key}"

    @property
    def speaker(self) -> dict[str, Any]:
        """Return the live speaker payload."""
        return self.coordinator.data.speakers.get(self._speaker_id, {})

    @property
    def speaker_name(self) -> str:
        """Return the human-readable speaker name."""
        return self.speaker.get("name") or "Яндекс Станция"

    @property
    def device_type(self) -> str:
        """Return the Yandex device type used by alarm APIs."""
        return (
            self.speaker.get("type")
            or "devices.types.smart_speaker.yandex.station"
        )

    @property
    def available(self) -> bool:
        """Return True while the speaker exists in the coordinator."""
        return super().available and self._speaker_id in self.coordinator.data.speakers

    @property
    def device_info(self) -> DeviceInfo:
        """Attach the entity to the same HA device as the media player."""
        iot_id = self.coordinator.data.quasar_to_iot.get(self._speaker_id)
        return DeviceInfo(
            identifiers={(DOMAIN, iot_id or f"speaker_{self._speaker_id}")},
            name=self.speaker_name,
            manufacturer="Yandex",
            model=self.speaker.get("platform"),
        )
