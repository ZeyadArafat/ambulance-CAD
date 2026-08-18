import json
import math
import os
import time
import threading
from concurrent.futures import ThreadPoolExecutor

import paho.mqtt.client as mqtt
import sys
from pathlib import Path
from sqlalchemy.orm import Session

# Database imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from backend.app.database import SessionLocal, engine
from backend.app.models import Ambulance, Base

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


def simulate_ambulance(ambulance_code, initial_lat, initial_lon):
    """Simulate a single ambulance"""
    
    # Initialize state
    with ambulance_lock:
        ambulance_states[ambulance_code] = {
            "latitude": initial_lat,
            "longitude": initial_lon,
            "status": "available",
            "target_latitude": None,
            "target_longitude": None,
            "route_points": [],
        }
    
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
                else:
                    if state["status"] not in {"en_route", "busy"}:
                        state["status"] = "available"
            
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
    """Fetch all ambulances and simulate them concurrently"""
    
    # Get all ambulances from database
    db: Session = SessionLocal()
    try:
        ambulances = db.query(Ambulance).all()
        
        if not ambulances:
            print("No ambulances found in database")
            return
        
        print(f"Found {len(ambulances)} ambulances to simulate")
        
        # Use ThreadPoolExecutor to run simulators concurrently
        with ThreadPoolExecutor(max_workers=len(ambulances)) as executor:
            futures = []
            for ambulance in ambulances:
                # Use database coordinates or defaults
                lat = ambulance.latitude if ambulance.latitude else 30.0444
                lon = ambulance.longitude if ambulance.longitude else 31.2357
                
                future = executor.submit(
                    simulate_ambulance,
                    ambulance.code,
                    lat,
                    lon
                )
                futures.append(future)
            
            # Wait for all simulators
            for future in futures:
                try:
                    future.result()
                except Exception as e:
                    print(f"Ambulance simulator error: {e}")
    
    finally:
        db.close()


if __name__ == "__main__":
    main()