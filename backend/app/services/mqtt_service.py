import json
import os

import paho.mqtt.client as mqtt


MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id="cad-backend",
)


def connect_mqtt():
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_start()


def publish_dispatch(
    ambulance_code: str,
    incident_id: int,
    latitude: float,
    longitude: float,
    priority: str,
):
    topic = f"cad/ambulance/{ambulance_code}/dispatch"

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