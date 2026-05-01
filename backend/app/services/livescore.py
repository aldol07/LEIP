import json
import random
from copy import deepcopy
from datetime import datetime
from pathlib import Path

import httpx

from app.core.config import get_settings

settings = get_settings()
_mock_events_cache: list[dict] | None = None
_mock_tick: int = 0
DEFAULT_LEAGUE_IDS = ["4328", "4331", "4387", "4400", "4424", "4329"]


def _load_mock_events() -> list[dict]:
    global _mock_events_cache
    if _mock_events_cache is not None:
        return _mock_events_cache

    mock_path = Path(settings.mock_livescore_path)
    if not mock_path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        mock_path = repo_root / settings.mock_livescore_path
    data = json.loads(mock_path.read_text(encoding="utf-8"))
    _mock_events_cache = data.get("events", [])
    return _mock_events_cache


def _simulate_mock_live_updates(events: list[dict]) -> list[dict]:
    global _mock_tick
    _mock_tick += 1
    simulated = deepcopy(events)

    live_indices = [idx for idx, event in enumerate(simulated) if str(event.get("event_status", "")).lower() == "live"]
    scheduled_indices = [
        idx for idx, event in enumerate(simulated) if str(event.get("event_status", "")).lower() == "scheduled"
    ]

    # Progress a subset of live events each tick to emulate incoming feed updates.
    for idx in live_indices[:10]:
        if (_mock_tick + idx) % 2 != 0:
            continue
        event = simulated[idx]
        seed = f"{event.get('external_event_id', idx)}-{_mock_tick}"
        rng = random.Random(seed)
        home_delta = 1 if rng.random() > 0.6 else 0
        away_delta = 1 if rng.random() > 0.65 else 0
        event["home_score"] = int(event.get("home_score", 0)) + home_delta
        event["away_score"] = int(event.get("away_score", 0)) + away_delta

    # Occasionally move scheduled events to live for broader test coverage.
    if _mock_tick % 3 == 0 and scheduled_indices:
        idx = scheduled_indices[_mock_tick % len(scheduled_indices)]
        simulated[idx]["event_status"] = "Live"
        simulated[idx]["starts_at"] = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    # Periodically close a live event as final to trigger stage 8 report flow.
    if _mock_tick % 7 == 0 and live_indices:
        idx = live_indices[_mock_tick % len(live_indices)]
        simulated[idx]["event_status"] = "Final"

    return simulated


def _normalize_sportsdb_event(raw: dict) -> dict | None:
    event_id = raw.get("idEvent")
    if not event_id:
        return None

    status_raw = str(raw.get("strStatus", "")).strip().lower()
    if status_raw in {"match finished", "ft", "finished", "after pen", "after et"}:
        event_status = "Final"
    elif status_raw in {"", "not started", "scheduled"}:
        event_status = "Scheduled"
    else:
        event_status = "Live"

    starts_at = raw.get("strTimestamp") or raw.get("dateEvent")
    if starts_at and "T" not in starts_at:
        starts_at = f"{starts_at}T00:00:00Z"

    return {
        "external_event_id": str(event_id),
        "sport": raw.get("strSport") or "Unknown",
        "league": raw.get("strLeague") or "Unknown",
        "home_team": raw.get("strHomeTeam") or "TBD",
        "away_team": raw.get("strAwayTeam") or "TBD",
        "home_score": int(raw.get("intHomeScore") or 0),
        "away_score": int(raw.get("intAwayScore") or 0),
        "event_status": event_status,
        "starts_at": starts_at or datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }


def _fetch_sportsdb(endpoint: str) -> list[dict]:
    url = f"{settings.thesportsdb_base_url}/{settings.thesportsdb_api_key}/{endpoint}"
    response = httpx.get(url, timeout=20)
    response.raise_for_status()
    payload = response.json()
    return payload.get("events") or []


def fetch_events() -> list[dict]:
    if settings.use_mock:
        events = _load_mock_events()
        return _simulate_mock_live_updates(events)

    collected: list[dict] = []
    seen_ids: set[str] = set()

    # 1) Try live scores first.
    try:
        live_rows = _fetch_sportsdb("livescore.php")
    except Exception:
        live_rows = []

    for raw in live_rows:
        normalized = _normalize_sportsdb_event(raw)
        if not normalized:
            continue
        event_id = normalized["external_event_id"]
        if event_id in seen_ids:
            continue
        seen_ids.add(event_id)
        collected.append(normalized)

    # 2) If live feed is sparse/empty, enrich with upcoming and recent real events.
    if len(collected) < 10:
        for league_id in DEFAULT_LEAGUE_IDS:
            for endpoint in [f"eventsnextleague.php?id={league_id}", f"eventspastleague.php?id={league_id}"]:
                try:
                    rows = _fetch_sportsdb(endpoint)
                except Exception:
                    continue
                for raw in rows:
                    normalized = _normalize_sportsdb_event(raw)
                    if not normalized:
                        continue
                    event_id = normalized["external_event_id"]
                    if event_id in seen_ids:
                        continue
                    seen_ids.add(event_id)
                    collected.append(normalized)
                if len(collected) >= 60:
                    break
            if len(collected) >= 60:
                break

    return collected
