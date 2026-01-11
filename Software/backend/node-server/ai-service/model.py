import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

DATA_FILE   = "training_features.csv"
MODEL_FILE  = "isolation_forest.pkl"
SCALER_FILE = "scaler.pkl"

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

df = pd.read_csv(DATA_FILE)

X = df[FEATURES].fillna(0)

# ------------------------------------
# OPTIONAL: supervised evaluation
# ------------------------------------
HAS_LABELS = "is_anomaly" in df.columns

if HAS_LABELS:
    y = df["is_anomaly"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
else:
    X_train = X
    X_test  = X.copy()

# ------------------------------------
# SCALE (NO LEAKAGE)
# ------------------------------------
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled  = scaler.transform(X_test)

# ------------------------------------
# TRAIN ONLY ON NORMAL DATA
# ------------------------------------
if HAS_LABELS:
    X_train_normal = X_train_scaled[y_train == 0]
else:
    X_train_normal = X_train_scaled

model = IsolationForest(
    n_estimators=300,
    contamination=0.05,
    random_state=42,
    n_jobs=-1
)

model.fit(X_train_normal)

# ------------------------------------
# EVALUATION (IF LABELS EXIST)
# ------------------------------------
if HAS_LABELS:
    preds = model.predict(X_test_scaled)
    preds = np.where(preds == -1, 1, 0)

    print("\n📊 Evaluation:")
    print(confusion_matrix(y_test, preds))
    print("Accuracy :", accuracy_score(y_test, preds))
    print("Precision:", precision_score(y_test, preds))
    print("Recall   :", recall_score(y_test, preds))
    print("F1-score :", f1_score(y_test, preds))

# ------------------------------------
# SAVE
# ------------------------------------
joblib.dump(model, MODEL_FILE)
joblib.dump(scaler, SCALER_FILE)

print("\n✅ Model & scaler saved")
