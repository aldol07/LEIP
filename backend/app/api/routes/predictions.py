from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.entities import AnalysisUpdate, Event, Subscription, User

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/board")
def prediction_board(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    subscriptions = db.scalars(
        select(Subscription).where(Subscription.user_id == current_user.id).order_by(Subscription.created_at.desc())
    ).all()
    event_ids = [row.event_id for row in subscriptions]
    if not event_ids:
        return []

    result: list[dict] = []
    for event_id in event_ids:
        event = db.scalar(select(Event).where(Event.id == event_id))
        if not event:
            continue
        latest = db.scalar(
            select(AnalysisUpdate)
            .where(AnalysisUpdate.event_id == event_id)
            .order_by(desc(AnalysisUpdate.created_at))
            .limit(1)
        )
        if not latest:
            continue
        result.append(
            {
                "event_id": event_id,
                "sport": event.sport,
                "league": event.league,
                "home_team": event.home_team,
                "away_team": event.away_team,
                "prediction": latest.prediction,
                "confidence": latest.confidence,
                "trend": latest.trend.value,
                "created_at": latest.created_at,
            }
        )
    return result
