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
