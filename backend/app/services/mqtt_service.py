import json
import os
import asyncio
import logging

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
logger = logging.getLogger(__name__)


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

    print("Subscribed to ambulance telemetry")


def on_message(client, userdata, message):
    try:
        topic_parts = message.topic.split("/")

        # Expected:
        # cad / ambulance / AMB-001 / location

        ambulance_code = topic_parts[2]
        message_type = topic_parts[3]

        payload = json.loads(
            message.payload.decode()
        )

        db = SessionLocal()

        try:
            ambulance = (
                db.query(Ambulance)
                .filter(
                    Ambulance.ambulance_code == ambulance_code
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

                ambulance.current_latitude = payload["latitude"]
                ambulance.current_longitude = payload["longitude"]

                print(
                    f"{ambulance_code} location: "
                    f"{ambulance.current_latitude}, "
                    f"{ambulance.current_longitude}"
                )

            elif message_type == "status":

                ambulance.status = payload["status"]

                print(
                    f"{ambulance_code} status: "
                    f"{ambulance.status}"
                )

            db.commit()

            asyncio.run(
                manager.broadcast(
                    {
                        "type": "ambulance_update",
                        "ambulance": {
                            "id": str(ambulance.ambulance_id),
                            "code": ambulance.ambulance_code,
                            "latitude": float(ambulance.current_latitude),
                            "longitude": float(ambulance.current_longitude),
                            "status": ambulance.status,
                        },
                    }
            )
)

        finally:
            db.close()

    except Exception as e:
        print(
            f"MQTT message processing error: {e}"
        )


def connect_mqtt():

    client.on_connect = on_connect
    client.on_message = on_message

    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.loop_start()
        return True
    except OSError as exc:
        logger.warning("MQTT unavailable at %s:%s: %s", MQTT_HOST, MQTT_PORT, exc)
        return False


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

    if not client.is_connected():
        raise RuntimeError("MQTT broker is not connected")

    client.publish(
        topic,
        json.dumps(payload),
        qos=1,
    )