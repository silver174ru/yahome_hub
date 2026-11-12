"""Mirror Yandex Station music to other media players."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

from homeassistant.components.media_player import MediaPlayerEntityFeature
from homeassistant.const import (
    STATE_IDLE,
    STATE_OFF,
    STATE_PAUSED,
    STATE_PLAYING,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Context, Event, HomeAssistant, State, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.template import Template, TemplateError

from .const import CONF_MUSIC_TOKEN
from .music import MusicStreamError, async_get_track_stream
from .stream_proxy import async_get_registry

if TYPE_CHECKING:
    from .coordinator import YahomeDataUpdateCoordinator

_LOGGER = logging.getLogger(__name__)
YANDEX_TARGET_PLATFORMS = {"yahome_hub", "yandex_station"}
STOP_STATES = {STATE_OFF, STATE_IDLE, STATE_UNAVAILABLE, STATE_UNKNOWN}


@dataclass
class StreamSession:
    """One source-to-targets mirroring session."""

    session_id: str
    source_entity_id: str
    target_entity_ids: list[str]
    sync_volume: bool | Template
    use_proxy: bool
    stop_targets: bool
    context: Context | None = None
    unsub: Callable[[], None] | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    worker: asyncio.Task | None = None
    pending_state: State | None = None
    closed: bool = False
    last_track_key: tuple[str, str] | None = None
    last_source_state: str | None = None
    last_volume: float | None = None
    last_play_url: str | None = None
    last_play_track_id: str | None = None
    last_play_title: str = ""
    last_play_artist: str = ""
    last_play_cover: str = ""
    last_play_position: float = 0.0
    proxy_tokens: set[str] = field(default_factory=set)
    warned_targets: set[str] = field(default_factory=set)
    template_error_logged: bool = False

    def snapshot(self) -> dict[str, Any]:
        """Return a safe public description."""
        sync: bool | str = self.sync_volume
        if isinstance(sync, Template):
            sync = sync.template
        return {
            "session_id": self.session_id,
            "source_entity_id": self.source_entity_id,
            "target_entity_ids": list(self.target_entity_ids),
            "sync_volume": sync,
            "use_proxy": self.use_proxy,
            "last_track": self.last_track_key[0] if self.last_track_key else None,
            "last_state": self.last_source_state,
        }


class MusicStreamManager:
    """Manage persistent source-to-target playback sessions."""

    def __init__(self, coordinator: "YahomeDataUpdateCoordinator") -> None:
        self.coordinator = coordinator
        self.hass: HomeAssistant = coordinator.hass
        self.sessions: dict[str, StreamSession] = {}
        self.target_owner: dict[str, str] = {}
        self.proxy = async_get_registry(self.hass)

    async def async_start(
        self,
        source_entity_id: str,
        target_entity_ids: list[str],
        *,
        sync_volume: bool | Template | str = True,
        use_proxy: bool = True,
        start: bool = True,
        stop_targets: bool = True,
        context: Context | None = None,
    ) -> dict[str, Any]:
        """Create or replace a mirroring session."""
        if not self.hass.states.get(source_entity_id):
            raise ServiceValidationError("Source media player was not found")
        targets = list(dict.fromkeys(str(item) for item in target_entity_ids))
        targets = [item for item in targets if item != source_entity_id]
        if not targets:
            raise ServiceValidationError(
                "At least one target different from the source is required"
            )

        if isinstance(sync_volume, str):
            try:
                sync_volume = Template(sync_volume, self.hass)
            except TemplateError as err:
                raise ServiceValidationError(
                    f"Invalid sync_volume template: {err}"
                ) from err

        for target in targets:
            if not target.startswith("media_player."):
                raise ServiceValidationError(
                    f"Target {target} is not a media_player entity"
                )

        needs_stream = any(
            not self._is_yandex_target(target) for target in targets
        )
        if needs_stream and not self.coordinator.entry.data.get(
            CONF_MUSIC_TOKEN
        ):
            raise ServiceValidationError(
                "Yandex Music token is required to stream to non-Yandex players"
            )

        await self._async_stop_conflicts(source_entity_id, targets)

        session = StreamSession(
            session_id=uuid.uuid4().hex[:12],
            source_entity_id=source_entity_id,
            target_entity_ids=targets,
            sync_volume=sync_volume,
            use_proxy=use_proxy,
            stop_targets=stop_targets,
            context=context,
        )
        session.unsub = async_track_state_change_event(
            self.hass,
            [source_entity_id],
            lambda event: self._async_source_event(session, event),
        )
        self.sessions[session.session_id] = session
        for target in targets:
            self.target_owner[target] = session.session_id

        state = self.hass.states.get(source_entity_id)
        if start and state is not None:
            self._schedule(session, state)
        _LOGGER.info(
            "Music stream %s started: %s -> %s",
            session.session_id,
            source_entity_id,
            ", ".join(targets),
        )
        return session.snapshot()

    async def async_stop(
        self,
        *,
        session_id: str | None = None,
        source_entity_id: str | None = None,
        target_entity_ids: list[str] | None = None,
        stop_playback: bool = True,
    ) -> int:
        """Stop matching sessions and detach listeners."""
        targets = set(target_entity_ids or [])
        matched = [
            session
            for session in self.sessions.values()
            if (session_id is None or session.session_id == session_id)
            and (
                source_entity_id is None
                or session.source_entity_id == source_entity_id
            )
            and (
                not targets
                or targets.intersection(session.target_entity_ids)
            )
        ]
        for session in matched:
            session.closed = True
            if session.worker is not None and not session.worker.done():
                session.worker.cancel()
            if session.unsub is not None:
                session.unsub()
                session.unsub = None
            for target in session.target_entity_ids:
                if self.target_owner.get(target) == session.session_id:
                    self.target_owner.pop(target, None)
            for token in session.proxy_tokens:
                self.proxy.remove(token)
            session.proxy_tokens.clear()
            self.sessions.pop(session.session_id, None)
            if stop_playback:
                await self._async_stop_targets(session)
            _LOGGER.info("Music stream %s stopped", session.session_id)
        return len(matched)

    async def async_shutdown(self) -> None:
        """Stop all sessions without failing integration unload."""
        try:
            await asyncio.wait_for(
                self.async_stop(stop_playback=True), timeout=8
            )
        except (asyncio.TimeoutError, HomeAssistantError):
            _LOGGER.debug("Music stream shutdown timed out", exc_info=True)

    def snapshot(self) -> list[dict[str, Any]]:
        """Return active sessions for diagnostics."""
        return [session.snapshot() for session in self.sessions.values()]

    @callback
    def _async_source_event(
        self, session: StreamSession, event: Event
    ) -> None:
        """Schedule work without doing I/O inside the event callback."""
        if session.closed:
            return
        new_state = event.data.get("new_state")
        if new_state is None:
            self.hass.async_create_task(
                self.async_stop(
                    session_id=session.session_id, stop_playback=True
                )
            )
            return
        self._schedule(session, new_state)

    def _schedule(self, session: StreamSession, state: State) -> None:
        """Coalesce rapid state updates into one worker."""
        session.pending_state = state
        if session.worker is None or session.worker.done():
            session.worker = self.hass.async_create_task(
                self._async_worker(session)
            )

    async def _async_worker(self, session: StreamSession) -> None:
        """Process the latest source state until quiet."""
        try:
            while not session.closed:
                state = session.pending_state
                if state is None:
                    break
                session.pending_state = None
                try:
                    async with session.lock:
                        await self._async_apply(session, state)
                except asyncio.CancelledError:
                    raise
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning(
                        "Music stream %s update failed: %s",
                        session.session_id,
                        err,
                    )
        finally:
            session.worker = None

    async def _async_apply(
        self, session: StreamSession, state: State
    ) -> None:
        """Mirror one source state to the targets."""
        if session.closed:
            return
        attrs = state.attributes
        source_state = state.state

        if source_state == STATE_PLAYING:
            content_id = str(attrs.get("media_content_id") or "")
            content_type = str(attrs.get("media_content_type") or "")
            is_url = content_type in (
                "music",
                "radio",
                "url",
                "",
            ) and content_id.startswith(("http://", "https://"))
            is_track = (
                content_type == "music"
                and content_id.split(":", 1)[0].isdigit()
            )
            if not is_url and not is_track:
                if content_type in ("music", "radio"):
                    _LOGGER.debug(
                        "Music stream %s: unsupported source media id %s",
                        session.session_id,
                        content_id[:32],
                    )
                session.last_source_state = source_state
                return

            key = (content_id, content_type)
            if key != session.last_track_key:
                if await self._async_start_track(
                    session, state, content_id, content_type
                ):
                    session.last_track_key = key
            elif session.last_source_state != STATE_PLAYING:
                await self._async_resume_targets(session)
                await self._async_align_targets(session, state)
            session.last_source_state = source_state
            await self._async_sync_volume(session, state)
            return

        if source_state == STATE_PAUSED:
            if session.last_source_state != STATE_PAUSED:
                await self._async_pause_targets(session)
            session.last_source_state = source_state
            return

        if source_state in STOP_STATES:
            if session.last_source_state not in STOP_STATES:
                await self._async_stop_targets(session)
            session.last_source_state = source_state
            session.last_track_key = None
            session.last_play_url = None
            return

        session.last_source_state = source_state

    async def _async_start_track(
        self,
        session: StreamSession,
        state: State,
        content_id: str,
        content_type: str,
    ) -> bool:
        """Resolve a track and start it on every target."""
        attrs = state.attributes
        title = str(attrs.get("media_title") or "")
        artist = str(attrs.get("media_artist") or "")
        cover = str(attrs.get("entity_picture") or "")
        track_id: str | None = (
            content_id
            if content_type == "music"
            and content_id.split(":", 1)[0].isdigit()
            else None
        )
        needs_url = content_id.startswith(("http://", "https://")) or any(
            not self._is_yandex_target(target)
            for target in session.target_entity_ids
        )
        url = ""
        if needs_url:
            try:
                url = await self._async_stream_url(
                    session, content_id, track_id, title
                )
            except (MusicStreamError, HomeAssistantError) as err:
                _LOGGER.warning(
                    "Music stream %s: cannot resolve track: %s",
                    session.session_id,
                    err,
                )
                return False
        session.last_play_url = url
        session.last_play_track_id = track_id
        session.last_play_title = title
        session.last_play_artist = artist
        session.last_play_cover = cover
        session.last_play_position = self._position(state)

        await self._async_sync_volume(session, state, force=True)
        results = await asyncio.gather(
            *(
                self._async_play_target(
                    session,
                    target,
                    url,
                    track_id,
                    title,
                    artist,
                    cover,
                    session.last_play_position,
                )
                for target in session.target_entity_ids
            ),
            return_exceptions=True,
        )
        for target, result in zip(session.target_entity_ids, results):
            if isinstance(result, Exception):
                _LOGGER.warning(
                    "Music stream %s: target %s failed: %s",
                    session.session_id,
                    target,
                    result,
                )
        return True

    async def _async_stream_url(
        self,
        session: StreamSession,
        content_id: str,
        track_id: str | None,
        title: str,
    ) -> str:
        """Return a stable proxy URL or the original direct URL."""
        if content_id.startswith(("http://", "https://")):
            return content_id
        if track_id is None:
            raise MusicStreamError("Unsupported Yandex Music content")
        music_token = self.coordinator.entry.data.get(CONF_MUSIC_TOKEN)
        if not music_token:
            raise MusicStreamError("Yandex Music token is not configured")
        if not session.use_proxy:
            info = await async_get_track_stream(
                self.coordinator._session, track_id, music_token
            )
            return info.url

        for token in session.proxy_tokens:
            self.proxy.remove(token)
        session.proxy_tokens.clear()
        token = self.proxy.create(track_id, music_token, title)
        session.proxy_tokens.add(token)
        return self.proxy.url(token)

    async def _async_play_target(
        self,
        session: StreamSession,
        target: str,
        url: str,
        track_id: str | None,
        title: str,
        artist: str,
        cover: str,
        position: float,
    ) -> None:
        """Send one play_media command."""
        state = self.hass.states.get(target)
        if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            return
        features = self._features(state)
        if not features & MediaPlayerEntityFeature.PLAY_MEDIA:
            if target not in session.warned_targets:
                session.warned_targets.add(target)
                _LOGGER.warning(
                    "Music stream %s: target %s does not support play_media",
                    session.session_id,
                    target,
                )
            return

        yandex_target = self._is_yandex_target(target)
        if yandex_target and track_id is not None:
            media_id = track_id.split(":", 1)[0]
            media_type = "music"
        else:
            media_id = url
            media_type = self._media_content_type(target)

        extra: dict[str, Any] = {}
        if title:
            extra["title"] = title
        if cover:
            extra["thumb"] = cover
        if position > 1:
            extra["current_time"] = int(position)
        if title or cover:
            metadata: dict[str, Any] = {"metadataType": 3}
            if title:
                metadata["title"] = title
            if artist:
                metadata["artist"] = artist
            if cover:
                metadata["images"] = [{"url": cover}]
            extra["metadata"] = metadata

        await self.hass.services.async_call(
            "media_player",
            "play_media",
            {
                "media_content_id": media_id,
                "media_content_type": media_type,
                "extra": extra,
            },
            target={"entity_id": target},
            blocking=True,
            context=session.context,
        )
        if position > 2:
            self.hass.async_create_task(
                self._async_align_target(session, target, position)
            )

    async def _async_resume_targets(self, session: StreamSession) -> None:
        """Resume targets that are paused; replay idle targets."""
        for target in session.target_entity_ids:
            state = self.hass.states.get(target)
            if state is None:
                continue
            features = self._features(state)
            if state.state == STATE_PAUSED and features & MediaPlayerEntityFeature.PLAY:
                await self._async_call(
                    session, target, "media_play", {}
                )
            elif (
                state.state in (STATE_IDLE, STATE_OFF)
                and (session.last_play_url or session.last_play_track_id)
            ):
                await self._async_play_target(
                    session,
                    target,
                    session.last_play_url or "",
                    session.last_play_track_id,
                    session.last_play_title,
                    session.last_play_artist,
                    session.last_play_cover,
                    session.last_play_position,
                )

    async def _async_pause_targets(self, session: StreamSession) -> None:
        """Pause targets, falling back to stop."""
        for target in session.target_entity_ids:
            state = self.hass.states.get(target)
            if state is None:
                continue
            features = self._features(state)
            if features & MediaPlayerEntityFeature.PAUSE:
                await self._async_call(
                    session, target, "media_pause", {}
                )
            elif features & MediaPlayerEntityFeature.STOP:
                await self._async_call(
                    session, target, "media_stop", {}
                )

    async def _async_stop_targets(self, session: StreamSession) -> None:
        """Stop targets, falling back to pause."""
        for target in session.target_entity_ids:
            state = self.hass.states.get(target)
            if state is None:
                continue
            features = self._features(state)
            if features & MediaPlayerEntityFeature.STOP:
                await self._async_call(
                    session, target, "media_stop", {}
                )
            elif features & MediaPlayerEntityFeature.PAUSE:
                await self._async_call(
                    session, target, "media_pause", {}
                )

    async def _async_sync_volume(
        self,
        session: StreamSession,
        state: State,
        *,
        force: bool = False,
    ) -> None:
        """Apply sync_volume true or a Jinja mapping to every target."""
        if session.sync_volume is False:
            return
        source_volume = state.attributes.get("volume_level")
        if not isinstance(source_volume, (int, float)):
            return
        source_volume = max(0.0, min(1.0, float(source_volume)))
        if (
            not force
            and session.last_volume is not None
            and abs(source_volume - session.last_volume) < 0.005
        ):
            return
        session.last_volume = source_volume

        for target in session.target_entity_ids:
            target_state = self.hass.states.get(target)
            if target_state is None:
                continue
            features = self._features(target_state)
            if not features & MediaPlayerEntityFeature.VOLUME_SET:
                continue
            target_volume = target_state.attributes.get("volume_level")
            if not isinstance(target_volume, (int, float)):
                continue
            try:
                desired = self._render_volume(
                    session,
                    source_volume,
                    float(target_volume),
                    target,
                    state,
                )
            except (TemplateError, TypeError, ValueError) as err:
                if not session.template_error_logged:
                    session.template_error_logged = True
                    _LOGGER.warning(
                        "Music stream %s: invalid sync_volume template: %s",
                        session.session_id,
                        err,
                    )
                continue
            if desired is None:
                continue
            if abs(float(target_volume) - desired) < 0.02:
                continue
            await self._async_call(
                session,
                target,
                "volume_set",
                {"volume_level": desired},
            )

    def _render_volume(
        self,
        session: StreamSession,
        source_volume: float,
        target_volume: float,
        target: str,
        state: State,
    ) -> float | None:
        """Return a clamped target volume."""
        if session.sync_volume is True:
            value: Any = source_volume
        elif isinstance(session.sync_volume, Template):
            value = session.sync_volume.async_render(
                {
                    "volume_level": source_volume,
                    "source_volume": source_volume,
                    "target_volume": target_volume,
                    "entity_id": target,
                    "source_entity_id": session.source_entity_id,
                    "state": state,
                    "attributes": state.attributes,
                    "media_title": state.attributes.get("media_title"),
                    "media_artist": state.attributes.get("media_artist"),
                    "is_volume_muted": state.attributes.get("is_volume_muted"),
                },
                parse_result=True,
            )
        else:
            return None
        if value is None or value == "":
            return None
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            return None
        return max(0.0, min(1.0, number))

    async def _async_align_targets(
        self, session: StreamSession, state: State
    ) -> None:
        """Seek targets after resume if they support it."""
        position = self._position(state)
        if position <= 2:
            return
        for target in session.target_entity_ids:
            self.hass.async_create_task(
                self._async_align_target(session, target, position)
            )

    async def _async_align_target(
        self, session: StreamSession, target: str, position: float
    ) -> None:
        """Best-effort seek to the source position."""
        await asyncio.sleep(2)
        state = self.hass.states.get(target)
        if state is None or state.state not in (STATE_PLAYING, STATE_PAUSED):
            return
        features = self._features(state)
        if not features & MediaPlayerEntityFeature.SEEK:
            return
        current = state.attributes.get("media_position")
        if isinstance(current, (int, float)) and abs(
            float(current) - position
        ) < 2:
            return
        await self._async_call(
            session,
            target,
            "media_seek",
            {"seek_position": max(0.0, position)},
        )

    async def _async_call(
        self,
        session: StreamSession,
        target: str,
        service: str,
        data: dict[str, Any],
    ) -> None:
        """Call a media_player service without failing the whole session."""
        try:
            await self.hass.services.async_call(
                "media_player",
                service,
                data,
                target={"entity_id": target},
                blocking=True,
                context=session.context,
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug(
                "Music stream %s: %s on %s failed: %s",
                session.session_id,
                service,
                target,
                err,
            )

    async def _async_stop_conflicts(
        self, source_entity_id: str, targets: list[str]
    ) -> None:
        """Stop sessions that own the same source or target."""
        conflicts = [
            session.session_id
            for session in self.sessions.values()
            if session.source_entity_id == source_entity_id
            or set(session.target_entity_ids).intersection(targets)
        ]
        for session_id in conflicts:
            await self.async_stop(
                session_id=session_id, stop_playback=True
            )

    def _is_yandex_target(self, target: str) -> bool:
        """Return True for native Yandex speakers that accept track IDs."""
        registry = er.async_get(self.hass)
        entry = registry.async_get(target)
        return bool(entry and entry.platform in YANDEX_TARGET_PLATFORMS)

    def _media_content_type(self, target: str) -> str:
        """Pick the most compatible type for the target platform."""
        registry = er.async_get(self.hass)
        entry = registry.async_get(target)
        platform = entry.platform if entry else ""
        if platform == "cast":
            return "audio/mpeg"
        if platform == "heos":
            return "url"
        return "music"

    @staticmethod
    def _features(state: State) -> MediaPlayerEntityFeature:
        """Return supported features from a state object."""
        try:
            return MediaPlayerEntityFeature(
                int(state.attributes.get("supported_features") or 0)
            )
        except (TypeError, ValueError):
            return MediaPlayerEntityFeature(0)

    @staticmethod
    def _position(state: State) -> float:
        """Return the current source position, extrapolated to now."""
        attrs = state.attributes
        value = attrs.get("media_position")
        if not isinstance(value, (int, float)):
            return 0.0
        updated = attrs.get("media_position_updated_at")
        if updated is not None:
            try:
                from datetime import datetime

                if isinstance(updated, str):
                    updated = datetime.fromisoformat(
                        updated.replace("Z", "+00:00")
                    )
                value += max(
                    0.0,
                    (datetime.now(updated.tzinfo) - updated).total_seconds(),
                )
            except (TypeError, ValueError):
                pass
        return max(0.0, float(value))
