import json
import numpy as np
import pandas as pd
import joblib

# ===============================
# LOAD MODEL & SCALER
# ===============================
MODEL_FILE  = "isolation_forest.pkl"
SCALER_FILE = "scaler.pkl"

model  = joblib.load(MODEL_FILE)
scaler = joblib.load(SCALER_FILE)

# ===============================
# FEATURES (MUST MATCH TRAINING)
# ===============================
FEATURES = [
    "accel_mag",
    "delta_accel_mag",
    "accel_std",
    "mag_norm",
    "delta_mag_norm",
    "TEMPERATURE",
    "HUMIDITY",
    "PRESSURE"
]

# ===============================
# FIXED SENSOR LOCATION
# ===============================
SENSOR_LOCATION = {
    "track_section": "TRACK_SEC_42",
    "latitude": 28.6139,
    "longitude": 77.2090
}

# ===============================
# THRESHOLDS (TUNABLE LATER)
# ===============================
VIBRATION_SCORE_THRESHOLD = -0.05   # lower = more anomalous

# ===============================
# CORE PREDICTION FUNCTION
# ===============================
def process_sensor_packet(packet: dict):

    # ---- Build feature row ----
    row = {
        "accel_mag": packet["accel_mag"],
        "delta_accel_mag": packet.get("delta_accel_mag", 0),
        "accel_std": packet.get("accel_std", 0),
        "mag_norm": packet["mag_norm"],
        "delta_mag_norm": packet.get("delta_mag_norm", 0),
        "TEMPERATURE": packet["temperature"],
        "HUMIDITY": packet["humidity"],
        "PRESSURE": packet["pressure"]
    }

    df = pd.DataFrame([row])
    X_scaled = scaler.transform(df[FEATURES])

    # ---- Vibration anomaly ----
    anomaly_score = model.decision_function(X_scaled)[0]
    vibration_anomaly = anomaly_score < VIBRATION_SCORE_THRESHOLD

    # ---- Other sensors ----
    tilt_alert = packet.get("tilt_alert", False)
    mic_anomaly = packet.get("mic_anomaly", False)  # optional

    # ---- Final fusion ----
    final_alert = vibration_anomaly or tilt_alert or mic_anomaly

    # ---- Reasoning ----
    reasons = []
    if vibration_anomaly:
        reasons.append("abnormal_vibration")
    if tilt_alert:
        reasons.append("tilt_detected")
    if mic_anomaly:
        reasons.append("tool_sound_detected")

    # ---- Final output ----
    output = {
    "node_id": str(packet["node_id"]),
    "timestamp": str(packet["timestamp"]),
    "location": SENSOR_LOCATION,

    "anomaly_score": float(anomaly_score),

    "vibration_anomaly": bool(vibration_anomaly),
    "tilt_alert": bool(tilt_alert),
    "mic_anomaly": bool(mic_anomaly),

    "final_alert": bool(final_alert),
    "reasons": list(reasons)
    }

    return output

# ===============================
# TEST WITH SAMPLE JSON
# ===============================
if __name__ == "__main__":

    sample_packet = {
        "node_id": "TRACK_SEC_42",
        "timestamp": "2026-01-12T10:32:00Z",

        "accel_mag": 1025.4,
        "delta_accel_mag": 62.1,
        "accel_std": 28.4,

        "mag_norm": 1112.6,
        "delta_mag_norm": 4.9,

        "temperature": 26.8,
        "humidity": 31.2,
        "pressure": 94740.5,

        "tilt_alert": False,
        "mic_anomaly": False
    }

    result = process_sensor_packet(sample_packet)
    print(json.dumps(result, indent=2))
