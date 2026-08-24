from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect

from .database import Base, SessionLocal, engine
from .auth import ensure_default_roles
from .models import Ambulance, Hospital, Incident 
from .api import admin, assessments, ambulances, authentication, calls, dispatch, hospitals, incidents, patients, protocols
from .services.mqtt_service import connect_mqtt
from .services.websocket_manager import manager

app = FastAPI(
    title="Ambulance CAD API",
    version="0.1.0",
    description="Computer-Aided Dispatch backend for an EMS/ambulance system.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://localhost:5174"
                   ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    with SessionLocal.begin() as db:
        ensure_default_roles(db)
    connect_mqtt()

@app.get("/health")
def health():
    return {"status": "ok", "service": "cad-backend"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)


app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(ambulances.router, prefix="/api/ambulances", tags=["Ambulances"])
app.include_router(dispatch.router, prefix="/api/dispatch", tags=["Dispatch"])
app.include_router(calls.router, prefix="/api/calls", tags=["Emergency Calls"])
app.include_router(hospitals.router, prefix="/api/hospitals", tags=["Hospitals"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(assessments.router, prefix="/api", tags=["Prehospital Assessments"])
app.include_router(admin.router, prefix="/api/admin", tags=["Administration"])

# Versioned contract routes live alongside their MVP domain modules.
app.include_router(authentication.router, prefix="/api/v1", tags=["Authentication"])
app.include_router(admin.contract_router, prefix="/api/v1", tags=["Administration"])
app.include_router(calls.contract_router, prefix="/api/v1", tags=["Emergency Calls"])
app.include_router(incidents.contract_router, prefix="/api/v1", tags=["Incidents"])
app.include_router(ambulances.contract_router, prefix="/api/v1", tags=["Vehicles"])
app.include_router(dispatch.contract_router, prefix="/api/v1", tags=["Dispatch"])
app.include_router(hospitals.contract_router, prefix="/api/v1", tags=["Hospitals"])
app.include_router(protocols.router, prefix="/api/v1", tags=["Protocols"])
