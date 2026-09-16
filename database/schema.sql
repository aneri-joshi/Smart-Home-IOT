-- Database schema for Smart Home Automation System (Advanced 7-Feature Upgrade)

CREATE TABLE IF NOT EXISTS device_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT UNIQUE NOT NULL,
    state TEXT NOT NULL,
    mode TEXT DEFAULT 'MANUAL',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telemetry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    soil_moisture REAL NOT NULL,
    fire_detected INTEGER NOT NULL,
    light_state TEXT NOT NULL,
    fan_state TEXT NOT NULL,
    pump_state TEXT NOT NULL,
    buzzer_state TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'INFO',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users & Authentication Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'GUEST', -- 'ADMIN' or 'GUEST'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device Schedules Table
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_name TEXT NOT NULL,
    target_state TEXT NOT NULL,
    time_hhmm TEXT NOT NULL, -- e.g. "18:30"
    days TEXT DEFAULT 'ALL', -- 'ALL', 'WEEKDAYS', 'WEEKENDS'
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial device states
INSERT OR IGNORE INTO device_states (device_name, state, mode) VALUES ('light', 'OFF', 'MANUAL');
INSERT OR IGNORE INTO device_states (device_name, state, mode) VALUES ('fan', 'OFF', 'MANUAL');
INSERT OR IGNORE INTO device_states (device_name, state, mode) VALUES ('pump', 'OFF', 'AUTO');
INSERT OR IGNORE INTO device_states (device_name, state, mode) VALUES ('buzzer', 'OFF', 'AUTO');

-- Seed initial settings
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('moisture_threshold', '30');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('eco_mode', 'true');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('latitude', '21.17');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('longitude', '72.83');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('telegram_bot_token', '');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('telegram_chat_id', '');

-- Seed default users (admin: admin123, guest: guest123 - SHA-256 hashed)
-- admin123 -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- guest123 -> 8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92
INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'ADMIN');
INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('guest', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'GUEST');
