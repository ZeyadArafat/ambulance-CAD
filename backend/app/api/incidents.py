from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import EmergencyCall, Incident, Patient, utc_now
from ..models import IncidentNote, User
from ..auth import current_user
from .schemas import NoteInput, PriorityInput
from .router_helpers import get_or_404

router = APIRouter()
contract_router = APIRouter()


class IncidentCreate(BaseModel):
    incident_number: str
    incident_type: str
    priority: str = Field(default="medium")
    severity: str = Field(default="moderate")
    incident_description: str | None = None
    location_description: str | None = None
    latitude: float
    longitude: float
    incident_time: datetime | None = None
    emergency_call_id: UUID | None = None
    patient_id: UUID | None = None


class IncidentUpdate(BaseModel):
    incident_type: str | None = None
    priority: str | None = None
    severity: str | None = None
    incident_description: str | None = None
    location_description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str | None = None


class IncidentResponse(BaseModel):
    incident_id: UUID
    incident_number: str
    incident_type: str
    priority: str
    severity: str
    incident_description: str | None
    location_description: str | None
    latitude: float
    longitude: float
    incident_time: datetime
    status: str
    emergency_call_id: UUID | None
    patient_id: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.post("/", response_model=IncidentResponse, status_code=201)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    if payload.emergency_call_id and not db.query(EmergencyCall).filter(
        EmergencyCall.emergency_call_id == payload.emergency_call_id
    ).first():
        raise HTTPException(status_code=404, detail="Emergency call not found")
    if payload.patient_id and not db.query(Patient).filter(
        Patient.patient_id == payload.patient_id
    ).first():
        raise HTTPException(status_code=404, detail="Patient not found")
    values = payload.model_dump()
    values["incident_time"] = values["incident_time"] or utc_now()
    values["status"] = "new"
    incident = Incident(**values)
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/", response_model=list[IncidentResponse])
def list_incidents(
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Incident)
    if status:
        query = query.filter(Incident.status == status)
    if priority:
        query = query.filter(Incident.priority == priority)
    return query.order_by(Incident.created_at.desc()).all()


@router.put("/{incident_id}", response_model=IncidentResponse)
def update_incident(incident_id: UUID, payload: IncidentUpdate, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(incident, key, value)

    db.commit()
    db.refresh(incident)
    return incident


@contract_router.get("/incidents/duplicates")
def duplicate_incidents(lat: float, lng: float, radius: float = 0.01, window: int = 60, db: Session = Depends(get_db), _: User = Depends(current_user)):
    from datetime import timedelta
    since = utc_now() - timedelta(minutes=window)
    return db.query(Incident).filter(Incident.status.notin_(["resolved", "cancelled"]), Incident.incident_time >= since, Incident.latitude.between(lat - radius, lat + radius), Incident.longitude.between(lng - radius, lng + radius)).all()


@contract_router.get("/incidents/queue")
def incident_queue(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Incident).filter(Incident.status.in_(["new", "pending", "submitted"])).order_by(Incident.priority.desc(), Incident.created_at).all()


@contract_router.get("/incidents/{incident_id}")
def incident_detail(incident_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")


@contract_router.post("/incidents/{incident_id}/priority")
def set_priority(incident_id: UUID, payload: PriorityInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    incident = get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    incident.priority = payload.priority
    if payload.severity:
        incident.severity = payload.severity
    db.commit()
    return incident


@contract_router.post("/incidents/{incident_id}/submit")
def submit_incident(incident_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    incident = get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    if incident.status not in {"new", "pending"}:
        raise HTTPException(status_code=400, detail="Incident cannot be submitted from its current status")
    incident.status = "submitted"
    db.commit()
    return incident


@contract_router.post("/incidents/{incident_id}/notes", status_code=201)
def add_incident_note(incident_id: UUID, payload: NoteInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    note = IncidentNote(incident_id=incident_id, author_id=user.user_id, note_text=payload.note)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@contract_router.get("/incidents/{incident_id}/calls")
def incident_calls(incident_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    return db.query(EmergencyCall).filter(EmergencyCall.incident_id == incident_id).all()
