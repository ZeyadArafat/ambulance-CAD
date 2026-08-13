from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import Incident
from ..services.dispatch_service import (
    recommend_ambulances, dispatch_ambulance
)


router = APIRouter(
    prefix="/api/dispatch",
    tags=["Dispatch"],
)


@router.get(
    "/recommend/{incident_id}"
)
async def recommend(
    incident_id: int,
    db: Session = Depends(get_db),
):

    incident = (
        db.query(Incident)
        .filter(
            Incident.id == incident_id
        )
        .first()
    )

    if not incident:
        raise HTTPException(
            status_code=404,
            detail="Incident not found",
        )

    recommendations = (
        await recommend_ambulances(
            db,
            incident,
        )
    )

    return {
        "incident_id": incident.id,
        "recommendations":
            recommendations,
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

        raise HTTPException(
            status_code=400,
            detail=str(e),
        )