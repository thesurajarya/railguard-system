from camera import capture_image
from vlm_model import run_vlm
from fusion import fuse_results

from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
import os
import time
from collections import defaultdict, deque

# ===============================
# 1. INITIALIZE SERVER
# ===============================
app = FastAPI()

print("\n" + "=" * 60)
print("AI SERVICE LOADED: MULTIMODAL (VIBRATION → LIVE VISION)")
print("MODE: CPU | EVENT-DRIVEN CAMERA | STABLE FEATURES")
print("=" * 60 + "\n")

# ===============================
# 2. LOAD MODEL & SCALER
# ===============================
MODEL_FILE = "isolation_forest.pkl"
SCALER_FILE = "scaler.pkl"

model = None
scaler = None

if os.path.exists(MODEL_FILE) and os.path.exists(SCALER_FILE):
    model = joblib.load(MODEL_FILE)
    scaler = joblib.load(SCALER_FILE)
    print("==> Isolation Forest model loaded")
else:
    print("==> ML model not found → Physics-only fallback")

# ⚠️ MUST MATCH TRAINING EXACTLY
FEATURES = [
    "accel_mag",
    "accel_roll_mean",
    "accel_roll_std",
    "accel_roll_rms",
    "accel_roll_range",
    "mag_norm",
    "TEMPERATURE",
    "HUMIDITY",
    "PRESSURE"
]

# ===============================
# 3. BUFFERS & CAMERA COOLDOWN
# ===============================
node_buffers = defaultdict(lambda: deque(maxlen=40))
camera_cooldown = defaultdict(float)
COOLDOWN_SECONDS = 10

# ===============================
# 4. INPUT MODEL
# ===============================
class SensorInput(BaseModel):
    node_id: str
    timestamp: int

    accel_x: float
    accel_y: float
    accel_z: float

    mag_x: float
    mag_y: float
    mag_z: float
    heading: float

    temperature: float
    humidity: float
    pressure: float

    latitude: float = 0.0
    longitude: float = 0.0
    mic_level: float = 0.0
    frequency: float = 0.0

# ===============================
# 5. LIVE CAMERA CAPTURE (SAFE)
# ===============================
def capture_live_frames(frames=5, interval=0.4):
    images = []
    for _ in range(frames):
        try:
            img = capture_image()
            if img and os.path.exists(img):
                images.append(img)
        except Exception as e:
            print("Camera error:", e)
        time.sleep(interval)
    return images

# ===============================
# 6. PREDICTION ENDPOINT
# ===============================
@app.post("/predict")
def predict(data: SensorInput):
    try:
        # ---------------------------
        # A. PHYSICS FEATURES
        # ---------------------------
        accel_mag = float(np.sqrt(
            data.accel_x**2 +
            data.accel_y**2 +
            data.accel_z**2
        ))

        mag_norm = float(np.sqrt(
            data.mag_x**2 +
            data.mag_y**2 +
            data.mag_z**2
        ))

        buf = node_buffers[data.node_id]
        buf.append(accel_mag)

        accel_roll_mean = float(np.mean(buf))
        accel_roll_std  = float(np.std(buf))
        accel_roll_rms  = float(np.sqrt(np.mean(np.square(buf))))
        accel_roll_range = float(max(buf) - min(buf)) if len(buf) > 1 else 0.0

        feature_row = {
            "accel_mag": accel_mag,
            "accel_roll_mean": accel_roll_mean,
            "accel_roll_std": accel_roll_std,
            "accel_roll_rms": accel_roll_rms,
            "accel_roll_range": accel_roll_range,
            "mag_norm": mag_norm,
            "TEMPERATURE": data.temperature,
            "HUMIDITY": data.humidity,
            "PRESSURE": data.pressure
        }

        # ---------------------------
        # B. VIBRATION ANOMALY
        # ---------------------------
        vibration_anomaly = False
        vib_score = 0.0
        reasons = []

        # Rule 1: Hard physical shock
        if accel_mag > 15.0:
            vibration_anomaly = True
            vib_score = min((accel_mag - 15.0) / 10.0, 1.0)
            reasons.append(f"Hard vibration |a|={accel_mag:.2f}")

        # Rule 2: ML-based anomaly
        elif model and scaler:
            df = pd.DataFrame([feature_row])
            X_scaled = scaler.transform(df[FEATURES])
            score = float(model.decision_function(X_scaled)[0])

            if score < -0.05:
                vibration_anomaly = True
                vib_score = abs(score)
                reasons.append("Abnormal vibration pattern (ML)")

        # ---------------------------
        # C. LIVE VISION (EVENT-DRIVEN)
        # ---------------------------
        vision_result = {
            "vision_anomaly": False,
            "vision_confidence": 0.0,
            "vision_reason": "Not triggered"
        }

        now = time.time()
        if vibration_anomaly and (now - camera_cooldown[data.node_id] > COOLDOWN_SECONDS):
            camera_cooldown[data.node_id] = now

            frames = capture_live_frames()
            votes = []
            confidences = []

            for img in frames:
                res = run_vlm(img)
                votes.append(res.get("vision_anomaly", False))
                confidences.append(res.get("vision_confidence", 0.0))

            if votes and votes.count(True) >= (len(votes) // 2 + 1):
                vision_result = {
                    "vision_anomaly": True,
                    "vision_confidence": round(float(np.mean(confidences)), 2),
                    "vision_reason": "Suspicious object/person detected"
                }

        # ---------------------------
        # D. MULTIMODAL FUSION
        # ---------------------------
        final_decision = fuse_results(
            vibration_result={"score": vib_score},
            vision_result=vision_result
        )

        # ---------------------------
        # E. RESPONSE (FRONTEND SAFE)
        # ---------------------------
        return {
            "node_id": data.node_id,

            "final_alert": bool(final_decision["final_alert"]),
            "severity": str(final_decision["severity"]),
            "final_score": float(final_decision["final_score"]),

            "vibration_score": float(vib_score),
            "vision_score": float(vision_result["vision_confidence"]),

            "reasons": reasons,

            "location": {
                "lat": float(data.latitude),
                "lng": float(data.longitude)
            },

            "telemetry": {
                "accel_mag": accel_mag,
                "mag_norm": mag_norm,
                "accel_roll_std": accel_roll_std,
                "mic_level": float(data.mic_level),
                "frequency": float(data.frequency)
            }
        }

    except Exception as e:
        print("❌ ERROR:", e)
        return {
            "final_alert": False,
            "severity": "LOW",
            "error": str(e)
        }

# ===============================
# 7. RUN SERVER
# ===============================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
