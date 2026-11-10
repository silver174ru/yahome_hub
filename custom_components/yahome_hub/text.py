"""Text platform for Yandex speaker announcements."""

from __future__ import annotations

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import MUSIC_SPEAKER_PLATFORMS
from .coordinator import YahomeDataUpdateCoordinator
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up speaker announcement text entities."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    async_add_entities(
        YahomeSpeakerTtsText(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
        and speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
    )


class YahomeSpeakerTtsText(YahomeSpeakerEntity, TextEntity):
    """Pending phrase for the speaker announcement button."""

    _attr_name = "Текст для Алисы"
    _attr_icon = "mdi:message-text"
    _attr_native_min = 0
    _attr_native_max = 500

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "tts_text")

    @property
    def native_value(self) -> str:
        """Return the pending message."""
        return self.coordinator.tts_message(self._speaker_id)

    async def async_set_value(self, value: str) -> None:
        """Store the message for the announcement button."""
        self.coordinator.set_tts_message(self._speaker_id, value)
        self.async_write_ha_state()
