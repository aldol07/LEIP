from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.entities import Alert, AlertRule, AnalysisUpdate, CommentaryUpdate, Event
from app.models.enums import AlertRuleType


def _score_condition_met(operator: str, score_gap: float, threshold: float) -> bool:
    if operator == ">":
        return score_gap > threshold
    if operator == ">=":
        return score_gap >= threshold
    if operator == "<":
        return score_gap < threshold
    if operator == "<=":
        return score_gap <= threshold
    if operator == "==":
        return score_gap == threshold
    return False


def evaluate_alerts_for_event(session: Session, event_id: int) -> list[dict]:
    latest_analysis = session.scalar(
        select(AnalysisUpdate).where(AnalysisUpdate.event_id == event_id).order_by(desc(AnalysisUpdate.created_at)).limit(1)
    )
    if not latest_analysis:
        return []

    previous_analysis = session.scalar(
        select(AnalysisUpdate)
        .where(AnalysisUpdate.event_id == event_id, AnalysisUpdate.id != latest_analysis.id)
        .order_by(desc(AnalysisUpdate.created_at))
        .limit(1)
    )

    latest_commentary = session.scalar(
        select(CommentaryUpdate).where(CommentaryUpdate.event_id == event_id).order_by(desc(CommentaryUpdate.created_at)).limit(1)
    )
    commentary_text = (latest_commentary.commentary if latest_commentary else "").lower()

    event = session.scalar(select(Event).where(Event.id == event_id))
    score_gap = abs((event.home_score if event else 0) - (event.away_score if event else 0))

    active_rules = session.scalars(
        select(AlertRule).where(AlertRule.event_id == event_id, AlertRule.is_active.is_(True))
    ).all()

    prev_trend = previous_analysis.trend.value if previous_analysis else None
    current_trend = latest_analysis.trend.value
    created_alerts: list[dict] = []

    for rule in active_rules:
        cfg = rule.rule_config or {}
        triggered = False
        message = ""

        if rule.rule_type == AlertRuleType.keyword_detected:
            keyword = str(cfg.get("keyword", "")).strip().lower()
            if keyword and keyword in commentary_text:
                triggered = True
                message = f"Keyword '{keyword}' detected in commentary for event {event_id}"

        elif rule.rule_type == AlertRuleType.score_threshold:
            threshold = float(cfg.get("threshold", 0))
            operator = str(cfg.get("operator", ">="))
            if _score_condition_met(operator, float(score_gap), threshold):
                triggered = True
                message = f"Score gap condition matched: {score_gap} {operator} {threshold}"

        elif rule.rule_type == AlertRuleType.trend_change:
            from_trend = cfg.get("from")
            to_trend = cfg.get("to")
            changed = prev_trend is not None and prev_trend != current_trend
            if changed:
                if from_trend and prev_trend != from_trend:
                    changed = False
                if to_trend and current_trend != to_trend:
                    changed = False
            if changed:
                triggered = True
                message = f"Trend changed from {prev_trend} to {current_trend}"

        if triggered:
            alert = Alert(
                user_id=rule.user_id,
                event_id=event_id,
                alert_rule_id=rule.id,
                message=message,
            )
            session.add(alert)
            session.flush()
            created_alerts.append(
                {
                    "event_id": event_id,
                    "user_id": rule.user_id,
                    "rule_id": rule.id,
                    "message": message,
                }
            )

    session.commit()
    return created_alerts
