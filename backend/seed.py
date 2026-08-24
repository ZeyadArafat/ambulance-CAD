import os

from app.auth import ensure_default_roles, hash_password
from app.database import Base, SessionLocal, engine
from app.models import Role, User, UserRole


def seed_admin() -> bool:
    Base.metadata.create_all(bind=engine)

    username = os.getenv("CAD_ADMIN_USERNAME", "admin")
    password = os.getenv("CAD_ADMIN_PASSWORD", "admin123")
    email = os.getenv("CAD_ADMIN_EMAIL", "admin@example.com")

    with SessionLocal.begin() as db:
        ensure_default_roles(db)

        if db.query(User).first() is not None:
            return False

        admin_role = db.query(Role).filter(Role.role_name == "admin").one()

        admin_user = User(
            username=username,
            password_hash=hash_password(password),
            email=email,
        )
        db.add(admin_user)
        db.flush()
        db.add(UserRole(user_id=admin_user.user_id, role_id=admin_role.role_id))

    return True


if __name__ == "__main__":
    if seed_admin():
        print("Created admin account.")
    else:
        print("Skipped admin seed: the database already contains a user.")