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

            asyncio.run(
                manager.broadcast(
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
    }

    client.publish(
        topic,
        json.dumps(payload),
        qos=1,
    )