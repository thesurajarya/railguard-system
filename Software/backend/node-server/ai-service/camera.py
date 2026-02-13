# camera.py
import cv2
import os
import time

CAMERA_INDEX = 0   # laptop webcam
IMAGE_DIR = "captured_frames"

os.makedirs(IMAGE_DIR, exist_ok=True)

def capture_image():
    """
    Captures a single frame from webcam and saves it
    Returns image path or None
    """
    cap = cv2.VideoCapture(CAMERA_INDEX)

    if not cap.isOpened():
        print("❌ Camera not accessible")
        return None

    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("❌ Failed to capture image")
        return None

    filename = f"frame_{int(time.time())}.jpg"
    path = os.path.join(IMAGE_DIR, filename)

    cv2.imwrite(path, frame)
    return path
