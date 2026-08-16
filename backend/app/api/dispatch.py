from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Dispatch, Incident
from ..services.dispatch_service import dispatch_ambulance, recommend_ambulances
from ..services.routing_service import get_route


router = APIRouter(tags=["Dispatch"])


class DispatchResponse(BaseModel):
    id: int
    incident_id: int
    ambulance_id: int
    status: str
    dispatched_at: datetime
    arrived_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class RouteResponse(BaseModel):
    incident_id: int
    ambulance_id: int
    ambulance_code: str
    distance_km: float
    eta_minutes: float
    coordinates: list[list[float]] | None = None


@router.get("/", response_model=list[DispatchResponse])
def list_dispatches(db: Session = Depends(get_db)):
    return db.query(Dispatch).order_by(Dispatch.id.desc()).all()


@router.get("/route/ambulance/{ambulance_id}", response_model=RouteResponse)
async def get_ambulance_route(ambulance_id: int, db: Session = Depends(get_db)):
    ambulance = db.query(Ambulance).filter(Ambulance.id == ambulance_id).first()
    if not ambulance:
        raise HTTPException(status_code=404, detail="Ambulance not found")

    incident = (
        db.query(Incident)
        .filter(
            Incident.assigned_ambulance_id == ambulance.id,
        )
        .order_by(Incident.id.desc())
        .first()
    )

    if not incident:
        raise HTTPException(status_code=400, detail="Ambulance has no assigned incident")

    route = await get_route(
        ambulance.latitude,
        ambulance.longitude,
        incident.latitude,
        incident.longitude,
    )

    return {
        "incident_id": incident.id,
        "ambulance_id": ambulance.id,
        "ambulance_code": ambulance.code,
        "distance_km": round(route["distance_km"], 2),
        "eta_minutes": round(route["duration_minutes"], 1),
        "coordinates": route.get("coordinates", []),
    }


@router.get("/route/incident/{incident_id}", response_model=RouteResponse)
async def get_incident_route(incident_id: int, db: Session = Depends(get_db)):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    if not incident.assigned_ambulance_id:
        raise HTTPException(status_code=400, detail="Incident has no assigned ambulance")

    ambulance = (
        db.query(Ambulance)
        .filter(Ambulance.id == incident.assigned_ambulance_id)
        .first()
    )
    if not ambulance:
        raise HTTPException(status_code=404, detail="Assigned ambulance not found")

    route = await get_route(
        ambulance.latitude,
        ambulance.longitude,
        incident.latitude,
        incident.longitude,
    )

    return {
        "incident_id": incident.id,
        "ambulance_id": ambulance.id,
        "ambulance_code": ambulance.code,
        "distance_km": round(route["distance_km"], 2),
        "eta_minutes": round(route["duration_minutes"], 1),
        "coordinates": route.get("coordinates", []),
    }


@router.get("/recommend/{incident_id}")
async def recommend(
    incident_id: int,
    db: Session = Depends(get_db),
):
    incident = db.query(Incident).filter(Incident.id == incident_id).first()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    recommendations = await recommend_ambulances(db, incident)

    return {
        "incident_id": incident.id,
        "recommendations": recommendations,
    }


class DispatchRequest(BaseModel):
    incident_id: int
    ambulance_id: int


@router.post("/dispatch")
def dispatch_ambulance_endpoint(
    request: DispatchRequest,
    db: Session = Depends(get_db),
):
    try:
        dispatch = dispatch_ambulance(
            db,
            request.incident_id,
            request.ambulance_id,
        )

        return {
            "success": True,
            "dispatch_id": dispatch.id,
            "incident_id": dispatch.incident_id,
            "ambulance_id": dispatch.ambulance_id,
            "status": dispatch.status,
            "dispatched_at": dispatch.dispatched_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))