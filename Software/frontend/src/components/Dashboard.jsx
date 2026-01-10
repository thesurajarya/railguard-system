import React, { useEffect, useState, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import L from "leaflet";
import io from "socket.io-client";
import axios from "axios";
import "leaflet/dist/leaflet.css";

// --- ICONS & ASSETS ---
const getIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/markers-default/${color}-marker.png`,
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

const icons = {
  green: getIcon("green"),
  yellow: getIcon("yellow"),
  red: getIcon("red"),
  grey: getIcon("grey"),
};

// Initialize socket outside component to prevent multiple connections
const socket = io("http://localhost:3000", { autoConnect: false });
const API_URL = "http://localhost:3000/api/alerts";

export default function Dashboard() {
  // --- STATE ---
  const [mode, setMode] = useState('LIVE'); // 'LIVE' or 'TEST'
  
  const [nodes, setNodes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  
  // UX State
  const [activeTab, setActiveTab] = useState('telemetry');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(50);
  
  // Logging State
  const [systemLogs, setSystemLogs] = useState([
    { id: 0, time: new Date().toLocaleTimeString(), type: 'info', msg: 'System initialized. Waiting for stream selection...' }
  ]);

  const addLog = (msg, type = 'info') => {
    setSystemLogs(prev => [{ id: Date.now(), time: new Date().toLocaleTimeString(), type, msg }, ...prev].slice(0, 50));
  };

  // --- EFFECT: HANDLE MODE SWITCHING ---
  useEffect(() => {
    // Reset Data on Mode Switch
    setNodes({});
    setAlerts([]);
    setTelemetry([]);
    setSystemLogs([]);
    addLog(`Switched to ${mode} MODE`, "warning");

    if (mode === 'LIVE') {
        socket.connect();
        fetchAlerts(); // Fetch historical real alerts
        
        // --- LIVE SOCKET LISTENERS ---
        socket.on("connect", () => addLog("Connected to Backend Server", "success"));
        socket.on("disconnect", () => addLog("Lost connection to Backend Server", "error"));

        socket.on("sensor_update", (data) => {
            updateNodesAndTelemetry(data);
        });

        socket.on("new_alert", (newAlert) => {
            setAlerts((prev) => [newAlert, ...prev]);
            setNodes((prev) => ({
                ...prev,
                [newAlert.nodeId]: { ...prev[newAlert.nodeId], status: newAlert.severity === "HIGH" ? "red" : "yellow" },
            }));
            addLog(`ANOMALY DETECTED: Node ${newAlert.nodeId} | Severity: ${newAlert.severity}`, "error");
        });

        socket.on("alert_update", (updatedAlert) => {
            setAlerts((prev) => prev.map((a) => (a.id === updatedAlert.id ? updatedAlert : a)));
            if(updatedAlert.isConstruction) addLog(`Update: Alert ${updatedAlert.id} marked as CONSTRUCTION activity.`, "warning");
        });
    } else {
        socket.disconnect();
        // Initialize Dummy Nodes for Test Mode
        setNodes({
            'TEST-NODE-01': { lat: 28.6139, lng: 77.2090, status: 'green', battery: 98, rssi: -45 },
            'TEST-NODE-02': { lat: 28.6150, lng: 77.2100, status: 'green', battery: 85, rssi: -60 },
            'TEST-NODE-03': { lat: 28.6120, lng: 77.2080, status: 'yellow', battery: 40, rssi: -80 }
        });
        addLog("Test Mode Initialized. Simulating sensor data...", "info");
    }

    return () => {
        socket.off("connect");
        socket.off("disconnect");
        socket.off("sensor_update");
        socket.off("new_alert");
        socket.off("alert_update");
    };
  }, [mode]);

  // --- EFFECT: TEST MODE SIMULATION LOOP ---
  useEffect(() => {
    if (mode !== 'TEST') return;

    const interval = setInterval(() => {
        const timestamp = Date.now();
        const timeStr = new Date(timestamp).toLocaleTimeString();
        
        // 1. Simulate Telemetry (Sine waves for realistic look)
        const t = timestamp / 1000;
        const fakeData = {
            node_id: 'TEST-NODE-01',
            timestamp: timestamp,
            lat: 28.6139, lng: 77.2090,
            accel_mag: Math.abs(Math.sin(t)) * 0.5 + Math.random() * 0.1, // Vibration
            accel_roll_rms: Math.abs(Math.sin(t)) * 0.3,
            mag_norm: 45 + Math.cos(t) * 5, // Magnetic
            temperature: 28 + Math.random(),
            humidity: 60 + Math.random() * 2,
            pressure: 1013,
            anomaly_score: Math.random() > 0.9 ? -0.5 : 0.5
        };

        updateNodesAndTelemetry(fakeData);

        // 2. Simulate Random Alert (Rarely)
        if (Math.random() > 0.98) {
            const fakeAlert = {
                id: timestamp,
                timestamp: timestamp,
                nodeId: 'TEST-NODE-03',
                lat: 28.6120, lng: 77.2080,
                severity: Math.random() > 0.5 ? 'HIGH' : 'MEDIUM',
                isConstruction: false
            };
            setAlerts(prev => [fakeAlert, ...prev]);
            addLog(`[SIMULATION] Alert generated on TEST-NODE-03`, "error");
        }

    }, 800); // Update every 800ms

    return () => clearInterval(interval);
  }, [mode]);

  // --- HELPER: Update State (Used by both Live and Test) ---
  const updateNodesAndTelemetry = (data) => {
    setNodes((prev) => ({
        ...prev,
        [data.node_id]: {
          lat: data.lat || data.latitude,
          lng: data.lng || data.longitude,
          alt: data.altitude || 0,
          lastSeen: data.timestamp,
          status: prev[data.node_id]?.status || 'green', // Preserve status unless alert changes it
          battery: Math.max(0, 100 - (Date.now() % 100000) / 1000), 
          rssi: -40 - Math.random() * 10
        },
    }));

    setTelemetry((prev) => {
        const newData = [...prev, {
            time: new Date(data.timestamp).toLocaleTimeString(),
            node_id: data.node_id,
            accel_mag: data.accel_mag,
            accel_roll_rms: data.accel_roll_rms,
            mag_norm: data.mag_norm,
            temperature: data.temperature,
            humidity: data.humidity,
            pressure: data.pressure,
            anomaly_score: data.anomaly_score
        }];
        return newData.slice(-100); 
    });
  };

  // --- ACTIONS ---
  const fetchAlerts = async () => {
    if (mode === 'TEST') return; // Don't fetch real alerts in test mode
    try {
      const res = await axios.get(API_URL);
      setAlerts(res.data);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    }
  };

  const handleMarkConstruction = async (alertId) => {
    if (mode === 'TEST') {
        setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isConstruction: true } : a));
        addLog(`[SIMULATION] Alert ${alertId} marked as construction`, "info");
        return;
    }
    try {
      await axios.post(`${API_URL}/mark-construction`, { id: alertId });
      addLog(`User Action: Verifying alert ${alertId} as construction site...`, "info");
    } catch (err) {
      addLog(`Error: Could not update alert status`, "error");
    }
  };

  const handleDispatch = (alertId) => {
      addLog(`DISPATCH: Inspection Team Alpha sent to Site ID: ${alertId}`, "success");
  };

  // --- DATA PROCESSING ---
  const filteredAlerts = useMemo(() => {
      if (filterStatus === 'ALL') return alerts;
      if (filterStatus === 'HIGH') return alerts.filter(a => a.severity === 'HIGH');
      if (filterStatus === 'CONSTRUCTION') return alerts.filter(a => a.isConstruction);
      return alerts;
  }, [alerts, filterStatus]);

  // Replay Logic
  const displayTelemetry = useMemo(() => {
    let data = selectedNode ? telemetry.filter(t => t.node_id === selectedNode) : telemetry;
    if (replayMode) {
        const endIndex = Math.floor((replayIndex / 100) * data.length);
        const startIndex = Math.max(0, endIndex - 20);
        return data.slice(startIndex, endIndex);
    }
    return data.slice(-20); // Default live view (last 20)
  }, [telemetry, selectedNode, replayMode, replayIndex]);

  const latestEnv = displayTelemetry.length > 0 ? displayTelemetry[displayTelemetry.length - 1] : {};
  const currentNode = selectedNode ? nodes[selectedNode] : null;

  // --- STYLES ---
  const styles = {
    container: { display: "flex", flexDirection: "column", height: "100vh", width: "100%", overflow: "hidden", fontFamily: "'Inter', sans-serif", backgroundColor: "#f8fafc" },
    header: { height: "60px", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", zIndex: 50 },
    statusBadge: { display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "20px" },
    body: { display: "flex", flex: 1, height: "calc(100vh - 60px)", overflow: "hidden", width: "100%" },
    leftPanel: { flex: "0 0 35%", height: "100%", position: "relative", borderRight: "1px solid #e2e8f0", zIndex: 10 },
    rightPanel: { flex: 1, display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#f1f5f9", overflowY: "auto", minWidth: 0 },
    
    // KPI Cards
    kpiRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', padding: '16px 16px 0 16px' },
    kpiCard: { background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
    kpiLabel: { fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' },
    kpiValue: { fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a', marginTop: '4px' },

    // Alert Section
    alertSection: { margin: "16px", display: "flex", flexDirection: "column", backgroundColor: "white", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0", overflow: "hidden", flexShrink: 0, maxHeight: "40%" },
    alertHeader: { padding: "12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white", position: "sticky", top: 0, zIndex: 20 },
    filterPill: (active) => ({
        padding: '4px 10px', borderRadius: '15px', fontSize: '0.7rem', fontWeight: '600', cursor: 'pointer',
        background: active ? '#e0f2fe' : '#f1f5f9', color: active ? '#0284c7' : '#64748b', border: 'none', marginRight: '8px'
    }),

    // Graph Section
    graphSection: { padding: "0 16px 20px 16px", display: "flex", flexDirection: "column", flex: 1 },
    tabHeader: { display: 'flex', gap: '20px', borderBottom: '1px solid #e2e8f0', marginBottom: '15px', paddingBottom: '5px' },
    tab: (active) => ({
        padding: '5px 0', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600',
        color: active ? '#3b82f6' : '#94a3b8', borderBottom: active ? '2px solid #3b82f6' : 'none'
    }),
    gridContainer: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
    chartCard: { background: "white", borderRadius: "12px", padding: "16px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", height: "260px", display: "flex", flexDirection: "column" },
    
    // Footer Console
    footer: { height: "140px", backgroundColor: "#0f172a", color: "#e2e8f0", display: "flex", flexDirection: "column", borderTop: "4px solid #334155", flexShrink: 0, fontFamily: "'Courier New', monospace", zIndex: 60 },
    consoleBody: { flex: 1, overflowY: "auto", padding: "10px 15px", fontSize: "0.8rem", lineHeight: "1.6" },
    
    // Mode Select
    modeSelect: {
        padding: '6px 12px', borderRadius: '6px', border: '1px solid #475569', 
        background: '#1e293b', color: 'white', fontWeight: 'bold', cursor: 'pointer'
    }
  };

  // --- RENDER ---
  return (
    <div style={styles.container}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .status-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); } 70% { box-shadow: 0 0 0 6px rgba(74,222,128,0); } 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); } }
        .leaflet-container { background: #cbd5e1; }
        .btn-action { padding: 4px 8px; border: 1px solid #cbd5e1; background: white; border-radius: 4px; font-size: 0.7rem; color: #475569; cursor: pointer; transition: all 0.2s; }
        .btn-action:hover { background: #f1f5f9; color: #1e293b; border-color: #94a3b8; }
        .btn-dispatch { background: #fee2e2; color: #b91c1c; border-color: #fecaca; margin-left: 5px; }
        .btn-dispatch:hover { background: #fecaca; }
        input[type=range] { width: 100%; cursor: pointer; accent-color: #3b82f6; }
      `}</style>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
          <span style={{fontSize:'1.5rem'}}>🚄</span>
          <div>
            <h1 style={{fontSize:'1.2rem', fontWeight:'700'}}>RailGuard Command</h1>
            <div style={{fontSize:'0.75rem', opacity:0.8}}>Professional Operator Interface</div>
          </div>
        </div>
        
        {/* MODE SWITCHER */}
        <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
            <select style={styles.modeSelect} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="LIVE">🔴 LIVE SENSORS</option>
                <option value="TEST">🧪 TEST MODE (SIM)</option>
            </select>

            <div style={styles.statusBadge}>
                <div className="status-dot" style={{background: mode==='LIVE'?'#4ade80':'#f59e0b'}}></div>
                <span style={{fontSize:'0.8rem', color: mode==='LIVE'?'#4ade80':'#f59e0b', fontWeight:'600'}}>
                    {mode === 'LIVE' ? 'SYSTEM ACTIVE' : 'SIMULATION'}
                </span>
            </div>
        </div>
      </header>

      {/* BODY */}
      <div style={styles.body}>
        
        {/* LEFT: MAP */}
        <div style={styles.leftPanel}>
          <MapContainer center={[28.6139, 77.209]} zoom={13} zoomControl={false} style={{height: '100%'}}>
            <TileLayer
              url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
              attribution='&copy; OpenRailwayMap'
              maxZoom={19}
            />
            {filteredAlerts.map((alert) => (
              <Marker key={`alert-${alert.id}`} position={[alert.lat || 0, alert.lng || 0]} icon={icons.red}>
                <Popup>
                  <div style={{fontFamily:'Inter, sans-serif'}}>
                    <b style={{color:'#ef4444'}}>🚨 ALERT</b><br/>
                    Node: {alert.nodeId}<br/>
                    Severity: {alert.severity}
                  </div>
                </Popup>
              </Marker>
            ))}
            {Object.entries(nodes).map(([id, node]) => (
              <Marker key={id} position={[node.lat || 0, node.lng || 0]} icon={icons[node.status] || icons.green} eventHandlers={{ click: () => setSelectedNode(id) }} />
            ))}
          </MapContainer>
        </div>

        {/* RIGHT: DATA */}
        <div style={styles.rightPanel}>
          
          {/* 1. KPI CARDS */}
          <div style={styles.kpiRow}>
            <div style={styles.kpiCard}>
                <div style={styles.kpiLabel}>System Uptime</div>
                <div style={styles.kpiValue} style={{color: '#16a34a'}}>99.98%</div>
            </div>
            <div style={styles.kpiCard}>
                <div style={styles.kpiLabel}>Active Nodes</div>
                <div style={styles.kpiValue} style={{color: '#3b82f6'}}>{Object.keys(nodes).length} / {Object.keys(nodes).length + 2}</div>
            </div>
            <div style={styles.kpiCard}>
                <div style={styles.kpiLabel}>Avg Vibration</div>
                <div style={styles.kpiValue}>0.04g</div>
            </div>
          </div>

          {/* 2. ALERTS */}
          <div style={styles.alertSection}>
            <div style={styles.alertHeader}>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <span style={{fontWeight:'600'}}>Incident Feed</span>
                <span style={{background:'#fee2e2', color:'#ef4444', fontSize:'0.7rem', padding:'2px 8px', borderRadius:'10px', fontWeight:'700'}}>{filteredAlerts.length} Active</span>
              </div>
              {/* FILTER PILLS */}
              <div>
                  {['ALL', 'HIGH', 'CONSTRUCTION'].map(filter => (
                      <button key={filter} style={styles.filterPill(filterStatus === filter)} onClick={() => setFilterStatus(filter)}>
                          {filter}
                      </button>
                  ))}
              </div>
            </div>
            <div style={{flex:1, overflowY:'auto'}}>
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead style={{background:'#f8fafc', position:'sticky', top:0}}>
                  <tr>
                    <th style={{textAlign:'left', padding:'10px 15px', fontSize:'0.75rem', color:'#64748b'}}>TIME</th>
                    <th style={{textAlign:'left', padding:'10px 15px', fontSize:'0.75rem', color:'#64748b'}}>NODE</th>
                    <th style={{textAlign:'left', padding:'10px 15px', fontSize:'0.75rem', color:'#64748b'}}>LOC</th>
                    <th style={{textAlign:'left', padding:'10px 15px', fontSize:'0.75rem', color:'#64748b'}}>STATUS</th>
                    <th style={{textAlign:'right', padding:'10px 15px', fontSize:'0.75rem', color:'#64748b'}}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => (
                    <tr key={idx} style={{borderBottom:'1px solid #f1f5f9', background: alert.isConstruction ? '#fffbeb' : 'white'}}>
                      <td style={{padding:'10px 15px', fontSize:'0.8rem'}}>{new Date(alert.timestamp).toLocaleTimeString()}</td>
                      <td style={{padding:'10px 15px', fontSize:'0.8rem', fontWeight:'600'}}>{alert.nodeId}</td>
                      <td style={{padding:'10px 15px', fontSize:'0.75rem', fontFamily:'monospace', color:'#64748b'}}>{Number(alert.lat).toFixed(3)}, {Number(alert.lng).toFixed(3)}</td>
                      <td style={{padding:'10px 15px'}}>
                        <span style={{padding:'2px 8px', borderRadius:'10px', fontSize:'0.7rem', fontWeight:'bold', background: alert.severity==='HIGH'?'#fee2e2':'#fef9c3', color: alert.severity==='HIGH'?'#991b1b':'#854d0e'}}>
                            {alert.severity}
                        </span>
                      </td>
                      <td style={{padding:'10px 15px', textAlign:'right'}}>
                        {alert.isConstruction ? (
                            <span style={{fontSize:'0.75rem', color:'#b45309'}}>🚧 Verified</span>
                        ) : (
                            <>
                                <button className="btn-action" onClick={() => handleMarkConstruction(alert.id)}>Verify Site</button>
                                <button className="btn-action btn-dispatch" onClick={() => handleDispatch(alert.id)}>Dispatch</button>
                            </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. TABS & GRAPHS */}
          <div style={styles.graphSection}>
            <div style={styles.tabHeader}>
                <span style={styles.tab(activeTab === 'telemetry')} onClick={() => setActiveTab('telemetry')}>Telemetry</span>
                <span style={styles.tab(activeTab === 'health')} onClick={() => setActiveTab('health')}>Node Health</span>
                
                {/* REPLAY CONTROLS */}
                <div style={{marginLeft:'auto', display:'flex', alignItems:'center', gap:'10px'}}>
                    <span style={{fontSize:'0.7rem', color:'#64748b'}}>REPLAY MODE:</span>
                    <input type="checkbox" checked={replayMode} onChange={(e) => setReplayMode(e.target.checked)} />
                    {replayMode && (
                        <input type="range" min="0" max="100" value={replayIndex} onChange={(e) => setReplayIndex(e.target.value)} style={{width:'100px'}} />
                    )}
                </div>
            </div>

            {activeTab === 'telemetry' ? (
                <div style={styles.gridContainer}>
                    <div style={styles.chartCard}>
                        <div style={{fontSize:'0.75rem', fontWeight:'700', color:'#64748b', marginBottom:'10px'}}>VIBRATION</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={displayTelemetry}>
                                <CartesianGrid stroke="#f1f5f9" />
                                <XAxis dataKey="time" hide />
                                <YAxis width={30} tick={{fontSize:10}} />
                                <Tooltip contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}/>
                                <Line type="monotone" dataKey="accel_mag" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={styles.chartCard}>
                        <div style={{fontSize:'0.75rem', fontWeight:'700', color:'#64748b', marginBottom:'10px'}}>MAGNETIC (µT)</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={displayTelemetry}>
                                <CartesianGrid stroke="#f1f5f9" />
                                <XAxis dataKey="time" hide />
                                <YAxis width={30} tick={{fontSize:10}} domain={['auto','auto']} />
                                <Tooltip contentStyle={{borderRadius:'8px', border:'none', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}/>
                                <Line type="monotone" dataKey="mag_norm" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : (
                // HEALTH TAB VISUALS
                <div style={styles.gridContainer}>
                    <div style={styles.chartCard}>
                        <div style={{fontSize:'0.75rem', fontWeight:'700', color:'#64748b', marginBottom:'10px'}}>TRACK STRESS (TEMP)</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[latestEnv]} layout="vertical">
                                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" domain={[0, 60]} hide />
                                <YAxis type="category" dataKey="temperature" width={1} hide />
                                <Tooltip cursor={{fill:'transparent'}} />
                                <Bar dataKey="temperature" barSize={40} radius={[0,4,4,0]}>
                                    { [latestEnv].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.temperature > 45 ? '#ef4444' : '#22c55e'} />
                                    )) }
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div style={{textAlign:'center', marginTop:'10px', fontSize:'0.9rem'}}>
                            Current: <b>{latestEnv.temperature?.toFixed(1)}°C</b> <span style={{color:'#64748b'}}>(Crit: 45°C)</span>
                        </div>
                    </div>
                    <div style={styles.chartCard}>
                        <div style={{fontSize:'0.75rem', fontWeight:'700', color:'#64748b', marginBottom:'10px'}}>NODE STATUS</div>
                        <div style={{display:'flex', flexDirection:'column', gap:'15px', marginTop:'10px'}}>
                            <div>
                                <div style={{fontSize:'0.8rem', color:'#475569', marginBottom:'5px'}}>Battery Level</div>
                                <div style={{width:'100%', height:'10px', background:'#e2e8f0', borderRadius:'5px'}}>
                                    <div style={{width: `${currentNode?.battery || 85}%`, height:'100%', background:'#22c55e', borderRadius:'5px'}}></div>
                                </div>
                            </div>
                            <div>
                                <div style={{fontSize:'0.8rem', color:'#475569', marginBottom:'5px'}}>Signal Strength (RSSI)</div>
                                <div style={{width:'100%', height:'10px', background:'#e2e8f0', borderRadius:'5px'}}>
                                    <div style={{width: '70%', height:'100%', background:'#3b82f6', borderRadius:'5px'}}></div>
                                </div>
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
        <div style={{padding:'5px 15px', background:'#1e293b', fontSize:'0.75rem', fontWeight:'bold', color:'#94a3b8', borderBottom:'1px solid #334155'}}>
            >_ SYSTEM CONSOLE <span style={{float:'right', color:'#4ade80'}}>● ONLINE</span>
        </div>
        <div style={styles.consoleBody} className="console-logs">
            {systemLogs.map((log) => (
                <div key={log.id} style={{marginBottom:'4px', display:'flex', gap:'10px'}}>
                    <span style={{color:'#64748b'}}>[{log.time}]</span>
                    <span style={{color: log.type==='error'?'#ef4444':log.type==='warning'?'#f59e0b':log.type==='success'?'#4ade80':'#e2e8f0'}}>{log.msg}</span>
                </div>
            ))}
        </div>
      </footer>
    </div>
  );
}
