import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "smarthome.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    with open(SCHEMA_PATH, 'r') as f:
        cursor.executescript(f.read())
    
    # Ensure default users exist
    admin_pwd = hash_password("admin123")
    guest_pwd = hash_password("guest123")
    cursor.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'ADMIN') "
        "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'ADMIN'", 
        (admin_pwd,)
    )
    cursor.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('guest', ?, 'GUEST') "
        "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = 'GUEST'", 
        (guest_pwd,)
    )
    
    # Ensure default weather coordinates set to Surat, Gujarat (21.17, 72.83)
    cursor.execute("INSERT INTO system_settings (key, value) VALUES ('latitude', '21.17') ON CONFLICT(key) DO UPDATE SET value = '21.17'")
    cursor.execute("INSERT INTO system_settings (key, value) VALUES ('longitude', '72.83') ON CONFLICT(key) DO UPDATE SET value = '72.83'")

    conn.commit()
    conn.close()

def get_all_device_states():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT device_name, state, mode FROM device_states")
    rows = cursor.fetchall()
    states = {row["device_name"]: {"state": row["state"], "mode": row["mode"]} for row in rows}
    
    cursor.execute("SELECT key, value FROM system_settings")
    settings_rows = cursor.fetchall()
    settings = {row["key"]: row["value"] for row in settings_rows}
    conn.close()
    
    return {
        "devices": states,
        "settings": settings
    }

def update_device_state(device_name: str, state: str, mode: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if mode:
        cursor.execute(
            "UPDATE device_states SET state = ?, mode = ?, updated_at = CURRENT_TIMESTAMP WHERE device_name = ?",
            (state, mode, device_name)
        )
    else:
        cursor.execute(
            "UPDATE device_states SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE device_name = ?",
            (state, device_name)
        )
    conn.commit()
    conn.close()

def set_setting(key: str, value: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        (key, str(value))
    )
    conn.commit()
    conn.close()

def log_event(event_type: str, message: str, severity: str = "INFO"):
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO event_logs (event_type, message, severity, timestamp) VALUES (?, ?, ?, ?)",
        (event_type, message, severity, now_str)
    )
    conn.commit()
    conn.close()

def log_telemetry(soil_moisture: float, fire_detected: bool, light: str, fan: str, pump: str, buzzer: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO telemetry_logs (soil_moisture, fire_detected, light_state, fan_state, pump_state, buzzer_state, timestamp) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (soil_moisture, 1 if fire_detected else 0, light, fan, pump, buzzer, now_str)
    )
    conn.commit()
    conn.close()

def get_recent_event_logs(limit: int = 15):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT event_type, message, severity, timestamp FROM event_logs ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# --- Auth Functions ---
def authenticate_user(username: str, password_plain: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password_plain)
    cursor.execute(
        "SELECT id, username, role FROM users WHERE username = ? AND password_hash = ?",
        (username, pwd_hash)
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# --- Schedule Functions ---
def get_schedules():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, device_name, target_state, time_hhmm, days, is_active FROM schedules ORDER BY time_hhmm ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def add_schedule(device_name: str, target_state: str, time_hhmm: str, days: str = "ALL"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO schedules (device_name, target_state, time_hhmm, days) VALUES (?, ?, ?, ?)",
        (device_name, target_state, time_hhmm, days)
    )
    conn.commit()
    schedule_id = cursor.lastrowid
    conn.close()
    return schedule_id

def delete_schedule(schedule_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
    conn.commit()
    conn.close()

def toggle_schedule(schedule_id: int, is_active: bool):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE schedules SET is_active = ? WHERE id = ?", (1 if is_active else 0, schedule_id))
    conn.commit()
    conn.close()

# --- Analytics History ---
def get_moisture_history(limit: int = 30):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT soil_moisture, timestamp FROM telemetry_logs ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    # Reverse so timeline is chronological (oldest to newest)
    result = [dict(row) for row in rows]
    result.reverse()
    return result
