# LEIP Implementation Guide

This document describes the implementation approach, methods, and end-to-end 8-stage pipeline behavior.

## 1) Architecture overview

- `backend` (FastAPI): auth, event APIs, alert APIs, stage persistence, WebSocket endpoint, internal worker APIs.
- `workers` (Node + BullMQ): executes pipeline jobs, calls internal backend APIs, calls Groq/Gemini, publishes Redis events.
- `redis`: pub/sub transport and BullMQ backend.
- `frontend` (React): event browser, live screen, pipeline stepper, analysis, alerts, report, admin views.

Primary runtime flow:

1. Backend scheduler publishes raw events to Redis.
2. Worker consumes ticks and runs stage jobs.
3. Worker emits stage state events to Redis.
4. Backend listener persists stage transitions, commentary, analysis, and report data to DB.
5. Frontend reads persisted state and receives live updates over WebSocket.

## 2) Pipeline stages (1 to 8)

Source of truth:

- Stage definitions and DB row creation: `backend/app/services/pipeline_stages.py`
- Stage execution map and chaining: `workers/src/workers/pipelineWorker.js`

Stages:

1. Event ingestion
   - Worker job: `ingest_event`
   - Action: upsert event through internal API
   - DB impact: event upsert, stage row activation/completion timestamps

2. Stream accumulation
   - Worker job: `accumulate_stream`
   - Action: append stream row for event
   - DB impact: `event_stream` insert + stage timestamps

3. Groq commentary
   - Worker job: `generate_groq_commentary`
   - Action: generate commentary (or fallback), publish update payload
   - DB impact: persisted by backend listener into `commentary_updates`

4. Gemini Flash analysis
   - Worker job: `generate_gemini_analysis`
   - Action: generate analysis (or fallback), publish analysis payload
   - DB impact: persisted by backend listener into `analysis_updates`

5. Redis pub/sub publish
   - Worker job: `publish_analysis`
   - Action: publish normalized analysis update event for event channel
   - DB impact: stage timestamps

6. WebSocket push
   - Worker job: `websocket_push`
   - Action: transition step that hands off to alert evaluation
   - DB impact: stage timestamps

7. Alert rule evaluation
   - Worker job: `evaluate_alerts`
   - Action: call backend alert evaluator, publish triggered alerts
   - DB impact: alerts persisted in backend service

8. Post-event report
   - Worker job: `generate_report`
   - Action: generate report for final events (idempotent check before create)
   - DB impact: `event_reports` upsert/persist + stage timestamps

## 3) Stage tracking and timestamps

`pipeline_stages` is tracked per `event_id` and `stage_number`:

- `status`: `pending`, `active`, `done`
- `started_at`: set when stage becomes active
- `completed_at`: set when stage is marked done

Backend listener consumes `pipeline:stage:events` and updates `pipeline_stages` rows.

## 4) Methods and APIs

### Public API methods (FastAPI)

- Auth methods:
  - `POST /api/v1/auth/signup`
  - `POST /api/v1/auth/login`
- Event methods:
  - `GET /api/v1/events`
  - `GET /api/v1/events/subscriptions`
  - `POST /api/v1/events/{event_id}/subscribe`
  - `GET /api/v1/events/{event_id}/stages`
  - `GET /api/v1/events/{event_id}/updates`
  - `GET /api/v1/events/{event_id}/analysis`
  - `GET /api/v1/events/{event_id}/report`
- Alert methods:
  - `POST /api/v1/alerts/rules`
  - `GET /api/v1/alerts/rules`
  - `GET /api/v1/alerts/history`
- Prediction methods:
  - `GET /api/v1/predictions/board`
- Admin methods:
  - `GET /api/v1/admin/dashboard`
  - `POST /api/v1/admin/trigger-ingestion`
  - `POST /api/v1/admin/trigger-analysis`
  - `GET /api/v1/admin/queues` (redirect to Bull Board)
- WebSocket method:
  - `WS /api/v1/ws/events/{event_id}`

### Internal worker methods (backend, private)

- `POST /api/v1/internal/ingestion/upsert`
- `POST /api/v1/internal/ingestion/accumulate`
- `GET /api/v1/internal/events/{event_id}/window`
- `GET /api/v1/internal/events/{event_id}/status`
- `POST /api/v1/internal/events/{event_id}/evaluate-alerts`

All internal methods require `x-worker-token`.

### Worker service methods (Node)

- Backend client:
  - `upsertIngestionEvent()`
  - `accumulateStream()`
  - `getEventWindow()`
  - `getEventStatus()`
  - `evaluateAlerts()`
- LLM service:
  - `generateGroqCommentary()`
  - `generateGeminiAnalysis()`
  - `generateGeminiReport()`

## 5) Frontend implementation details

Live event screen (`frontend/src/screens/LiveEventScreen.jsx`) implements:

- Stage bootstrap from `GET /events/{id}/stages` (DB-backed, not hardcoded)
- WebSocket live feed subscription to `WS /ws/events/{event_id}`
- Local stage upsert logic from `pipeline:stage:events` payloads
- Commentary, analysis, and alert feed rendering
- Catchup support for newly connected clients

## 6) Gemini and resiliency behavior

Gemini calls include:

- Request queueing with minimum interval (`GEMINI_MIN_INTERVAL_MS`)
- Retries (`GEMINI_MAX_RETRIES`)
- Exponential backoff with jitter
- `Retry-After` header support
- Retryable status handling for `429`, `500`, `502`, `503`, `504`
- Fallback response generation when retries are exhausted

## 7) Mock data and USE_MOCK behavior

- Fixture file: `mock_livescore.json` (50 sample events)
- `USE_MOCK=true` uses simulated live updates from fixture.
- `USE_MOCK=false` uses TheSportsDB APIs with normalization and enrichment.

## 8) Verification checklist commands

- Start stack: `docker compose up`
- OpenAPI docs: `http://localhost:8000/docs`
- Bull Board: `http://localhost:3001/admin/queues`
- Stage endpoint check: `GET /api/v1/events/{id}/stages`
- WebSocket check: connect two clients to `WS /api/v1/ws/events/{event_id}`

