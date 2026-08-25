from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import create_access_token, current_user, hash_password, user_roles, verify_password
from ..database import get_db
from ..models import User

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserProfile(BaseModel):
    user_id: UUID
    username: str
    email: str
    is_active: bool
    roles: list[str]
    hospital_id: UUID | None = None


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    from ..models import utc_now
    user.last_login_at = utc_now()
    db.commit()
    from ..auth import TOKEN_TTL_MINUTES
    return {"access_token": create_access_token(user), "expires_in": TOKEN_TTL_MINUTES * 60}


@router.post("/auth/logout")
def logout(user: User = Depends(current_user)):
    return {"success": True, "message": "Discard the bearer token on the client"}


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh(user: User = Depends(current_user)):
    from ..auth import TOKEN_TTL_MINUTES
    return {"access_token": create_access_token(user), "expires_in": TOKEN_TTL_MINUTES * 60}


@router.get("/auth/me", response_model=UserProfile)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"user_id": user.user_id, "username": user.username, "email": user.email, "is_active": user.is_active, "roles": sorted(user_roles(db, user.user_id)), "hospital_id": user.hospital_id}
