"""Sidebar panel registration for YaHome Hub."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
PANEL_KEY = f"{DOMAIN}_panel_registered"
FRONTEND_PATH = Path(__file__).parent / "frontend"
FRONTEND_URL = f"/{DOMAIN}"


def _asset_version() -> str:
    """Return a content hash so the browser never keeps stale panel code."""
    try:
        data = (FRONTEND_PATH / "yahome-hub-panel.js").read_bytes()
    except OSError:
        return "dev"
    return hashlib.sha256(data).hexdigest()[:10]


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the static frontend and the sidebar panel."""
    if hass.data.get(PANEL_KEY):
        return
    try:
        version = await hass.async_add_executor_job(_asset_version)
        await hass.http.async_register_static_paths(
            [StaticPathConfig(FRONTEND_URL, str(FRONTEND_PATH), False)]
        )
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="yahome-hub-panel",
            frontend_url_path="yahome-hub",
            sidebar_title="YaHome Hub",
            sidebar_icon="mdi:home-automation",
            module_url=f"{FRONTEND_URL}/yahome-hub-panel.js?v={version}",
            embed_iframe=False,
            require_admin=True,
        )
        hass.data[PANEL_KEY] = True
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Unable to register the YaHome Hub panel")




