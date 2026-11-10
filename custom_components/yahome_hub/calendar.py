"""Speaker alarm calendar for YaHome Hub."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from dateutil.rrule import rrulestr
from homeassistant.components.calendar import (
    CalendarEntity,
    CalendarEntityFeature,
    CalendarEvent,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import MUSIC_SPEAKER_PLATFORMS
from .coordinator import YahomeDataUpdateCoordinator
from .speaker_entity import YahomeSpeakerEntity

WEEKDAYS_API = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
WEEKDAYS_RRULE = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
EVENT_MINUTES = 1


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create an alarm calendar for every real speaker."""
    coordinator: YahomeDataUpdateCoordinator = entry.runtime_data
    entities = [
        YahomeSpeakerCalendar(coordinator, speaker_id)
        for speaker_id, speaker in coordinator.data.speakers.items()
        if speaker.get("entity_id")
        and speaker.get("platform") in MUSIC_SPEAKER_PLATFORMS
    ]
    async_add_entities(entities)


class YahomeSpeakerCalendar(YahomeSpeakerEntity, CalendarEntity):
    """Alarms stored on a Yandex Station."""

    _attr_name = "Будильники"
    _attr_icon = "mdi:alarm"
    _attr_supported_features = (
        CalendarEntityFeature.CREATE_EVENT
        | CalendarEntityFeature.UPDATE_EVENT
        | CalendarEntityFeature.DELETE_EVENT
    )

    def __init__(
        self, coordinator: YahomeDataUpdateCoordinator, speaker_id: str
    ) -> None:
        super().__init__(coordinator, speaker_id, "calendar")
        self._events: list[CalendarEvent] = []
        self._next_event: CalendarEvent | None = None

    @property
    def event(self) -> CalendarEvent | None:
        """Return the next alarm."""
        return self._next_event

    async def async_added_to_hass(self) -> None:
        """Load alarms once when the entity is created."""
        await super().async_added_to_hass()
        await self._async_load_alarms()

    async def _async_load_alarms(self) -> None:
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None:
            return
        try:
            alarms = await quasar.get_alarms(self._speaker_id)
        except Exception:  # noqa: BLE001
            self._events = []
            self._next_event = None
            return

        self._events = [alarm_to_event(alarm) for alarm in alarms]
        now = dt_util.now()
        upcoming = sorted(
            (event for event in self._events if event.start >= now),
            key=lambda event: event.start,
        )
        self._next_event = upcoming[0] if upcoming else None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return alarms in the requested range."""
        await self._async_load_alarms()
        return [
            event
            for event in self._events
            if start_date <= event.start and event.end <= end_date
        ]

    async def async_create_event(self, **kwargs: Any) -> None:
        """Create an alarm."""
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None:
            return
        alarm = event_to_alarm(kwargs)
        if await quasar.create_alarm(
            self._speaker_id, self.device_type, alarm
        ):
            await self._async_load_alarms()
            self.async_write_ha_state()

    async def async_update_event(
        self, uid: str, event: dict[str, Any], **kwargs: Any
    ) -> None:
        """Update an alarm."""
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None:
            return
        alarm = event_to_alarm(event, uid)
        if await quasar.change_alarm(
            self._speaker_id, self.device_type, alarm
        ):
            await self._async_load_alarms()
            self.async_write_ha_state()

    async def async_delete_event(self, uid: str, **kwargs: Any) -> None:
        """Delete an alarm."""
        quasar = await self.coordinator.async_live_quasar()
        if quasar is None:
            return
        if await quasar.cancel_alarms(self._speaker_id, uid):
            await self._async_load_alarms()
            self.async_write_ha_state()


def alarm_to_event(alarm: dict[str, Any]) -> CalendarEvent:
    """Convert a Yandex alarm payload into a Home Assistant calendar event."""
    now = dt_util.now()
    recurring = alarm.get("recurring")
    rrule_text = None
    if recurring:
        days = [
            WEEKDAYS_RRULE[WEEKDAYS_API.index(day)]
            for day in recurring.get("days_of_week") or []
            if day in WEEKDAYS_API
        ]
        if days:
            rrule_text = "FREQ=WEEKLY;BYDAY=" + ",".join(days)
            clock = datetime.strptime(alarm.get("time", "00:00"), "%H:%M")
            rule = rrulestr(rrule_text).replace(
                dtstart=now.replace(
                    hour=clock.hour,
                    minute=clock.minute,
                    second=0,
                    microsecond=0,
                )
            )
            start = (
                rule.after(now)
                if alarm.get("enabled")
                else rule.before(now)
            )
        else:
            start = now
    else:
        try:
            start = datetime.strptime(
                f'{alarm.get("date")}T{alarm.get("time", "00:00")}',
                "%Y-%m-%dT%H:%M",
            ).astimezone()
        except (TypeError, ValueError):
            start = now

    summary = "Будильник" if alarm.get("enabled") else "Выключен"
    return CalendarEvent(
        start,
        start + timedelta(minutes=EVENT_MINUTES),
        summary,
        "",
        uid=alarm.get("alarm_id"),
        rrule=rrule_text,
    )


def event_to_alarm(event: dict[str, Any], uid: str = "") -> dict[str, Any]:
    """Convert a Home Assistant calendar event into an alarm payload."""
    start = event.get("dtstart") or dt_util.now()
    if isinstance(start, datetime):
        alarm_time = start.strftime("%H:%M")
        alarm_date = start.strftime("%Y-%m-%d")
    else:
        alarm_time = "00:00"
        alarm_date = str(start)

    alarm: dict[str, Any] = {
        "alarm_id": uid,
        "enabled": event.get("summary") not in ("Выключен", "Disabled"),
        "time": alarm_time,
    }

    rrule_text = event.get("rrule")
    if rrule_text:
        parts = dict(
            item.split("=", 1)
            for item in rrule_text.split(";")
            if "=" in item
        )
        days = [
            WEEKDAYS_API[WEEKDAYS_RRULE.index(day)]
            for day in (parts.get("BYDAY") or "").split(",")
            if day in WEEKDAYS_RRULE
        ]
        if days:
            alarm["recurring"] = {"days_of_week": days}
    else:
        alarm["date"] = alarm_date

    return alarm
