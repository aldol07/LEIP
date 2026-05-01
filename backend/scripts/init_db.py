from datetime import datetime, timedelta

from app.db.session import Base, SessionLocal, engine
from app.models.entities import Event
from app.models.enums import EventStatus
from app.services.pipeline_stages import ensure_pipeline_rows


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Event).count() == 0:
            sample_events = [
                Event(
                    external_event_id="seed-1",
                    sport="Soccer",
                    league="Demo League",
                    home_team="Team Red",
                    away_team="Team Blue",
                    home_score=0,
                    away_score=0,
                    event_status=EventStatus.live,
                    starts_at=datetime.utcnow() - timedelta(minutes=20),
                ),
                Event(
                    external_event_id="seed-2",
                    sport="Cricket",
                    league="Demo Cup",
                    home_team="Strikers",
                    away_team="Warriors",
                    home_score=145,
                    away_score=140,
                    event_status=EventStatus.scheduled,
                    starts_at=datetime.utcnow() + timedelta(minutes=90),
                ),
            ]
            db.add_all(sample_events)
            db.commit()
            for event in sample_events:
                db.refresh(event)
                ensure_pipeline_rows(db, event.id)
    finally:
        db.close()


if __name__ == "__main__":
    run()
