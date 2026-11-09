"""YaHome Hub integration for Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import CONF_COOKIES, CONF_MUSIC_TOKEN, CONF_X_TOKEN
from .cookies import async_find_cookies
from .panel import async_register_panel
from .services import async_setup_services
from .websocket_api import async_register_websocket_commands

PLATFORMS: list[Platform] = [
    Platform.SWITCH,
    Platform.LIGHT,
    Platform.COVER,
    Platform.VACUUM,
    Platform.CLIMATE,
    Platform.FAN,
    Platform.HUMIDIFIER,
    Platform.MEDIA_PLAYER,
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SCENE,
    Platform.CAMERA,
    Platform.CALENDAR,
    Platform.CONVERSATION,
]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration-wide services and panel."""
    await async_setup_services(hass)
    async_register_websocket_commands(hass)
    await async_register_panel(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up YaHome Hub from a config entry."""
    from .coordinator import YahomeDataUpdateCoordinator

    found = await async_find_cookies(hass)
    if found and found.cookies and found.cookies != entry.data.get(CONF_COOKIES):
        data = dict(entry.data)
        data[CONF_COOKIES] = found.cookies
        if found.music_token:
            data[CONF_MUSIC_TOKEN] = found.music_token
        if found.x_token:
            data[CONF_X_TOKEN] = found.x_token
        hass.config_entries.async_update_entry(entry, data=data)

    coordinator = YahomeDataUpdateCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload after options change."""
    await hass.config_entries.async_reload(entry.entry_id)
