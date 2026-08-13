from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ambulance, Incident
from ..services.dispatch_service import (
    calculate_distance_km,
    estimate_eta_minutes,
)
from ..services.routing_service import get_route
from ..services.mqtt_service import publish_dispatch

router = APIRouter()


class DispatchAssignment(BaseModel):
    incident_id: int
    ambulance_id: int


@router.get("/recommend/{incident_id}")
async def recommend_ambulance(
    incident_id: int,
    db: Session = Depends(get_db),
):
    # 1. Find the incident
    incident = (
        db.query(Incident)
        .filter(Incident.id == incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    # 2. Find available ambulances
    ambulances = (
        db.query(Ambulance)
        .filter(Ambulance.status == "available")
        .all()
    )

    if not ambulances:
        return {
            "incident_id": incident.id,
            "recommendations": [],
            "message": "No available ambulances",
        }

    recommendations = []

    # 3. Calculate distance for every available ambulance
    for ambulance in ambulances:

        # Ignore ambulances without GPS coordinates
        if ambulance.latitude is None or ambulance.longitude is None:
            continue

        route = await get_route(
            ambulance.latitude,
            ambulance.longitude,
            incident.latitude,
            incident.longitude,
        )

        distance = route["distance_km"]
        eta = route["duration_minutes"]

        recommendations.append(
            {
                "ambulance_id": ambulance.id,
                "code": ambulance.code,
                "ambulance_type": ambulance.ambulance_type,
                "distance_km": round(distance, 2),
                "eta_minutes": round(eta, 1),
                "status": ambulance.status,
            }
        )

    # 4. Sort by distance
    recommendations.sort(
        key=lambda ambulance: ambulance["distance_km"]
    )

    return {
        "incident_id": incident.id,
        "incident_priority": incident.priority,
        "incident_type": incident.incident_type,
        "recommendations": recommendations,
    }


@router.post("/assign")
def assign_ambulance(
    assignment: DispatchAssignment,
    db: Session = Depends(get_db),
):
    # 1. Find incident
    incident = (
        db.query(Incident)
        .filter(Incident.id == assignment.incident_id)
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    # 2. Find ambulance
    ambulance = (
        db.query(Ambulance)
        .filter(Ambulance.id == assignment.ambulance_id)
        .first()
    )

    if not ambulance:
        raise HTTPException(
            status_code=404,
            detail="Ambulance not found",
        )

    # 3. Make sure ambulance is available
    if ambulance.status != "available":
        raise HTTPException(
            status_code=409,
            detail="Ambulance is not available",
        )

    # 4. Assign ambulance
    incident.assigned_ambulance_id = ambulance.id
    incident.status = "dispatched"

    ambulance.status = "dispatched"

    # 5. Save changes
    db.commit()

    publish_dispatch(
        ambulance_code=ambulance.code,
        incident_id=incident.id,
        latitude=incident.latitude,
        longitude=incident.longitude,
        priority=incident.priority,
    )

    return {
        "message": "Ambulance successfully dispatched",
        "incident_id": incident.id,
        "ambulance_id": ambulance.id,
        "ambulance_code": ambulance.code,
        "incident_status": incident.status,
        "ambulance_status": ambulance.status,
    }