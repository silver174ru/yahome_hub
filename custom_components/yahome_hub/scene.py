"""Scene platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.scene import Scene
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .coordinator import YahomeDataUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Yandex scenarios."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeScene(coordinator, scenario_id, scenario)
        for scenario_id, scenario in coordinator.data.scenarios.items()
    ]
    async_add_entities(entities)


class YahomeScene(CoordinatorEntity[YahomeDataUpdateCoordinator], Scene):
    """A Yandex scenario exposed as a scene."""

    def __init__(
        self,
        coordinator: YahomeDataUpdateCoordinator,
        scenario_id: str,
        scenario: dict[str, Any],
    ) -> None:
        super().__init__(coordinator)
        self._scenario_id = scenario_id
        self._attr_unique_id = f"scenario_{scenario_id}"
        self._attr_name = scenario.get("name") or scenario_id

    async def async_activate(self, **kwargs: Any) -> None:
        """Activate the scenario."""
        await self.coordinator.async_execute_scenario(self._scenario_id)
