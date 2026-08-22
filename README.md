# Ambulance CAD System

A comprehensive Computer-Aided Dispatch (CAD) system for Emergency Medical Services (EMS) operations. This system enables real-time ambulance tracking, intelligent incident dispatch, and route optimization across geographic regions.

## 🎯 Project Overview

Ambulance CAD is an MVP (Minimum Viable Product) foundation designed to modernize emergency response coordination. It combines real-time location tracking, intelligent dispatch algorithms, and interactive mapping to optimize emergency response times and resource allocation.

### Key Features

- **Real-time Ambulance Tracking**: Monitor ambulance locations and status updates via MQTT telemetry
- **Incident Management**: Create, prioritize, and track emergency incidents with detailed information
- **Intelligent Dispatch**: Automatic ambulance recommendations based on proximity and availability
- **Route Optimization**: OSRM-based routing for accurate ETAs and optimal navigation paths
- **Live Dashboard**: React-based dispatcher interface with Leaflet maps for situational awareness
- **WebSocket Updates**: Real-time push notifications for system events and status changes
- **Geographic Database**: PostGIS-enabled PostgreSQL for spatial queries and proximity searches

## 🏗️ System Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React + Vite + Leaflet | Dispatcher map interface and incident management UI |
| **Backend** | FastAPI | RESTful API for ambulance, incident, and dispatch operations |
| **Database** | PostgreSQL + PostGIS | Relational storage with geographic/spatial capabilities |
| **Messaging** | Mosquitto MQTT | Real-time telemetry from ambulances and field devices |
| **WebSocket** | FastAPI WebSockets | Live updates to connected dispatcher clients |
| **Routing** | OSRM (Open Source Routing Machine) | Route calculation and ETA estimation |
| **Simulation** | Python Simulator | Test ambulance behavior and system load testing |
| **Containerization** | Docker + Docker Compose | Unified deployment and environment consistency |

### Project Structure

```
ambulance-CAD/
├── backend/                 # FastAPI application
│   ├── app/
│   │   ├── api/            # API endpoints (ambulances, incidents, dispatch)
│   │   ├── services/       # Business logic (dispatch, routing, MQTT, WebSockets)
│   │   ├── models.py       # Database models
│   │   ├── database.py     # Database configuration
│   │   └── main.py         # FastAPI application entry point
│   ├── requirements.txt    # Python dependencies
│   └── Dockerfile          # Container configuration
├── frontend/               # React + Vite application
│   ├── src/
│   │   ├── components/     # React components (Map, Panels, UI)
│   │   ├── App.jsx         # Main application component
│   │   └── main.jsx        # React entry point
│   ├── package.json        # Node dependencies
│   └── vite.config.js      # Vite build configuration
├── ambulance/              # Simulation and utilities
│   └── simulator/          # Ambulance behavior simulator
├── infrastructure/         # External services configuration
│   ├── mosquitto/          # MQTT broker configuration
│   └── osrm/               # Routing engine data (Egypt map)
└── docker-compose.yml      # Multi-container orchestration
```

## 🚀 Quick Start

### Prerequisites

- Docker Desktop or Docker Engine
- Docker Compose v2.0+
- Git

### Installation & Deployment

1. **Clone and navigate to project**:
   ```bash
   cd ambulance-CAD
   ```

2. **Start all services**:
   ```bash
   docker compose up --build
   ```

   This command will:
   - Build the FastAPI backend container
   - Start PostgreSQL with PostGIS extension
   - Initialize Mosquitto MQTT broker
   - Start OSRM routing service with Egypt map data
   - Launch the React frontend development server

3. **Verify services are running**:
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Health Check: http://localhost:8000/health
   - Frontend: http://localhost:5173 (typical Vite port)

### Database Configuration

PostgreSQL credentials (configured in docker-compose.yml):
- **Host**: localhost
- **Port**: 5432
- **Database**: cad
- **User**: cad
- **Password**: cad_password

### MQTT Broker

Mosquitto MQTT broker for ambulance telemetry:
- **Host**: localhost
- **Port**: 1883
- **Protocol**: MQTT v3.1.1

## 📡 API Usage Examples

### Create an Ambulance

```bash
curl -X POST http://localhost:8000/api/ambulances/ \
  -H "Content-Type: application/json" \
  -d '{
    "code": "AMB-001",
    "status": "available",
    "ambulance_type": "advanced_life_support",
    "latitude": 30.0444,
    "longitude": 31.2357
  }'
```

### Create an Incident

```bash
curl -X POST http://localhost:8000/api/incidents/ \
  -H "Content-Type: application/json" \
  -d '{
    "priority": "high",
    "incident_type": "traffic_accident",
    "description": "Two-car collision on Ring Road",
    "latitude": 30.0500,
    "longitude": 31.2400
  }'
```

### Interactive API Documentation

After starting the services, visit http://localhost:8000/docs to access the Swagger UI where you can:
- View all available endpoints
- Read detailed parameter descriptions
- Execute API calls directly from the browser
- View response examples

## 📋 Development Roadmap

### Current Status: MVP Phase

**Completed**:
- ✅ Basic FastAPI backend structure
- ✅ PostgreSQL + PostGIS database schema
- ✅ MQTT broker infrastructure
- ✅ OSRM routing data (Egypt)
- ✅ API endpoints for ambulances, incidents, dispatch
- ✅ React component architecture

**In Progress / Planned**:
1. **Ambulance Telemetry** - MQTT-based real-time location and status updates
2. **WebSocket Live Updates** - Push-based dispatcher notifications
3. **Dispatcher Dashboard** - Interactive React map with incident/ambulance visualization
4. **Route Optimization** - OSRM integration for ETA and path calculation
5. **Intelligent Dispatch** - Automatic ambulance recommendation algorithms
6. **Ambulance Simulator** - Load testing and scenario simulation
7. **CAN Gateway** - Integration with vehicle diagnostics

## 🔧 Development

### Backend Development

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run development server
cd backend
python -m uvicorn app.main:app --reload
```

To create the initial admin account when the database has no users:

```bash
docker compose exec backend python seed.py
```

The defaults are `admin` / `admin123` / `admin@example.com`. Set `CAD_ADMIN_USERNAME`,
`CAD_ADMIN_PASSWORD`, and `CAD_ADMIN_EMAIL` before running the seed to override them.

### Frontend Development

```bash
# Install dependencies
cd frontend
npm install

# Run dev server
npm run dev
```

## 📚 Key Components

### Backend Services

- **dispatch_service.py**: Dispatch logic and ambulance assignment algorithms
- **mqtt_service.py**: MQTT publisher/subscriber for ambulance telemetry
- **routing_service.py**: OSRM API client for route planning and ETA calculation
- **websocket_manager.py**: WebSocket connection management for real-time updates

### Frontend Components

- **MapView.jsx**: Leaflet-based map display for ambulances and incidents
- **DispatchPanel.jsx**: Dispatcher controls and incident management
- **AmbulancePanel.jsx**: Ambulance fleet status and details
- **IncidentPanel.jsx**: Incident creation and status tracking
- **Header.jsx**: Navigation and system status

## 📦 Deployment

The entire system is containerized and deployed via Docker Compose. Each service runs in its own container with persistent volumes for data durability.

### Services

- **backend**: FastAPI application on port 8000
- **frontend**: React dev server on port 5173
- **db**: PostgreSQL on port 5432
- **mqtt**: Mosquitto on port 1883
- **osrm**: Routing engine on port 5000

## 🤝 Contributing

This project is under active development. For contributions:
1. Create a feature branch from `main`
2. Make your changes following the existing code structure
3. Test thoroughly in the Docker environment
4. Submit a pull request with a clear description

## 📄 License

- Feel free to use this pice of software anyware and any time.

## 📞 Support & Documentation

For issues, questions, or feature requests, please open an issue on the project repository.

---

**Last Updated**: 2026-08-16  
**Project Status**: MVP Phase - Active Development
