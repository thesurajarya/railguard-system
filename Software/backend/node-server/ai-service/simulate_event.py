# simulate_event.py
import requests

payload = {
    "node_id": "TRACK_NODE_01",
    "timestamp": 123456,
    "accel_x": 18.0,
    "accel_y": 2.0,
    "accel_z": 1.0,
    "mag_x": 30,
    "mag_y": 25,
    "mag_z": 40,
    "heading": 90,
    "temperature": 30,
    "humidity": 45,
    "pressure": 1012
}

print(requests.post("http://127.0.0.1:5000/predict", json=payload).json())
