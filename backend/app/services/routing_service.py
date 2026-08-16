import os

import httpx


CANDIDATE_OSRM_URLS = [
    os.getenv("OSRM_URL", "http://localhost:5000"),
    "http://osrm:5000",
]


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

            if response.status_code >= 400:
                last_error = RuntimeError(
                    f"OSRM request failed for {base_url}: {response.status_code} {response.text}"
                )
                continue

            data = response.json()

            if data.get("code") != "Ok":
                last_error = RuntimeError(
                    f"OSRM routing failed for {base_url}: {data}"
                )
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

    if last_error is not None:
        raise RuntimeError(f"Unable to reach OSRM: {last_error}")

    raise RuntimeError("Unable to reach OSRM")