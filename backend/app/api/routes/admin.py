from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.entities import Alert, AnalysisUpdate, CommentaryUpdate, Event, EventReport, User
from app.models.enums import UserRole
from app.services import ws_state
from app.workers.enqueue import enqueue_gemini_analysis_jobs, enqueue_ingestion_jobs

router = APIRouter(tags=["admin"])


@router.get("/admin/queues", include_in_schema=False)
def queues_dashboard_redirect() -> RedirectResponse:
    return RedirectResponse(url="http://localhost:3001/admin/queues")


@router.get("/admin/dashboard")
def admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != UserRole.analyst:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    return {
        "events_total": db.scalar(select(func.count()).select_from(Event)),
        "analysis_updates_total": db.scalar(select(func.count()).select_from(AnalysisUpdate)),
        "commentary_updates_total": db.scalar(select(func.count()).select_from(CommentaryUpdate)),
        "alerts_total": db.scalar(select(func.count()).select_from(Alert)),
        "reports_total": db.scalar(select(func.count()).select_from(EventReport)),
        "active_ws_connections": ws_state.total_connections(),
        "ws_connections_by_event": ws_state.per_event_connections(),
        "bullboard_url": "http://localhost:3001/admin/queues",
    }


@router.post("/admin/trigger-ingestion")
def trigger_ingestion(
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != UserRole.analyst:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    enqueue_ingestion_jobs()
    return {"status": "ok", "message": "Ingestion tick executed"}


@router.post("/admin/trigger-analysis")
def trigger_analysis(
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != UserRole.analyst:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    enqueue_gemini_analysis_jobs()
    return {"status": "ok", "message": "Analysis tick executed"}
