from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.entities import Alert, AlertRule, User
from app.models.enums import AlertRuleType, UserRole

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertRuleCreate(BaseModel):
    event_id: int
    rule_type: AlertRuleType
    rule_config: dict


@router.post("/rules")
def create_alert_rule(
    payload: AlertRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != UserRole.analyst:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only analysts can create alert rules")

    count = db.scalar(
        select(func.count()).select_from(AlertRule).where(
            AlertRule.user_id == current_user.id,
            AlertRule.event_id == payload.event_id,
        )
    )
    if count >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 alert rules per event are allowed",
        )

    rule = AlertRule(
        user_id=current_user.id,
        event_id=payload.event_id,
        rule_type=payload.rule_type,
        rule_config=payload.rule_config,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": rule.id, "event_id": rule.event_id, "rule_type": rule.rule_type, "rule_config": rule.rule_config}


@router.get("/rules")
def list_alert_rules(
    event_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    query = select(AlertRule).where(AlertRule.user_id == current_user.id).order_by(AlertRule.created_at.desc())
    if event_id is not None:
        query = query.where(AlertRule.event_id == event_id)
    rows = db.scalars(query).all()
    return [
        {
            "id": row.id,
            "event_id": row.event_id,
            "rule_type": row.rule_type,
            "rule_config": row.rule_config,
            "is_active": row.is_active,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/history")
def list_alert_history(
    event_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    query = select(Alert).where(Alert.user_id == current_user.id).order_by(desc(Alert.triggered_at))
    if event_id is not None:
        query = query.where(Alert.event_id == event_id)
    rows = db.scalars(query.limit(min(max(limit, 1), 200))).all()
    return [
        {
            "id": row.id,
            "event_id": row.event_id,
            "alert_rule_id": row.alert_rule_id,
            "message": row.message,
            "triggered_at": row.triggered_at,
        }
        for row in rows
    ]
