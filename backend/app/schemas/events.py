from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import EventStatus


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_event_id: str
    sport: str
    league: str
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    event_status: EventStatus
    starts_at: datetime


class SubscriptionResponse(BaseModel):
    id: int
    event_id: int
    user_id: int
