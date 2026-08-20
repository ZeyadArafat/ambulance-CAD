from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Hospital, HospitalCapacity, utc_now

router = APIRouter()


class HospitalCreate(BaseModel):
    hospital_code: str
    hospital_name: str
    address: str | None = None
    phone: str | None = None
    latitude: Decimal
    longitude: Decimal
    capacity_status: str = "available"
    diversion_flag: bool = False
    status: str = "active"


class HospitalUpdate(BaseModel):
    hospital_name: str | None = None
    address: str | None = None
    phone: str | None = None
    capacity_status: str | None = None
    diversion_flag: bool | None = None
    status: str | None = None


class HospitalResponse(HospitalCreate):
    hospital_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CapacityUpdate(BaseModel):
    available_beds: int = Field(ge=0)
    emergency_beds: int = Field(ge=0)
    icu_beds: int = Field(ge=0)
    available_ambulance_slots: int = Field(ge=0)
    capacity_status: str
    diversion_flag: bool = False
    updated_by: UUID


@router.post("/", response_model=HospitalResponse, status_code=201)
def create_hospital(payload: HospitalCreate, db: Session = Depends(get_db)):
    hospital = Hospital(**payload.model_dump())
    db.add(hospital)
    db.commit()
    db.refresh(hospital)
    return hospital


@router.get("/", response_model=list[HospitalResponse])
def list_hospitals(db: Session = Depends(get_db)):
    return db.query(Hospital).filter(Hospital.status == "active").order_by(Hospital.hospital_name).all()


@router.patch("/{hospital_id}", response_model=HospitalResponse)
def update_hospital(hospital_id: UUID, payload: HospitalUpdate, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(hospital, key, value)
    db.commit()
    db.refresh(hospital)
    return hospital


@router.put("/{hospital_id}/capacity")
def update_capacity(hospital_id: UUID, payload: CapacityUpdate, db: Session = Depends(get_db)):
    if not db.query(Hospital).filter(Hospital.hospital_id == hospital_id).first():
        raise HTTPException(status_code=404, detail="Hospital not found")
    capacity = HospitalCapacity(hospital_id=hospital_id, updated_at=utc_now(), **payload.model_dump())
    db.add(capacity)
    db.commit()
    db.refresh(capacity)
    return capacity


@router.get("/{hospital_id}/capacity")
def get_capacity(hospital_id: UUID, db: Session = Depends(get_db)):
    capacity = db.query(HospitalCapacity).filter(
        HospitalCapacity.hospital_id == hospital_id
    ).order_by(HospitalCapacity.updated_at.desc()).first()
    if not capacity:
        raise HTTPException(status_code=404, detail="Hospital capacity not found")
    return capacity
