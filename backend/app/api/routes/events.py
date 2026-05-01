from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.entities import AnalysisUpdate, CommentaryUpdate, Event, EventReport, Subscription, User
from app.models.enums import UserRole
from app.schemas.events import EventResponse, SubscriptionResponse
from app.schemas.pipeline import EventStagesResponse, PipelineStageResponse
from app.services.pipeline_stages import ensure_pipeline_rows

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventResponse])
def list_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EventResponse]:
    _ = current_user
    events = db.scalars(select(Event).order_by(Event.starts_at.asc())).all()
    return [EventResponse.model_validate(event) for event in events]


@router.get("/subscriptions", response_model=list[EventResponse])
def list_subscribed_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EventResponse]:
    event_rows = db.scalars(
        select(Event)
        .join(Subscription, Subscription.event_id == Event.id)
        .where(Subscription.user_id == current_user.id)
        .order_by(Event.starts_at.asc())
    ).all()
    return [EventResponse.model_validate(event) for event in event_rows]


@router.post("/{event_id}/subscribe", response_model=SubscriptionResponse, status_code=status.HTTP_201_CREATED)
def subscribe_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SubscriptionResponse:
    event = db.scalar(select(Event).where(Event.id == event_id))
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    existing_sub = db.scalar(
        select(Subscription).where(Subscription.user_id == current_user.id, Subscription.event_id == event_id)
    )
    if existing_sub:
        return SubscriptionResponse(id=existing_sub.id, event_id=event_id, user_id=current_user.id)

    if current_user.role == UserRole.viewer:
        count = db.scalar(select(func.count()).select_from(Subscription).where(Subscription.user_id == current_user.id))
        if count >= 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Viewer role can subscribe to a maximum of 3 events",
            )

    sub = Subscription(user_id=current_user.id, event_id=event_id)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return SubscriptionResponse(id=sub.id, user_id=sub.user_id, event_id=sub.event_id)


@router.get("/{event_id}/stages", response_model=EventStagesResponse)
def get_event_stages(event_id: int, db: Session = Depends(get_db)) -> EventStagesResponse:
    event = db.scalar(select(Event).where(Event.id == event_id))
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    rows = ensure_pipeline_rows(db, event_id)
    rows = sorted(rows, key=lambda row: row.stage_number)
    return EventStagesResponse(
        event_id=event_id,
        stages=[PipelineStageResponse.model_validate(row) for row in rows],
    )


@router.get("/{event_id}/report")
def get_event_report(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    report = db.scalar(select(EventReport).where(EventReport.event_id == event_id))
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not generated yet")

    return {
        "event_id": event_id,
        "narrative_summary": report.narrative_summary,
        "top_key_moments": report.top_key_moments,
        "prediction_accuracy_score": report.prediction_accuracy_score,
        "created_at": report.created_at,
    }


@router.get("/{event_id}/analysis")
def get_latest_analysis(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    analysis = db.scalar(
        select(AnalysisUpdate)
        .where(AnalysisUpdate.event_id == event_id)
        .order_by(desc(AnalysisUpdate.created_at))
        .limit(1)
    )
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No analysis found for this event")

    return {
        "event_id": event_id,
        "updated_summary": analysis.updated_summary,
        "key_moments": analysis.key_moments,
        "trend": analysis.trend.value,
        "prediction": analysis.prediction,
        "confidence": analysis.confidence,
        "source": (
            analysis.raw_payload.get("source", "gemini")
            if isinstance(analysis.raw_payload, dict)
            else "gemini"
        ),
        "created_at": analysis.created_at,
    }


@router.get("/{event_id}/updates")
def get_recent_updates(
    event_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    safe_limit = min(max(limit, 1), 100)
    commentary_rows = db.scalars(
        select(CommentaryUpdate)
        .where(CommentaryUpdate.event_id == event_id)
        .order_by(desc(CommentaryUpdate.created_at))
        .limit(safe_limit)
    ).all()
    analysis_rows = db.scalars(
        select(AnalysisUpdate)
        .where(AnalysisUpdate.event_id == event_id)
        .order_by(desc(AnalysisUpdate.created_at))
        .limit(safe_limit)
    ).all()

    return {
        "event_id": event_id,
        "commentary": [
            {
                "id": row.id,
                "commentary": row.commentary,
                "model": row.model,
                "created_at": row.created_at,
            }
            for row in commentary_rows
        ],
        "analysis": [
            {
                "id": row.id,
                "updated_summary": row.updated_summary,
                "key_moments": row.key_moments,
                "trend": row.trend.value,
                "prediction": row.prediction,
                "confidence": row.confidence,
                "source": row.raw_payload.get("source", "gemini") if isinstance(row.raw_payload, dict) else "gemini",
                "created_at": row.created_at,
            }
            for row in analysis_rows
        ],
    }
