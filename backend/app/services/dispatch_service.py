from sqlalchemy.orm import Session
from ..models import Ambulance, Dispatch, DispatchAssignment, Incident, utc_now
from .mqtt_service import publish_dispatch
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
                float(ambulance.current_latitude),
                float(ambulance.current_longitude),
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
                "ambulance_id": ambulance.ambulance_id,
                "code": ambulance.ambulance_code,
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


async def dispatch_ambulance(
    db: Session,
    incident_id,
    ambulance_id,
    dispatcher_id,
    crew_member_id,
    override_reason: str | None = None,
    manual: bool = False,
):

    incident = (
        db.query(Incident)
        .filter(
            Incident.incident_id == incident_id
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
            Ambulance.ambulance_id == ambulance_id
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
        incident_id=incident.incident_id,
        dispatcher_id=dispatcher_id,
        assigned_at=utc_now(),
        dispatch_status="dispatched",
        priority=incident.priority,
        override_reason=override_reason,
    )

    db.add(dispatch)

    assignment = DispatchAssignment(
        dispatch_id=dispatch.dispatch_id,
        ambulance_id=ambulance.ambulance_id,
        crew_member_id=crew_member_id,
        assigned_at=dispatch.assigned_at,
        assignment_status="assigned",
    )
    db.add(assignment)

    ambulance.status = "dispatched"

    incident.status = "dispatched"

    db.commit()
    db.refresh(dispatch)

    route = await get_route(
        float(ambulance.current_latitude),
        float(ambulance.current_longitude),
        incident.latitude,
        incident.longitude,
    )

    route_coordinates = route.get("coordinates", []) if route else []

    publish_dispatch(
        ambulance.ambulance_code,
        str(incident.incident_id),
        incident.latitude,
        incident.longitude,
        incident.priority,
        route_coordinates,
    )

    return dispatch