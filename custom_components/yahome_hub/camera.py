"""Camera platform for YaHome Hub."""

from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Any

from aiohttp import web
from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONTENT_TYPE_MULTIPART
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from .const import CAP_ON_OFF, CONF_MUSIC_TOKEN, MUSIC_SPEAKER_PLATFORMS
from .coordinator import YahomeDataUpdateCoordinator
from .entity import YahomeDeviceEntity
from .helpers import get_capability_instance, get_capability_state, primary_domain
from .music import async_get_lyrics, parse_lyrics_triplet
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
                await asyncio.sleep(0.5)
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
        if position is not None:
            position += self.coordinator.lyrics_offset
        info = parse_lyrics_triplet(self._lyrics, position)
        fade = 1.0
        if info.get("start") is not None and position is not None:
            fade = min(1.0, max(0.0, (position - info["start"]) / 0.5))
        cover = await self._async_cover()
        return await self.hass.async_add_executor_job(
            _render_lyrics_frame,
            cover,
            attrs.get("media_title"),
            attrs.get("media_artist"),
            info.get("prev"),
            info.get("current"),
            info.get("next"),
            info.get("remaining"),
            fade,
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
        if position is not None:
            position += self.coordinator.lyrics_offset
        info = parse_lyrics_triplet(self._lyrics, position)
        return {
            "media_title": attrs.get("media_title"),
            "media_artist": attrs.get("media_artist"),
            "media_content_id": attrs.get("media_content_id"),
            "lyrics": self._lyrics,
            "prev_line": info.get("prev"),
            "current_line": info.get("current"),
            "next_line": info.get("next"),
            "remaining": info.get("remaining"),
            "lyrics_offset": self.coordinator.lyrics_offset,
        }


FONT_PATH = Path(__file__).parent / "fonts" / "DejaVuSans.ttf"


def _render_lyrics_frame(
    cover: bytes | None,
    title: str | None,
    artist: str | None,
    prev_line: str | None,
    current: str | None,
    next_line: str | None,
    remaining: float | None,
    fade: float,
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
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, size, size), radius=28, fill=255
        )
        canvas.paste(square, (70, 80), mask)
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

    if cover_image:
        _draw_cover_lyrics(
            canvas,
            (70, 80, size, size),
            prev_line,
            current,
            next_line,
            remaining,
            fade,
        )
    else:
        draw.rectangle((0, height - 230, width, height), fill=(8, 8, 14, 170))
        if prev_line:
            draw.text(
                (width // 2, height - 190),
                prev_line,
                font=font_next,
                fill=(190, 190, 205, 150),
                anchor="mm",
            )
        if current:
            draw.text(
                (width // 2, height - 120),
                current,
                font=font_line,
                fill=(255, 255, 255, 245),
                anchor="mm",
            )
            if remaining is not None:
                draw.text(
                    (32, height - 120),
                    f"{remaining:.1f}",
                    font=font_next,
                    fill=(210, 210, 225, 200),
                    anchor="lm",
                )
        if next_line:
            draw.text(
                (width // 2, height - 55),
                next_line,
                font=font_next,
                fill=(200, 200, 215, 170),
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


def _draw_cover_lyrics(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    prev_line: str | None,
    current: str | None,
    next_line: str | None,
    remaining: float | None,
    fade: float,
) -> None:
    """Draw three lyric lines with a countdown over the cover."""
    x, y, width, height = box
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, "RGBA")
    overlay_height = min(310, int(height * 0.58))
    for offset in range(overlay_height):
        alpha = int(245 * (offset / overlay_height) ** 1.35)
        draw.line(
            (
                0,
                height - overlay_height + offset,
                width,
                height - overlay_height + offset,
            ),
            fill=(5, 6, 15, alpha),
        )

    font_prev = ImageFont.truetype(str(FONT_PATH), 20)
    font_current = ImageFont.truetype(str(FONT_PATH), 31)
    font_next = ImageFont.truetype(str(FONT_PATH), 20)
    font_count = ImageFont.truetype(str(FONT_PATH), 19)
    fade = max(0.0, min(1.0, float(fade)))
    center_x = width // 2
    overlay_top = height - overlay_height
    prev_alpha = int(125 + 70 * (1.0 - fade))

    if prev_line:
        text = _wrap_text(prev_line, font_prev, width - 48)
        draw.multiline_text(
            (center_x, overlay_top + 24),
            text,
            font=font_prev,
            fill=(215, 215, 230, prev_alpha),
            anchor="ma",
            align="center",
            spacing=4,
        )

    if current:
        text = _wrap_text(current, font_current, width - 104)
        bbox = draw.multiline_textbbox(
            (0, 0), text, font=font_current, spacing=6, align="center"
        )
        text_height = bbox[3] - bbox[1]
        current_y = height - 72 - text_height
        draw.multiline_text(
            (70 + (width - 90) // 2, current_y),
            text,
            font=font_current,
            fill=(255, 255, 255, int(245 * fade)),
            anchor="ma",
            align="center",
            spacing=6,
        )
        if remaining is not None:
            draw.text(
                (24, current_y + 10),
                f"{remaining:.1f}",
                font=font_count,
                fill=(220, 220, 235, int(210 * fade)),
                anchor="la",
            )

    if next_line:
        text = _wrap_text(next_line, font_next, width - 48)
        draw.multiline_text(
            (center_x, height - 30),
            text,
            font=font_next,
            fill=(205, 205, 220, 185),
            anchor="ms",
            align="center",
            spacing=4,
        )

    if not current and not next_line and not prev_line:
        draw.text(
            (center_x, height - 40),
            "Текст песни недоступен",
            font=font_next,
            fill=(210, 210, 225, 180),
            anchor="ms",
        )

    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, width, height), radius=28, fill=255
    )
    overlay.putalpha(ImageChops.multiply(overlay.getchannel("A"), mask))
    canvas.paste(overlay, (x, y), overlay)


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
