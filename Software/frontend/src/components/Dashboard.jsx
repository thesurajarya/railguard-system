import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import L from "leaflet";
import io from "socket.io-client";
import axios from "axios";
import "leaflet/dist/leaflet.css";

// --- IMPORT YOUR LOCAL LOGOS HERE ---
import IRLogo from "../assets/IRLogo.png"; 
import MakeInIndiaLogo from "../assets/MakeInIndiaLogo.jpeg"; 

// Fallback Emblem (Online)
const LOGO_EMBLEM = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Emblem_of_India.svg/240px-Emblem_of_India.svg.png";

// --- ICONS & ASSETS ---
const getIcon = (color) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${
        color === "green" ? "#10b981" : color === "yellow" ? "#f59e0b" : color === "red" ? "#ef4444" : "#64748b"
      }" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); width: 42px; height: 42px; transition: transform 0.2s;">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
      </svg>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -42],
  });

const icons = {
  green: getIcon("green"),
  yellow: getIcon("yellow"),
  red: getIcon("red"),
  grey: getIcon("grey"),
};

// --- SOCKET CONFIGURATION ---
const SOCKET_URL = "http://localhost:3000"; 
const API_URL = "http://localhost:3000/api/alerts";
const PYTHON_AI_URL = "http://localhost:5000"; // Added for fetching VLM images

const socket = io(SOCKET_URL, { 
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000
});

// --- STATION COORDINATES (New Delhi Railway Station) ---
const STATION_LAT = 28.6427;
const STATION_LNG = 77.2207;

export default function Dashboard() {
  // --- STATE ---
  const [mode, setMode] = useState("LIVE"); 
  const [nodes, setNodes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now());

  // UX State
  const [activeTab, setActiveTab] = useState("telemetry");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(50);

  // Logging State
  const [systemLogs, setSystemLogs] = useState([
    { id: 0, time: new Date().toLocaleTimeString(), type: "info", msg: "System Interface Loaded." },
  ]);

  const addLog = (msg, type = "info") => {
    setSystemLogs((prev) =>
      [{ id: Date.now(), time: new Date().toLocaleTimeString(), type, msg }, ...prev].slice(0, 50)
    );
  };

  // --- EFFECT: SOCKET & DATA HANDLING ---
  useEffect(() => {
    setNodes({});
    setAlerts([]);
    setTelemetry([]);
    setSystemLogs([]);
    addLog(`Switched to ${mode} MODE`, "warning");

    if (mode === "LIVE") {
      if (!socket.connected) socket.connect();
      fetchAlerts();
      
      socket.on("connect", () => addLog("Connected to Backend Stream", "success"));
      socket.on("disconnect", () => addLog("Disconnected from Backend", "error"));
      socket.on("reconnect", () => addLog("Connection Restored", "success"));

      socket.on("sensor_update", (data) => {
        setLastHeartbeat(Date.now());
        setNodes((prev) => ({
          ...prev,
          [data.node_id]: {
            lat: data.lat || data.latitude || STATION_LAT,
            lng: data.lng || data.longitude || STATION_LNG,
            lastSeen: data.timestamp,
            status: prev[data.node_id]?.status === 'red' ? 'red' : 'green',
            battery: 98, 
            rssi: -45,   
          },
        }));

        setTelemetry((prev) => {
          const newPoint = {
            time: new Date(data.timestamp).toLocaleTimeString(),
            node_id: data.node_id,
            accel_mag: data.accel_mag,
            accel_roll_rms: data.accel_roll_rms,
            mag_norm: data.mag_norm,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            mic_level: data.mic_level || 0,
            frequency: data.frequency || 0,
            anomaly_score: data.anomaly_score,
          };
          return [...prev, newPoint].slice(-50);
        });
      });

      socket.on("new_alert", (newAlert) => {
        console.log("RECEIVED ALERT:", newAlert);
        try {
          const audio = new Audio("/alert.mp3");
          audio.play().catch((e) => console.log("Audio block:", e));
        } catch (err) { console.error(err); }

        const normalizedAlert = {
            ...newAlert,
            id: newAlert.id || Date.now(),
            nodeId: newAlert.nodeId || newAlert.node_id || "UNKNOWN",
            lat: newAlert.lat || newAlert.latitude || STATION_LAT,
            lng: newAlert.lng || newAlert.longitude || STATION_LNG,
            status: newAlert.status || 'OPEN',
            // Added for Visual Evidence Support
            vlmImage: newAlert.image_url || null,
            vlmReason: newAlert.vlm_analysis?.vision_reason || "Visual confirmation pending...",
            vlmConfidence: newAlert.vlm_analysis?.vision_confidence || 0
        };

        setAlerts((prev) => {
            if (prev.find(a => a.id === normalizedAlert.id)) return prev;
            return [normalizedAlert, ...prev];
        });

        setNodes((prev) => ({
          ...prev,
          [normalizedAlert.nodeId]: {
            ...prev[normalizedAlert.nodeId],
            status: normalizedAlert.severity === "HIGH" ? "red" : "yellow",
            lat: normalizedAlert.lat,
            lng: normalizedAlert.lng
          },
        }));

        addLog(`🚨 ANOMALY: Node ${normalizedAlert.nodeId} | Severity: ${normalizedAlert.severity}`, "error");
      });

      socket.on("alert_update", (updatedAlert) => {
        setAlerts((prev) => prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)));
        if (updatedAlert.isConstruction) addLog(`Update: Alert ${updatedAlert.id} verified as CONSTRUCTION.`, "warning");
      });

    } else {
      socket.disconnect();
      setNodes({
        "TEST-NODE-01": { lat: STATION_LAT, lng: STATION_LNG, status: "green", battery: 98, rssi: -45 },
        "TEST-NODE-03": { lat: STATION_LAT - 0.002, lng: STATION_LNG + 0.001, status: "yellow", battery: 40, rssi: -80 },
      });
      addLog("Test Mode Initialized.", "info");
    }

    return () => {
      socket.off("connect"); socket.off("disconnect"); socket.off("reconnect");
      socket.off("sensor_update"); socket.off("new_alert"); socket.off("alert_update");
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "TEST") return;
    const interval = setInterval(() => {
        const t = Date.now();
        const fakeData = {
            node_id: "TEST-NODE-01",
            timestamp: t,
            lat: STATION_LAT, lng: STATION_LNG,
            accel_mag: Math.random() * 0.5,
            mag_norm: 45 + Math.cos(t/1000) * 5,
            mic_level: Math.random() * 80, 
            frequency: 48 + Math.random() * 4, 
            temperature: 28, humidity: 60, pressure: 1013
        };
        setTelemetry(prev => [...prev, { time: new Date(t).toLocaleTimeString(), ...fakeData }].slice(-50));
    }, 500);
    return () => clearInterval(interval);
  }, [mode]);

  // --- ACTIONS ---
  const fetchAlerts = async () => {
    if (mode === "TEST") return;
    try {
      const res = await axios.get(API_URL);
      const mappedAlerts = res.data.map((a) => ({
        ...a,
        status: a.isConstruction ? "CONSTRUCTION" : a.status || "OPEN",
      }));
      setAlerts(mappedAlerts);
    } catch (err) { console.error("Failed to fetch alerts", err); }
  };

  const handleResolutionChange = async (alertId, resolution) => {
    setAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, status: resolution, isConstruction: resolution === "CONSTRUCTION" } : a));
    addLog(`User Action: Marking alert ${alertId} as ${resolution}`, "info");
    if (mode === "TEST") return;
    try {
      if (resolution === "CONSTRUCTION") await axios.post(`${API_URL}/mark-construction`, { id: alertId });
    } catch (err) { addLog(`Error syncing with backend`, "error"); }
  };

  const handleDispatch = (alertId) => {
    addLog(`DISPATCH: Team Alpha sent to Site ID: ${alertId}`, "success");
  };

  // --- DATA PROCESSING ---
  const filteredAlerts = useMemo(() => {
    if (filterStatus === "ALL") return alerts;
    if (filterStatus === "HIGH") return alerts.filter((a) => a.severity === "HIGH");
    if (filterStatus === "CONSTRUCTION") return alerts.filter((a) => a.status === "CONSTRUCTION");
    if (filterStatus === "CLOSED") return alerts.filter((a) => a.status === "CLOSED");
    return alerts;
  }, [alerts, filterStatus]);

  const displayTelemetry = useMemo(() => {
    let data = selectedNode ? telemetry.filter((t) => t.node_id === selectedNode) : telemetry;
    if (replayMode) {
      const endIndex = Math.floor((replayIndex / 100) * data.length);
      const startIndex = Math.max(0, endIndex - 20);
      return data.slice(startIndex, endIndex);
    }
    return data.slice(-20);
  }, [telemetry, selectedNode, replayMode, replayIndex]);

  const latestEnv = displayTelemetry.length > 0 ? displayTelemetry[displayTelemetry.length - 1] : {};
  const currentNode = selectedNode ? nodes[selectedNode] : null;

  // --- DARK THEME STYLES ---
  const styles = {
    container: { display: "flex", flexDirection: "column", height: "100vh", width: "100%", overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif", backgroundColor: "#0f172a", color: "#e2e8f0" },
    header: { height: "80px", background: "rgba(15, 23, 42, 0.95)", borderBottom: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0, zIndex: 50 },
    
    logoContainer: { 
        display: "flex", alignItems: "center", gap: "16px", 
        background: "#ffffff", padding: "4px 12px", borderRadius: "8px", marginRight: "16px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        height: "64px" 
    },
    
    statusBadge: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "999px" },
    body: { display: "flex", flex: 1, height: "calc(100vh - 80px)", overflow: "hidden", width: "100%" },
    leftPanel: { flex: "0 0 35%", height: "100%", position: "relative", borderRight: "1px solid #334155", zIndex: 10 },
    rightPanel: { flex: 1, display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#020617", overflowY: "auto", minWidth: 0 },
    kpiRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", padding: "20px" },
    kpiCard: { background: "#1e293b", padding: "16px", borderRadius: "12px", border: "1px solid #334155", boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)' },
    kpiLabel: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" },
    kpiValue: { fontSize: "1.5rem", fontWeight: "700", color: "#f8fafc", marginTop: "8px" },
    alertSection: { margin: "0 20px 20px 20px", display: "flex", flexDirection: "column", backgroundColor: "#1e293b", borderRadius: "12px", border: "1px solid #334155", overflow: "hidden", flexShrink: 0, maxHeight: "40%", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.3)" },
    alertHeader: { padding: "16px 20px", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e293b" },
    filterPill: (active) => ({ padding: "6px 14px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer", background: active ? "#3b82f6" : "#334155", color: "white", border: "none", marginRight: "8px", transition: "all 0.2s" }),
    graphSection: { padding: "0 20px 20px 20px", display: "flex", flexDirection: "column", flex: 1 },
    tabHeader: { display: "flex", gap: "24px", borderBottom: "1px solid #334155", marginBottom: "20px" },
    tab: (active) => ({ padding: "0 0 12px 0", cursor: "pointer", fontSize: "0.9rem", fontWeight: "600", color: active ? "#60a5fa" : "#94a3b8", borderBottom: active ? "3px solid #60a5fa" : "3px solid transparent", transition: "color 0.2s" }),
    gridContainer: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
    chartCard: { background: "#1e293b", borderRadius: "12px", padding: "20px", border: "1px solid #334155", height: "280px", display: "flex", flexDirection: "column" },
    footer: { height: "160px", backgroundColor: "#020617", color: "#cbd5e1", display: "flex", flexDirection: "column", borderTop: "1px solid #334155", flexShrink: 0, fontFamily: "'JetBrains Mono', 'Courier New', monospace", zIndex: 60 },
    consoleBody: { flex: 1, overflowY: "auto", padding: "12px 20px", fontSize: "0.8rem", lineHeight: "1.6" },
    modeSelect: { padding: "8px 16px", borderRadius: "8px", border: "1px solid #475569", background: "#0f172a", color: "white", fontWeight: "bold", cursor: "pointer", outline: "none" },
    statusSelect: { padding: "6px 10px", borderRadius: "6px", border: "1px solid #475569", fontSize: "0.75rem", color: "#e2e8f0", cursor: "pointer", background: "#334155", outline: "none" },
  };

  return (
    <div style={styles.container}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
        .status-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); } 70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
        .leaflet-container { background: #cbd5e1; }
        .btn-action { padding: 6px 12px; border: none; background: #3b82f6; border-radius: 6px; font-size: 0.75rem; font-weight: 600; color: white; cursor: pointer; transition: all 0.2s; }
        .btn-action:hover { background: #2563eb; transform: translateY(-1px); }
        .btn-dispatch { background: #dc2626; color: white; margin-left: 8px; }
        .btn-dispatch:hover { background: #b91c1c; }
        input[type=range] { width: 120px; cursor: pointer; accent-color: #3b82f6; }
        .custom-marker { background: transparent; border: none; }
        .custom-marker svg:hover { transform: scale(1.1); }
      `}</style>

      {/* HEADER WITH OFFICIAL LOGOS */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={styles.logoContainer}>
             <img src={LOGO_EMBLEM} alt="Government of India" style={{ height: "100%", width: "auto" }} />
             <div style={{width: "1px", height: "40px", background: "#cbd5e1"}}></div>
             <img src={IRLogo} alt="Indian Railways" style={{ height: "60px", width: "auto" }} onError={(e) => {e.target.onerror = null; e.target.src="https://via.placeholder.com/50"}}/>
          </div>
          
          <div>
            <h1 style={{ fontSize: "1.4rem", fontWeight: "800", letterSpacing: "-0.02em", color: "#f8fafc", margin: 0, lineHeight: 1 }}>RailGuard Command</h1>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "600", marginTop: "4px", letterSpacing: "0.05em" }}>
                MINISTRY OF RAILWAYS | RDSO COMPLIANT
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ background: "white", padding: "4px 12px", borderRadius: "6px", display: "flex", alignItems: "center", height: "55px" }}>
             <img src={MakeInIndiaLogo} alt="Make In India" style={{ height: "100%", width: "auto" }} onError={(e) => {e.target.onerror = null; e.target.src="https://via.placeholder.com/50"}} />
          </div>
          
          <div style={{ width: "1px", height: "30px", background: "#475569" }}></div>
          
          <select style={styles.modeSelect} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="LIVE">LIVE SENSORS</option>
            <option value="TEST">TEST MODE (SIM)</option>
          </select>
          <div style={styles.statusBadge}>
            <div className="status-dot" style={{ background: mode === "LIVE" ? "#10b981" : "#f59e0b" }}></div>
            <span style={{ fontSize: "0.8rem", color: mode === "LIVE" ? "#10b981" : "#f59e0b", fontWeight: "700" }}>
              {mode === "LIVE" ? "SYSTEM ACTIVE" : "SIMULATION"}
            </span>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div style={styles.body}>
        {/* LEFT: MAP (LIGHT THEME) */}
        <div style={styles.leftPanel}>
          <MapContainer center={[STATION_LAT, STATION_LNG]} zoom={16} zoomControl={false} style={{ height: "100%" }}>
            <TileLayer 
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
                attribution='&copy; OpenStreetMap' 
                maxZoom={19} 
            />
            <TileLayer 
                url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" 
                attribution='&copy; OpenRailwayMap' 
                maxZoom={19} 
            />
            
            {filteredAlerts.map((alert) => (
              <Marker key={`alert-${alert.id}`} position={[alert.lat || 0, alert.lng || 0]} icon={icons.red}>
                <Popup className="custom-popup">
                  <div style={{ fontFamily: "Inter, sans-serif", color: "#1e293b" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "1.2rem" }}>🚨</span>
                        <b style={{ color: "#ef4444", fontSize: "1rem" }}>THREAT DETECTED</b>
                    </div>
                    <div style={{ fontSize: "0.85rem", marginBottom: "4px" }}><b>Node:</b> {alert.nodeId}</div>
                    <div style={{ fontSize: "0.85rem", marginBottom: "8px" }}><b>Severity:</b> <span style={{ fontWeight: "bold", color: "#ef4444" }}>{alert.severity}</span></div>
                    <hr style={{ margin: "8px 0", borderTop: "1px solid #e2e8f0" }} />
                    {alert.status === "CONSTRUCTION" ? (
                      <div style={{ background: "#fef3c7", padding: "6px", borderRadius: "6px", color: "#b45309", fontSize: "0.75rem", textAlign: "center", fontWeight: "600" }}>Construction Verified</div>
                    ) : alert.status === "CLOSED" ? (
                      <div style={{ background: "#dcfce7", padding: "6px", borderRadius: "6px", color: "#166534", fontSize: "0.75rem", textAlign: "center", fontWeight: "600" }}>Resolved / Closed</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <label style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: "600" }}>IMMEDIATE ACTION:</label>
                        <select style={{ padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", cursor: "pointer", width: "100%" }} onChange={(e) => handleResolutionChange(alert.id, e.target.value)} defaultValue="">
                          <option value="" disabled>Select Resolution...</option>
                          <option value="CONSTRUCTION">🚧 Verify Construction</option>
                          <option value="CLOSED">Close Alert</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            {Object.entries(nodes).map(([id, node]) => (
              <Marker key={id} position={[node.lat || 0, node.lng || 0]} icon={icons[node.status] || icons.green} eventHandlers={{ click: () => setSelectedNode(id) }} />
            ))}
          </MapContainer>
        </div>

        {/* RIGHT: DATA (DARK THEME) */}
        <div style={styles.rightPanel}>
          {/* 1. KPI CARDS */}
          <div style={styles.kpiRow}>
            <div style={styles.kpiCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={styles.kpiLabel}>System Uptime</div>
                <div style={{ color: "#10b981" }}>●</div>
              </div>
              <div style={styles.kpiValue} style={{ color: "#10b981" }}>99.98%</div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <div style={styles.kpiLabel}>Active Nodes</div>
                 <div style={{ color: "#3b82f6" }}>●</div>
              </div>
              <div style={styles.kpiValue} style={{ color: "#60a5fa" }}>{Object.keys(nodes).length} <span style={{fontSize: "0.9rem", color:"#64748b"}}>/ {Object.keys(nodes).length + 2}</span></div>
            </div>
            <div style={styles.kpiCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <div style={styles.kpiLabel}>Max Impact</div>
                 <div style={{ color: "#f59e0b" }}>●</div>
              </div>
              <div style={styles.kpiValue} style={{ color: "#f8fafc" }}>
                  {latestEnv.accel_mag ? latestEnv.accel_mag.toFixed(3) : "0.00"} <span style={{fontSize: "0.9rem", color:"#64748b"}}>g</span>
              </div>
            </div>
          </div>

          {/* 2. ALERTS */}
          <div style={styles.alertSection}>
            <div style={styles.alertHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontWeight: "700", fontSize: "0.9rem", color: "#f1f5f9" }}>INCIDENT FEED</span>
                {filteredAlerts.length > 0 && (
                    <span style={{ background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", fontSize: "0.7rem", padding: "2px 8px", borderRadius: "10px", fontWeight: "700", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                        {filteredAlerts.length} ACTIVE
                    </span>
                )}
              </div>
              <div>
                {["ALL", "HIGH", "CONSTRUCTION", "CLOSED"].map((filter) => (
                  <button key={filter} style={styles.filterPill(filterStatus === filter)} onClick={() => setFilterStatus(filter)}>{filter}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ background: "#1e293b", position: "sticky", top: 0, zIndex: 5 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: "0.7rem", color: "#64748b", borderBottom: "1px solid #334155" }}>TIME</th>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: "0.7rem", color: "#64748b", borderBottom: "1px solid #334155" }}>NODE ID</th>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: "0.7rem", color: "#64748b", borderBottom: "1px solid #334155" }}>LOCATION</th>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: "0.7rem", color: "#64748b", borderBottom: "1px solid #334155" }}>SEVERITY</th>
                    <th style={{ textAlign: "right", padding: "12px 20px", fontSize: "0.7rem", color: "#64748b", borderBottom: "1px solid #334155" }}>RESPONSE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #334155", background: alert.status === "CONSTRUCTION" ? "rgba(245, 158, 11, 0.1)" : alert.status === "CLOSED" ? "rgba(16, 185, 129, 0.05)" : "transparent" }}>
                      <td style={{ padding: "12px 20px", fontSize: "0.8rem", color: "#cbd5e1" }}>{new Date(alert.timestamp).toLocaleTimeString()}</td>
                      <td style={{ padding: "12px 20px", fontSize: "0.85rem", fontWeight: "600", color: "#f8fafc" }}>{alert.nodeId}</td>
                      <td style={{ padding: "12px 20px", fontSize: "0.8rem", fontFamily: "monospace", color: "#94a3b8" }}>{Number(alert.lat).toFixed(3)}, {Number(alert.lng).toFixed(3)}</td>
                      <td style={{ padding: "12px 20px" }}>
                        <span style={{ 
                            padding: "4px 10px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: "bold", 
                            background: alert.severity === "HIGH" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)", 
                            color: alert.severity === "HIGH" ? "#fca5a5" : "#fcd34d",
                            border: `1px solid ${alert.severity === "HIGH" ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"}`
                        }}>{alert.severity}</span>
                      </td>
                      <td style={{ padding: "12px 20px", textAlign: "right" }}>
                        {alert.status === "CONSTRUCTION" ? (<span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: "600" }}>🚧 Verified Const.</span>) : alert.status === "CLOSED" ? (<span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "600" }}>✅ Incident Closed</span>) : (
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <select style={styles.statusSelect} onChange={(e) => handleResolutionChange(alert.id, e.target.value)} defaultValue=""><option value="" disabled>Action ▼</option><option value="CONSTRUCTION">🚧 Verify Construction</option><option value="CLOSED">✅ Close Alert</option></select>
                            <button className="btn-action btn-dispatch" onClick={() => handleDispatch(alert.id)}>DISPATCH</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAlerts.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: "center", padding: "40px", color: "#64748b", fontSize: "0.9rem" }}>No active alerts. System nominal.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. TABS & GRAPHS */}
          <div style={styles.graphSection}>
            <div style={styles.tabHeader}>
              <span style={styles.tab(activeTab === "telemetry")} onClick={() => setActiveTab("telemetry")}>LIVE TELEMETRY</span>
              <span style={styles.tab(activeTab === "health")} onClick={() => setActiveTab("health")}>DEVICE HEALTH</span>
              <span style={styles.tab(activeTab === "vision")} onClick={() => setActiveTab("vision")}>VISION FEED (AI)</span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: "600" }}>PLAYBACK:</span>
                <input type="checkbox" checked={replayMode} onChange={(e) => setReplayMode(e.target.checked)} style={{accentColor: "#3b82f6"}} />
                {replayMode && (<input type="range" min="0" max="100" value={replayIndex} onChange={(e) => setReplayIndex(e.target.value)} style={{ width: "100px" }} />)}
              </div>
            </div>

            {activeTab === "telemetry" && (
              <div style={styles.gridContainer}>
                <div style={styles.chartCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8" }}>VIBRATION MAGNITUDE</div>
                    <div style={{ fontSize: "0.7rem", color: "#60a5fa" }}>ACCELEROMETER</div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", color: "#f8fafc" }} />
                      <Line type="monotone" dataKey="accel_mag" stroke="#60a5fa" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.chartCard}>
                   <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8" }}>MAGNETIC FLUX (µT)</div>
                    <div style={{ fontSize: "0.7rem", color: "#f59e0b" }}>MAGNETOMETER</div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayTelemetry}>
                      <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="time" hide />
                      <YAxis width={30} tick={{ fontSize: 10, fill: "#64748b" }} domain={["auto", "auto"]} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", color: "#f8fafc" }} />
                      <Line type="monotone" dataKey="mag_norm" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.chartCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8" }}>ACOUSTIC NOISE (dB)</div>
                    <div style={{ fontSize: "0.7rem", color: "#3b82f6" }}>MICROPHONE</div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayTelemetry}>
                        <defs>
                            <linearGradient id="colorMic" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} width={30} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", color: "#f8fafc" }} />
                        <Area type="monotone" dataKey="mic_level" stroke="#3b82f6" fillOpacity={1} fill="url(#colorMic)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div style={styles.chartCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8" }}>VIBRATION FREQUENCY (Hz)</div>
                    <div style={{ fontSize: "0.7rem", color: "#8b5cf6" }}>SPECTRAL ANALYSIS</div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayTelemetry}>
                        <defs>
                            <linearGradient id="colorFreq" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={['auto', 'auto']} width={30} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", color: "#f8fafc" }} />
                        <Area type="monotone" dataKey="frequency" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorFreq)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {activeTab === "health" && (
              <div style={styles.gridContainer}>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8", marginBottom: "10px" }}>TRACK TEMPERATURE</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[latestEnv]} layout="vertical">
                      <CartesianGrid stroke="#334155" horizontal={false} />
                      <XAxis type="number" domain={[0, 60]} hide />
                      <YAxis type="category" dataKey="temperature" width={1} hide />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155" }} />
                      <Bar dataKey="temperature" barSize={40} radius={[0, 4, 4, 0]}>
                        {[latestEnv].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.temperature > 45 ? "#ef4444" : "#10b981"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ textAlign: "center", marginTop: "10px", fontSize: "1.2rem", color: "#f8fafc" }}>{latestEnv.temperature?.toFixed(1)}°C <span style={{ fontSize: "0.8rem", color: "#64748b" }}>/ CRITICAL: 45°C</span></div>
                </div>
                <div style={styles.chartCard}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8", marginBottom: "10px" }}>NODE STATUS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "10px" }}>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                            <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Battery Level</span>
                            <span style={{ fontSize: "0.8rem", color: "#10b981" }}>{currentNode?.battery || 85}%</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "#334155", borderRadius: "4px" }}><div style={{ width: `${currentNode?.battery || 85}%`, height: "100%", background: "#10b981", borderRadius: "4px", boxShadow: "0 0 10px rgba(16,185,129,0.3)" }}></div></div>
                    </div>
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                            <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>Signal Strength (RSSI)</span>
                            <span style={{ fontSize: "0.8rem", color: "#3b82f6" }}>Good</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "#334155", borderRadius: "4px" }}><div style={{ width: "70%", height: "100%", background: "#3b82f6", borderRadius: "4px", boxShadow: "0 0 10px rgba(59,130,246,0.3)" }}></div></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "vision" && (
              <div style={{ display: "flex", gap: "20px", height: "100%" }}>
                <div style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: "12px", border: "1px solid #334155", padding: "15px", display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#94a3b8", marginBottom: "10px" }}>LIVE CAMERA FEED (ANALYSIS)</div>
                    <div style={{ flex: 1, backgroundColor: "#020617", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #475569" }}>
                        {alerts[0]?.vlmImage ? (
                            <img 
                                src={`${PYTHON_AI_URL}/${alerts[0].vlmImage}`} 
                                alt="Visual Evidence" 
                                style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                            />
                        ) : (
                            <div style={{ textAlign: "center", color: "#475569" }}>
                                <p style={{ fontSize: "2rem" }}>📸</p>
                                <p style={{ fontSize: "0.8rem" }}>Searching for visual threats...</p>
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ width: "35%", display: "flex", flexDirection: "column", gap: "15px" }}>
                    <div style={{ ...styles.kpiCard, flex: 1 }}>
                        <div style={styles.kpiLabel}>AI Reasoning</div>
                        <p style={{ marginTop: "10px", fontSize: "0.9rem", color: "#cbd5e1", fontStyle: "italic", lineHeight: "1.4" }}>
                            "{alerts[0]?.vlmReason || "The system is currently scanning for physical tampering or human presence near the tracks."}"
                        </p>
                    </div>
                    <div style={styles.kpiCard}>
                        <div style={styles.kpiLabel}>Confidence Score</div>
                        <div style={{ ...styles.kpiValue, color: "#60a5fa" }}>
                            {alerts[0]?.vlmConfidence ? (alerts[0].vlmConfidence * 100).toFixed(1) + "%" : "0.0%"}
                        </div>
                    </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <div style={{ padding: "8px 24px", background: "#020617", fontSize: "0.75rem", fontWeight: "bold", color: "#64748b", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between" }}>
          <span>{">"}_ SYSTEM CONSOLE OUTPUT</span>
          <span style={{ color: "#10b981" }}>● SECURE CONNECTION ESTABLISHED</span>
        </div>
        <div style={styles.consoleBody} className="console-logs">
          {systemLogs.map((log) => (
            <div key={log.id} style={{ marginBottom: "6px", display: "flex", gap: "12px", fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: "#475569" }}>[{log.time}]</span>
              <span style={{ color: log.type === "error" ? "#ef4444" : log.type === "warning" ? "#f59e0b" : log.type === "success" ? "#10b981" : "#cbd5e1" }}>
                {log.type === "error" ? "✖ " : log.type === "success" ? "✔ " : "ℹ "}{log.msg}
              </span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}