from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance

router = APIRouter()


class AmbulanceCreate(BaseModel):
    code: str
    status: str = "available"
    ambulance_type: str = "basic_life_support"
    latitude: float | None = None
    longitude: float | None = None


class AmbulanceResponse(AmbulanceCreate):
    id: int

    model_config = {"from_attributes": True}


@router.post("/", response_model=AmbulanceResponse, status_code=201)
def create_ambulance(payload: AmbulanceCreate, db: Session = Depends(get_db)):
    ambulance = Ambulance(**payload.model_dump())
    db.add(ambulance)
    db.commit()
    db.refresh(ambulance)
    return ambulance


@router.get("/", response_model=list[AmbulanceResponse])
def list_ambulances(db: Session = Depends(get_db)):
    return db.query(Ambulance).order_by(Ambulance.id).all()
