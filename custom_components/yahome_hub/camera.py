"""Camera platform for YaHome Hub."""

from __future__ import annotations

import asyncio
import io
import re
from pathlib import Path
from typing import Any

from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONTENT_TYPE_MULTIPART
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .const import CAP_ON_OFF, CONF_MUSIC_TOKEN, MUSIC_SPEAKER_PLATFORMS
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_capability_instance, get_capability_state, primary_domain
from .music import async_get_lyrics, parse_lyrics_line
from .speaker_entity import YahomeSpeakerEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up camera placeholders for Yandex cameras."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities: list[Camera] = [
        YahomeCamera(coordinator, device_id)
        for device_id, device in coordinator.data.devices.items()
        if coordinator.is_device_visible(device_id)
        and primary_domain(device) == "camera"
    ]
    entities.extend(
        YahomeSpeakerLyricsCamera(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
        and speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
    )
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
        Camera.__init__(self)
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


class YahomeSpeakerLyricsCamera(YahomeSpeakerEntity, Camera):
    """Cover art and synchronized lyrics for a Yandex Station."""

    _attr_name = "Текст"
    _attr_icon = "mdi:text-box-music"

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        Camera.__init__(self)
        super().__init__(coordinator, speaker_id, "lyrics")
        self._cover_url: str | None = None
        self._cover: bytes | None = None
        self._lyrics_track: str | None = None
        self._lyrics: str | None = None

    @property
    def _media_state(self):
        entity_id = self.speaker.get("entity_id")
        return self.hass.states.get(entity_id) if entity_id else None

    @property
    def _media_attrs(self) -> dict[str, Any]:
        state = self._media_state
        return dict(state.attributes) if state else {}

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        await self._async_refresh_lyrics()

    def _handle_coordinator_update(self) -> None:
        async def refresh() -> None:
            await self._async_refresh_lyrics()
            self.async_write_ha_state()

        self.hass.async_create_task(refresh())
        super()._handle_coordinator_update()

    async def _async_refresh_lyrics(self) -> None:
        attrs = self._media_attrs
        track_id = str(attrs.get("media_content_id") or "")
        if not track_id or track_id == self._lyrics_track:
            return
        self._lyrics_track = track_id
        self._lyrics = await async_get_lyrics(
            async_get_clientsession(self.hass),
            track_id,
            self.coordinator.entry.data.get(CONF_MUSIC_TOKEN),
        )

    async def _async_cover(self) -> bytes | None:
        url = self._media_attrs.get("entity_picture")
        if not url or not str(url).startswith("http"):
            return None
        if url == self._cover_url:
            return self._cover
        try:
            async with async_get_clientsession(self.hass).get(url) as response:
                if response.status != 200:
                    return None
                data = await response.read()
        except Exception:  # noqa: BLE001
            return None
        self._cover_url = url
        self._cover = data
        return data

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Return a frame with cover art and the current lyric line."""
        return await self._async_render_frame()

    async def handle_async_mjpeg_stream(
        self, request: web.Request
    ) -> web.StreamResponse | None:
        """Stream lyrics frames over the track cover."""
        response = web.StreamResponse()
        response.content_type = CONTENT_TYPE_MULTIPART.format("--frameboundary")
        await response.prepare(request)
        self._attr_is_streaming = True
        self.async_write_ha_state()
        try:
            while True:
                frame = await self._async_render_frame()
                if not frame:
                    await asyncio.sleep(1)
                    continue
                data = (
                    b"--frameboundary\r\nContent-Type: image/jpeg\r\n"
                    b"Content-Length: "
                    + str(len(frame)).encode()
                    + b"\r\n\r\n"
                    + frame
                    + b"\r\n"
                )
                await response.write(data)
                await asyncio.sleep(1)
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            self._attr_is_streaming = False
            self.async_write_ha_state()
        return response

    async def _async_render_frame(self) -> bytes | None:
        attrs = self._media_attrs
        position = attrs.get("media_position")
        if position is not None and attrs.get("media_position_updated_at"):
            try:
                from datetime import datetime

                updated = datetime.fromisoformat(
                    str(attrs["media_position_updated_at"]).replace("Z", "+00:00")
                )
                position += max(
                    0, (datetime.now(updated.tzinfo) - updated).total_seconds()
                )
            except (TypeError, ValueError):
                pass
        current = parse_lyrics_line(self._lyrics, position)
        next_line = _next_lyric_line(self._lyrics, position)
        cover = await self._async_cover()
        return await self.hass.async_add_executor_job(
            _render_lyrics_frame,
            cover,
            attrs.get("media_title"),
            attrs.get("media_artist"),
            current,
            next_line,
        )

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Expose lyrics and the current line as attributes."""
        attrs = self._media_attrs
        position = attrs.get("media_position")
        if position is not None and attrs.get("media_position_updated_at"):
            try:
                from datetime import datetime

                updated = datetime.fromisoformat(
                    str(attrs["media_position_updated_at"]).replace("Z", "+00:00")
                )
                position += max(
                    0, (datetime.now(updated.tzinfo) - updated).total_seconds()
                )
            except (TypeError, ValueError):
                pass
        return {
            "media_title": attrs.get("media_title"),
            "media_artist": attrs.get("media_artist"),
            "media_content_id": attrs.get("media_content_id"),
            "lyrics": self._lyrics,
            "current_line": parse_lyrics_line(self._lyrics, position),
        }


FONT_PATH = Path(__file__).parent / "fonts" / "DejaVuSans.ttf"
LYRIC_RE = re.compile(r"^\[([0-9]{2}):([0-9]{2})(?:\.([0-9]{2,3}))?\]\s*(.*)$")


def _next_lyric_line(lyrics: str | None, position: float | None) -> str | None:
    if not lyrics:
        return None
    next_line = None
    for raw in lyrics.splitlines():
        match = LYRIC_RE.match(raw.strip())
        if not match:
            continue
        seconds = int(match.group(1)) * 60 + int(match.group(2))
        if match.group(3):
            seconds += int(match.group(3)) / (100 if len(match.group(3)) == 2 else 1000)
        if position is not None and seconds > position:
            next_line = match.group(4).strip()
            break
    return next_line or None


def _render_lyrics_frame(
    cover: bytes | None,
    title: str | None,
    artist: str | None,
    current: str | None,
    next_line: str | None,
) -> bytes:
    width, height = 1280, 720
    canvas = Image.new("RGB", (width, height), "#101018")
    draw = ImageDraw.Draw(canvas, "RGBA")

    cover_image = None
    if cover:
        try:
            cover_image = Image.open(io.BytesIO(cover)).convert("RGB")
        except Exception:  # noqa: BLE001
            cover_image = None

    if cover_image:
        background = cover_image.resize((width, height)).filter(
            ImageFilter.GaussianBlur(34)
        )
        background = background.point(lambda value: int(value * 0.42))
        canvas.paste(background, (0, 0))
        size = 560
        square = cover_image.resize((size, size))
        canvas.paste(square, (70, 80))
        draw.rounded_rectangle(
            (70, 80, 70 + size, 80 + size),
            radius=28,
            outline=(255, 255, 255, 70),
            width=2,
        )

    font_title = ImageFont.truetype(str(FONT_PATH), 44)
    font_artist = ImageFont.truetype(str(FONT_PATH), 28)
    font_line = ImageFont.truetype(str(FONT_PATH), 48)
    font_next = ImageFont.truetype(str(FONT_PATH), 28)

    text_x = 680 if cover_image else 80
    text_width = width - text_x - 60
    draw.text(
        (text_x, 150),
        _wrap_text(title or "Яндекс Станция", font_title, text_width),
        font=font_title,
        fill=(255, 255, 255, 235),
        spacing=8,
    )
    draw.text(
        (text_x, 270),
        _wrap_text(artist or "", font_artist, text_width),
        font=font_artist,
        fill=(220, 220, 230, 190),
    )

    draw.rectangle((0, height - 170, width, height), fill=(8, 8, 14, 150))
    if current:
        draw.text(
            (width // 2, height - 115),
            current,
            font=font_line,
            fill=(255, 255, 255, 245),
            anchor="mm",
        )
    if next_line:
        draw.text(
            (width // 2, height - 55),
            next_line,
            font=font_next,
            fill=(200, 200, 215, 190),
            anchor="mm",
        )
    if not current and not next_line:
        draw.text(
            (width // 2, height - 80),
            "Текст песни недоступен",
            font=font_artist,
            fill=(200, 200, 215, 170),
            anchor="mm",
        )

    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG", quality=86)
    return buffer.getvalue()


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, width: int) -> str:
    if not text:
        return ""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if font.getlength(candidate) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines[:3])
