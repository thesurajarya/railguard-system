import cv2
import os
import time

VIDEO_DIR = "live_frames"
os.makedirs(VIDEO_DIR, exist_ok=True)

cap = None

def start_camera():
    global cap
    if cap is None:
        cap = cv2.VideoCapture(0)

def get_frame():
    global cap
    if cap is None:
        start_camera()

    ret, frame = cap.read()
    if not ret:
        return None

    filename = f"{VIDEO_DIR}/frame_{int(time.time()*1000)}.jpg"
    cv2.imwrite(filename, frame)
    return filename

def stop_camera():
    global cap
    if cap:
        cap.release()
        cap = None
