from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine
from .models import Ambulance, Hospital, Incident  # noqa: F401
from .api import incidents, ambulances, dispatch
from .services.mqtt_service import connect_mqtt

app = FastAPI(
    title="Ambulance CAD API",
    version="0.1.0",
    description="Computer-Aided Dispatch backend for an EMS/ambulance system.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this in production.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    connect_mqtt()  # Connect to the MQTT broker on startup


@app.get("/health")
def health():
    return {"status": "ok", "service": "cad-backend"}


app.include_router(incidents.router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(ambulances.router, prefix="/api/ambulances", tags=["Ambulances"])
app.include_router(dispatch.router, prefix="/api/dispatch", tags=["Dispatch"])
