# Ambulance CAD Frontend

Production-style React/Vite frontend scaffold for an ambulance/EMS Computer-Aided Dispatch system.

## Run

```bash
npm install
npm run dev
```

## Backend authentication

The login screen authenticates against `VITE_API_URL` (or `VITE_API_BASE_URL`) and stores the returned bearer token as `access_token` in `localStorage`. The selected role must be present in the authenticated user's backend `roles`. Supported route keys:

- `call-taker`
- `dispatcher`
- `paramedic`
- `hospital`
- `operations`
- `fleet`
- `admin`

## Architecture

- `src/context/CadContext.jsx` is the mock domain state boundary.
- Replace its mock actions with API clients/WebSocket subscriptions when the backend is ready.
- `MapPanel.jsx` is the Leaflet integration boundary. It currently renders a deterministic CAD map surface and accepts `units`, `incidents`, `routes`, and `markers`-style data through props.
- OSRM should provide route/ETA data; MQTT/WebSocket should provide live unit state; FastAPI should expose REST/domain commands; PostGIS should remain the geospatial persistence layer.
- No routing algorithm or OSRM behavior is faked.

## Role routes

`/login`, `/call-taker`, `/dispatcher`, `/paramedic`, `/hospital`, `/operations`, `/fleet`, `/admin`.

Route guards enforce the authenticated backend role and redirect unauthorized workspace access back to the user's own role. The backend must allow the frontend's localhost origin through CORS.

## Visual system

Dark navy CAD palette, 8px spacing rhythm, 60px global header, thin borders, high-contrast emergency priority/status states, desktop command-center layouts, and mobile-oriented Paramedic workspace.
