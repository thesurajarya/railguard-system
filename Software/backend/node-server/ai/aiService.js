const axios = require('axios');
const config = require('../config/config');

async function getPrediction(sensorData) {
    try {
        const payload = {
            node_id: sensorData.node_id || "UNKNOWN",
            timestamp: sensorData.timestamp || Date.now(),
            
            // GPS Location
            latitude: sensorData.latitude || 28.6139,
            longitude: sensorData.longitude || 77.2090,
            
            // Raw Accelerometer & Magnetometer
            accel_x: sensorData.accel_x || 0.0,
            accel_y: sensorData.accel_y || 0.0,
            accel_z: sensorData.accel_z || 0.0,
            mag_x: sensorData.mag_x || 0.0,
            mag_y: sensorData.mag_y || 0.0,
            mag_z: sensorData.mag_z || 0.0,
            heading: sensorData.heading || 0.0,
            
            // Environment & Audio
            temperature: sensorData.temperature || 0.0,
            humidity: sensorData.humidity || 0.0,
            pressure: sensorData.pressure || 0.0,
            mic_level: sensorData.mic_level || 0.0,
            frequency: sensorData.frequency || 0.0
        };

        // INCREASED TIMEOUT: VLM inference (Qwen2-VL) is slow on CPU.
        // We give it 45 seconds to avoid breaking the "Vision Feed" window.
        const response = await axios.post(config.ai.url, payload, { 
            timeout: 45000 
        }); 

        return response.data;

    } catch (error) {
        // Detailed logging for debugging VLM latency
        if (error.code === 'ECONNABORTED') {
            console.error("⚠️ AI SERVICE TIMEOUT: VLM took > 45s to respond.");
        } else {
            console.error("⚠️ AI SERVICE ERROR:", error.message);
        }
        
        // Fallback: Dashboard stays active but visual evidence is skipped
        return { 
            final_alert: false,
            severity: "LOW", 
            vibration_score: 0,
            vision_score: 0,
            reasons: ["AI Service Unavailable"],
            vlm_analysis: { vision_reason: "AI Connection Error" }
        };
    }
}

module.exports = { getPrediction };