# ESP32 Smart Home Firmware Guide

This directory contains the firmware code for the ESP32 microcontroller that interfaces physical sensors and relays with the Smart Home Backend API.

---

## 🛠️ Hardware Wiring Matrix

| Hardware Component | ESP32 Pin | Type | Notes |
| :--- | :--- | :--- | :--- |
| **Relay 1 (Light)** | `GPIO 26` | Output (Digital) | Active LOW relay input |
| **Relay 2 (Fan)** | `GPIO 27` | Output (Digital) | Active LOW relay input |
| **Relay 3 (Water Pump)** | `GPIO 14` | Output (Digital) | Active LOW relay input |
| **Active Buzzer** | `GPIO 12` | Output (Digital) | High level trigger sound |
| **Flame Sensor** | `GPIO 34` | Input (Digital) | IR / Flame sensor module DO pin |
| **Soil Moisture Sensor**| `GPIO 32` | Input (Analog ADC) | Capacitive or Resistive Moisture AO pin |

---

## 📦 Required Arduino IDE Libraries

Before compiling `smart_home_esp32.ino`, ensure you have installed the following in Arduino IDE:

1. **ESP32 Board Package**:
   - `Tools` -> `Board` -> `Boards Manager` -> Search for `esp32` by Expressif Systems.
2. **ArduinoJson**:
   - `Tools` -> `Manage Libraries` -> Search for `ArduinoJson` (by Benoit Blanchon, v6.x or newer).

---

## 🚀 Setup & Upload Instructions

1. Open `smart_home_esp32.ino` in Arduino IDE.
2. Update WiFi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
3. Update the Server API URL with your computer's local IP address on the WiFi network:
   ```cpp
   const char* serverUrl = "http://192.168.X.X:8000/api/telemetry";
   ```
4. Select Board: `Tools` -> `Board` -> `ESP32 Dev Module`.
5. Select Port: `Tools` -> `Port` -> Choose your ESP32 COM port.
6. Click **Upload** (press and hold `BOOT` button on ESP32 if upload stays on `Connecting...`).
7. Open Serial Monitor at **115200 baud** to view real-time telemetry logs.
