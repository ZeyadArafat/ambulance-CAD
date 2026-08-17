from fastapi import APIRouter
from pydantic import BaseModel

from ..services.simulation_service import manager

router = APIRouter(tags=["Simulation"])


class SimulationStatus(BaseModel):
    enabled: bool


@router.get("/", response_model=SimulationStatus)
def get_simulation_status():
    return {"enabled": bool(manager.enabled)}


class SimulationRequest(BaseModel):
    enabled: bool


@router.post("/", response_model=SimulationStatus)
def set_simulation_status(request: SimulationRequest):
    manager.set_enabled(request.enabled)
    return {"enabled": bool(manager.enabled)}
