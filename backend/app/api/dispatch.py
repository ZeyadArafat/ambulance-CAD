from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Dispatch, DispatchAssignment, Incident
from ..models import DispatchDestination, DispatchMessage, Hospital, User, utc_now
from ..auth import current_user
from .schemas import DispatchInput, DispatchPatch, DestinationInput, MessageInput
from .router_helpers import get_or_404
from ..services.dispatch_service import dispatch_ambulance, recommend_ambulances, transition_dispatch
from ..services.routing_service import get_route

router = APIRouter()
contract_router = APIRouter()


class DispatchRequest(BaseModel):
    incident_id: UUID
    ambulance_id: UUID
    dispatcher_id: UUID
    crew_member_id: UUID
    override_reason: str | None = None


class DispatchResponse(BaseModel):
    dispatch_id: UUID
    incident_id: UUID
    dispatcher_id: UUID
    assigned_at: datetime
    eta_minutes: int | None
    estimated_arrival_time: datetime | None
    actual_arrival_time: datetime | None
    dispatch_status: str
    priority: str
    override_reason: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class DispatchTransitionRequest(BaseModel):
    status: str


class RouteResponse(BaseModel):
    incident_id: UUID
    ambulance_id: UUID
    ambulance_code: str
    distance_km: float
    eta_minutes: float
    coordinates: list[list[float]]


@router.get("/", response_model=list[DispatchResponse])
def list_dispatches(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Dispatch)
    if status:
        query = query.filter(Dispatch.dispatch_status == status)
    return query.order_by(Dispatch.assigned_at.desc()).all()


async def _route_for(ambulance: Ambulance, incident: Incident) -> RouteResponse:
    route = await get_route(
        float(ambulance.current_latitude),
        float(ambulance.current_longitude),
        float(incident.latitude),
        float(incident.longitude),
    )
    return RouteResponse(
        incident_id=incident.incident_id,
        ambulance_id=ambulance.ambulance_id,
        ambulance_code=ambulance.ambulance_code,
        distance_km=round(route["distance_km"], 2),
        eta_minutes=round(route["duration_minutes"], 1),
        coordinates=route.get("coordinates", []),
    )


@router.get("/route/ambulance/{ambulance_id}", response_model=RouteResponse)
async def get_ambulance_route(ambulance_id: UUID, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.ambulance_id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")
    dispatch = db.query(Dispatch).join(
        DispatchAssignment, Dispatch.dispatch_id == DispatchAssignment.dispatch_id
    ).filter(
        Dispatch.dispatch_status.in_(["dispatched", "en_route"]),
        DispatchAssignment.ambulance_id == ambulance_id,
    ).order_by(Dispatch.assigned_at.desc()).first()
    if not dispatch:
        raise HTTPException(status_code=404, detail="Ambulance has no active dispatch")
    incident = db.query(Incident).filter(Incident.incident_id == dispatch.incident_id).first()
    return await _route_for(ambulance, incident)


@router.get("/route/incident/{incident_id}", response_model=RouteResponse)
async def get_incident_route(incident_id: UUID, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    assignment = db.query(DispatchAssignment).join(
        Dispatch, Dispatch.dispatch_id == DispatchAssignment.dispatch_id
    ).filter(
        Dispatch.incident_id == incident_id,
        Dispatch.dispatch_status.in_(["dispatched", "en_route", "arrived_scene", "transporting"]),
        DispatchAssignment.assignment_status.in_(["assigned", "en_route", "arrived_scene", "transporting"]),
    ).order_by(Dispatch.assigned_at.desc()).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Incident has no ambulance assignment")
    ambulance = db.query(Ambulance).filter(Ambulance.ambulance_id == assignment.ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Assigned ambulance not found")
    return await _route_for(ambulance, incident)


@router.get("/recommend/{incident_id}")
async def recommend(incident_id: UUID, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"incident_id": incident_id, "recommendations": await recommend_ambulances(db, incident)}


@router.post("/dispatch", response_model=DispatchResponse, status_code=201)
async def create_dispatch(request: DispatchRequest, db: Session = Depends(get_db)):
    try:
        return await dispatch_ambulance(
            db,
            request.incident_id,
            request.ambulance_id,
            request.dispatcher_id,
            request.crew_member_id,
            request.override_reason,
            manual=request.override_reason is not None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/{dispatch_id}/status", response_model=DispatchResponse)
def update_dispatch_status(
    dispatch_id: UUID,
    request: DispatchTransitionRequest,
    db: Session = Depends(get_db),
):
    try:
        return transition_dispatch(db, dispatch_id, request.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@contract_router.get("/units/live")
def contract_live_units(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Ambulance).order_by(Ambulance.ambulance_code).all()


@contract_router.get("/incidents/{incident_id}/recommendation")
async def contract_recommendation(incident_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    incident = get_or_404(db, Incident, Incident.incident_id, incident_id, "Incident")
    return {"incident_id": incident_id, "recommendations": await recommend_ambulances(db, incident)}


@contract_router.post("/dispatches", status_code=201)
async def contract_create_dispatch(payload: DispatchInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        return await dispatch_ambulance(db, payload.incident_id, payload.ambulance_id, user.user_id, payload.crew_member_id, payload.override_reason, manual=payload.override_reason is not None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@contract_router.patch("/dispatches/{dispatch_id}")
def contract_patch_dispatch(dispatch_id: UUID, payload: DispatchPatch, db: Session = Depends(get_db), _: User = Depends(current_user)):
    dispatch = get_or_404(db, Dispatch, Dispatch.dispatch_id, dispatch_id, "Dispatch")
    if payload.ambulance_id:
        assignment = get_or_404(db, DispatchAssignment, DispatchAssignment.dispatch_id, dispatch_id, "Assignment")
        unit = get_or_404(db, Ambulance, Ambulance.ambulance_id, payload.ambulance_id, "Unit")
        if unit.status != "available":
            raise HTTPException(status_code=400, detail="Replacement unit is not available")
        previous_unit = db.query(Ambulance).filter(Ambulance.ambulance_id == assignment.ambulance_id).first()
        if previous_unit:
            previous_unit.status = "available"
        assignment.ambulance_id = unit.ambulance_id
        unit.status = "dispatched"
    if payload.priority:
        dispatch.priority = payload.priority
    if payload.notes is not None:
        dispatch.notes = payload.notes
    db.commit()
    return dispatch


@contract_router.get("/dispatches/{dispatch_id}/eta")
async def contract_dispatch_eta(dispatch_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    dispatch = get_or_404(db, Dispatch, Dispatch.dispatch_id, dispatch_id, "Dispatch")
    assignment = get_or_404(db, DispatchAssignment, DispatchAssignment.dispatch_id, dispatch_id, "Assignment")
    ambulance = get_or_404(db, Ambulance, Ambulance.ambulance_id, assignment.ambulance_id, "Unit")
    incident = get_or_404(db, Incident, Incident.incident_id, dispatch.incident_id, "Incident")
    route = await get_route(float(ambulance.current_latitude), float(ambulance.current_longitude), float(incident.latitude), float(incident.longitude))
    return {"dispatch_id": dispatch_id, "eta_minutes": round(route["duration_minutes"], 1), "distance_km": round(route["distance_km"], 2)}


@contract_router.post("/dispatches/{dispatch_id}/messages", status_code=201)
def contract_send_message(dispatch_id: UUID, payload: MessageInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    get_or_404(db, Dispatch, Dispatch.dispatch_id, dispatch_id, "Dispatch")
    message = DispatchMessage(dispatch_id=dispatch_id, sender_id=user.user_id, message_text=payload.message)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@contract_router.get("/units/{unit_id}/dispatch/current")
def contract_current_dispatch(unit_id: UUID, db: Session = Depends(get_db), _: User = Depends(current_user)):
    assignment = db.query(DispatchAssignment).join(Dispatch, Dispatch.dispatch_id == DispatchAssignment.dispatch_id).filter(DispatchAssignment.ambulance_id == unit_id, Dispatch.dispatch_status.notin_(["completed", "cancelled"])).order_by(Dispatch.assigned_at.desc()).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="No active dispatch")
    return db.query(Dispatch).filter(Dispatch.dispatch_id == assignment.dispatch_id).first()


@contract_router.post("/routing/nearest-unit")
async def contract_nearest_unit(payload: dict, db: Session = Depends(get_db), _: User = Depends(current_user)):
    incident = Incident(latitude=payload["latitude"], longitude=payload["longitude"], incident_number="routing-preview", incident_type="routing-preview", priority=payload.get("priority", "medium"), severity="moderate", incident_time=utc_now(), status="new")
    return {"recommendations": await recommend_ambulances(db, incident)}


@contract_router.get("/routing/eta")
async def contract_routing_eta(origin: str, destination: str, _: User = Depends(current_user)):
    start_lat, start_lng = (float(value) for value in origin.split(","))
    end_lat, end_lng = (float(value) for value in destination.split(","))
    route = await get_route(start_lat, start_lng, end_lat, end_lng)
    return {"distance_km": round(route["distance_km"], 2), "eta_minutes": round(route["duration_minutes"], 1)}


@contract_router.get("/routing/navigation")
async def contract_routing_navigation(unit_id: UUID, destination: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    unit = get_or_404(db, Ambulance, Ambulance.ambulance_id, unit_id, "Unit")
    end_lat, end_lng = (float(value) for value in destination.split(","))
    route = await get_route(float(unit.current_latitude), float(unit.current_longitude), end_lat, end_lng)
    return {"unit_id": unit_id, "coordinates": route.get("coordinates", []), "eta_minutes": round(route["duration_minutes"], 1)}
