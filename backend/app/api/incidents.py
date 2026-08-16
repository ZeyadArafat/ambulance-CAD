from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Incident

router = APIRouter()


class IncidentCreate(BaseModel):
    priority: str = Field(default="medium")
    incident_type: str
    description: str | None = None
    latitude: float
    longitude: float


class IncidentUpdate(BaseModel):
    priority: str | None = None
    incident_type: str | None = None
    description: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: str | None = None
    assigned_ambulance_id: int | None = None


class IncidentResponse(IncidentCreate):
    id: int
    status: str
    assigned_ambulance_id: int | None

    model_config = {"from_attributes": True}


@router.post("/", response_model=IncidentResponse, status_code=201)
def create_incident(payload: IncidentCreate, db: Session = Depends(get_db)):
    incident = Incident(**payload.model_dump())
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/", response_model=list[IncidentResponse])
def list_incidents(db: Session = Depends(get_db)):
    return db.query(Incident).order_by(Incident.id.desc()).all()


@router.put("/{incident_id}", response_model=IncidentResponse)
def update_incident(incident_id: int, payload: IncidentUpdate, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        return {"error": "Incident not found"}

    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(incident, key, value)

    db.commit()
    db.refresh(incident)
    return incident
