import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Role, User, UserRole


DEFAULT_ROLE_DEFINITIONS = (
    ("call-taker", "Emergency call intake and incident creation"),
    ("dispatcher", "Unit assignment and active incident coordination"),
    ("paramedic", "Field response and patient handoff"),
    ("hospital", "Inbound patient and capacity management"),
    ("operations-supervisor", "Fleet-wide operational oversight"),
    ("fleet-maintenance", "Vehicle diagnostics and maintenance"),
    ("admin", "System administrator"),
)


def ensure_default_roles(db: Session) -> None:
    existing_roles = {role.role_name for role in db.query(Role).all()}
    for role_name, description in DEFAULT_ROLE_DEFINITIONS:
        if role_name not in existing_roles:
            db.add(Role(role_name=role_name, description=description))

SECRET = os.getenv("CAD_AUTH_SECRET", "change-this-cad-secret")
TOKEN_TTL_MINUTES = int(os.getenv("CAD_TOKEN_TTL_MINUTES", "60"))
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2_sha256$120000${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _encode(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def _decode(token: str) -> dict:
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if datetime.fromtimestamp(payload["exp"], timezone.utc) <= datetime.now(timezone.utc):
            raise ValueError
        return payload
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES)
    return _encode({"sub": str(user.user_id), "exp": expires.timestamp()})


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = _decode(credentials.credentials)
    user = db.query(User).filter(User.user_id == UUID(payload["sub"]), User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User is inactive or not found")
    return user


def user_roles(db: Session, user_id: UUID) -> set[str]:
    return {name for name, in db.query(Role.role_name).join(UserRole, UserRole.role_id == Role.role_id).filter(UserRole.user_id == user_id).all()}


def require_roles(*required_roles: str):
    def dependency(user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        roles = user_roles(db, user.user_id)
        if not roles.intersection(required_roles):
            raise HTTPException(status_code=403, detail="Insufficient role permissions")
        return user
    return dependency
