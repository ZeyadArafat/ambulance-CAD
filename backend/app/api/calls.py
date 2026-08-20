from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EmergencyCall, User
from ..models import Incident, IncidentNote, Patient, utc_now
from ..auth import current_user
from .schemas import CallInput, IncidentInput, LocationInput, NoteInput, PriorityInput
from .router_helpers import get_or_404
from ..models import utc_now

router = APIRouter()
contract_router = APIRouter()


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


@contract_router.post("/calls/{call_id}/location")
def attach_call_location(call_id: UUID, payload: LocationInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    call = get_or_404(db, EmergencyCall, EmergencyCall.emergency_call_id, call_id, "Call")
    call.location_description = payload.location_description
    call.latitude = payload.latitude
    call.longitude = payload.longitude
    db.commit()
    return call


@contract_router.post("/calls", status_code=201)
def contract_create_call(payload: CallInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    call = EmergencyCall(**payload.model_dump(), call_taker_id=user.user_id, call_time=utc_now(), call_status="open")
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


@contract_router.post("/incidents", status_code=201)
def contract_create_incident(payload: IncidentInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if payload.emergency_call_id:
        get_or_404(db, EmergencyCall, EmergencyCall.emergency_call_id, payload.emergency_call_id, "Call")
    if payload.patient_id:
        get_or_404(db, Patient, Patient.patient_id, payload.patient_id, "Patient")
    incident = Incident(**payload.model_dump(), incident_time=utc_now(), status="new")
    db.add(incident)
    db.commit()
    db.refresh(incident)
    if incident.emergency_call_id:
        call = db.query(EmergencyCall).filter(EmergencyCall.emergency_call_id == incident.emergency_call_id).first()
        call.incident_id = incident.incident_id
        call.call_status = "converted"
        db.commit()
    return incident
