from datetime import datetime

from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import desc, func, select
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import AnalysisUpdate, CommentaryUpdate, Event, EventReport, EventStream, Subscription
from app.models.enums import EventStatus
from app.services.alert_engine import evaluate_alerts_for_event
from app.services.ingestion_service import append_stream_row, upsert_event
from app.services.pipeline_stages import ensure_pipeline_rows

router = APIRouter(prefix="/internal", tags=["internal"], include_in_schema=False)
settings = get_settings()


def _verify_worker_token(token: str | None) -> None:
    if token != settings.worker_internal_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid worker token")


class RawEventPayload(BaseModel):
    raw_event: dict


class AccumulatePayload(BaseModel):
    event_id: int
    raw_event: dict


@router.post("/ingestion/upsert")
def upsert_ingestion_event(
    payload: RawEventPayload,
    x_worker_token: str | None = Header(default=None),
) -> dict:
    _verify_worker_token(x_worker_token)
    db = SessionLocal()
    try:
        event, changed = upsert_event(db, payload.raw_event)
        db.commit()
        db.refresh(event)
        ensure_pipeline_rows(db, event.id)
        subscriber_count = db.scalar(
            select(func.count()).select_from(Subscription).where(Subscription.event_id == event.id)
        ) or 0
        has_subscribers = subscriber_count > 0

        can_commentary = False
        if has_subscribers and event.event_status in [EventStatus.live, EventStatus.scheduled]:
            if not event.last_commentary_at:
                can_commentary = True
            else:
                elapsed_seconds = (datetime.utcnow() - event.last_commentary_at).total_seconds()
                can_commentary = elapsed_seconds >= 60

        report = db.scalar(select(EventReport).where(EventReport.event_id == event.id))
        return {
            "event_id": event.id,
            "changed": changed,
            "status": event.event_status.value,
            "is_final": event.event_status == EventStatus.final,
            "has_subscribers": has_subscribers,
            "can_commentary": can_commentary,
            "report_exists": report is not None,
        }
    finally:
        db.close()


@router.post("/ingestion/accumulate")
def accumulate_stream(
    payload: AccumulatePayload,
    x_worker_token: str | None = Header(default=None),
) -> dict:
    _verify_worker_token(x_worker_token)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == payload.event_id))
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        append_stream_row(db, payload.event_id, payload.raw_event)
        db.commit()
        return {"event_id": payload.event_id, "ok": True}
    finally:
        db.close()


@router.get("/events/{event_id}/window")
def get_event_window(
    event_id: int,
    x_worker_token: str | None = Header(default=None),
) -> dict:
    _verify_worker_token(x_worker_token)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == event_id))
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

        stream_rows = db.scalars(
            select(EventStream).where(EventStream.event_id == event_id).order_by(EventStream.sequence_number.desc()).limit(50)
        ).all()
        stream_rows = list(reversed(stream_rows))
        latest_analysis = db.scalar(
            select(AnalysisUpdate).where(AnalysisUpdate.event_id == event_id).order_by(desc(AnalysisUpdate.created_at)).limit(1)
        )
        latest_report = db.scalar(select(EventReport).where(EventReport.event_id == event_id))
        recent_commentary_rows = db.scalars(
            select(CommentaryUpdate)
            .where(CommentaryUpdate.event_id == event_id)
            .order_by(desc(CommentaryUpdate.created_at))
            .limit(3)
        ).all()

        return {
            "event": {
                "id": event.id,
                "status": event.event_status.value,
                "sport": event.sport,
                "league": event.league,
                "home_team": event.home_team,
                "away_team": event.away_team,
                "home_score": event.home_score,
                "away_score": event.away_score,
                "last_commentary_at": event.last_commentary_at.isoformat() if event.last_commentary_at else None,
            },
            "stream_window": [
                {
                    "sequence_number": row.sequence_number,
                    "payload": row.payload,
                    "created_at": row.created_at.isoformat(),
                }
                for row in stream_rows
            ],
            "latest_analysis": (
                {
                    "updated_summary": latest_analysis.updated_summary,
                    "trend": latest_analysis.trend.value,
                    "prediction": latest_analysis.prediction,
                    "confidence": latest_analysis.confidence,
                }
                if latest_analysis
                else None
            ),
            "recent_commentary": [row.commentary for row in recent_commentary_rows],
            "report_exists": latest_report is not None,
        }
    finally:
        db.close()


@router.get("/events/{event_id}/status")
def get_event_status(
    event_id: int,
    x_worker_token: str | None = Header(default=None),
) -> dict:
    _verify_worker_token(x_worker_token)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == event_id))
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        report = db.scalar(select(EventReport).where(EventReport.event_id == event_id))
        return {
            "event_id": event_id,
            "status": event.event_status.value,
            "is_final": event.event_status.value == "Final",
            "report_exists": report is not None,
        }
    finally:
        db.close()


@router.post("/events/{event_id}/evaluate-alerts")
def evaluate_alerts(
    event_id: int,
    x_worker_token: str | None = Header(default=None),
) -> dict:
    _verify_worker_token(x_worker_token)
    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == event_id))
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        alerts = evaluate_alerts_for_event(db, event_id)
        return {"event_id": event_id, "alerts": alerts}
    finally:
        db.close()
