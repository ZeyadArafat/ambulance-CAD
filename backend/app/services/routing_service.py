import os
from math import asin, cos, radians, sin, sqrt

import httpx


CANDIDATE_OSRM_URLS = [
    os.getenv("OSRM_URL", "http://localhost:5000"),
    "http://osrm:5000",
]


def _fallback_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float):
    earth_radius_km = 6371.0
    lat_delta = radians(end_lat - start_lat)
    lon_delta = radians(end_lon - start_lon)
    start_lat_radians = radians(start_lat)
    end_lat_radians = radians(end_lat)
    haversine = sin(lat_delta / 2) ** 2 + cos(start_lat_radians) * cos(end_lat_radians) * sin(lon_delta / 2) ** 2
    distance_km = earth_radius_km * 2 * asin(sqrt(haversine))
    duration_minutes = max(1.0, distance_km / 35.0 * 60.0)
    return {
        "distance_km": distance_km,
        "duration_minutes": duration_minutes,
        "coordinates": [[start_lon, start_lat], [end_lon, end_lat]],
        "routing_source": "straight_line_fallback",
    }


async def get_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
):
    coordinates = (
        f"{start_lon},{start_lat};"
        f"{end_lon},{end_lat}"
    )

    last_error = None

    for base_url in dict.fromkeys(CANDIDATE_OSRM_URLS):
        url = f"{base_url}/route/v1/driving/{coordinates}"
        params = {
            "overview": "full",
            "geometries": "geojson",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    url,
                    params=params,
                )

            data = response.json()

            if data.get("code") != "Ok":
                last_error = RuntimeError(
                    f"OSRM routing failed for {base_url}: {data}"
                )
                if data.get("code") == "NoRoute":
                    continue
                continue

            route = data["routes"][0]
            geometry = route.get("geometry", {})

            return {
                "distance_km": route["distance"] / 1000,
                "duration_minutes": route["duration"] / 60,
                "coordinates": geometry.get("coordinates", []),
            }
        except Exception as exc:
            last_error = exc
            continue

    if last_error is not None and "NoRoute" not in str(last_error):
        raise RuntimeError(f"Unable to reach OSRM: {last_error}")

    return _fallback_route(start_lat, start_lon, end_lat, end_lon)