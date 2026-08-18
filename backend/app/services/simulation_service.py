import threading
import time
import math
from typing import Dict, Any, List

from ..database import SessionLocal
from ..models import Ambulance
from . import mqtt_service


class SimulationManager:
    def __init__(self):
        self.enabled = False
        self._running = False
        self._thread = None
        self.states: Dict[str, Dict[str, Any]] = {}

        # default movement parameters
        self.MOVE_STEP = 0.00025
        self.TARGET_REACHED_DISTANCE = 0.0003

        # Register callback so incoming dispatch MQTT messages
        # are routed to the simulation manager when simulation
        # runs in-process.
        try:
            mqtt_service.register_dispatch_callback(self.handle_dispatch)
        except Exception:
            # If mqtt_service not yet fully available at import
            # time, the connect path will set up subscriptions later.
            pass

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None

    def set_enabled(self, value: bool):
        if value and not self.enabled:
            # initialize states from DB when enabling so we don't
            # overwrite DB values with simulator defaults
            self._initialize_states()
        self.enabled = bool(value)

    def _initialize_states(self):
        db = SessionLocal()
        try:
            ambulances = db.query(Ambulance).all()
            for amb in ambulances:
                self.states[amb.code] = {
                    "id": amb.id,
                    "code": amb.code,
                    "latitude": float(amb.latitude) if amb.latitude is not None else 30.0444,
                    "longitude": float(amb.longitude) if amb.longitude is not None else 31.2357,
                    "status": amb.status or "available",
                    "target_lat": None,
                    "target_lon": None,
                    "route": [],
                }
        finally:
            db.close()

    def handle_dispatch(self, ambulance_code: str, payload: dict):
        # Called when a dispatch MQTT message arrives for an ambulance.
        state = self.states.get(ambulance_code)
        if not state:
            # If ambulance unknown, try to initialize that single ambulance from DB
            db = SessionLocal()
            try:
                amb = db.query(Ambulance).filter(Ambulance.code == ambulance_code).first()
                if amb:
                    self.states[ambulance_code] = {
                        "id": amb.id,
                        "code": amb.code,
                        "latitude": float(amb.latitude) if amb.latitude is not None else 30.0444,
                        "longitude": float(amb.longitude) if amb.longitude is not None else 31.2357,
                        "status": amb.status or "available",
                        "target_lat": None,
                        "target_lon": None,
                        "route": [],
                    }
                    state = self.states[ambulance_code]
            finally:
                db.close()

        if not state:
            return

        # payload may include a route (list of [lon, lat]) same as the simulator
        route = payload.get("route") or []
        if route:
            # Convert to list of (lat, lon)
            try:
                state["route"] = [(float(pt[1]), float(pt[0])) for pt in route]
            except Exception:
                state["route"] = []

            if state["route"]:
                state["target_lat"], state["target_lon"] = state["route"][0]
                state["status"] = "en_route"
                return

        # If no route, but latitude/longitude provided
        if "latitude" in payload and "longitude" in payload:
            try:
                state["target_lat"] = float(payload["latitude"])
                state["target_lon"] = float(payload["longitude"])
                state["status"] = "en_route"
            except Exception:
                pass

    def _move_towards(self, state: Dict[str, Any], target_lat: float, target_lon: float):
        lat = state["latitude"]
        lon = state["longitude"]
        lat_delta = target_lat - lat
        lon_delta = target_lon - lon
        distance = math.hypot(lat_delta, lon_delta)

        if distance <= self.TARGET_REACHED_DISTANCE:
            state["latitude"] = target_lat
            state["longitude"] = target_lon
            print(f"Simulation arrived for {state.get('code')}: {state['latitude']}, {state['longitude']}")
            return True

        step_ratio = min(self.MOVE_STEP / distance, 1.0)
        new_lat = lat + lat_delta * step_ratio
        new_lon = lon + lon_delta * step_ratio
        print(f"Simulation move for {state.get('code')}: {lat},{lon} -> {new_lat},{new_lon} (step_ratio={step_ratio})")
        state["latitude"] = new_lat
        state["longitude"] = new_lon
        return False

    def _run_loop(self):
        # main simulation loop
        refresh_counter = 0
        while self._running:
            try:
                if self.enabled:
                    # periodically refresh known ambulances from DB
                    if refresh_counter % 6 == 0:
                        self._initialize_states()

                    for code, state in list(self.states.items()):
                        try:
                            # follow route points first
                            if state.get("route"):
                                next_lat, next_lon = state["route"][0]
                                arrived = self._move_towards(state, next_lat, next_lon)
                                if arrived:
                                    state["route"].pop(0)
                                    if not state["route"]:
                                        state["status"] = "busy"
                                        state["target_lat"] = None
                                        state["target_lon"] = None
                                    else:
                                        state["status"] = "en_route"
                                else:
                                    state["status"] = "en_route"

                            elif state.get("target_lat") is not None and state.get("target_lon") is not None:
                                arrived = self._move_towards(state, state["target_lat"], state["target_lon"])
                                if arrived:
                                    state["status"] = "busy"
                                    state["target_lat"] = None
                                    state["target_lon"] = None
                                else:
                                    state["status"] = "en_route"

                            else:
                                if state.get("status") in {"en_route", "busy", "dispatched"}:
                                    # keep status as-is for busy/en_route/dispatched
                                    pass
                                else:
                                    state["status"] = "available"

                            # publish telemetry via mqtt_service helper so the rest
                            # of the backend (mqtt_service) will process it and
                            # update the DB and websockets as normal.
                            try:
                                print(f"Simulation publishing telemetry for {code}: {state['latitude']}, {state['longitude']} | {state['status']}")
                                mqtt_service.publish_telemetry(
                                    state["code"], state["latitude"], state["longitude"], state["status"]
                                )
                            except Exception as e:
                                print(f"Failed to publish telemetry for {code}: {e}")

                            # ALSO update the database directly to ensure the
                            # ambulance rows reflect the simulation state even if
                            # the MQTT broker does not loop back the publish to
                            # the same client or there's a delivery issue.
                            try:
                                db = SessionLocal()
                                try:
                                    amb = db.query(Ambulance).filter(Ambulance.code == state['code']).first()
                                    if amb:
                                        amb.latitude = float(state['latitude'])
                                        amb.longitude = float(state['longitude'])
                                        amb.status = state.get('status', amb.status)
                                        db.commit()
                                        print(f"Simulation DB-updated ambulance {state['code']}: {amb.latitude}, {amb.longitude}")
                                finally:
                                    db.close()
                            except Exception as e:
                                print(f"Failed to DB-update telemetry for {code}: {e}")

                        except Exception as e:
                            print(f"Simulation error for {code}: {e}")

                refresh_counter += 1
            except Exception as e:
                print(f"Simulation loop error: {e}")

            # simulation tick
            time.sleep(5)


# Singleton manager instance used by the API and main startup
manager = SimulationManager()


def start_manager():
    manager.start()
    return manager
