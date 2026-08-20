from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Role(Base):
    __tablename__ = "roles"

    role_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    role_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), primary_key=True
    )
    role_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("roles.role_id"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    assigned_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=True
    )


class Staff(Base):
    __tablename__ = "staff"

    staff_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), unique=True, nullable=False
    )
    employee_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    employment_status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Station(Base):
    __tablename__ = "stations"

    station_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    station_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    station_name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Zone(Base):
    __tablename__ = "zones"

    zone_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    zone_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    zone_name: Mapped[str] = mapped_column(String(100), nullable=False)
    coverage_area: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority_level: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Ambulance(Base):
    __tablename__ = "ambulances"

    ambulance_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    station_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("stations.station_id"), nullable=False
    )
    zone_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("zones.zone_id"), nullable=False
    )
    ambulance_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    call_sign: Mapped[str] = mapped_column(String(50), nullable=False)
    ambulance_type: Mapped[str] = mapped_column(String(50), nullable=False)
    registration_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    current_latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    current_longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    vehicle_health_status: Mapped[str] = mapped_column(String(30), nullable=False)
    mileage: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class CrewMember(Base):
    __tablename__ = "crew_members"

    crew_member_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    ambulance_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ambulances.ambulance_id"), nullable=False
    )
    staff_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("staff.staff_id"), nullable=False
    )
    crew_role: Mapped[str] = mapped_column(String(50), nullable=False)
    shift_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    shift_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    maintenance_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    ambulance_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ambulances.ambulance_id"), nullable=False
    )
    maintenance_type: Mapped[str] = mapped_column(String(50), nullable=False)
    maintenance_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    odometer: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    fault_codes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Hospital(Base):
    __tablename__ = "hospitals"

    hospital_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    hospital_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    hospital_name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    capacity_status: Mapped[str] = mapped_column(String(30), nullable=False)
    diversion_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class HospitalCapacity(Base):
    __tablename__ = "hospital_capacity"

    capacity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    hospital_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hospitals.hospital_id"), nullable=False
    )
    available_beds: Mapped[int] = mapped_column(Integer, nullable=False)
    emergency_beds: Mapped[int] = mapped_column(Integer, nullable=False)
    icu_beds: Mapped[int] = mapped_column(Integer, nullable=False)
    available_ambulance_slots: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity_status: Mapped[str] = mapped_column(String(30), nullable=False)
    diversion_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    medical_record_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    blood_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class EmergencyCall(Base):
    __tablename__ = "emergency_calls"

    emergency_call_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    caller_name: Mapped[str] = mapped_column(String(150), nullable=False)
    caller_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    call_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    call_source: Mapped[str] = mapped_column(String(50), nullable=False)
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    call_status: Mapped[str] = mapped_column(String(30), nullable=False)
    call_taker_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    incident_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("incidents.incident_id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class Incident(Base):
    __tablename__ = "incidents"

    incident_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    emergency_call_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("emergency_calls.emergency_call_id"), nullable=True
    )
    patient_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.patient_id"), nullable=True
    )
    incident_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    incident_type: Mapped[str] = mapped_column(String(100), nullable=False)
    priority: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(30), nullable=False)
    incident_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    incident_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class Dispatch(Base):
    __tablename__ = "dispatches"

    dispatch_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    incident_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("incidents.incident_id"), nullable=False
    )
    dispatcher_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    eta_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatch_status: Mapped[str] = mapped_column(String(30), nullable=False)
    priority: Mapped[str] = mapped_column(String(30), nullable=False)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class DispatchAssignment(Base):
    __tablename__ = "dispatch_assignments"

    assignment_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    dispatch_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("dispatches.dispatch_id"), nullable=False
    )
    ambulance_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ambulances.ambulance_id"), nullable=False
    )
    crew_member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("crew_members.crew_member_id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    en_route_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_scene_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    transporting_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_hospital_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assignment_status: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class PrehospitalAssessment(Base):
    __tablename__ = "prehospital_assessments"

    assessment_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    assignment_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("dispatch_assignments.assignment_id"), nullable=False
    )
    patient_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.patient_id"), nullable=False
    )
    assessed_by: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    assessment_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consciousness_level: Mapped[str] = mapped_column(String(50), nullable=False)
    airway_status: Mapped[str] = mapped_column(String(50), nullable=False)
    breathing_status: Mapped[str] = mapped_column(String(50), nullable=False)
    circulation_status: Mapped[str] = mapped_column(String(50), nullable=False)
    heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    respiratory_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    systolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diastolic_bp: Mapped[int | None] = mapped_column(Integer, nullable=True)
    spo2: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    temperature: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    pain_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    clinical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
