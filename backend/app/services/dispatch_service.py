from datetime import timedelta

from sqlalchemy.orm import Session

from ..models import Ambulance, CrewMember, Dispatch, DispatchAssignment, Incident, User, utc_now
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
        .with_for_update()
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
        .with_for_update()
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

    if not db.query(User).filter(User.user_id == dispatcher_id, User.is_active.is_(True)).first():
        raise ValueError("Dispatcher not found or inactive")

    crew_member = db.query(CrewMember).filter(
        CrewMember.crew_member_id == crew_member_id,
        CrewMember.ambulance_id == ambulance_id,
        CrewMember.status == "active",
    ).first()
    if not crew_member:
        raise ValueError("Active crew member is not assigned to this ambulance")

    try:
        route = await get_route(
            float(ambulance.current_latitude),
            float(ambulance.current_longitude),
            float(incident.latitude),
            float(incident.longitude),
        )
    except Exception as exc:
        raise ValueError(f"Unable to calculate dispatch route: {exc}") from exc

    assigned_at = utc_now()
    eta_minutes = max(1, round(route["duration_minutes"]))

    dispatch = Dispatch(
        incident_id=incident.incident_id,
        dispatcher_id=dispatcher_id,
        assigned_at=assigned_at,
        eta_minutes=eta_minutes,
        estimated_arrival_time=assigned_at + timedelta(minutes=eta_minutes),
        dispatch_status="dispatched",
        priority=incident.priority,
        override_reason=override_reason,
    )

    db.add(dispatch)
    db.flush()

    assignment = DispatchAssignment(
        dispatch_id=dispatch.dispatch_id,
        ambulance_id=ambulance.ambulance_id,
        crew_member_id=crew_member_id,
        assigned_at=assigned_at,
        assignment_status="assigned",
    )
    db.add(assignment)

    ambulance.status = "dispatched"

    incident.status = "dispatched"

    db.commit()
    db.refresh(dispatch)

    route_coordinates = route.get("coordinates", []) if route else []

    try:
        publish_dispatch(
            ambulance.ambulance_code,
            str(incident.incident_id),
            float(incident.latitude),
            float(incident.longitude),
            incident.priority,
            route_coordinates,
        )
    except Exception:
        # The dispatch is durable; telemetry delivery can be retried by the broker/client.
        pass

    return dispatch


DISPATCH_TRANSITIONS = {
    "dispatched": {"en_route", "cancelled"},
    "en_route": {"arrived_scene", "cancelled"},
    "arrived_scene": {"transporting", "cancelled"},
    "transporting": {"arrived_hospital"},
    "arrived_hospital": {"completed"},
}


def transition_dispatch(db: Session, dispatch_id, next_status: str):
    dispatch = db.query(Dispatch).filter(Dispatch.dispatch_id == dispatch_id).with_for_update().first()
    if not dispatch:
        raise ValueError("Dispatch not found")
    if next_status not in DISPATCH_TRANSITIONS.get(dispatch.dispatch_status, set()):
        raise ValueError(f"Invalid dispatch transition: {dispatch.dispatch_status} -> {next_status}")

    assignment = db.query(DispatchAssignment).filter(
        DispatchAssignment.dispatch_id == dispatch_id
    ).with_for_update().first()
    if not assignment:
        raise ValueError("Dispatch assignment not found")
    ambulance = db.query(Ambulance).filter(Ambulance.ambulance_id == assignment.ambulance_id).with_for_update().first()
    incident = db.query(Incident).filter(Incident.incident_id == dispatch.incident_id).with_for_update().first()
    now = utc_now()

    dispatch.dispatch_status = next_status
    assignment.assignment_status = next_status
    if next_status == "en_route":
        assignment.en_route_at = now
    elif next_status == "arrived_scene":
        assignment.arrived_scene_at = now
        dispatch.actual_arrival_time = now
    elif next_status == "transporting":
        assignment.transporting_at = now
    elif next_status == "arrived_hospital":
        assignment.arrived_hospital_at = now
    elif next_status in {"completed", "cancelled"}:
        ambulance.status = "available"

    incident.status = "resolved" if next_status == "completed" else next_status
    db.commit()
    db.refresh(dispatch)
    return dispatch