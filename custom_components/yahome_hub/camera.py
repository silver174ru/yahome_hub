"""Camera platform for YaHome Hub."""

from __future__ import annotations

from typing import Any

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CAP_ON_OFF
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_capability_instance, get_capability_state, primary_domain


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up camera placeholders for Yandex cameras."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeCamera(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "camera"
    ]
    async_add_entities(entities)


class YahomeCamera(YahomeDeviceEntity, Camera):
    """A Yandex camera.

    Yandex does not expose a public still-image endpoint through the IoT API.
    The entity keeps the device in Home Assistant and shows its capabilities
    and state; a video stream can be added later through Quasar/WebRTC.
    """

    _attr_name = None

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, device_id: str
    ) -> None:
        super().__init__(coordinator, device_id, "camera")

    @property
    def is_recording(self) -> bool:
        """Return True when the camera is on."""
        value = get_capability_state(self.device, CAP_ON_OFF, "on")
        return bool(value)

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a still image.

        The Yandex IoT API does not provide a public snapshot endpoint.
        """
        return None

    async def stream_source(self) -> str | None:
        """Return a stream source.

        A WebRTC/RTSP source can be added when Quasar stream support is wired.
        """
        return None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return raw capabilities."""
        return {
            "capabilities": [
                {
                    "type": capability.get("type"),
                    "instance": get_capability_instance(capability),
                    "value": (capability.get("state") or {}).get("value"),
                }
                for capability in self.device.get("capabilities") or []
            ]
        }
