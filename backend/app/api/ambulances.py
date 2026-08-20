from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance

router = APIRouter()


class AmbulanceCreate(BaseModel):
    station_id: UUID
    zone_id: UUID
    ambulance_code: str
    call_sign: str
    registration_number: str
    status: str = "available"
    ambulance_type: str = "basic_life_support"
    vehicle_health_status: str = "operational"
    mileage: Decimal = Field(default=0, ge=0)
    current_latitude: float
    current_longitude: float


class AmbulanceUpdate(BaseModel):
    station_id: UUID | None = None
    zone_id: UUID | None = None
    call_sign: str | None = None
    status: str | None = None
    ambulance_type: str | None = None
    vehicle_health_status: str | None = None
    mileage: Decimal | None = Field(default=None, ge=0)
    current_latitude: float | None = None
    current_longitude: float | None = None


class TelemetryUpdate(BaseModel):
    latitude: float
    longitude: float
    status: str | None = None
    mileage: Decimal | None = Field(default=None, ge=0)


class AmbulanceResponse(BaseModel):
    ambulance_id: UUID
    station_id: UUID
    zone_id: UUID
    ambulance_code: str
    call_sign: str
    registration_number: str
    ambulance_type: str
    current_latitude: Decimal
    current_longitude: Decimal
    status: str
    vehicle_health_status: str
    mileage: Decimal
    created_at: datetime
    updated_at: datetime

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
    return db.query(Ambulance).order_by(Ambulance.ambulance_code).all()


# --------------------------------------------------------------------------------------------------
@router.put("/{ambulance_id}", response_model=AmbulanceResponse)
def update_ambulance(ambulance_id: UUID, payload: AmbulanceUpdate, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.ambulance_id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(ambulance, key, value)

    db.commit()
    db.refresh(ambulance)
    return ambulance


@router.patch("/{ambulance_id}/telemetry", response_model=AmbulanceResponse)
def update_telemetry(ambulance_id: UUID, payload: TelemetryUpdate, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.ambulance_id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    ambulance.current_latitude = payload.latitude
    ambulance.current_longitude = payload.longitude
    if payload.status is not None:
        ambulance.status = payload.status
    if payload.mileage is not None:
        ambulance.mileage = payload.mileage
    db.commit()
    db.refresh(ambulance)
    return ambulance
