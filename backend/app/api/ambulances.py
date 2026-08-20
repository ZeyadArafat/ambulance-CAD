from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Station, Zone
from ..models import MaintenanceRecord, VehicleAlert, VehicleDiagnostic, User, RosterEntry, AuditLog, Dispatch, Incident, Zone
from ..auth import current_user, require_roles
from sqlalchemy import func
from fastapi.responses import PlainTextResponse
from fastapi import Query
from .schemas import MaintenanceInput, RosterInput, ServiceStatusInput
from .router_helpers import get_or_404

router = APIRouter()
contract_router = APIRouter()


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
    if not db.query(Station).filter(Station.station_id == payload.station_id).first():
        raise HTTPException(status_code=404, detail="Station not found")
    if not db.query(Zone).filter(Zone.zone_id == payload.zone_id).first():
        raise HTTPException(status_code=404, detail="Zone not found")
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


@contract_router.get("/vehicles/{vehicle_id}/diagnostics")
def diagnostics(vehicle_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    return db.query(VehicleDiagnostic).filter(VehicleDiagnostic.ambulance_id == vehicle_id).order_by(VehicleDiagnostic.recorded_at.desc()).all()


@contract_router.get("/vehicles/{vehicle_id}/alerts")
def vehicle_alerts(vehicle_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    return db.query(VehicleAlert).filter(VehicleAlert.ambulance_id == vehicle_id).order_by(VehicleAlert.created_at.desc()).all()


@contract_router.post("/vehicles/{vehicle_id}/maintenance-records", status_code=201)
def create_maintenance(vehicle_id: UUID, payload: MaintenanceInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    record = MaintenanceRecord(ambulance_id=vehicle_id, created_by=user.user_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@contract_router.get("/vehicles/{vehicle_id}/maintenance-records")
def maintenance_history(vehicle_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(MaintenanceRecord).filter(MaintenanceRecord.ambulance_id == vehicle_id).order_by(MaintenanceRecord.maintenance_date.desc()).all()


@contract_router.post("/vehicles/{vehicle_id}/service-status")
def service_status(vehicle_id: UUID, payload: ServiceStatusInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    ambulance = get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    ambulance.status = payload.status
    db.commit()
    return ambulance


@contract_router.get("/vehicles/{vehicle_id}/usage")
def vehicle_usage(vehicle_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    ambulance = get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    return {"vehicle_id": vehicle_id, "mileage": ambulance.mileage}


@contract_router.get("/rosters")
def list_rosters(station_id: UUID | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    query = db.query(RosterEntry)
    if station_id:
        query = query.filter(RosterEntry.station_id == station_id)
    return query.order_by(RosterEntry.shift_start).all()


@contract_router.post("/rosters", status_code=201)
def create_roster(payload: RosterInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    roster = RosterEntry(**payload.model_dump())
    db.add(roster)
    db.commit()
    db.refresh(roster)
    return roster


@contract_router.patch("/rosters/{roster_id}")
def patch_roster(roster_id: UUID, payload: RosterInput, db: Session = Depends(get_db), _: User = Depends(current_user)):
    roster = get_or_404(db, RosterEntry, RosterEntry.roster_id, roster_id, "Roster")
    for key, value in payload.model_dump().items():
        setattr(roster, key, value)
    db.commit()
    return roster


@contract_router.get("/staffing/current")
def current_staffing(station_id: UUID | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    query = db.query(RosterEntry).filter(RosterEntry.status == "on_duty")
    if station_id:
        query = query.filter(RosterEntry.station_id == station_id)
    return query.all()
