module.exports = {
    mqtt: {
        brokerUrl: 'mqtt://broker.hivemq.com', 
        // topic: 'railway/sensor/+'
        topic: 'railguard_live_stream'
    },
    ai: {
        // CHANGED: Port 8000 -> 5000 (Matches your Python main.py)
        url: 'http://127.0.0.1:5000/predict'
    },
    server: {
        port: 3000
    },
    frontend: {
        origin: '*' // Allow all for hackathon simplicity
    }
};