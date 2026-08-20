from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Dispatch, DispatchAssignment, Incident
from ..services.dispatch_service import dispatch_ambulance, recommend_ambulances
from ..services.routing_service import get_route

router = APIRouter()


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
    ).first()
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
    ).filter(Dispatch.incident_id == incident_id).first()
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
