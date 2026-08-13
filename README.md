# Ambulance CAD System

Initial MVP foundation for an EMS Computer-Aided Dispatch system.

## Current components

- React/Leaflet frontend: to be added
- FastAPI CAD backend
- PostgreSQL + PostGIS
- Mosquitto MQTT broker
- OSRM routing: to be added
- Ambulance simulator: to be added
- CAN gateway/simulator: to be added

## Start

Requirements:
- Docker Desktop
- Docker Compose

From the project root:

```bash
docker compose up --build
```

Backend:
- API: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- Health: http://localhost:8000/health

PostgreSQL:
- host: localhost
- port: 5432
- database: cad
- user: cad
- password: cad_password

MQTT:
- host: localhost
- port: 1883

## Test the API

Create an ambulance:

```bash
curl -X POST http://localhost:8000/api/ambulances/ \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"AMB-001\",\"status\":\"available\",\"ambulance_type\":\"advanced_life_support\",\"latitude\":30.0444,\"longitude\":31.2357}"
```

Create an incident:

```bash
curl -X POST http://localhost:8000/api/incidents/ \
  -H "Content-Type: application/json" \
  -d "{\"priority\":\"high\",\"incident_type\":\"traffic_accident\",\"description\":\"Two-car collision\",\"latitude\":30.0500,\"longitude\":31.2400}"
```

Then open:

http://localhost:8000/docs

## Next milestone

Implement:
1. ambulance status/location MQTT telemetry
2. WebSocket live updates
3. React dispatcher map
4. OSRM routing and ETA
5. automatic ambulance recommendation
