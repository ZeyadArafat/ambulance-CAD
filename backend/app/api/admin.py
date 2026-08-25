from datetime import date, datetime
from decimal import Decimal
import json
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CrewMember, Staff, Station, User, Zone
from ..models import utc_now
from ..auth import current_user, hash_password, require_roles
from ..models import Ambulance, Role, UserRole
from .schemas import PasswordUserCreate, RoleInput, StationInput, UserPatch, VehicleInput, ZoneInput
from .router_helpers import get_or_404
from fastapi.responses import PlainTextResponse, Response
from fastapi import Query
from sqlalchemy import func
from ..models import AuditLog, Dispatch, Incident, RosterEntry, MaintenanceRecord

router = APIRouter()
contract_router = APIRouter()


def _audit(db: Session, actor: User, action: str, resource: str, resource_id: UUID, old_value=None, new_value=None):
    db.add(AuditLog(
        user_id=actor.user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        old_value=json.dumps(old_value, default=str) if old_value is not None else None,
        new_value=json.dumps(new_value, default=str) if new_value is not None else None,
    ))


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


# Versioned contract routes for administration and master data.
@contract_router.post("/users", status_code=201)
def contract_create_user(payload: PasswordUserCreate, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    user = User(username=payload.username, password_hash=hash_password(payload.password), email=payload.email)
    db.add(user)
    db.flush()
    for role_id in payload.role_ids:
        get_or_404(db, Role, Role.role_id, role_id, "Role")
        db.add(UserRole(user_id=user.user_id, role_id=role_id))
    _audit(db, actor, "create", "user", user.user_id, new_value={"username": user.username, "email": user.email, "role_ids": payload.role_ids})
    db.commit()
    return {"user_id": user.user_id, "username": user.username, "email": user.email}


@contract_router.get("/users")
def contract_list_users(active: bool | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    query = db.query(User)
    if active is not None:
        query = query.filter(User.is_active == active)
    return [
        {
            "user_id": user.user_id,
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "role_ids": [role_id for role_id, in db.query(UserRole.role_id).filter(UserRole.user_id == user.user_id).all()],
        }
        for user in query.order_by(User.username).all()
    ]


@contract_router.get("/users/{user_id}")
def contract_get_user(user_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    user = get_or_404(db, User, User.user_id, user_id, "User")
    return {"user_id": user.user_id, "username": user.username, "email": user.email, "is_active": user.is_active}


@contract_router.patch("/users/{user_id}")
def contract_patch_user(user_id: UUID, payload: UserPatch, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    user = get_or_404(db, User, User.user_id, user_id, "User")
    old_value = {"email": user.email, "is_active": user.is_active, "role_ids": [role_id for role_id, in db.query(UserRole.role_id).filter(UserRole.user_id == user_id).all()]}
    for key, value in payload.model_dump(exclude_unset=True, exclude={"role_ids"}).items():
        setattr(user, key, value)
    if payload.role_ids is not None:
        db.query(UserRole).filter(UserRole.user_id == user_id).delete()
        for role_id in payload.role_ids:
            get_or_404(db, Role, Role.role_id, role_id, "Role")
            db.add(UserRole(user_id=user_id, role_id=role_id))
            _audit(db, actor, "update", "user", user_id, old_value, payload.model_dump(exclude_unset=True, mode="json"))
    db.commit()
    return {"user_id": user.user_id, "is_active": user.is_active}


@contract_router.delete("/users/{user_id}", status_code=204)
def contract_deactivate_user(user_id: UUID, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    user = get_or_404(db, User, User.user_id, user_id, "User")
    old_value = {"is_active": user.is_active}
    user.is_active = False
    _audit(db, actor, "deactivate", "user", user_id, old_value, {"is_active": False})
    db.commit()


@contract_router.get("/roles")
def contract_list_roles(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return db.query(Role).order_by(Role.role_name).all()


@contract_router.post("/roles", status_code=201)
def contract_create_role(payload: RoleInput, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    role = Role(**payload.model_dump())
    db.add(role)
    db.flush()
    _audit(db, actor, "create", "role", role.role_id, new_value=payload.model_dump(mode="json"))
    db.commit()
    db.refresh(role)
    return role


@contract_router.patch("/roles/{role_id}")
def contract_patch_role(role_id: UUID, payload: RoleInput, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    role = get_or_404(db, Role, Role.role_id, role_id, "Role")
    old_value = {"role_name": role.role_name, "description": role.description}
    role.role_name = payload.role_name
    role.description = payload.description
    _audit(db, actor, "update", "role", role_id, old_value, payload.model_dump(mode="json"))
    db.commit()
    return role


@contract_router.post("/stations", status_code=201)
def contract_create_station(payload: StationInput, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    station = Station(**payload.model_dump())
    db.add(station)
    db.flush()
    _audit(db, actor, "create", "station", station.station_id, new_value=payload.model_dump(mode="json"))
    db.commit()
    db.refresh(station)
    return station


@contract_router.get("/stations")
def contract_list_stations(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Station).order_by(Station.station_code).all()


@contract_router.get("/stations/{station_id}")
def contract_get_station(station_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return get_or_404(db, Station, Station.station_id, station_id, "Station")


@contract_router.patch("/stations/{station_id}")
def contract_patch_station(station_id: UUID, payload: dict, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    station = get_or_404(db, Station, Station.station_id, station_id, "Station")
    old_value = {key: getattr(station, key) for key in payload if key in {"station_code", "station_name", "address", "latitude", "longitude", "status"}}
    for key in ("station_code", "station_name", "address", "latitude", "longitude", "status"):
        if key in payload:
            setattr(station, key, payload[key])
    _audit(db, actor, "update", "station", station_id, old_value, payload)
    db.commit()
    return station


@contract_router.delete("/stations/{station_id}", status_code=204)
def contract_deactivate_station(station_id: UUID, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    station = get_or_404(db, Station, Station.station_id, station_id, "Station")
    old_value = {"status": station.status}
    station.status = "inactive"
    _audit(db, actor, "deactivate", "station", station_id, old_value, {"status": "inactive"})
    db.commit()


@contract_router.post("/zones", status_code=201)
def contract_create_zone(payload: ZoneInput, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    zone = Zone(**payload.model_dump())
    db.add(zone)
    db.flush()
    _audit(db, actor, "create", "zone", zone.zone_id, new_value=payload.model_dump(mode="json"))
    db.commit()
    db.refresh(zone)
    return zone


@contract_router.get("/zones")
def contract_list_zones(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Zone).order_by(Zone.zone_code).all()


@contract_router.get("/staff/paramedics")
def contract_list_paramedics(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Staff).join(UserRole, UserRole.user_id == Staff.user_id).join(
        Role, Role.role_id == UserRole.role_id
    ).filter(
        Role.role_name == "paramedic",
        Staff.employment_status == "active",
    ).order_by(Staff.last_name, Staff.first_name).all()


@contract_router.post("/crew", status_code=201)
def contract_create_crew_member(
    payload: CrewCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "supervisor", "operations-supervisor")),
):
    get_or_404(db, Ambulance, Ambulance.ambulance_id, payload.ambulance_id, "Ambulance")
    staff = get_or_404(db, Staff, Staff.staff_id, payload.staff_id, "Staff member")
    if staff.employment_status != "active":
        raise HTTPException(status_code=400, detail="Staff member is not active")
    if not db.query(UserRole).join(Role, Role.role_id == UserRole.role_id).filter(
        UserRole.user_id == staff.user_id,
        Role.role_name == "paramedic",
    ).first():
        raise HTTPException(status_code=400, detail="Only staff with the paramedic role can join an ambulance crew")
    existing = db.query(CrewMember).filter(
        CrewMember.staff_id == payload.staff_id,
        CrewMember.status == "active",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Staff member is already assigned to an active crew")
    crew_member = CrewMember(**payload.model_dump())
    db.add(crew_member)
    db.commit()
    db.refresh(crew_member)
    return crew_member


@contract_router.post("/vehicles", status_code=201)
def contract_create_vehicle(payload: VehicleInput, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin", "supervisor"))):
    get_or_404(db, Station, Station.station_id, payload.station_id, "Station")
    get_or_404(db, Zone, Zone.zone_id, payload.zone_id, "Zone")
    vehicle = Ambulance(**payload.model_dump())
    db.add(vehicle)
    db.flush()
    _audit(db, actor, "create", "vehicle", vehicle.ambulance_id, new_value=payload.model_dump(mode="json"))
    db.commit()
    db.refresh(vehicle)
    return vehicle


@contract_router.get("/vehicles")
def contract_list_vehicles(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Ambulance).order_by(Ambulance.ambulance_code).all()


@contract_router.patch("/vehicles/{vehicle_id}")
def contract_patch_vehicle(vehicle_id: UUID, payload: dict, db: Session = Depends(get_db), actor: User = Depends(require_roles("admin"))):
    vehicle = get_or_404(db, Ambulance, Ambulance.ambulance_id, vehicle_id, "Vehicle")
    editable_keys = {"call_sign", "ambulance_type", "vehicle_health_status", "mileage", "station_id", "zone_id"}
    old_value = {key: getattr(vehicle, key) for key in payload if key in editable_keys}
    for key, value in payload.items():
        if key in editable_keys:
            setattr(vehicle, key, value)
    _audit(db, actor, "update", "vehicle", vehicle_id, old_value, payload)
    db.commit()
    return vehicle


@contract_router.post("/units/{unit_id}/reallocate")
def contract_reallocate_unit(unit_id: UUID, station_id: UUID, zone_id: UUID, db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "supervisor"))):
    unit = get_or_404(db, Ambulance, Ambulance.ambulance_id, unit_id, "Unit")
    unit.station_id = station_id
    unit.zone_id = zone_id
    db.commit()
    return unit


@contract_router.get("/dashboard/fleet")
def fleet_dashboard(db: Session = Depends(get_db), _: User = Depends(current_user)):
    counts = dict(db.query(Ambulance.status, func.count(Ambulance.ambulance_id)).group_by(Ambulance.status).all())
    return {"availability": counts, "open_incidents": db.query(Incident).filter(Incident.status.notin_(["resolved", "cancelled"])).count()}


@contract_router.get("/reports/post-incident/{incident_id}")
def post_incident_report(incident_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    incident = get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    dispatch = db.query(Dispatch).filter(Dispatch.incident_id == incident_id).order_by(Dispatch.assigned_at).first()
    response_minutes = None
    if dispatch and dispatch.actual_arrival_time:
        response_minutes = round((dispatch.actual_arrival_time - incident.incident_time).total_seconds() / 60, 1)
    return {"incident_id": incident_id, "status": incident.status, "response_minutes": response_minutes, "dispatch_id": dispatch.dispatch_id if dispatch else None}


@contract_router.get("/alerts/zone-coverage")
def zone_coverage(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.query(Zone.zone_id, Zone.zone_code, func.count(Ambulance.ambulance_id)).outerjoin(Ambulance, Ambulance.zone_id == Zone.zone_id).group_by(Zone.zone_id, Zone.zone_code).all()
    return [{"zone_id": zone_id, "zone_code": code, "active_unit_count": count} for zone_id, code, count in rows]


@contract_router.get("/audit-log")
def audit_log(
    action: str | None = None,
    resource: str | None = None,
    query: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin", "supervisor")),
):
    audit_query = db.query(AuditLog)
    if action:
        audit_query = audit_query.filter(AuditLog.action == action)
    if resource:
        audit_query = audit_query.filter(AuditLog.resource == resource)
    if query:
        pattern = f"%{query}%"
        audit_query = audit_query.filter(
            (AuditLog.action.ilike(pattern))
            | (AuditLog.resource.ilike(pattern))
            | (AuditLog.old_value.ilike(pattern))
            | (AuditLog.new_value.ilike(pattern))
        )
    return audit_query.order_by(AuditLog.created_at.desc()).limit(500).all()


@contract_router.get("/reports/operational")
def operational_report(db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "supervisor"))):
    return {"incident_count": db.query(Incident).count(), "dispatch_count": db.query(Dispatch).count(), "unit_count": db.query(Ambulance).count()}


@contract_router.get("/reports/operational/export")
def export_report(format: str = Query("json"), db: Session = Depends(get_db), _: User = Depends(require_roles("admin", "supervisor"))):
    if format not in {"json", "csv", "pdf"}:
        raise HTTPException(status_code=400, detail="Supported formats: json, csv, pdf")
    report = {"incident_count": db.query(Incident).count(), "dispatch_count": db.query(Dispatch).count(), "unit_count": db.query(Ambulance).count()}
    if format == "csv":
        return PlainTextResponse("metric,value\n" + "\n".join(f"{key},{value}" for key, value in report.items()), media_type="text/csv")
    if format == "pdf":
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen.canvas import Canvas

        buffer = BytesIO()
        canvas = Canvas(buffer, pagesize=letter)
        canvas.setTitle("CAD Operational Report")
        canvas.drawString(72, 720, "CAD Operational Report")
        for index, (key, value) in enumerate(report.items(), start=1):
            canvas.drawString(72, 700 - (index * 20), f"{key.replace('_', ' ').title()}: {value}")
        canvas.save()
        return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=cad-operational-report.pdf"})
    return report
