import json
import math
import os
import time

import paho.mqtt.client as mqtt
import sys
from pathlib import Path



AMBULANCE_CODE = os.getenv("AMBULANCE_CODE", "AMB-001")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_HOST_CANDIDATES = [
    os.getenv("MQTT_HOST"),
    "mosquitto",
    "localhost",
]
MQTT_HOST_CANDIDATES = [
    host for host in MQTT_HOST_CANDIDATES if host
]

status = "available"
latitude = 30.0444
longitude = 31.2357

TARGET_LATITUDE = None
TARGET_LONGITUDE = None
ROUTE_POINTS = []
TARGET_REACHED_DISTANCE = 0.0003
MOVE_STEP = 0.00025


def publish_telemetry():
    global latitude, longitude, status

    location_topic = (
        f"cad/ambulance/"
        f"{AMBULANCE_CODE}/location"
    )

    location_payload = {
        "ambulance": AMBULANCE_CODE,
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
        f"{AMBULANCE_CODE}/status"
    )

    status_payload = {
        "ambulance": AMBULANCE_CODE,
        "status": status,
    }

    client.publish(
        status_topic,
        json.dumps(status_payload),
        qos=1,
    )

    print(
        f"telemetry published: "
        f"{latitude}, {longitude} | {status}"
    )


def on_connect(client, userdata, flags, reason_code, properties):
    print("Connected to MQTT broker")

    dispatch_topic = (
        f"cad/ambulance/{AMBULANCE_CODE}/dispatch"
    )

    client.subscribe(dispatch_topic)

    print(f"Subscribed to {dispatch_topic}")


def on_message(client, userdata, message):
    global status, TARGET_LATITUDE, TARGET_LONGITUDE, ROUTE_POINTS

    print("\nDISPATCH RECEIVED")

    payload = json.loads(
        message.payload.decode()
    )

    print(json.dumps(payload, indent=2))

    route_points = payload.get("route") or []
    if route_points:
        ROUTE_POINTS = [
            (float(point[1]), float(point[0]))
            for point in route_points
        ]

        if ROUTE_POINTS:
            TARGET_LATITUDE, TARGET_LONGITUDE = ROUTE_POINTS[0]
            status = "en_route"
            print(
                f"{AMBULANCE_CODE} en route along {len(ROUTE_POINTS)} waypoints"
            )

    if "latitude" in payload and "longitude" in payload and not route_points:
        TARGET_LATITUDE = float(payload["latitude"])
        TARGET_LONGITUDE = float(payload["longitude"])
        status = "en_route"
        print(
            f"{AMBULANCE_CODE} en route to "
            f"{TARGET_LATITUDE}, {TARGET_LONGITUDE}"
        )

    if not route_points and (TARGET_LATITUDE is None or TARGET_LONGITUDE is None):
        print("Dispatch payload missing target coordinates")


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id=AMBULANCE_CODE,
)

client.on_connect = on_connect
client.on_message = on_message

connected = False
for host in MQTT_HOST_CANDIDATES:
    try:
        print(f"Trying MQTT broker at {host}:{MQTT_PORT}")
        client.connect(host, MQTT_PORT, 60)
        client.loop_start()
        connected = True
        print(f"Connected to MQTT broker at {host}:{MQTT_PORT}")
        break
    except Exception as exc:
        print(f"Failed to connect to {host}:{MQTT_PORT}: {exc}")

if not connected:
    raise RuntimeError(
        f"Could not connect to MQTT broker. Tried: {MQTT_HOST_CANDIDATES}"
    )

print(f"{AMBULANCE_CODE} simulator started")

try:
    while True:
        if ROUTE_POINTS:
            next_lat, next_lon = ROUTE_POINTS[0]
            lat_delta = next_lat - latitude
            lon_delta = next_lon - longitude
            distance = math.hypot(lat_delta, lon_delta)

            if distance <= TARGET_REACHED_DISTANCE:
                latitude = next_lat
                longitude = next_lon
                ROUTE_POINTS.pop(0)
                if not ROUTE_POINTS:
                    status = "busy"
                    print(
                        f"{AMBULANCE_CODE} arrived at incident: "
                        f"{latitude}, {longitude}"
                    )
                    TARGET_LATITUDE = None
                    TARGET_LONGITUDE = None
                else:
                    status = "en_route"
            else:
                step_ratio = min(MOVE_STEP / distance, 1.0)
                latitude += lat_delta * step_ratio
                longitude += lon_delta * step_ratio
                status = "en_route"

        elif TARGET_LATITUDE is not None and TARGET_LONGITUDE is not None:
            lat_delta = TARGET_LATITUDE - latitude
            lon_delta = TARGET_LONGITUDE - longitude
            distance = math.hypot(lat_delta, lon_delta)

            if distance <= TARGET_REACHED_DISTANCE:
                latitude = TARGET_LATITUDE
                longitude = TARGET_LONGITUDE
                status = "busy"
                print(
                    f"{AMBULANCE_CODE} arrived at incident: "
                    f"{latitude}, {longitude}"
                )
                TARGET_LATITUDE = None
                TARGET_LONGITUDE = None
            else:
                step_ratio = min(
                    MOVE_STEP / distance,
                    1.0,
                )
                latitude += lat_delta * step_ratio
                longitude += lon_delta * step_ratio
                status = "en_route"

        else:
            if status in {"en_route", "busy"}:
                status = status
            else:
                status = "available"

        publish_telemetry()
        time.sleep(5)

except KeyboardInterrupt:

    print("Simulator stopped")

finally:

    client.loop_stop()
    client.disconnect()