# 🏠 Smart Home Automation System 2.0 - Complete Technical Documentation

A comprehensive, state-of-the-art **IoT-enabled Smart Home Automation System** featuring real-time bi-directional WebSockets, **Electric Blue Neumorphism UI design**, **Multi-Language Voice Commands**, **Virtual ESP32 Hardware Simulator**, **Energy Consumption & Cost Calculator**, **Open-Meteo Weather Eco-Irrigation**, **Chart.js Sensor Analytics**, **Role-Based Authentication**, and **ESP32 Microcontroller Integration**.

---

## 📌 1. System Architecture Overview

The system follows a decoupled, event-driven client-server architecture. The central **FastAPI Backend Server** acts as the orchestrator, managing device state synchronization, real-time WebSocket broadcasting, background scheduling, weather telemetry, and database persistence.

```
                                +-----------------------------------+
                                |      Modern Web UI Dashboard      |
                                |  (Neumorphism / Chart.js / Voice) |
                                +-----------------+-----------------+
                                                  |
                         +------------------------+------------------------+
                         | REST API (HTTP)        | WebSockets (ws://)     | Voice (WebSpeech)
                         v                        v                        v
                  +----------------------------------------------------------------+
                  |                     FastAPI Backend Server                     |
                  |     (Rule Engine, Weather Fetcher, Async Scheduler Task)       |
                  +---------------+------------------------------+-----------------+
                                  |                              |
                                  | SQLite                       | Open-Meteo REST API
                                  v                              v
                  +-------------------------------+    +-------------------+
                  |    Database (smarthome.db)    |    |  Weather Service  |
                  | (State, Telemetry, Schedules) |    +-------------------+
                  +-------------------------------+
                                  ^
                                  | Telemetry POST & Sync
                                  v
                  +-------------------------------+
                  |  Virtual / Physical ESP32 Node|
                  +---------------+---------------+
                                  |
               +------------------+------------------+
               |                  |                  |
               v                  v                  v
     [Relays: Light & Fan]  [Flame & Buzzer]   [Soil Moisture & Pump]
```

### 🔄 End-to-End Data Flow Lifecycle
1. **Sensor Telemetry Ingestion**: The ESP32 node (or Virtual ESP32 Hardware Simulator) periodically measures raw analog soil moisture and digital flame status, transmitting a JSON POST payload to `/api/telemetry`.
2. **Backend Rule Evaluation**:
   - **Fire Safety**: If flame is detected, the backend immediately switches the light to **FLICKER** mode, sets the buzzer to **ON**, logs a `CRITICAL` alert, broadcasts an instant WebSocket event, and dispatches an optional Telegram alert.
   - **Eco-Irrigation**: If soil moisture falls below threshold, the backend checks Open-Meteo weather. If rain is expected within 6 hours, auto-watering pauses; otherwise, the pump activates.
3. **Real-Time Client Broadcasting**: Updated system states are pushed over low-latency WebSockets (`/ws`) to all active browser dashboards simultaneously.
4. **Local Hardware Execution**: The HTTP POST response returns the latest target states for Light, Fan, Pump, and Buzzer to the ESP32 node to trigger physical relays.

---

## 🛠️ 2. Technology Stack

| Layer | Technology / Library | Purpose |
| :--- | :--- | :--- |
| **Backend Framework** | Python 3.10+, FastAPI, Uvicorn | High-performance asynchronous REST API & WebSocket server |
| **Database** | SQLite 3 | Embedded transactional SQL storage for state, logs, and schedules |
| **Real-Time Protocol** | WebSockets (`ws://`) | Zero-latency bi-directional state synchronization |
| **Frontend UI** | HTML5, Native JavaScript (ES6+), Vanilla CSS3 | Modular Neumorphism design without third-party heavy CSS framework |
| **Design System** | Electric Blue Neumorphism | Outset/Inset drop-shadow tokenized design with Light/Dark modes |
| **Data Analytics** | Chart.js 4.x | Dynamic line chart visualization for soil moisture trends |
| **Voice Processing** | Web Speech API (`SpeechRecognition` & `SpeechSynthesis`) | Hands-free multi-language voice control & audio response synthesis |
| **Weather Engine** | Open-Meteo REST API | Free location-aware weather forecast & rain detection |
| **Hardware / Firmware** | ESP32 Microcontroller, Arduino C++ | Hardware sensor reading, relay switching, and HTTP POST sync |

---

## 🎨 3. UI/UX & Design System Architecture

### 💎 Electric Blue Neumorphism Design System
The interface uses modern Neumorphic (soft UI) aesthetics built with CSS custom properties (variables) for seamless theme switching:
- **Outset Shadows (`--nm-out`)**: Creates extruded 3D tactile elements for cards, buttons, and control pills.
- **Inset Shadows (`--nm-in`)**: Creates depressed, sunken sockets for light bulbs, rotary fan dials, gauges, and inputs.
- **Color Palette**: Curated Electric Blue (`#2563eb`), Sky Blue (`#0284c7`), and Ocean Blue (`#3b82f6`) hues paired with dark mode background (`#121929`) and light mode background (`#e6eef8`).

### ☀️/🌙 Light & Dark Theme Switcher Engine
- **Persistence**: Theme choice (`light` or `dark`) is saved in `localStorage`.
- **Live Chart Integration**: Dynamically recolors Chart.js gridlines, tick labels, and legends upon theme toggle.
- **Header Toggle Pill**: Single-click conversion between Light and Dark Neumorphic mode.

### 📱 Responsive Adaptability
- **Desktop (1200px+)**: 4-column module grid (`grid-template-columns: repeat(4, 1fr)`).
- **Tablet (768px - 1199px)**: Responsive 2-column card grid.
- **Mobile (< 768px)**: 1-column layout with optimized touch target padding and full mobile viewport scaling.

---

## 📦 4. Comprehensive Features & Modules Matrix

### 💡 Module 1: Smart Light Control
- **Dual Operating Modes**:
  - `NORMAL`: Standard constant illumination.
  - `FLICKER 🚨`: High-visibility emergency strobe mode (triggered automatically during fire emergencies or manually).
- **Tactile UI Socket**: Glowing lightbulb socket with keyframe brightness animations during flicker mode.
- **Control Methods**: Dashboard button, Voice command (*"Turn on light"*), or automated schedule timer.

### 🌀 Module 2: Multi-Speed Fan Control
- **4 Discrete Speed Levels**:
  - `Speed 1`: Low speed (`2.0s` rotation duration).
  - `Speed 2`: Medium speed (`1.2s` rotation duration).
  - `Speed 3`: High speed (`0.6s` rotation duration).
  - `Speed 4`: Turbo speed (`0.22s` rapid spin).
- **Rotary Dial Display**: Neumorphic spinning rotary dial icon dynamically reflecting the active speed level.

### 🔥 Module 3: Fire & Safety System
- **Flame Sensor Ingestion**: Real-time monitoring of flame/smoke sensors.
- **Immediate Local & Server Alarm**: Sounds local active buzzer (`BUZZER_PIN`), activates Light `FLICKER` mode, and logs a `CRITICAL` alert.
- **Multi-Tiered Notification Suite**:
  1. In-App Floating Neumorphic Toast Banner.
  2. Desktop Browser Push Notification (`Notification API`).
  3. Telegram Emergency Alert Bot Integration.
- **Silence Option**: One-click dashboard mute button or vocal silence command (*"Silence alarm"*).

### 🌱 Module 4: Soil Moisture & Smart Eco-Irrigation
- **Soil Moisture Readout**: Analog ADC sensor reading formatted as a 0–100% moisture gauge bar.
- **Adjustable Threshold Slider**: Configurable trigger threshold (5% to 95%).
- **Open-Meteo Eco-Irrigation Logic**: Automatically fetches local rain forecast. If rain is expected within 6 hours, auto-watering pauses to prevent root rot and save water.

### ⚡ Module 5: Energy Consumption & Electricity Cost Calculator
- **Active Power Load**: Real-time calculation of total active power consumption in Watts (W):
  - Light: 10W (Normal) / 15W (Flicker)
  - Fan: 15W / 30W / 55W / 75W (based on speed level)
  - Water Pump: 120W
  - Buzzer: 5W
- **Estimated Daily Energy**: Calculates estimated daily usage (`kWh = (Active Load * 8h) / 1000`).
- **Projected Monthly Cost (₹)**: Live cost calculation based on a customizable electricity tariff rate input (default: ₹8.00/kWh).

### 📱 Module 6: Virtual ESP32 Hardware Simulator Modal
- **Header Launch Action**: On-screen simulation suite (`📱 ESP32 Simulator`) allowing hardware testing without physical microcontrollers.
- **Sensor Controls**:
  - Soil Moisture ADC range slider (0–100%).
  - Flame Sensor mode toggle (`NORMAL` vs `FIRE 🚨`).
  - Auto Telemetry Stream switch (3-second continuous POST ping loop).
- **Embedded Dark Terminal**: Mini console output (`.sim-terminal`) displaying POST request logs and JSON responses.

### 🌐 Module 7: Multi-Language Voice Assistant
- **Language Selection Dropdown**:
  - 🇺🇸 **English** (`en-US`)
  - 🇮🇳 **Hindi** (`hi-IN`)
  - 🇮🇳 **Gujarati** (`gu-IN`)
  - 🇪🇸 **Spanish** (`es-ES`)
- **Multilingual Command Engine**: Parses phrases across languages:
  - English: *"Turn on light"*, *"Turn off fan"*, *"Silence alarm"*
  - Hindi: *"लाइट चालू करो"*, *"पंखा बंद करो"*, *"अलार्म बंद करो"*
  - Gujarati: *"લાઇટ ચાલુ કરો"*, *"પંખો બંધ કરો"*
  - Spanish: *"Encender luz"*, *"Apagar ventilador"*
- **Speech Synthesis Feedback**: Native vocal confirmation spoken in the selected language.

### 📈 Module 8: Chart.js Live Moisture Analytics
- **Historical Moisture Graph**: Displays recent soil moisture trends over time using smooth line plots.
- **Dynamic Theme Synchronization**: Automatically updates text, gridline, and point colors when toggling Light/Dark mode.

### ⏱️ Module 9: Automated Device Scheduling Engine
- **Time-Based Automation**: Set HH:MM target rules for any device (e.g., Turn Light ON at 18:00).
- **Background Async Runner**: Backend loop checks active schedules every 30 seconds.

### 🔒 Module 10: Role-Based Authentication (RBAC)
- **Admin Role** (`admin` / `admin123`): Full write access to control devices, modify thresholds, and set schedules.
- **Guest Role** (`guest` / `guest123`): Read-only dashboard view with interactive controls disabled.

### 📜 Module 11: System Audit Logging
- **Event Feed**: Logs all state changes, threshold modifications, and safety alerts with severity ratings (`INFO`, `WARNING`, `CRITICAL`).

---

## 🔌 5. REST API Specifications

### Summary Table

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/status` | Fetch complete system state, telemetry, settings, weather, and logs | No |
| `POST` | `/api/auth/login` | Authenticate user credentials and return user role token | No |
| `POST` | `/api/control/light` | Change light state (`ON`/`OFF`) and mode (`NORMAL`/`FLICKER`) | Admin |
| `POST` | `/api/control/fan` | Change fan state (`ON`/`OFF`) and speed (`1`, `2`, `3`, `4`) | Admin |
| `POST` | `/api/control/pump` | Change pump state (`ON`/`OFF`) and mode (`AUTO`/`MANUAL`) | Admin |
| `POST` | `/api/control/buzzer` | Change buzzer state (`ON`/`OFF`/`MUTE`) | Any / Admin |
| `POST` | `/api/settings/threshold` | Update soil moisture threshold and eco mode flag | Admin |
| `POST` | `/api/telemetry` | ESP32 telemetry POST and sync | Hardware / Client |
| `GET` | `/api/schedules` | Fetch list of active automation schedules | No |
| `POST` | `/api/schedules/add` | Create a new automated timer schedule | Admin |
| `POST` | `/api/schedules/delete/{id}` | Remove a schedule by ID | Admin |
| `GET` | `/api/analytics/moisture` | Fetch historical soil moisture data points for Chart.js | No |
| `GET` | `/api/logs` | Fetch recent event log entries | No |

---

## ⚡ 6. Real-Time WebSocket Engine (`/ws`)

The WebSocket engine maintains active client connections and broadcasts state change events instantly.

### Bi-Directional Message Types
1. **`INIT_STATUS`** *(Server -> Client)*: Transmitted immediately upon WebSocket connection, supplying the full initial snapshot.
2. **`STATE_CHANGE`** *(Server -> Client)*: Broadcast whenever a device state or mode changes.
3. **`TELEMETRY_UPDATE`** *(Server -> Client)*: Broadcast when new ESP32 telemetry arrives.
4. **`SETTINGS_CHANGE`** *(Server -> Client)*: Broadcast when thresholds or eco-irrigation settings are updated.

---

## 🗄️ 7. Database Schema & Models (SQLite)

The system uses an embedded SQLite database (`database/smarthome.db`) managed via `database/db.py`.

```sql
-- Device States Table
CREATE TABLE IF NOT EXISTS device_states (
    device_name TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    mode TEXT DEFAULT 'NORMAL',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Event Audit Logs Table
CREATE TABLE IF NOT EXISTS event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'INFO',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Telemetry Logs Table
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    soil_moisture REAL,
    fire_detected BOOLEAN,
    light_state TEXT,
    fan_state TEXT,
    pump_state TEXT,
    buzzer_state TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Automated Schedules Table
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    target_state TEXT NOT NULL,
    time_hhmm TEXT NOT NULL,
    days TEXT DEFAULT 'ALL',
    is_active BOOLEAN DEFAULT 1
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL
);
```

---

## 💻 8. ESP32 Firmware Specification

### Hardware Pin Mapping (`esp32/smart_home_esp32.ino`)

| Hardware Module | ESP32 Pin | Type | Logic / Description |
| :--- | :--- | :--- | :--- |
| **Relay 1 (Light)** | `GPIO 26` | Digital Output | Active LOW (LOW = Relay ON, HIGH = Relay OFF) |
| **Relay 2 (Fan)** | `GPIO 27` | Digital Output | Active LOW (LOW = Relay ON, HIGH = Relay OFF) |
| **Relay 3 (Water Pump)** | `GPIO 14` | Digital Output | Active LOW (LOW = Relay ON, HIGH = Relay OFF) |
| **Active Buzzer** | `GPIO 12` | Digital Output | Active HIGH (HIGH = Alarm Sounding) |
| **Flame Sensor** | `GPIO 34` | Digital Input | Active LOW (LOW = Flame/Smoke Detected) |
| **Soil Moisture ADC** | `GPIO 32` | Analog Input | 12-bit ADC (Calibrated: 3200 Dry -> 1300 Wet) |

---

## 📁 9. Project Directory Structure

```
SmartHomeMinorProject/
├── backend/
│   ├── main.py                  # FastAPI Application, WebSockets, REST Endpoints
│   ├── weather.py               # Open-Meteo Weather Forecast Client
│   └── notifications.py         # Telegram Emergency Notification Dispatcher
├── database/
│   ├── db.py                    # SQLite Initialization, Queries & Helpers
│   └── smarthome.db             # Embedded SQLite Database File
├── esp32/
│   ├── smart_home_esp32.ino     # ESP32 C++ Firmware Code
│   └── README.md                # ESP32 Wiring & Setup Documentation
├── website/
│   ├── index.html               # Main Neumorphic UI Dashboard HTML
│   ├── styles.css               # Neumorphism Styling System & Animations
│   └── app.js                   # Client Logic, WebSockets, Voice Engine & Modals
├── documentation/
│   └── PROJECT_DOCS.md          # Complete Technical Documentation
└── run.txt                      # Execution commands
```

---

## 🚀 10. Installation & Execution Guide

### 1. Backend Setup
1. Ensure **Python 3.10+** is installed.
2. Open terminal in the project backend directory:
   ```bash
   cd backend
   ```
3. Install required dependencies:
   ```bash
   pip install fastapi uvicorn requests pydantic
   ```
4. Launch the FastAPI server:
   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

### 2. Accessing the Dashboard
Open your web browser and navigate to:
```
http://localhost:8000
```
- **Admin Login**: `admin` / `admin123`
- **Guest Login**: `guest` / `guest123`

---
*Documentation compiled and updated for Smart Home Automation System 2.0.*
