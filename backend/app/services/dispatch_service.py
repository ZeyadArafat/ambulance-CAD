from sqlalchemy.orm import Session
from datetime import datetime


from ..models import Ambulance, Incident,Dispatch, utc_now
from .routing_service import get_route


PRIORITY_WEIGHT = {
    "critical": 1.5,
    "high": 1.3,
    "medium": 1.0,
    "low": 0.8,
}


def get_available_ambulances(db: Session):

    return (
        db.query(Ambulance)
        .filter(
            Ambulance.status == "available"
        )
        .all()
    )


def calculate_score(
    eta_minutes: float,
    ambulance: Ambulance,
    incident: Incident,
):

    score = eta_minutes

    priority_multiplier = PRIORITY_WEIGHT.get(
        incident.priority,
        1.0,
    )

    # Critical incidents benefit more
    # from advanced life support.
    if (
        incident.priority == "critical"
        and ambulance.ambulance_type
        == "advanced_life_support"
    ):
        score *= 0.7

    elif (
        incident.priority == "critical"
        and ambulance.ambulance_type
        == "basic_life_support"
    ):
        score *= 1.3

    score /= priority_multiplier

    return round(score, 2)


async def recommend_ambulances(
    db: Session,
    incident: Incident,
):

    ambulances = get_available_ambulances(db)

    recommendations = []

    for ambulance in ambulances:
        try:
            route = await get_route(
                ambulance.latitude,
                ambulance.longitude,
                incident.latitude,
                incident.longitude,
            )
        except Exception:
            continue

        if not route:
            continue

        eta_minutes = route["duration_minutes"]

        distance_km = route["distance_km"]

        score = calculate_score(
            eta_minutes,
            ambulance,
            incident,
        )

        recommendations.append(
            {
                "ambulance_id": ambulance.id,
                "code": ambulance.code,
                "ambulance_type":
                    ambulance.ambulance_type,
                "eta_minutes":
                    round(eta_minutes, 1),
                "distance_km":
                    round(distance_km, 2),
                "score": score,
            }
        )

    recommendations.sort(
        key=lambda x: x["score"]
    )

    return recommendations


def dispatch_ambulance(
    db: Session,
    incident_id: int,
    ambulance_id: int,
    manual: bool = False,
):

    incident = (
        db.query(Incident)
        .filter(
            Incident.id == incident_id
        )
        .first()
    )

    if not incident:
        raise ValueError(
            "Incident not found"
        )

    ambulance = (
        db.query(Ambulance)
        .filter(
            Ambulance.id == ambulance_id
        )
        .first()
    )

    if not ambulance:
        raise ValueError(
            "Ambulance not found"
        )

    if ambulance.status != "available":
        raise ValueError(
            "Ambulance is not available"
        )

    if incident.status not in [
        "new",
        "pending",
    ]:
        raise ValueError(
            "Incident has already been dispatched"
        )

    dispatch = Dispatch(
        incident_id=incident.id,
        ambulance_id=ambulance.id,
        status="dispatched",
        dispatched_at=utc_now(),
    )

    db.add(dispatch)

    ambulance.status = "dispatched"

    incident.status = "dispatched"
    incident.assigned_ambulance_id = ambulance.id

    db.commit()

    db.refresh(dispatch)

    return dispatch