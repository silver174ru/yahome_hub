"""Conversation entity that talks to Alice on a Yandex Station."""

from __future__ import annotations

from typing import Any

from homeassistant.components.conversation import (
    ConversationEntity,
    ConversationEntityFeature,
    ConversationInput,
    ConversationResult,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.intent import IntentResponse, IntentResponseErrorCode
from homeassistant.util import ulid

from .coordinator import YahomeDataUpdateCoordinator
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create an Alice conversation entity for every real speaker."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    async_add_entities(
        YahomeSpeakerConversation(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
    )


class YahomeSpeakerConversation(YahomeSpeakerEntity, ConversationEntity):
    """Send text to Alice and return the station answer."""

    _attr_name = "Алиса"
    _attr_icon = "mdi:account-voice"
    _attr_supported_features = ConversationEntityFeature.CONTROL

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "conversation")

    @property
    def supported_languages(self) -> list[str]:
        """Return supported languages."""
        return ["ru"]

    def _local_glagol(self) -> Any | None:
        """Find the live glagol connection of Yandex.Station, when present."""
        data = self.hass.data.get("yandex_station")
        if not isinstance(data, dict):
            return None
        for quasar in data.values():
            for device in getattr(quasar, "speakers", []):
                info = device.get("quasar_info") or {}
                if info.get("device_id") != self._speaker_id:
                    continue
                entity = device.get("entity")
                return getattr(entity, "glagol", None)
        return None

    async def async_process(
        self, user_input: ConversationInput
    ) -> ConversationResult:
        """Send a phrase to Alice."""
        response = IntentResponse(language=user_input.language)
        conversation_id = ulid.ulid_now()
        text: str | None = None

        glagol = self._local_glagol()
        if glagol is not None:
            try:
                card = await glagol.send(
                    {"command": "sendText", "text": user_input.text}
                )
            except Exception:  # noqa: BLE001
                card = None
            if isinstance(card, dict):
                text = card.get("text")
                if not text and card.get("error"):
                    response.async_set_error(
                        IntentResponseErrorCode.FAILED_TO_HANDLE,
                        str(card["error"]),
                    )
                    return ConversationResult(
                        response=response,
                        conversation_id=conversation_id,
                    )

        if not text:
            quasar = self.coordinator.quasar
            if quasar is None:
                response.async_set_error(
                    IntentResponseErrorCode.UNKNOWN, "Алиса недоступна"
                )
                return ConversationResult(
                    response=response, conversation_id=conversation_id
                )
            try:
                device_id = self.coordinator.data.quasar_to_iot.get(
                    self._speaker_id, self._speaker_id
                )
                await quasar.send_device_actions(
                    device_id,
                    [
                        {
                            "type": "devices.capabilities.quasar.server_action",
                            "state": {
                                "instance": "text_action",
                                "value": user_input.text,
                            },
                        }
                    ],
                )
            except Exception as err:  # noqa: BLE001
                response.async_set_error(
                    IntentResponseErrorCode.FAILED_TO_HANDLE, str(err)
                )
                return ConversationResult(
                    response=response, conversation_id=conversation_id
                )
            text = "Команда отправлена на колонку"

        response.async_set_speech(text)
        return ConversationResult(
            response=response, conversation_id=conversation_id
        )
