from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.entities import Event, EventStream
from app.models.enums import EventStatus


def parse_event_status(value: str | None) -> EventStatus:
    if not value:
        return EventStatus.scheduled
    normalized = value.strip().lower()
    if normalized == "live":
        return EventStatus.live
    if normalized == "final":
        return EventStatus.final
    return EventStatus.scheduled


def parse_start(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    except ValueError:
        return datetime.utcnow()


def upsert_event(session: Session, raw_event: dict) -> tuple[Event, bool]:
    external_event_id = str(raw_event["external_event_id"])
    existing = session.scalar(select(Event).where(Event.external_event_id == external_event_id))

    if existing:
        incoming = {
            "sport": raw_event.get("sport", existing.sport),
            "league": raw_event.get("league", existing.league),
            "home_team": raw_event.get("home_team", existing.home_team),
            "away_team": raw_event.get("away_team", existing.away_team),
            "home_score": int(raw_event.get("home_score", existing.home_score)),
            "away_score": int(raw_event.get("away_score", existing.away_score)),
            "event_status": parse_event_status(raw_event.get("event_status")),
            "starts_at": parse_start(raw_event.get("starts_at")),
        }
        changed = any(
            [
                existing.sport != incoming["sport"],
                existing.league != incoming["league"],
                existing.home_team != incoming["home_team"],
                existing.away_team != incoming["away_team"],
                existing.home_score != incoming["home_score"],
                existing.away_score != incoming["away_score"],
                existing.event_status != incoming["event_status"],
                existing.starts_at != incoming["starts_at"],
            ]
        )
        existing.sport = incoming["sport"]
        existing.league = incoming["league"]
        existing.home_team = incoming["home_team"]
        existing.away_team = incoming["away_team"]
        existing.home_score = incoming["home_score"]
        existing.away_score = incoming["away_score"]
        existing.event_status = incoming["event_status"]
        existing.starts_at = incoming["starts_at"]
        session.add(existing)
        session.flush()
        return existing, changed

    event = Event(
        external_event_id=external_event_id,
        sport=raw_event.get("sport", "Unknown"),
        league=raw_event.get("league", "Unknown"),
        home_team=raw_event.get("home_team", "TBD"),
        away_team=raw_event.get("away_team", "TBD"),
        home_score=int(raw_event.get("home_score", 0)),
        away_score=int(raw_event.get("away_score", 0)),
        event_status=parse_event_status(raw_event.get("event_status")),
        starts_at=parse_start(raw_event.get("starts_at")),
    )
    session.add(event)
    session.flush()
    return event, True


def append_stream_row(session: Session, event_id: int, payload: dict) -> None:
    next_sequence = session.scalar(select(func.max(EventStream.sequence_number)).where(EventStream.event_id == event_id))
    sequence_number = (next_sequence or 0) + 1
    stream_row = EventStream(event_id=event_id, sequence_number=sequence_number, payload=payload)
    session.add(stream_row)
    session.flush()

    old_rows = session.scalars(
        select(EventStream)
        .where(EventStream.event_id == event_id)
        .order_by(EventStream.sequence_number.desc())
        .offset(50)
    ).all()
    for row in old_rows:
        session.delete(row)
