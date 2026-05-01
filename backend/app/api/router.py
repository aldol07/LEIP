from fastapi import APIRouter

from app.api.routes import admin, alerts, auth, events, health, internal, predictions, ws

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(events.router)
api_router.include_router(ws.router)
api_router.include_router(admin.router)
api_router.include_router(alerts.router)
api_router.include_router(predictions.router)
api_router.include_router(internal.router)
