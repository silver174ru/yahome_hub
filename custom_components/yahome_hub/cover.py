"""Cover platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.cover import (
    CoverDeviceClass,
    CoverEntity,
    CoverEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    CAP_OPEN,
    DEVICE_TYPE_BLIND,
    DEVICE_TYPE_CURTAIN,
    DEVICE_TYPE_DOOR,
    DEVICE_TYPE_GATE,
    DEVICE_TYPE_WINDOW,
)
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import (
    device_type,
    get_capability,
    get_capability_state,
    is_cover,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up covers."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[YahomeCover] = []
    for device_id, device in coordinator.data.devices.items():
        if (
            coordinator.is_device_visible(device_id)
            and is_cover(device)
            and get_capability(device, CAP_OPEN)
        ):
            entities.append(YahomeCover(coordinator, device_id))
    async_add_entities(entities)


class YahomeCover(YahomeDeviceEntity, CoverEntity):
    """A Yandex openable device."""

    _attr_name = None
    _attr_supported_features = (
        CoverEntityFeature.OPEN
        | CoverEntityFeature.CLOSE
        | CoverEntityFeature.SET_POSITION
    )

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "cover")
        mapping = {
            DEVICE_TYPE_CURTAIN: CoverDeviceClass.CURTAIN,
            DEVICE_TYPE_BLIND: CoverDeviceClass.SHADE,
            DEVICE_TYPE_GATE: CoverDeviceClass.GATE,
            DEVICE_TYPE_DOOR: CoverDeviceClass.DOOR,
            DEVICE_TYPE_WINDOW: CoverDeviceClass.WINDOW,
        }
        self._attr_device_class = mapping.get(device_type(self.device))

    @property
    def current_cover_position(self) -> int | None:
        """Return the current position 0..100."""
        value = get_capability_state(self.device, CAP_OPEN, "open")
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def is_closed(self) -> bool | None:
        """Return True when fully closed."""
        position = self.current_cover_position
        return position == 0 if position is not None else None

    async def async_open_cover(self, **kwargs: Any) -> None:
        """Open the cover."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_OPEN, "open", 100
        )

    async def async_close_cover(self, **kwargs: Any) -> None:
        """Close the cover."""
        await self.coordinator.async_device_action(
            self._device_id, CAP_OPEN, "open", 0
        )

    async def async_set_cover_position(self, **kwargs: Any) -> None:
        """Set the cover position."""
        position = int(kwargs["position"])
        await self.coordinator.async_device_action(
            self._device_id, CAP_OPEN, "open", position
        )
