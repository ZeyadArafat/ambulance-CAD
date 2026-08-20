from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import current_user, require_roles
from ..database import get_db
from ..models import User

router = APIRouter()


class TriageProtocol(BaseModel):
    priorities: list[str] = ["critical", "high", "medium", "low"]
    response_targets_minutes: dict[str, int] = Field(default_factory=lambda: {"critical": 8, "high": 15, "medium": 30, "low": 60})


class RecommendationProtocol(BaseModel):
    eta_weight: float = 1.0
    distance_weight: float = 0.0
    search_radius_km: float = 50.0


triage_config = TriageProtocol()
recommendation_config = RecommendationProtocol()


@router.get("/protocols/triage", response_model=TriageProtocol)
def get_triage(_: User = Depends(current_user)):
    return triage_config


@router.patch("/protocols/triage", response_model=TriageProtocol)
def set_triage(payload: TriageProtocol, _: User = Depends(require_roles("admin", "supervisor"))):
    global triage_config
    triage_config = payload
    return triage_config


@router.get("/protocols/dispatch-recommendation", response_model=RecommendationProtocol)
def get_recommendation_protocol(_: User = Depends(current_user)):
    return recommendation_config


@router.patch("/protocols/dispatch-recommendation", response_model=RecommendationProtocol)
def set_recommendation_protocol(payload: RecommendationProtocol, _: User = Depends(require_roles("admin", "supervisor"))):
    global recommendation_config
    recommendation_config = payload
    return recommendation_config
