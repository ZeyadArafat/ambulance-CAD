import httpx


OSRM_URL = "http://osrm:5000"


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

    url = f"{OSRM_URL}/route/v1/driving/{coordinates}"

    params = {
        "overview": "false",
        "geometries": "geojson",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            url,
            params=params,
        )

    response.raise_for_status()

    data = response.json()

    if data.get("code") != "Ok":
        raise RuntimeError(
            f"OSRM routing failed: {data}"
        )

    route = data["routes"][0]
    geometry = route.get("geometry", {})

    return {
        "distance_km": route["distance"] / 1000,
        "duration_minutes": route["duration"] / 60,
        "coordinates": geometry.get("coordinates", []),
    }