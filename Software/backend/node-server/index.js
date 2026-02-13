const express = require('express');
const http = require('http');
const path = require('path'); // Added for static paths
const cors = require('cors');
const bodyParser = require('body-parser'); 
const { initSocket } = require('./socket/socket');
const { connectMQTT } = require('./mqtt/mqttClient');
const dataController = require('./controllers/dataController');

const app = express();
app.use(cors());
app.use(bodyParser.json()); 

// --- NEW: SERVE VLM IMAGES ---
// This allows the browser to access images via http://localhost:3000/captured_frames/filename.jpg
// Make sure this path correctly points to where your Python script saves images.
const imagesPath = path.join(__dirname, '../backend/node-server/ai-service/captured_frames');
app.use('/captured_frames', express.static(imagesPath));

const server = http.createServer(app);
const io = initSocket(server);

// --- API ROUTES ---
app.get('/api/alerts', (req, res) => {
    res.json(dataController.readAlerts());
});

app.post('/api/alerts/mark-construction', (req, res) => {
    const { id } = req.body;
    const updated = dataController.markConstruction(id);
    if(updated) {
        io.emit('alert_update', updated);
        res.json({ success: true, alert: updated });
    } else {
        res.status(404).json({ error: "Alert not found" });
    }
});

// --- MQTT SYSTEM ---
const mqttClient = connectMQTT((data) => {
    const targetNodeId = data.nodeId || data.node_id;

    if (targetNodeId) {
        console.log(`Registering Multimodal Incident: ${targetNodeId}`);
        
        const severity = data.severity || "MEDIUM"; 
        
        // --- UPDATED: Pass VLM Data to Controller ---
        const savedAlert = dataController.addAlert(
            targetNodeId, 
            severity, 
            data.vlm_analysis, // The JSON reasoning from Qwen2-VL
            data.image_url     // The path to the JPG
        );
        
        const broadcastPacket = {
            ...savedAlert, 
            lat: data.lat || data.latitude || 28.6139,
            lng: data.lng || data.longitude || 77.2090,
            anomaly_score: data.anomaly_score || 1.0,
            nodeId: targetNodeId
        };
        
        io.emit('new_alert', broadcastPacket);
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`RailGuard Multimodal Backend Active`);
    console.log(`API:      http://localhost:${PORT}`);
    console.log(`Images:   http://localhost:${PORT}/captured_frames`);
    console.log(`==================================================\n`);
});