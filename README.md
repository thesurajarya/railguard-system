# 🚆 Railway Track Tampering Detection System

AI-powered IoT system for real-time detection of intentional railway track tampering.

## Problem Statement

Detects the act of tampering in real time using sensor data and AI.

## Tech Stack

- ESP32 (C/C++)
- MQTT
- Node.js + Express + Socket.IO
- Python + FastAPI + scikit-learn
- React Dashboard

## System Flow

ESP32 → MQTT → Node.js → Python AI → Node.js → React Dashboard

## How to use it

Step 1: Fork the reporsitory.
Step 2: Clone the reposiroty.
Step 3: Open terminal and go into `Software/frontend`.
Step 4: run `npm install` in your terminal.
Step 5: Go into `Software/backend/node-server`.
Step 6: run `npm install` in your terminal.
Step 7: Go into `cd ai-services` and run `pip install -r requirements.txt`.

After succesfully installing all the dependencies, Run the WebApp by following the steps below:

Step 8: Open Terminal, go into the cloned repository and run `cd Software/backend/node-server/ai-server`.
Step 9 : run `python -m uvicorn main:app --reload --port 8000`
You should see something like...
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [16136] using StatReload
INFO:     Started server process [31240]
INFO:     Waiting for application startup.
✅ AI Model Trained on Normal Baseline
INFO:     Application startup complete.

Step 10: Open another Terminal, go into the cloned repository and run `cd Software/backend/node-server`.
Step 11 : run `node index.js`
You should see something like...
🚀 Server + API running on 3000
Frontend Dashboard Connected: ***...
✅ Connected to MQTT Broker
Frontend Dashboard Connected: ***...

Step 12 : Open another Terminal, go into the cloned repository and run `cd Software/frontend`
Step 13: run `npm run dev`
You should see something like...
VITE v7.3.1  ready in 648 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help

## Status

Hackathon prototype
