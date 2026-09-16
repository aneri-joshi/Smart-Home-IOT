/*
 * Smart Home Automation System - ESP32 Firmware
 * 
 * Hardware Modules Supported:
 * 1. Light Control (Relay 1)
 * 2. Fan Control (Relay 2)
 * 3. Fire Detection & Emergency Buzzer (Flame Sensor + Active Buzzer)
 * 4. Soil Humidity Measurement & Water Pump (Soil Moisture Sensor + Relay 3)
 * 
 * Required Libraries:
 * - WiFi.h (Built-in ESP32)
 * - HTTPClient.h (Built-in ESP32)
 * - ArduinoJson (Install via Library Manager by Benoit Blanchon v6.x)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- WiFi Credentials ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- Server Config ---
// Replace with your Laptop/Server local IP address (e.g., http://192.168.1.100:8000)
const char* serverUrl = "http://192.168.1.100:8000/api/telemetry";

// --- Hardware Pin Definitions ---
#define RELAY_LIGHT_PIN     26   // Relay 1 - Light
#define RELAY_FAN_PIN       27   // Relay 2 - Fan
#define RELAY_PUMP_PIN      14   // Relay 3 - Water Pump
#define BUZZER_PIN          12   // Active Buzzer
#define FLAME_SENSOR_PIN    34   // Flame/Smoke Sensor (Digital In)
#define SOIL_MOISTURE_PIN   32   // Soil Moisture Sensor (Analog In ADC)

// Soil Moisture Calibration (Adjust according to dry/wet sensor readings)
const int DRY_SENSOR_VALUE = 3200;  // Raw ADC value in dry air
const int WET_SENSOR_VALUE = 1300;  // Raw ADC value in water

// Polling interval (milliseconds)
const unsigned long POLL_INTERVAL = 2000;
unsigned long lastPollTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Initializing Smart Home ESP32 Node ===");

  // Setup Pin Modes
  pinMode(RELAY_LIGHT_PIN, OUTPUT);
  pinMode(RELAY_FAN_PIN, OUTPUT);
  pinMode(RELAY_PUMP_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  pinMode(FLAME_SENSOR_PIN, INPUT);
  pinMode(SOIL_MOISTURE_PIN, INPUT);

  // Set default relay outputs (Assuming Active LOW relays)
  digitalWrite(RELAY_LIGHT_PIN, HIGH);
  digitalWrite(RELAY_FAN_PIN, HIGH);
  digitalWrite(RELAY_PUMP_PIN, HIGH);
  digitalWrite(BUZZER_PIN, LOW);

  // Connect to WiFi
  connectWiFi();
}

void loop() {
  // 1. Immediate Local Safety Check (Fire Detection)
  bool isFireDetected = readFlameSensor();
  if (isFireDetected) {
    digitalWrite(BUZZER_PIN, HIGH); // Immediate alarm trigger
  }

  // 2. Periodic Telemetry Push & Target State Fetch
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();

    if (WiFi.status() == WL_CONNECTED) {
      float moisturePercentage = readSoilMoisture();
      sendTelemetryAndSync(moisturePercentage, isFireDetected);
    } else {
      Serial.println("WiFi disconnected! Attempting reconnect...");
      connectWiFi();
    }
  }
}

void connectWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Connection Failed! Will retry in main loop.");
  }
}

bool readFlameSensor() {
  // Active LOW or HIGH depending on Flame sensor module
  int sensorVal = digitalRead(FLAME_SENSOR_PIN);
  return (sensorVal == LOW); // LOW typically indicates flame detected
}

float readSoilMoisture() {
  int rawAnalog = analogRead(SOIL_MOISTURE_PIN);
  // Map ADC value to percentage (0% to 100%)
  float percentage = map(rawAnalog, DRY_SENSOR_VALUE, WET_SENSOR_VALUE, 0, 100);
  percentage = constrain(percentage, 0.0, 100.0);
  return percentage;
}

void sendTelemetryAndSync(float soilMoisture, bool fireDetected) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Create JSON Payload
  StaticJsonDocument<200> reqDoc;
  reqDoc["soil_moisture"] = soilMoisture;
  reqDoc["fire_detected"] = fireDetected;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  Serial.print("Sending Telemetry -> ");
  Serial.println(reqBody);

  int httpCode = http.POST(reqBody);

  if (httpCode == HTTP_CODE_OK) {
    String response = http.getString();
    Serial.print("Received Response -> ");
    Serial.println(response);

    StaticJsonDocument<300> respDoc;
    DeserializationError error = deserializeJson(respDoc, response);

    if (!error) {
      const char* lightState = respDoc["light"];
      const char* fanState   = respDoc["fan"];
      const char* pumpState  = respDoc["pump"];
      const char* buzzerState = respDoc["buzzer"];

      // Update Relays (Active LOW assumed: LOW = Relay ON, HIGH = Relay OFF)
      digitalWrite(RELAY_LIGHT_PIN, (String(lightState) == "ON") ? LOW : HIGH);
      digitalWrite(RELAY_FAN_PIN,   (String(fanState) == "ON")   ? LOW : HIGH);
      digitalWrite(RELAY_PUMP_PIN,  (String(pumpState) == "ON")  ? LOW : HIGH);

      // Update Buzzer (HIGH = Sounding, LOW = Silent)
      if (String(buzzerState) == "ON" || (fireDetected && String(buzzerState) != "MUTE")) {
        digitalWrite(BUZZER_PIN, HIGH);
      } else {
        digitalWrite(BUZZER_PIN, LOW);
      }
    } else {
      Serial.print("JSON Parse error: ");
      Serial.println(error.c_str());
    }
  } else {
    Serial.print("HTTP POST Error Code: ");
    Serial.println(httpCode);
  }

  http.end();
}
