import pandas as pd
import numpy as np

INPUT_FILE = "vibration_raw.csv"
OUTPUT_FILE = "training_features.csv"

df = pd.read_csv(INPUT_FILE)

# -------------------------------
# BASIC SANITY CHECK
# -------------------------------
required_cols = [
    "ACCEL_X","ACCEL_Y","ACCEL_Z",
    "MAG_X","MAG_Y","MAG_Z",
    "TEMPERATURE","HUMIDITY","PRESSURE"
]

missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

# -------------------------------
# FEATURE ENGINEERING
# -------------------------------

# Acceleration magnitude
df["accel_mag"] = np.sqrt(
    df["ACCEL_X"]**2 + df["ACCEL_Y"]**2 + df["ACCEL_Z"]**2
)

# Magnetic field magnitude
df["mag_norm"] = np.sqrt(
    df["MAG_X"]**2 + df["MAG_Y"]**2 + df["MAG_Z"]**2
)

# Temporal deltas (tampering sensitive)
df["delta_accel_mag"] = df["accel_mag"].diff().abs().fillna(0)
df["delta_mag_norm"]  = df["mag_norm"].diff().abs().fillna(0)

# Short rolling std (no downsampling)
WINDOW = 5
df["accel_std"] = df["accel_mag"].rolling(WINDOW).std().fillna(0)

# -------------------------------
# FINAL FEATURE SET
# -------------------------------
final_cols = [
    "accel_mag",
    "delta_accel_mag",
    "accel_std",
    "mag_norm",
    "delta_mag_norm",
    "TEMPERATURE",
    "HUMIDITY",
    "PRESSURE"
]

if "is_anomaly" in df.columns:
    final_cols.append("is_anomaly")

final_df = df[final_cols]

final_df.to_csv(OUTPUT_FILE, index=False)
print("✅ training_features.csv created")
print("Shape:", final_df.shape)
