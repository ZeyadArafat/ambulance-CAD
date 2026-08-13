import json
import time

import paho.mqtt.client as mqtt


AMBULANCE_CODE = "AMB-001"

MQTT_HOST = "localhost"
MQTT_PORT = 1883

latitude = 30.0444
longitude = 31.2357

status = "available"


def on_connect(client, userdata, flags, reason_code, properties):
    print("Connected to MQTT broker")

    dispatch_topic = (
        f"cad/ambulance/{AMBULANCE_CODE}/dispatch"
    )

    client.subscribe(dispatch_topic)

    print(f"Subscribed to {dispatch_topic}")


def on_message(client, userdata, message):
    global status

    print("\nDISPATCH RECEIVED")

    payload = json.loads(
        message.payload.decode()
    )

    print(json.dumps(payload, indent=2))

    status = "dispatched"

    print(
        f"{AMBULANCE_CODE} status changed to {status}"
    )


client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2,
    client_id=AMBULANCE_CODE,
)

client.on_connect = on_connect
client.on_message = on_message

client.connect(
    MQTT_HOST,
    MQTT_PORT,
    60,
)

client.loop_start()

print(f"{AMBULANCE_CODE} simulator started")

try:

    while True:

        location_topic = (
            f"cad/ambulance/"
            f"{AMBULANCE_CODE}/location"
        )

        location_payload = {
            "ambulance": AMBULANCE_CODE,
            "latitude": latitude,
            "longitude": longitude,
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

        print(f"telemetry published:"
              f"{latitude}, {longitude} |"
              f" {status}")

        latitude += 0.0001
        longitude += 0.0001

        time.sleep(5)

except KeyboardInterrupt:

    print("Simulator stopped")

finally:

    client.loop_stop()
    client.disconnect()