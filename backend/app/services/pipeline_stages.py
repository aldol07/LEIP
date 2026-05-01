from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import PipelineStage
from app.models.enums import StageStatus

STAGE_DEFINITIONS: list[tuple[int, str]] = [
    (1, "Event ingestion"),
    (2, "Stream accumulation"),
    (3, "Groq commentary"),
    (4, "Gemini Flash analysis"),
    (5, "Redis pub/sub publish"),
    (6, "WebSocket push"),
    (7, "Alert rule evaluation"),
    (8, "Post-event report"),
]


def ensure_pipeline_rows(session: Session, event_id: int) -> list[PipelineStage]:
    existing = session.scalars(
        select(PipelineStage).where(PipelineStage.event_id == event_id).order_by(PipelineStage.stage_number.asc())
    ).all()
    if existing:
        return existing

    rows = [
        PipelineStage(
            event_id=event_id,
            stage_number=stage_number,
            stage_name=stage_name,
            status=StageStatus.pending,
        )
        for stage_number, stage_name in STAGE_DEFINITIONS
    ]
    session.add_all(rows)
    session.commit()
    for row in rows:
        session.refresh(row)
    return rows


def mark_stage_active(session: Session, event_id: int, stage_number: int) -> None:
    stage = session.scalar(
        select(PipelineStage).where(
            PipelineStage.event_id == event_id,
            PipelineStage.stage_number == stage_number,
        )
    )
    if not stage:
        ensure_pipeline_rows(session, event_id)
        stage = session.scalar(
            select(PipelineStage).where(
                PipelineStage.event_id == event_id,
                PipelineStage.stage_number == stage_number,
            )
        )
    if stage:
        stage.status = StageStatus.active
        stage.started_at = datetime.utcnow()
        session.add(stage)
        session.commit()


def mark_stage_done(session: Session, event_id: int, stage_number: int) -> None:
    stage = session.scalar(
        select(PipelineStage).where(
            PipelineStage.event_id == event_id,
            PipelineStage.stage_number == stage_number,
        )
    )
    if stage:
        if not stage.started_at:
            stage.started_at = datetime.utcnow()
        stage.status = StageStatus.done
        stage.completed_at = datetime.utcnow()
        session.add(stage)
        session.commit()
