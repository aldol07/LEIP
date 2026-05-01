import asyncio
import json
from datetime import datetime
from contextlib import suppress

from redis.asyncio import Redis
from sqlalchemy import desc, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import AnalysisUpdate, CommentaryUpdate, Event, EventReport
from app.models.enums import TrendDirection
from app.schemas.gemini import GeminiAnalysis
from app.services.pipeline_stages import mark_stage_active, mark_stage_done

settings = get_settings()


def _upsert_commentary(payload: dict) -> None:
    event_id = payload.get("eventId")
    commentary = payload.get("commentary")
    model = payload.get("model")
    if not event_id or not commentary:
        return

    db = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == int(event_id)))
        if event:
            event.last_commentary_at = datetime.utcnow()
            db.add(event)
        db.add(
            CommentaryUpdate(
                event_id=int(event_id),
                commentary=str(commentary),
                model=str(model or "llama-3.1-8b-instant"),
            )
        )
        db.commit()
    finally:
        db.close()


def _upsert_analysis(payload: dict) -> None:
    event_id = payload.get("eventId")
    analysis_payload = payload.get("analysis")
    if not event_id or not analysis_payload:
        return
    event_id = int(event_id)

    validated = GeminiAnalysis.model_validate(analysis_payload)
    db = SessionLocal()
    try:
        latest_row = db.scalar(
            select(AnalysisUpdate)
            .where(AnalysisUpdate.event_id == event_id)
            .order_by(desc(AnalysisUpdate.created_at))
            .limit(1)
        )
        if (
            latest_row
            and latest_row.updated_summary == validated.updated_summary
            and latest_row.trend == TrendDirection(validated.trend)
            and latest_row.prediction == validated.prediction
            and abs(float(latest_row.confidence) - float(validated.confidence)) < 1e-9
        ):
            return

        row = AnalysisUpdate(
            event_id=event_id,
            updated_summary=validated.updated_summary,
            key_moments=validated.key_moments,
            trend=TrendDirection(validated.trend),
            prediction=validated.prediction,
            confidence=validated.confidence,
            raw_payload=analysis_payload,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()


def _upsert_report(payload: dict) -> None:
    event_id = payload.get("eventId")
    report = payload.get("report")
    if not event_id or not report:
        return
    event_id = int(event_id)

    db = SessionLocal()
    try:
        existing = db.scalar(select(EventReport).where(EventReport.event_id == event_id))
        if existing:
            existing.narrative_summary = report.get("narrative_summary", existing.narrative_summary)
            existing.top_key_moments = report.get("top_key_moments", existing.top_key_moments)
            existing.prediction_accuracy_score = float(
                report.get("prediction_accuracy_score", existing.prediction_accuracy_score)
            )
            db.add(existing)
        else:
            db.add(
                EventReport(
                    event_id=event_id,
                    narrative_summary=report.get("narrative_summary", ""),
                    top_key_moments=report.get("top_key_moments", []),
                    prediction_accuracy_score=float(report.get("prediction_accuracy_score", 0.0)),
                )
            )
        db.commit()
    finally:
        db.close()


def _handle_stage(payload: dict) -> None:
    event_id = payload.get("eventId")
    stage_number = payload.get("stageNumber")
    stage_status = payload.get("stageStatus")
    if not event_id or not stage_number or not stage_status:
        return
    event_id = int(event_id)
    stage_number = int(stage_number)

    db = SessionLocal()
    try:
        if stage_status == "active":
            mark_stage_active(db, event_id, stage_number)
        elif stage_status == "done":
            mark_stage_done(db, event_id, stage_number)
    finally:
        db.close()


async def run_pipeline_listener(stop_event: asyncio.Event) -> None:
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe(
        "pipeline:stage:events",
        "pipeline:commentary:events",
        "pipeline:analysis:events",
        "pipeline:report:events",
    )

    try:
        while not stop_event.is_set():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message:
                await asyncio.sleep(0.05)
                continue

            try:
                payload = json.loads(message["data"])
            except (TypeError, json.JSONDecodeError):
                continue
            channel = message["channel"]
            try:
                if channel == "pipeline:stage:events":
                    _handle_stage(payload)
                elif channel == "pipeline:commentary:events":
                    _upsert_commentary(payload)
                elif channel == "pipeline:analysis:events":
                    _upsert_analysis(payload)
                elif channel == "pipeline:report:events":
                    _upsert_report(payload)
            except Exception as exc:
                print(f"pipeline_listener channel={channel} error={exc}")
    finally:
        with suppress(Exception):
            await pubsub.unsubscribe(
                "pipeline:stage:events",
                "pipeline:commentary:events",
                "pipeline:analysis:events",
                "pipeline:report:events",
            )
            await pubsub.aclose()
            await redis.aclose()
