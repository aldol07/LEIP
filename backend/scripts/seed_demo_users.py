from app.db.session import SessionLocal
from app.models.entities import User
from app.models.enums import UserRole
from app.services.security import hash_password


DEMO_USERS = [
    {
        "email": "analyst@leipapp.com",
        "password": "Pass@123",
        "role": UserRole.analyst,
    },
    {
        "email": "viewer@leipapp.com",
        "password": "Pass@123",
        "role": UserRole.viewer,
    },
]


def run() -> None:
    db = SessionLocal()
    try:
        for user_data in DEMO_USERS:
            existing = db.query(User).filter(User.email == user_data["email"]).first()
            if existing:
                existing.hashed_password = hash_password(user_data["password"])
                existing.role = user_data["role"]
                db.add(existing)
                db.commit()
                db.refresh(existing)
                print(f"updated user_id={existing.id} email={existing.email} role={existing.role.value}")
                continue

            user = User(
                email=user_data["email"],
                hashed_password=hash_password(user_data["password"]),
                role=user_data["role"],
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"created user_id={user.id} email={user.email} role={user.role.value}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
