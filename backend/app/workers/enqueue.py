import json

from redis import Redis
from sqlalchemy import distinct, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import Event, Subscription
from app.models.enums import EventStatus
from app.services.livescore import fetch_events

settings = get_settings()


def _redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def enqueue_ingestion_jobs() -> None:
    redis_client = _redis_client()
    try:
        for raw_event in fetch_events():
            redis_client.publish("pipeline:ingest:raw", json.dumps(raw_event))
    finally:
        redis_client.close()


def enqueue_gemini_analysis_jobs() -> None:
    db = SessionLocal()
    try:
        event_ids = db.scalars(
            select(distinct(Event.id))
            .join(Subscription, Subscription.event_id == Event.id)
            .where(Event.event_status.in_([EventStatus.live, EventStatus.scheduled]))
        ).all()
    finally:
        db.close()

    if not event_ids:
        return

    redis_client = _redis_client()
    for event_id in event_ids:
        redis_client.publish("pipeline:analysis:tick", str(event_id))
    redis_client.close()
