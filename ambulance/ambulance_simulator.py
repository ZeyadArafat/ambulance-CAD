import json
import math
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib import request, parse

import paho.mqtt.client as mqtt
import sys
from pathlib import Path
from sqlalchemy.orm import Session

# Database imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from backend.app.database import SessionLocal, engine
from backend.app.models import Ambulance, Base, Incident

# Ensure tables exist
Base.metadata.create_all(bind=engine)

MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_HOST_CANDIDATES = [
    os.getenv("MQTT_HOST"),
    "mosquitto",
    "localhost",
]
MQTT_HOST_CANDIDATES = [
    host for host in MQTT_HOST_CANDIDATES if host
]

TARGET_REACHED_DISTANCE = 0.0003
MOVE_STEP = 0.00025

# Global state for each ambulance
ambulance_states = {}
ambulance_lock = threading.Lock()


def persist_ambulance_state(ambulance_code, state):
    db = SessionLocal()
    try:
        ambulance = db.query(Ambulance).filter(Ambulance.code == ambulance_code).first()
        if not ambulance:
            return

        ambulance.latitude = float(state["latitude"])
        ambulance.longitude = float(state["longitude"])
        ambulance.status = state["status"]
        db.commit()
    except Exception as exc:
        print(f"[{ambulance_code}] failed to persist ambulance state to database: {exc}")
    finally:
        db.close()


def publish_telemetry(client, ambulance_code):
    with ambulance_lock:
        if ambulance_code not in ambulance_states:
            return
        
        state = ambulance_states[ambulance_code]
        latitude = state["latitude"]
        longitude = state["longitude"]
        status = state["status"]

    location_topic = (
        f"cad/ambulance/"
        f"{ambulance_code}/location"
    )

    location_payload = {
        "ambulance": ambulance_code,
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "status": status,
    }

    client.publish(
        location_topic,
        json.dumps(location_payload),
        qos=1,
    )

    status_topic = (
        f"cad/ambulance/"
        f"{ambulance_code}/status"
    )

    status_payload = {
        "ambulance": ambulance_code,
        "status": status,
    }

    client.publish(
        status_topic,
        json.dumps(status_payload),
        qos=1,
    )

    print(
        f"[{ambulance_code}] telemetry published: "
        f"{latitude}, {longitude} | {status}"
    )


def on_connect(client, userdata, flags, reason_code, properties):
    ambulance_code = userdata.get("ambulance_code")
    print(f"[{ambulance_code}] Connected to MQTT broker")

    dispatch_topic = (
        f"cad/ambulance/{ambulance_code}/dispatch"
    )

    client.subscribe(dispatch_topic)

    print(f"[{ambulance_code}] Subscribed to {dispatch_topic}")


def on_message(client, userdata, message):
    ambulance_code = userdata.get("ambulance_code")

    print(f"\n[{ambulance_code}] DISPATCH RECEIVED")

    payload = json.loads(
        message.payload.decode()
    )

    print(json.dumps(payload, indent=2))

    with ambulance_lock:
        if ambulance_code not in ambulance_states:
            return

        state = ambulance_states[ambulance_code]

        route_points = payload.get("route") or []
        if route_points:
            state["route_points"] = [
                (float(point[1]), float(point[0]))
                for point in route_points
            ]

            if state["route_points"]:
                target_lat, target_lon = state["route_points"][0]
                state["target_latitude"] = target_lat
                state["target_longitude"] = target_lon
                state["status"] = "en_route"
                print(
                    f"[{ambulance_code}] en route along {len(state['route_points'])} waypoints"
                )

        if "latitude" in payload and "longitude" in payload and not route_points:
            state["target_latitude"] = float(payload["latitude"])
            state["target_longitude"] = float(payload["longitude"])
            state["status"] = "en_route"
            print(
                f"[{ambulance_code}] en route to "
                f"{state['target_latitude']}, {state['target_longitude']}"
            )

        if not route_points and (state["target_latitude"] is None or state["target_longitude"] is None):
            print(f"[{ambulance_code}] Dispatch payload missing target coordinates")

        persist_ambulance_state(ambulance_code, state)


def fetch_route_points(start_lat, start_lon, end_lat, end_lon):
    """Fetch the routed path from OSRM and return it as [(lat, lon), ...]."""
    candidate_urls = [
        os.getenv("OSRM_URL"),
        "http://osrm:5000",
        "http://localhost:5000",
    ]
    candidate_urls = [url for url in dict.fromkeys(candidate_urls) if url]

    coords = f"{start_lon},{start_lat};{end_lon},{end_lat}"
    query = parse.urlencode({"overview": "full", "geometries": "geojson"})

    for base_url in candidate_urls:
        url = f"{base_url}/route/v1/driving/{coords}?{query}"
        try:
            with request.urlopen(url, timeout=10) as response:
                data = json.loads(response.read().decode())

            if data.get("code") != "Ok":
                continue

            route = data.get("routes", [{}])[0]
            coords_list = route.get("geometry", {}).get("coordinates", [])
            if not coords_list:
                continue

            return [(float(point[1]), float(point[0])) for point in coords_list]
        except Exception:
            continue

    return []


def hydrate_state_from_assigned_incident(ambulance_code, state):
    """Resume movement for ambulances that were already dispatched before the simulator started."""
    if state["target_latitude"] is not None or state["target_longitude"] is not None:
        return

    if state["route_points"]:
        return

    db = SessionLocal()
    try:
        ambulance = db.query(Ambulance).filter(Ambulance.code == ambulance_code).first()
        if not ambulance:
            return

        incident = (
            db.query(Incident)
            .filter(Incident.assigned_ambulance_id == ambulance.id)
            .order_by(Incident.id.desc())
            .first()
        )

        if not incident:
            return

        route_points = fetch_route_points(
            state["latitude"],
            state["longitude"],
            float(incident.latitude),
            float(incident.longitude),
        )

        if route_points:
            state["route_points"] = route_points
            target_lat, target_lon = state["route_points"][0]
            state["target_latitude"] = target_lat
            state["target_longitude"] = target_lon
            state["status"] = "en_route"
            print(
                f"[{ambulance_code}] resumed route from assigned incident "
                f"{state['target_latitude']}, {state['target_longitude']}"
            )
            return

        state["target_latitude"] = float(incident.latitude)
        state["target_longitude"] = float(incident.longitude)
        state["status"] = "en_route"
        print(
            f"[{ambulance_code}] resumed from assigned incident "
            f"{state['target_latitude']}, {state['target_longitude']}"
        )
    except Exception as exc:
        print(f"[{ambulance_code}] failed to hydrate assigned incident state: {exc}")
    finally:
        db.close()


def simulate_ambulance(ambulance_code, initial_lat, initial_lon, initial_status):
    """Simulate a single ambulance"""
    
    # Initialize state
    with ambulance_lock:
        ambulance_states[ambulance_code] = {
            "latitude": initial_lat,
            "longitude": initial_lon,
            "status": initial_status,
            "target_latitude": None,
            "target_longitude": None,
            "route_points": [],
        }
        hydrate_state_from_assigned_incident(ambulance_code, ambulance_states[ambulance_code])
        persist_ambulance_state(ambulance_code, ambulance_states[ambulance_code])
    
    # Create MQTT client for this ambulance
    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=ambulance_code,
    )
    
    client.on_connect = on_connect
    client.on_message = on_message
    client.user_data_set({"ambulance_code": ambulance_code})
    
    # Connect to MQTT broker
    connected = False
    for host in MQTT_HOST_CANDIDATES:
        try:
            print(f"[{ambulance_code}] Trying MQTT broker at {host}:{MQTT_PORT}")
            client.connect(host, MQTT_PORT, 60)
            client.loop_start()
            connected = True
            print(f"[{ambulance_code}] Connected to MQTT broker at {host}:{MQTT_PORT}")
            break
        except Exception as exc:
            print(f"[{ambulance_code}] Failed to connect to {host}:{MQTT_PORT}: {exc}")
    
    if not connected:
        print(f"[{ambulance_code}] Could not connect to MQTT broker. Tried: {MQTT_HOST_CANDIDATES}")
        return
    
    print(f"[{ambulance_code}] simulator started")
    
    try:
        while True:
            with ambulance_lock:
                if ambulance_code not in ambulance_states:
                    break
                
                state = ambulance_states[ambulance_code]
                hydrate_state_from_assigned_incident(ambulance_code, state)
                
                # Handle route points
                if state["route_points"]:
                    next_lat, next_lon = state["route_points"][0]
                    lat_delta = next_lat - state["latitude"]
                    lon_delta = next_lon - state["longitude"]
                    distance = math.hypot(lat_delta, lon_delta)

                    if distance <= TARGET_REACHED_DISTANCE:
                        state["latitude"] = next_lat
                        state["longitude"] = next_lon
                        state["route_points"].pop(0)
                        if not state["route_points"]:
                            state["status"] = "busy"
                            print(
                                f"[{ambulance_code}] arrived at incident: "
                                f"{state['latitude']}, {state['longitude']}"
                            )
                            state["target_latitude"] = None
                            state["target_longitude"] = None
                        else:
                            state["status"] = "en_route"
                    else:
                        step_ratio = min(MOVE_STEP / distance, 1.0)
                        state["latitude"] += lat_delta * step_ratio
                        state["longitude"] += lon_delta * step_ratio
                        state["status"] = "en_route"

                    persist_ambulance_state(ambulance_code, state)

                # Handle single target
                elif state["target_latitude"] is not None and state["target_longitude"] is not None:
                    lat_delta = state["target_latitude"] - state["latitude"]
                    lon_delta = state["target_longitude"] - state["longitude"]
                    distance = math.hypot(lat_delta, lon_delta)

                    if distance <= TARGET_REACHED_DISTANCE:
                        state["latitude"] = state["target_latitude"]
                        state["longitude"] = state["target_longitude"]
                        state["status"] = "busy"
                        print(
                            f"[{ambulance_code}] arrived at incident: "
                            f"{state['latitude']}, {state['longitude']}"
                        )
                        state["target_latitude"] = None
                        state["target_longitude"] = None
                    else:
                        step_ratio = min(MOVE_STEP / distance, 1.0)
                        state["latitude"] += lat_delta * step_ratio
                        state["longitude"] += lon_delta * step_ratio
                        state["status"] = "en_route"

                    persist_ambulance_state(ambulance_code, state)
                else:
                    if state["status"] not in {"en_route", "busy", "dispatched"}:
                        state["status"] = "available"
                    persist_ambulance_state(ambulance_code, state)

            publish_telemetry(client, ambulance_code)
            time.sleep(5)
    
    except KeyboardInterrupt:
        print(f"[{ambulance_code}] Simulator stopped")
    
    finally:
        client.loop_stop()
        client.disconnect()
        with ambulance_lock:
            if ambulance_code in ambulance_states:
                del ambulance_states[ambulance_code]


def main():
    """Keep simulating ambulances, including ones added while the process is running."""
    db: Session = SessionLocal()
    try:
        futures = {}

        with ThreadPoolExecutor(max_workers=32) as executor:
            while True:
                ambulances = db.query(Ambulance).all()

                for ambulance in ambulances:
                    if ambulance.code in futures:
                        continue

                    lat = ambulance.latitude if ambulance.latitude else 30.0444
                    lon = ambulance.longitude if ambulance.longitude else 31.2357
                    status = ambulance.status if ambulance.status else "available"

                    future = executor.submit(
                        simulate_ambulance,
                        ambulance.code,
                        lat,
                        lon,
                        status,
                    )
                    futures[ambulance.code] = future
                    print(f"Started simulator for {ambulance.code}")

                for code, future in list(futures.items()):
                    if future.done():
                        try:
                            future.result()
                        except Exception as exc:
                            print(f"Ambulance simulator error for {code}: {exc}")
                        finally:
                            del futures[code]

                time.sleep(5)

    finally:
        db.close()


if __name__ == "__main__":
    main()