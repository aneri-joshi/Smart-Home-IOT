import os
import sys
import asyncio
from datetime import datetime
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from database.db import (
    init_db, get_all_device_states, update_device_state, 
    set_setting, log_event, log_telemetry, get_recent_event_logs,
    authenticate_user, get_schedules, add_schedule, delete_schedule,
    toggle_schedule, get_moisture_history
)
from backend.weather import fetch_weather_forecast
from backend.notifications import send_telegram_alert

app = FastAPI(title="Smart Home Automation System API", version="2.0")

# Initialize database schema and tables
init_db()

# Enable CORS for external/ESP32 web clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Runtime telemetry cache
telemetry_data = {
    "soil_moisture": 45.0,
    "fire_detected": False,
    "last_updated": None
}

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

# Background Scheduler Task
async def schedule_runner():
    while True:
        try:
            now = datetime.now()
            current_time = now.strftime("%H:%M")
            schedules = get_schedules()
            
            for sched in schedules:
                if sched["is_active"] and sched["time_hhmm"] == current_time:
                    device = sched["device_name"]
                    target = sched["target_state"]
                    update_device_state(device, target)
                    log_event("SCHEDULE", f"Scheduled Task: Turned {device} {target}", "INFO")
                    await ws_manager.broadcast({"type": "STATE_CHANGE", "device": device, "state": target})
            
            await asyncio.sleep(30) # check every 30s
        except asyncio.CancelledError:
            break
        except Exception as e:
            print("Schedule runner error:", e)
            await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    log_event("SYSTEM", "Smart Home Automation Backend Started", "INFO")
    asyncio.create_task(schedule_runner())

# --- Request Models ---
class DeviceControlRequest(BaseModel):
    state: str
    mode: Optional[str] = None

class ThresholdSettingsRequest(BaseModel):
    moisture_threshold: float
    eco_mode: Optional[bool] = True

class TelemetryPayload(BaseModel):
    soil_moisture: float
    fire_detected: bool

class LoginRequest(BaseModel):
    username: str
    password: str

class ScheduleRequest(BaseModel):
    device_name: str
    target_state: str
    time_hhmm: str
    days: Optional[str] = "ALL"

# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial status snapshot upon connection
        status_snapshot = get_status()
        await websocket.send_json({"type": "INIT_STATUS", "payload": status_snapshot})
        while True:
            # Keep connection alive & handle incoming ping
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# --- Core API Endpoints ---
@app.get("/api/status")
def get_status():
    db_state = get_all_device_states()
    devices = db_state["devices"]
    settings = db_state["settings"]
    
    lat = float(settings.get("latitude", 21.17))
    lon = float(settings.get("longitude", 72.83))
    weather_info = fetch_weather_forecast(lat, lon)
    
    return {
        "status": "success",
        "devices": {
            "light": devices.get("light", {"state": "OFF", "mode": "NORMAL"}),
            "fan": devices.get("fan", {"state": "OFF", "mode": "1"}),
            "pump": devices.get("pump", {"state": "OFF", "mode": "AUTO"}),
            "buzzer": devices.get("buzzer", {"state": "OFF", "mode": "AUTO"}),
        },
        "telemetry": {
            "soil_moisture": telemetry_data["soil_moisture"],
            "fire_detected": telemetry_data["fire_detected"],
        },
        "settings": {
            "moisture_threshold": float(settings.get("moisture_threshold", 30)),
            "eco_mode": settings.get("eco_mode", "true").lower() == "true"
        },
        "weather": weather_info,
        "recent_logs": get_recent_event_logs(10)
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    return {
        "status": "success",
        "token": f"token-{user['username']}-{user['role']}",
        "user": {
            "username": user["username"],
            "role": user["role"]
        }
    }

@app.post("/api/control/light")
async def control_light(req: DeviceControlRequest):
    state = req.state.upper()
    if state not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="State must be ON or OFF")
    
    db_state = get_all_device_states()["devices"].get("light", {})
    mode = req.mode.upper() if req.mode else db_state.get("mode", "NORMAL")
    if mode not in ["NORMAL", "FLICKER"]:
        mode = "NORMAL"

    update_device_state("light", state, mode)
    log_event("LIGHT", f"Light set to {state} (Mode: {mode})", "INFO")
    await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "light", "state": state, "mode": mode})
    return {"device": "light", "state": state, "mode": mode, "message": f"Light set to {state} ({mode})"}

@app.post("/api/control/fan")
async def control_fan(req: DeviceControlRequest):
    state = req.state.upper()
    if state not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="State must be ON or OFF")
    
    db_state = get_all_device_states()["devices"].get("fan", {})
    mode = str(req.mode) if req.mode else db_state.get("mode", "1")
    if mode not in ["1", "2", "3", "4"]:
        mode = "1"

    update_device_state("fan", state, mode)
    log_event("FAN", f"Fan set to {state} (Speed Level: {mode})", "INFO")
    await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "fan", "state": state, "mode": mode})
    return {"device": "fan", "state": state, "mode": mode, "message": f"Fan set to {state} (Speed Level {mode})"}

@app.post("/api/control/pump")
async def control_pump(req: DeviceControlRequest):
    state = req.state.upper()
    if state not in ["ON", "OFF"]:
        raise HTTPException(status_code=400, detail="State must be ON or OFF")
    
    mode = req.mode.upper() if req.mode else "MANUAL"
    if mode not in ["AUTO", "MANUAL"]:
        mode = "MANUAL"

    update_device_state("pump", state, mode)
    log_event("PUMP", f"Water Pump set to {state} (Mode: {mode})", "INFO")
    await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "pump", "state": state, "mode": mode})
    return {"device": "pump", "state": state, "mode": mode, "message": f"Pump set to {state}"}

@app.post("/api/control/buzzer")
async def control_buzzer(req: DeviceControlRequest):
    state = req.state.upper()
    if state not in ["ON", "OFF", "MUTE"]:
        raise HTTPException(status_code=400, detail="State must be ON, OFF or MUTE")
    
    update_device_state("buzzer", state)
    log_event("BUZZER", f"Buzzer state set to {state}", "WARNING" if state != "OFF" else "INFO")
    await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "buzzer", "state": state})
    return {"device": "buzzer", "state": state, "message": f"Buzzer state set to {state}"}

@app.post("/api/settings/threshold")
async def update_threshold(req: ThresholdSettingsRequest):
    if req.moisture_threshold < 0 or req.moisture_threshold > 100:
        raise HTTPException(status_code=400, detail="Threshold must be between 0 and 100%")
    
    set_setting("moisture_threshold", str(req.moisture_threshold))
    if req.eco_mode is not None:
        set_setting("eco_mode", "true" if req.eco_mode else "false")

    log_event("SETTINGS", f"Soil moisture threshold set to {req.moisture_threshold}% (Eco Mode: {req.eco_mode})", "INFO")
    await ws_manager.broadcast({"type": "SETTINGS_CHANGE", "threshold": req.moisture_threshold, "eco_mode": req.eco_mode})
    return {"message": "Settings updated", "threshold": req.moisture_threshold, "eco_mode": req.eco_mode}

@app.post("/api/telemetry")
async def receive_telemetry(payload: TelemetryPayload):
    telemetry_data["soil_moisture"] = payload.soil_moisture
    telemetry_data["fire_detected"] = payload.fire_detected
    
    db_state = get_all_device_states()
    devices = db_state["devices"]
    settings = db_state["settings"]
    
    moisture_threshold = float(settings.get("moisture_threshold", 30))
    eco_mode = settings.get("eco_mode", "true").lower() == "true"
    bot_token = settings.get("telegram_bot_token", "")
    chat_id = settings.get("telegram_chat_id", "")
    
    # 1. Fire Detection Logic & Emergency Light Flicker & Telegram Alarm
    buzzer_state = devices.get("buzzer", {}).get("state", "OFF")
    light_info = devices.get("light", {"state": "OFF", "mode": "NORMAL"})
    
    if payload.fire_detected:
        if light_info.get("mode") != "FLICKER":
            update_device_state("light", "ON", "FLICKER")
            log_event("FIRE_ALERT", "🔥 Fire Detected: Emergency Light FLICKER mode activated!", "CRITICAL")
            await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "light", "state": "ON", "mode": "FLICKER"})
        
        if buzzer_state != "MUTE" and buzzer_state != "ON":
            update_device_state("buzzer", "ON", "AUTO")
            alert_msg = "⚠️ FIRE DETECTED! Emergency Buzzer Activated!"
            log_event("FIRE_ALERT", alert_msg, "CRITICAL")
            buzzer_state = "ON"
            send_telegram_alert(bot_token, chat_id, f"🚨 *SMART HOME ALERT*\n{alert_msg}")
    else:
        if light_info.get("mode") == "FLICKER":
            update_device_state("light", "OFF", "NORMAL")
            log_event("FIRE_ALERT", "Fire cleared. Light restored to NORMAL mode.", "INFO")
            await ws_manager.broadcast({"type": "STATE_CHANGE", "device": "light", "state": "OFF", "mode": "NORMAL"})
        
        if buzzer_state == "ON":
            update_device_state("buzzer", "OFF", "AUTO")
            log_event("FIRE_ALERT", "Fire cleared. Alarm deactivated.", "INFO")
            buzzer_state = "OFF"

    # 2. Soil Moisture & Smart Eco-Irrigation Logic
    pump_info = devices.get("pump", {"state": "OFF", "mode": "AUTO"})
    pump_state = pump_info["state"]
    pump_mode = pump_info.get("mode", "AUTO")
    
    if pump_mode == "AUTO":
        # Check Weather Forecast if Eco Mode is enabled
        weather_info = fetch_weather_forecast()
        rain_likely = weather_info.get("rain_likely", False) if eco_mode else False

        if rain_likely and pump_state == "ON":
            update_device_state("pump", "OFF", "AUTO")
            log_event("ECO_IRRIGATION", f"🌧️ Eco-Irrigation Active: Rain forecast detected ({weather_info['condition']}). Auto Pump turned OFF.", "INFO")
            pump_state = "OFF"
        elif payload.soil_moisture < moisture_threshold and pump_state == "OFF":
            if rain_likely:
                log_event("ECO_IRRIGATION", f"🌧️ Eco-Irrigation Active: Soil dry ({payload.soil_moisture}%), but Rain is forecast ({weather_info['condition']}). Auto Pump PAUSED.", "INFO")
            else:
                update_device_state("pump", "ON", "AUTO")
                log_event("AUTO_IRRIGATION", f"Soil moisture drop ({payload.soil_moisture}% < {moisture_threshold}%). Auto Pump ON.", "INFO")
                pump_state = "ON"
        elif payload.soil_moisture >= (moisture_threshold + 5) and pump_state == "ON":
            update_device_state("pump", "OFF", "AUTO")
            log_event("AUTO_IRRIGATION", f"Soil moisture restored ({payload.soil_moisture}%). Auto Pump OFF.", "INFO")
            pump_state = "OFF"
            
    # Log telemetry snapshot to DB
    light_state = devices.get("light", {}).get("state", "OFF")
    fan_state = devices.get("fan", {}).get("state", "OFF")
    log_telemetry(payload.soil_moisture, payload.fire_detected, light_state, fan_state, pump_state, buzzer_state)
    
    # Broadcast telemetry update to WebSocket clients
    await ws_manager.broadcast({
        "type": "TELEMETRY_UPDATE",
        "telemetry": {"soil_moisture": payload.soil_moisture, "fire_detected": payload.fire_detected},
        "devices": {"pump": pump_state, "buzzer": buzzer_state}
    })

    return {
        "light": light_state,
        "fan": fan_state,
        "pump": pump_state,
        "buzzer": buzzer_state
    }

# --- Schedule API Endpoints ---
@app.get("/api/schedules")
def get_all_schedules():
    return {"schedules": get_schedules()}

@app.post("/api/schedules/add")
def add_new_schedule(req: ScheduleRequest):
    sched_id = add_schedule(req.device_name, req.target_state, req.time_hhmm, req.days)
    log_event("SCHEDULE", f"Added schedule for {req.device_name} -> {req.target_state} at {req.time_hhmm}", "INFO")
    return {"status": "success", "id": sched_id}

@app.post("/api/schedules/delete/{schedule_id}")
def remove_schedule(schedule_id: int):
    delete_schedule(schedule_id)
    return {"status": "success"}

# --- Analytics API Endpoints ---
@app.get("/api/analytics/moisture")
def get_moisture_analytics():
    return {"history": get_moisture_history(30)}

@app.get("/api/logs")
def get_logs():
    return {"logs": get_recent_event_logs(20)}

# Mount static website files
website_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "website"))
if os.path.exists(website_dir):
    app.mount("/", StaticFiles(directory=website_dir, html=True), name="website")