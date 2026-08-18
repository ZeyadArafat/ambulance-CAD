import json
import os
import asyncio

import paho.mqtt.client as mqtt

from ..database import SessionLocal
from ..models import Ambulance
from .websocket_manager import manager


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="cad-backend",
)

# The FastAPI main event loop; set at connect_mqtt() time so the
# MQTT client (which runs on its own thread) can schedule
# coroutines safely on the main loop.
main_loop = None


def on_connect(client, userdata, flags, reason_code, properties):
    print("CAD connected to MQTT broker")

    client.subscribe(
        "cad/ambulance/+/location",
        qos=1,
    )

    client.subscribe(
        "cad/ambulance/+/status",
        qos=1,
    )

    # Also listen for dispatch messages so the backend-integrated
    # simulator can react to dispatches published by the dispatch
    # service.
    client.subscribe(
        "cad/ambulance/+/dispatch",
        qos=1,
    )

    print("Subscribed to ambulance telemetry and dispatch topics")


def on_message(client, userdata, message):
    try:
        print(f"MQTT on_message: topic={message.topic} payload={message.payload[:200]}")
        topic_parts = message.topic.split("/")

        # Expected:
        # cad / ambulance / AMB-001 / location

        ambulance_code = topic_parts[2]
        message_type = topic_parts[3]

        payload = json.loads(
            message.payload.decode()
        )

        print(f"MQTT parsed payload for {ambulance_code} [{message_type}]: {payload}")

        # If this is a dispatch message, inform the simulation
        # manager if one is registered, and return early.
        if message_type == "dispatch":
            global dispatch_callback
            if dispatch_callback:
                try:
                    dispatch_callback(ambulance_code, payload)
                except Exception as e:
                    print(f"Dispatch callback error: {e}")
            return

        db = SessionLocal()

        try:
            ambulance = (
                db.query(Ambulance)
                .filter(
                    Ambulance.code == ambulance_code
                )
                .first()
            )

            if not ambulance:
                print(
                    f"Unknown ambulance: "
                    f"{ambulance_code}"
                )
                return

            if message_type == "location":

                ambulance.latitude = payload["latitude"]
                ambulance.longitude = payload["longitude"]

                print(
                    f"{ambulance_code} location: "
                    f"{ambulance.latitude}, "
                    f"{ambulance.longitude}"
                )

            elif message_type == "status":

                ambulance.status = payload["status"]

                print(
                    f"{ambulance_code} status: "
                    f"{ambulance.status}"
                )

            db.commit()
            print(f"DB commit successful for {ambulance_code}")

            # Schedule the broadcast on the FastAPI main event loop if
            # available. MQTT callbacks run in a separate thread so using
            # asyncio.run() causes broadcasts to run on a different loop
            # which can fail when interacting with WebSocket objects that
            # are bound to the main loop. Use run_coroutine_threadsafe for
            # safe cross-thread scheduling.
            broadcast_coro = manager.broadcast(
                {
                    "type": "ambulance_update",
                    "ambulance": {
                        "id": ambulance.id,
                        "code": ambulance.code,
                        "latitude": ambulance.latitude,
                        "longitude": ambulance.longitude,
                        "status": ambulance.status,
                    },
                }
            )

            if main_loop is not None:
                try:
                    asyncio.run_coroutine_threadsafe(
                        broadcast_coro,
                        main_loop,
                    )
                except Exception as e:
                    print(f"Failed to schedule broadcast on main loop: {e}")
            else:
                # Fallback: try running directly (single-threaded / tests)
                try:
                    asyncio.run(broadcast_coro)
                except Exception as e:
                    print(f"Broadcast failed: {e}")

        finally:
            db.close()

    except Exception as e:
        print(
            f"MQTT message processing error: {e}"
        )


def connect_mqtt():

    client.on_connect = on_connect
    client.on_message = on_message

    # Capture the main FastAPI event loop so MQTT callbacks (which run on
    # the paho client's thread) can safely schedule coroutines back to
    # the main loop via run_coroutine_threadsafe.
    global main_loop
    try:
        main_loop = asyncio.get_running_loop()
    except RuntimeError:
        # If no running loop in this thread, fall back to get_event_loop().
        main_loop = asyncio.get_event_loop()

    client.connect(
        MQTT_HOST,
        MQTT_PORT,
        60,
    )

    client.loop_start()


def publish_dispatch(
    ambulance_code: str,
    incident_id: int,
    latitude: float,
    longitude: float,
    priority: str,
    route_coordinates: list[list[float]] | None = None,
):

    topic = (
        f"cad/ambulance/"
        f"{ambulance_code}/dispatch"
    )

    payload = {
        "incident_id": incident_id,
        "latitude": latitude,
        "longitude": longitude,
        "priority": priority,
        "route": route_coordinates or [],
    }

    client.publish(
        topic,
        json.dumps(payload),
        qos=1,
    )


# Simulation dispatch callback registration
# Simulation manager can register a callback to receive
# dispatch payloads that are published to MQTT.
dispatch_callback = None

def register_dispatch_callback(cb):
    global dispatch_callback
    dispatch_callback = cb


def publish_telemetry(ambulance_code: str, latitude: float, longitude: float, status: str):
    """Publish location and status telemetry for the given ambulance."""
    location_topic = f"cad/ambulance/{ambulance_code}/location"
    status_topic = f"cad/ambulance/{ambulance_code}/status"

    location_payload = {
        "ambulance": ambulance_code,
        "latitude": round(latitude, 6),
        "longitude": round(longitude, 6),
        "status": status,
    }

    status_payload = {"ambulance": ambulance_code, "status": status}

    print(f"MQTT publish -> {location_topic}: {location_payload}")
    client.publish(location_topic, json.dumps(location_payload), qos=1)
    print(f"MQTT publish -> {status_topic}: {status_payload}")
    client.publish(status_topic, json.dumps(status_payload), qos=1)
