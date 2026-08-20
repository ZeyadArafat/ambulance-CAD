from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EmergencyCall, User
from ..models import utc_now

router = APIRouter()


class EmergencyCallCreate(BaseModel):
    caller_name: str
    caller_phone: str
    call_source: str = "phone"
    narrative: str | None = None
    chief_complaint: str | None = None
    location_description: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    call_taker_id: UUID


class EmergencyCallUpdate(BaseModel):
    narrative: str | None = None
    chief_complaint: str | None = None
    location_description: str | None = None
    call_status: str | None = None
    incident_id: UUID | None = None


@router.post("/", status_code=201)
def create_call(payload: EmergencyCallCreate, db: Session = Depends(get_db)):
    if not db.query(User).filter(User.user_id == payload.call_taker_id, User.is_active.is_(True)).first():
        raise HTTPException(status_code=404, detail="Active call taker not found")
    call = EmergencyCall(**payload.model_dump(), call_time=utc_now(), call_status="open")
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


@router.get("/")
def list_calls(db: Session = Depends(get_db)):
    return db.query(EmergencyCall).order_by(EmergencyCall.call_time.desc()).all()


@router.patch("/{call_id}")
def update_call(call_id: UUID, payload: EmergencyCallUpdate, db: Session = Depends(get_db)):
    call = db.query(EmergencyCall).filter(EmergencyCall.emergency_call_id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Emergency call not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(call, key, value)
    db.commit()
    db.refresh(call)
    return call
