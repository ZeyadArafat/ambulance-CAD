from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CrewMember, Staff, Station, User, Zone
from ..models import utc_now

router = APIRouter()


class UserCreate(BaseModel):
    username: str
    password_hash: str
    email: str
    is_active: bool = True


class StaffCreate(BaseModel):
    user_id: UUID
    employee_number: str
    first_name: str
    last_name: str
    middle_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    hire_date: date | None = None
    employment_status: str = "active"


class StationCreate(BaseModel):
    station_code: str
    station_name: str
    address: str | None = None
    latitude: Decimal
    longitude: Decimal
    status: str = "active"


class ZoneCreate(BaseModel):
    zone_code: str
    zone_name: str
    coverage_area: str | None = None
    priority_level: str = "medium"
    status: str = "active"


class CrewCreate(BaseModel):
    ambulance_id: UUID
    staff_id: UUID
    crew_role: str
    shift_start: datetime
    shift_end: datetime | None = None
    status: str = "active"


@router.post("/users", status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    user = User(**payload.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.username).all()


@router.post("/staff", status_code=201)
def create_staff(payload: StaffCreate, db: Session = Depends(get_db)):
    if not db.query(User).filter(User.user_id == payload.user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    staff = Staff(**payload.model_dump())
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.get("/staff")
def list_staff(db: Session = Depends(get_db)):
    return db.query(Staff).order_by(Staff.last_name, Staff.first_name).all()


@router.post("/stations", status_code=201)
def create_station(payload: StationCreate, db: Session = Depends(get_db)):
    station = Station(**payload.model_dump())
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


@router.get("/stations")
def list_stations(db: Session = Depends(get_db)):
    return db.query(Station).filter(Station.status == "active").order_by(Station.station_code).all()


@router.post("/zones", status_code=201)
def create_zone(payload: ZoneCreate, db: Session = Depends(get_db)):
    zone = Zone(**payload.model_dump())
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


@router.get("/zones")
def list_zones(db: Session = Depends(get_db)):
    return db.query(Zone).filter(Zone.status == "active").order_by(Zone.zone_code).all()


@router.post("/crew", status_code=201)
def create_crew_member(payload: CrewCreate, db: Session = Depends(get_db)):
    if not db.query(Staff).filter(Staff.staff_id == payload.staff_id).first():
        raise HTTPException(status_code=404, detail="Staff member not found")
    crew_member = CrewMember(**payload.model_dump())
    db.add(crew_member)
    db.commit()
    db.refresh(crew_member)
    return crew_member


@router.get("/crew")
def list_crew_members(db: Session = Depends(get_db)):
    return db.query(CrewMember).filter(CrewMember.status == "active").all()
