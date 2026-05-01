# Live Event Intelligence Platform (LEIP)

Real-time sports event intelligence platform with an 8-stage processing pipeline, live commentary, AI analysis, alerts, and post-event reporting.

## Tech stack

- Backend: FastAPI + SQLAlchemy + APScheduler + Redis pub/sub
- Worker: Node.js + BullMQ + Bull Board
- Frontend: React (Vite)
- Data source: mock fixture (`USE_MOCK=true`) or TheSportsDB
- AI providers: Groq (commentary), Gemini (analysis/report with retry + backoff)

## Run locally with Docker

1. Copy env file:
   - `cp .env.example .env`
   - On Windows PowerShell: `Copy-Item .env.example .env`
2. Set required keys in `.env` (at minimum `JWT_SECRET_KEY`; add `GROQ_API_KEY` and `GEMINI_API_KEY` for real model outputs).
3. Start Docker Desktop and ensure Linux engine is running.
4. Start all services:
   - `docker compose up`
5. In a new terminal, seed demo users:
   - `docker compose exec backend sh -lc "PYTHONPATH=/app/backend python /app/backend/scripts/seed_demo_users.py"`

Local URLs:

- Backend API docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Frontend: [http://localhost:5173](http://localhost:5173)
- Bull Board: [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues)
- Backend redirect for Bull Board: [http://localhost:8000/api/v1/admin/queues](http://localhost:8000/api/v1/admin/queues)

## Environment variables

`.env.example` lists all supported keys. Most have safe defaults.

Minimum keys to set:

- `JWT_SECRET_KEY` (set a strong value; avoid default in shared/public environments)

Common optional keys (set only if needed):

- `GROQ_API_KEY` (required only for real Groq commentary)
- `GEMINI_API_KEY` (required only for real Gemini analysis/report)
- `USE_MOCK` (`true` for fixture mode, `false` for TheSportsDB mode)

All supported keys:

- `APP_ENV`
- `API_PREFIX`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `JWT_EXPIRE_MINUTES`
- `WORKER_INTERNAL_TOKEN`
- `USE_MOCK` (set `true` to use `mock_livescore.json`, `false` for real TheSportsDB calls)
- `MOCK_LIVESCORE_PATH`
- `THESPORTSDB_API_KEY`
- `THESPORTSDB_BASE_URL`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_MAX_RETRIES`
- `GEMINI_INITIAL_BACKOFF_MS`
- `GEMINI_MAX_BACKOFF_MS`
- `GEMINI_MIN_INTERVAL_MS`
- `GEMINI_REQUEST_TIMEOUT_MS`
- `WORKER_ADMIN_PORT`
- `BACKEND_INTERNAL_URL`

## Submission checklist mapping

- GitHub repo with setup + env + Docker run instructions: covered in this `README.md`.
- 8 pipeline stages tracked in `pipeline_stages` with `started_at` and `completed_at`: implemented and updated from stage events.
- BullMQ workers for ingestion, accumulation, Groq commentary, Gemini analysis, alert rules, report generation: implemented in `workers/src/workers/pipelineWorker.js`.
- Bull Board mounted at `/admin/queues`: implemented in `workers/src/services/bullBoard.js`.
- Event detail stepper UI, live-updating from DB stage data: implemented in `frontend/src/screens/LiveEventScreen.jsx` via `/events/{id}/stages` plus WebSocket stage updates.
- WebSocket endpoint with multiple clients: endpoint is `WS /api/v1/ws/events/{event_id}` and supports concurrent subscriptions.
- `.env.example` with keys and `USE_MOCK`: included.
- `mock_livescore.json` fixture with at least 50 events: included (50 sample events).
- OpenAPI docs at `/docs`: available from FastAPI at [http://localhost:8000/docs](http://localhost:8000/docs).
- Bonus challenges + test instructions: documented below.

## WebSocket test evidence (2 simultaneous clients)

Use this flow and attach screenshot evidence for submission:

1. Start stack with `docker compose up`.
2. Login in two browser windows (or one normal + one incognito).
3. Open Live Event screen in both clients for the same subscribed event.
4. Confirm both clients receive `groq_commentary`, `analysis_update`, and stage events in real-time.
5. Capture and add screenshot to `docs/images/ws-two-clients.png`.
6. Keep this README image link updated:
   - `![Two WebSocket clients](docs/images/ws-two-clients.png)`

## Bonus challenges and how to test

### Bonus 1: Gemini rate-limit resilience

Implemented with request queueing, exponential backoff, jitter, and retryable status handling.

How to test:

1. Lower `GEMINI_MIN_INTERVAL_MS` and trigger high analysis traffic (multiple subscribed live events).
2. Watch worker logs for retry messages.
3. Confirm pipeline continues and falls back gracefully if retries exhaust.

### Bonus 2: Real-time catchup on WebSocket connect

New clients receive recent analysis/commentary catchup before live stream updates.

How to test:

1. Let one event run for a few minutes.
2. Open a fresh client to the same event.
3. Confirm initial payloads include recent updates immediately, then continue live.

### Bonus 3: Idempotent report generation

Final report stage checks existing report state and skips duplicate generation.

How to test:

1. Mark an event `Final` in the feed flow.
2. Trigger report stage more than once.
3. Verify only one `event_reports` row exists per event.

## API quick reference

- Auth: `POST /api/v1/auth/signup`, `POST /api/v1/auth/login`
- Events: `GET /api/v1/events`, `POST /api/v1/events/{event_id}/subscribe`
- Live: `GET /api/v1/events/{event_id}/stages`, `GET /api/v1/events/{event_id}/updates`, `WS /api/v1/ws/events/{event_id}`
- AI: `GET /api/v1/events/{event_id}/analysis`, `GET /api/v1/events/{event_id}/report`
- Alerts: `POST /api/v1/alerts/rules`, `GET /api/v1/alerts/rules`, `GET /api/v1/alerts/history`
- Predictions: `GET /api/v1/predictions/board`
- Admin: `GET /api/v1/admin/dashboard`, `POST /api/v1/admin/trigger-ingestion`, `POST /api/v1/admin/trigger-analysis`

## Implementation notes

Detailed methods, worker flow, stage-by-stage pipeline behavior, and key implementation decisions are documented in `docs/IMPLEMENTATION.md`.
