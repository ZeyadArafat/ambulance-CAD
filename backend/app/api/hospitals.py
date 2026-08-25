from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Hospital, HospitalCapacity, User, utc_now
from ..models import Ambulance, Dispatch, DispatchDestination, Incident, IncidentCloseout
from ..auth import current_user, user_roles
from .schemas import CloseoutInput, DestinationInput, StatusInput
from .router_helpers import get_or_404

router = APIRouter()
contract_router = APIRouter()


def assert_hospital_access(user: User, hospital_id: UUID, db: Session):
    if "hospital" in user_roles(db, user.user_id) and user.hospital_id != hospital_id:
        raise HTTPException(status_code=403, detail="Hospital account is restricted to its assigned facility")


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
def list_hospitals(db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = db.query(Hospital).filter(Hospital.status == "active")
    if "hospital" in user_roles(db, user.user_id):
        query = query.filter(Hospital.hospital_id == user.hospital_id)
    return query.order_by(Hospital.hospital_name).all()


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
    if not db.query(User).filter(User.user_id == payload.updated_by, User.is_active.is_(True)).first():
        raise HTTPException(status_code=404, detail="Active user not found")
    capacity = HospitalCapacity(hospital_id=hospital_id, updated_at=utc_now(), **payload.model_dump())
    db.add(capacity)
    db.commit()
    db.refresh(capacity)
    return capacity


@router.get("/{hospital_id}/capacity")
def get_capacity(hospital_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    assert_hospital_access(user, hospital_id, db)
    capacity = db.query(HospitalCapacity).filter(
        HospitalCapacity.hospital_id == hospital_id
    ).order_by(HospitalCapacity.updated_at.desc()).first()
    if not capacity:
        raise HTTPException(status_code=404, detail="Hospital capacity not found")
    return capacity


@contract_router.post("/units/{unit_id}/status")
def contract_unit_status(unit_id: UUID, payload: StatusInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    ambulance = get_or_404(db, Ambulance, Ambulance.ambulance_id, unit_id, "Unit")
    ambulance.status = payload.status
    db.commit()
    return ambulance


@contract_router.post("/units/{unit_id}/status/sync")
def contract_sync_status(unit_id: UUID, statuses: list[StatusInput], db: Session = Depends(get_db), _: User = Depends(current_user)):
    ambulance = get_or_404(db, Ambulance, Ambulance.ambulance_id, unit_id, "Unit")
    for item in statuses:
        ambulance.status = item.status
    db.commit()
    return {"unit_id": unit_id, "applied": len(statuses), "status": ambulance.status}


@contract_router.get("/hospitals/capacity")
def contract_hospital_capacity(db: Session = Depends(get_db), _: User = Depends(current_user)):
    user = _
    query = db.query(Hospital).filter(Hospital.status == "active")
    if "hospital" in user_roles(db, user.user_id):
        query = query.filter(Hospital.hospital_id == user.hospital_id)
    return query.all()


@contract_router.post("/dispatches/{dispatch_id}/destination-hospital")
def contract_destination_hospital(dispatch_id: UUID, payload: DestinationInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_or_404(db, Dispatch, Dispatch.dispatch_id, dispatch_id, "Dispatch")
    get_or_404(db, Hospital, Hospital.hospital_id, payload.hospital_id, "Hospital")
    destination = DispatchDestination(dispatch_id=dispatch_id, hospital_id=payload.hospital_id, selected_by=user.user_id)
    db.add(destination)
    db.commit()
    db.refresh(destination)
    return destination


@contract_router.post("/incidents/{incident_id}/closeout", status_code=201)
def contract_closeout(incident_id: UUID, payload: CloseoutInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    incident = get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    incident.status = "resolved"
    record = IncidentCloseout(incident_id=incident_id, submitted_by=user.user_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@contract_router.get("/hospitals/{hospital_id}/inbound")
def contract_inbound(hospital_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    assert_hospital_access(_, hospital_id, db)
    return db.query(DispatchDestination).filter(DispatchDestination.hospital_id == hospital_id).all()


@contract_router.post("/hospitals/{hospital_id}/capacity")
def contract_capacity(hospital_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(current_user)):
    assert_hospital_access(user, hospital_id, db)
    hospital = get_or_404(db, Hospital, Hospital.hospital_id, hospital_id, "Hospital")
    for key in ("capacity_status", "diversion_flag"):
        if key in payload:
            setattr(hospital, key, payload[key])
    capacity = HospitalCapacity(hospital_id=hospital_id, updated_by=user.user_id, updated_at=utc_now(), available_beds=payload.get("available_beds", 0), emergency_beds=payload.get("emergency_beds", 0), icu_beds=payload.get("icu_beds", 0), available_ambulance_slots=payload.get("available_ambulance_slots", 0), capacity_status=payload.get("capacity_status", hospital.capacity_status), diversion_flag=payload.get("diversion_flag", hospital.diversion_flag))
    db.add(capacity)
    db.commit()
    return capacity


@contract_router.post("/hospitals/{hospital_id}/inbound/{dispatch_id}/acknowledge")
def contract_acknowledge_inbound(hospital_id: UUID, dispatch_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    assert_hospital_access(_, hospital_id, db)
    destination = db.query(DispatchDestination).filter(DispatchDestination.hospital_id == hospital_id, DispatchDestination.dispatch_id == dispatch_id).first()
    if not destination:
        raise HTTPException(status_code=404, detail="Inbound notification not found")
    destination.acknowledged_at = utc_now()
    db.commit()
    return destination
