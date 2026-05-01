from app.db.session import SessionLocal
from app.models.entities import User


def run() -> None:
    db = SessionLocal()
    try:
        rows = db.query(User).order_by(User.id.asc()).all()
        for row in rows:
            print(f"id={row.id} email={row.email} role={row.role.value}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
