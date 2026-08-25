from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class PasswordUserCreate(BaseModel):
    username: str
    password: str
    email: str
    role_ids: list[UUID] = []
    hospital_id: UUID | None = None


class UserPatch(BaseModel):
    email: str | None = None
    is_active: bool | None = None
    role_ids: list[UUID] | None = None
    hospital_id: UUID | None = None


class RoleInput(BaseModel):
    role_name: str
    description: str | None = None


class LocationInput(BaseModel):
    location_description: str | None = None
    latitude: Decimal
    longitude: Decimal


class CallInput(BaseModel):
    caller_name: str
    caller_phone: str
    call_source: str = "phone"
    narrative: str | None = None
    chief_complaint: str | None = None
    location_description: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None


class IncidentInput(BaseModel):
    incident_number: str
    incident_type: str
    priority: str = "medium"
    severity: str = "moderate"
    incident_description: str | None = None
    location_description: str | None = None
    latitude: Decimal
    longitude: Decimal
    emergency_call_id: UUID | None = None
    patient_id: UUID | None = None


class PriorityInput(BaseModel):
    priority: str
    severity: str | None = None


class NoteInput(BaseModel):
    note: str


class DispatchInput(BaseModel):
    incident_id: UUID
    ambulance_id: UUID
    crew_member_id: UUID
    override_reason: str | None = None


class DispatchPatch(BaseModel):
    ambulance_id: UUID | None = None
    priority: str | None = None
    notes: str | None = None


class MessageInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class StatusInput(BaseModel):
    status: str


class DestinationInput(BaseModel):
    hospital_id: UUID


class CloseoutInput(BaseModel):
    outcome_summary: str
    patient_handoff_confirmed: bool


class MaintenanceInput(BaseModel):
    maintenance_type: str
    maintenance_date: datetime
    description: str | None = None
    odometer: Decimal | None = None
    fault_codes: str | None = None
    status: str = "scheduled"


class ServiceStatusInput(BaseModel):
    status: str


class StationInput(BaseModel):
    station_code: str
    station_name: str
    address: str | None = None
    latitude: Decimal
    longitude: Decimal
    status: str = "active"


class ZoneInput(BaseModel):
    zone_code: str
    zone_name: str
    coverage_area: str | None = None
    priority_level: str = "medium"
    status: str = "active"


class VehicleInput(BaseModel):
    station_id: UUID
    zone_id: UUID
    ambulance_code: str
    call_sign: str
    ambulance_type: str = "basic_life_support"
    registration_number: str
    current_latitude: Decimal
    current_longitude: Decimal
    status: str = "available"
    vehicle_health_status: str = "operational"
    mileage: Decimal = 0


class RosterInput(BaseModel):
    staff_id: UUID
    ambulance_id: UUID | None = None
    station_id: UUID
    shift_start: datetime
    shift_end: datetime
    status: str = "scheduled"
