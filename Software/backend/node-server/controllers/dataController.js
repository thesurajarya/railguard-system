const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/alerts.json');

// Mock GPS Map
const NODE_LOCATIONS = {
    "TRACK_SEC_42": { lat: 28.6139, lng: 77.2090, name: "New Delhi Central" },
    "TRACK_SEC_43": { lat: 28.5355, lng: 77.3910, name: "Noida Sector 18" }
};

// Helper: Read Data
const readAlerts = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) return [];
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) { return []; }
};

// Helper: Write Data
const saveAlerts = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// UPDATED: Now accepts vlmAnalysis and imageUrl
const addAlert = (nodeId, severity, vlmAnalysis = null, imageUrl = null) => {
    const alerts = readAlerts();
    const location = NODE_LOCATIONS[nodeId] || { lat: 28.6139, lng: 77.2090, name: "Unknown" };
    
    const activeIndex = alerts.findIndex(a => a.nodeId === nodeId && a.status !== 'FIXED');
    
    if (activeIndex !== -1) {
        // Update existing alert with LATEST visual evidence
        alerts[activeIndex].last_seen = new Date().toISOString();
        if (vlmAnalysis) alerts[activeIndex].vlm_analysis = vlmAnalysis;
        if (imageUrl) alerts[activeIndex].image_url = imageUrl;
        
        saveAlerts(alerts);
        return alerts[activeIndex];
    }

    const newAlert = {
        id: Date.now(),
        nodeId,
        lat: location.lat,
        lng: location.lng,
        locationName: location.name,
        severity: severity,
        status: "ACTIVE",
        isConstruction: false,
        timestamp: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        // NEW FIELDS FOR VLM
        vlm_analysis: vlmAnalysis, // Stores {vision_anomaly, vision_reason, etc.}
        image_url: imageUrl        // Stores "captured_frames/frame_123.jpg"
    };

    alerts.push(newAlert);
    saveAlerts(alerts);
    return newAlert;
};

const markConstruction = (id) => {
    const alerts = readAlerts();
    const alert = alerts.find(a => a.id === parseInt(id));
    if (alert) {
        alert.isConstruction = true;
        saveAlerts(alerts);
        return alert;
    }
    return null;
};

module.exports = { readAlerts, addAlert, markConstruction };