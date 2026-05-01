import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from sqlalchemy import desc, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import AnalysisUpdate, CommentaryUpdate
from app.services import ws_state

router = APIRouter(tags=["websocket"])
settings = get_settings()


@router.websocket("/ws/events/{event_id}")
async def event_updates_ws(websocket: WebSocket, event_id: int) -> None:
    await websocket.accept()
    ws_state.connect(event_id)

    db = SessionLocal()
    try:
        analysis_rows = db.scalars(
            select(AnalysisUpdate)
            .where(AnalysisUpdate.event_id == event_id)
            .order_by(desc(AnalysisUpdate.created_at))
            .limit(10)
        ).all()
        commentary_rows = db.scalars(
            select(CommentaryUpdate)
            .where(CommentaryUpdate.event_id == event_id)
            .order_by(desc(CommentaryUpdate.created_at))
            .limit(10)
        ).all()
    finally:
        db.close()

    catchup_payloads: list[dict] = []
    for item in analysis_rows:
        catchup_payloads.append(
            {
                "type": "analysis_catchup",
                "event_id": event_id,
                "updated_summary": item.updated_summary,
                "key_moments": item.key_moments,
                "trend": item.trend.value,
                "prediction": item.prediction,
                "confidence": item.confidence,
                "source": item.raw_payload.get("source", "gemini") if isinstance(item.raw_payload, dict) else "gemini",
                "created_at": item.created_at.isoformat(),
            }
        )
    for item in commentary_rows:
        catchup_payloads.append(
            {
                "type": "groq_commentary",
                "eventId": event_id,
                "commentary": item.commentary,
                "model": item.model,
                "generatedAt": item.created_at.isoformat(),
            }
        )

    catchup_payloads = sorted(
        catchup_payloads,
        key=lambda row: row.get("created_at") or row.get("generatedAt") or "",
        reverse=True,
    )[:10]

    for payload in reversed(catchup_payloads):
        await websocket.send_json(
            payload
        )

    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    pubsub = redis.pubsub()
    channel = f"event:{event_id}:updates"
    stage_channel = "pipeline:stage:events"
    await pubsub.subscribe(channel, stage_channel)

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
            if not message:
                continue
            payload = json.loads(message["data"])
            if message["channel"] == stage_channel:
                if payload.get("eventId") != event_id:
                    continue
            await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    finally:
        ws_state.disconnect(event_id)
        await pubsub.unsubscribe(channel, stage_channel)
        await pubsub.aclose()
        await redis.aclose()
