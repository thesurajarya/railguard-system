const mqtt = require('mqtt');
const config = require('../config/config');
const aiService = require('../ai/aiService');
const { broadcastUpdate } = require('../socket/socket');
const { sendCriticalAlert } = require('../services/alertService');

const ALERT_COOLDOWN = 5000; 
let lastAlertTime = 0;

const connectMQTT = (onAnomalyCallback) => {
    const client = mqtt.connect(config.mqtt.brokerUrl, {
        reconnectPeriod: 1000,
        connectTimeout: 30 * 1000,
        keepalive: 60
    });

    client.on('connect', () => {
        console.log('Connected to MQTT Broker');
        client.subscribe(config.mqtt.topic, (err) => {
            if (!err) console.log(`📡 Listening on: ${config.mqtt.topic}`);
        });
    });

    client.on('message', async (topic, message) => {
        try {
            const msgString = message.toString();
            if (!msgString || msgString.trim().length === 0) return;

            // 1. Parse Data
            const rawData = JSON.parse(msgString);
            
            // 2. Broadcast Raw Data (Live Graph)
            broadcastUpdate({ ...rawData, is_anomaly: false, processing: true });

            // 3. Get Prediction (Now returns { is_anomaly, severity, vlm_analysis, image_url })
            const aiResult = await aiService.getPrediction(rawData);
            
            // 4. Merge Data
            const enrichedData = {
                ...rawData,
                ...aiResult,
                processed_at: new Date().toISOString()
            };
            
            // 5. Update Dashboard (Live Telemetry Tab)
            broadcastUpdate(enrichedData);

            // 6. Handle Alerts (Multimodal Verification)
            if(enrichedData.is_anomaly) {
                const now = Date.now();
                
                if (now - lastAlertTime > ALERT_COOLDOWN) {
                    lastAlertTime = now;

                    console.log(`🚨 MULTIMODAL ALERT: ${enrichedData.node_id}`);
                    console.log(`👁️ VLM Reasoning: ${enrichedData.vlm_analysis?.vision_reason}`);
                    
                    // Trigger Database Save & Frontend Alert
                    if (onAnomalyCallback) {
                        // This callback now passes the VLM data to the DataController
                        onAnomalyCallback(enrichedData);
                    }

                    // Send Email with Visual Context
                    sendCriticalAlert(enrichedData).catch(e => console.error("Email Error:", e.message));

                } else {
                    console.log(`Alert suppressed for ${enrichedData.node_id} (Cooldown)`);
                }
            }
        } catch (err) {
            console.error("Message Loop Error:", err.message);
        }
    });

    return client;
};

module.exports = { connectMQTT };