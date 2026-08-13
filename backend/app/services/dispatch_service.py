from math import radians, sin, cos, sqrt, atan2


def calculate_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate the approximate distance between two GPS coordinates
    using the Haversine formula.

    Returns:
        Distance in kilometers.
    """

    earth_radius_km = 6371.0

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)

    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad)
        * cos(lat2_rad)
        * sin(delta_lon / 2) ** 2
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    return earth_radius_km * c


def estimate_eta_minutes(distance_km: float) -> float:
    """
    Estimate ambulance travel time.

    This is only a temporary approximation.
    Later we will replace it with OSRM road-network ETA.
    """

    assumed_speed_kmh = 40

    return (distance_km / assumed_speed_kmh) * 60