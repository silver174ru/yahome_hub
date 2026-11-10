"""Button platform for Yandex speaker announcements."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import MUSIC_SPEAKER_PLATFORMS
from .coordinator import YahomeDataUpdateCoordinator
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up speaker announcement buttons."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    async_add_entities(
        YahomeSpeakerTtsButton(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
        and speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
    )


class YahomeSpeakerTtsButton(YahomeSpeakerEntity, ButtonEntity):
    """Send the pending phrase to the speaker."""

    _attr_name = "Озвучить"
    _attr_icon = "mdi:account-voice"

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "tts_button")

    async def async_press(self) -> None:
        """Announce the stored phrase."""
        message = self.coordinator.tts_message(self._speaker_id)
        if not message:
            raise HomeAssistantError("Введите текст в сущности «Текст для Алисы»")
        entity_id = self.speaker.get("entity_id")
        if not entity_id:
            raise HomeAssistantError("У колонки нет media_player")
        await self.coordinator.async_say(entity_id, message)
