// Smart Home Automation System 2.0 - Client Engine with WebSockets, Chart.js, Voice Control & Auth

const API_BASE = ""; 
let ws = null;
let moistureChart = null;
let isVoiceListening = false;
let speechRecognition = null;

// Auth Session State (default null until authenticated or loaded from localStorage)
let currentUser = null;

// --- 0. THEME SWITCHER ENGINE (Light / Dark Neumorphism) ---
function initTheme() {
    const savedTheme = localStorage.getItem("smarthome_theme") || "light";
    applyTheme(savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nextTheme = current === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    showNotification("Theme Preference", `Switched to ${nextTheme.toUpperCase()} Neumorphism mode`, nextTheme === "dark" ? "🌙" : "☀️", "info");
}

function applyTheme(theme) {
    if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
        const btnIcon = document.getElementById("theme-icon");
        const btnLabel = document.getElementById("theme-label");
        if (btnIcon) btnIcon.innerText = "☀️";
        if (btnLabel) btnLabel.innerText = "Light";
    } else {
        document.documentElement.removeAttribute("data-theme");
        const btnIcon = document.getElementById("theme-icon");
        const btnLabel = document.getElementById("theme-label");
        if (btnIcon) btnIcon.innerText = "🌙";
        if (btnLabel) btnLabel.innerText = "Dark";
    }
    localStorage.setItem("smarthome_theme", theme);
    updateChartTheme(theme);
}

function updateChartTheme(theme) {
    if (!moistureChart) return;
    const isDark = theme === "dark";
    moistureChart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    moistureChart.options.scales.x.ticks.color = isDark ? '#94a3b8' : '#64748b';
    moistureChart.options.scales.y.grid.color = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    moistureChart.options.scales.y.ticks.color = isDark ? '#94a3b8' : '#64748b';
    moistureChart.options.plugins.legend.labels.color = isDark ? '#f1f5f9' : '#1e293b';
    moistureChart.update();
}

// System State Cache
let stateCache = {
    devices: {
        light: { state: "OFF", mode: "NORMAL" },
        fan: { state: "OFF", mode: "1" },
        pump: { state: "OFF", mode: "AUTO" },
        buzzer: { state: "OFF", mode: "AUTO" }
    },
    telemetry: { soil_moisture: 45, fire_detected: false },
    settings: { moisture_threshold: 30, eco_mode: true },
    recent_logs: [],
    schedules: []
};

document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initAuthSession();
    initWebSocket();
    initChart();
    initVoiceAssistant();
    initDesktopNotifications();
    initESP32Simulator();
    initEventListeners();
    fetchSystemStatus();
    fetchAnalyticsHistory();
    fetchSchedules();
});

// --- 1. WEBSOCKET ENGINE ---
function initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "localhost:8000";
    const wsUrl = `${protocol}//${host}/ws`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            document.getElementById("status-conn-text").innerText = "WebSocket Live";
            document.getElementById("system-status").style.borderColor = "rgba(37, 99, 235, 0.4)";
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "INIT_STATUS") {
                stateCache = data.payload;
                renderUI();
            } else if (data.type === "STATE_CHANGE" || data.type === "TELEMETRY_UPDATE") {
                fetchSystemStatus();
                fetchAnalyticsHistory();
            }
        };

        ws.onclose = () => {
            document.getElementById("status-conn-text").innerText = "Polling Fallback";
            // Reconnect after 3 seconds
            setTimeout(initWebSocket, 3000);
        };
    } catch (err) {
        console.warn("WebSocket init error, relying on REST polling:", err);
    }

    // Fallback periodic refresh every 4 seconds
    setInterval(fetchSystemStatus, 4000);
}

// --- 2. AUTH & USER ROLES ---
function initAuthSession() {
    const saved = localStorage.getItem("smarthome_auth");
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
        } catch (e) {
            currentUser = null;
        }
    } else {
        currentUser = null;
    }
    updateAuthUI();
}

function updateAuthUI() {
    const usernameDisplay = document.getElementById("username-display");
    const roleBadge = document.getElementById("user-role-badge");
    const loginLogoutBtn = document.getElementById("btn-login-logout");

    if (!currentUser) {
        // Not logged in -> Show Login Modal immediately
        usernameDisplay.innerText = "Not Logged In";
        roleBadge.innerText = "AUTH REQUIRED";
        roleBadge.className = "role-badge guest";
        loginLogoutBtn.innerText = "Login";

        document.getElementById("login-modal").classList.add("active");

        // Lock all dashboard card controls
        const interactiveElements = document.querySelectorAll(".card .btn-toggle, .card input[type='range'], #chk-eco-mode, .card .btn-mode, #btn-open-schedule-modal");
        interactiveElements.forEach(el => {
            if (el.id === "btn-toggle-buzzer") return;
            el.disabled = true;
            el.style.opacity = "0.5";
            el.style.cursor = "not-allowed";
        });
        return;
    }

    // Valid Logged In User
    usernameDisplay.innerText = currentUser.username;
    roleBadge.innerText = currentUser.role;
    roleBadge.className = `role-badge ${currentUser.role.toLowerCase()}`;
    loginLogoutBtn.innerText = "Logout";

    // Close Login Modal if active
    document.getElementById("login-modal").classList.remove("active");

    const isAdmin = currentUser.role === "ADMIN";
    const interactiveElements = document.querySelectorAll(".card .btn-toggle, .card input[type='range'], #chk-eco-mode, .card .btn-mode, #btn-open-schedule-modal");
    
    interactiveElements.forEach(el => {
        if (el.id === "btn-toggle-buzzer") return;
        el.disabled = !isAdmin;
        if (!isAdmin) {
            el.style.opacity = "0.5";
            el.style.cursor = "not-allowed";
        } else {
            el.style.opacity = "1";
            el.style.cursor = "pointer";
        }
    });
}

// --- 3. CHART.JS ANALYTICS ---
function initChart() {
    const ctx = document.getElementById('moisture-chart').getContext('2d');
    moistureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Soil Moisture (%)',
                data: [],
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#64748b' } },
                x: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, ticks: { color: '#64748b', maxTicksLimit: 6 } }
            },
            plugins: {
                legend: { labels: { color: '#1e293b', font: { weight: '600' } } }
            }
        }
    });
}

async function fetchAnalyticsHistory() {
    try {
        const res = await fetch(`${API_BASE}/api/analytics/moisture`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.history && moistureChart) {
            const labels = data.history.map(item => formatTime(item.timestamp));
            const points = data.history.map(item => item.soil_moisture);
            
            moistureChart.data.labels = labels;
            moistureChart.data.datasets[0].data = points;
            moistureChart.update();
        }
    } catch (err) {
        console.error("Error fetching analytics:", err);
    }
}

// --- 4. VOICE ASSISTANT (Web Speech API) ---
function initVoiceAssistant() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Speech Recognition API not supported in this browser.");
        return;
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'en-US';

    speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        console.log("Voice Command Received:", transcript);
        const banner = document.getElementById("voice-banner");
        banner.style.display = "block";
        banner.innerHTML = `🎤 Heard: <b>"${transcript}"</b> ... Processing command...`;
        
        processVoiceCommand(transcript);
        setTimeout(stopVoiceListening, 2500);
    };

    speechRecognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        const banner = document.getElementById("voice-banner");
        banner.style.display = "block";

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            banner.innerHTML = `⚠️ <b>Microphone Access Denied</b>: Please click the mic/lock icon in your browser address bar to allow microphone access.`;
        } else if (event.error === 'no-speech') {
            banner.innerHTML = `⚠️ <b>No Speech Detected</b>: Please click the microphone button and speak clearly.`;
        } else {
            banner.innerHTML = `⚠️ <b>Voice Error (${event.error})</b>: Click mic to try again.`;
        }
        setTimeout(stopVoiceListening, 3500);
    };

    speechRecognition.onend = () => {
        if (isVoiceListening) {
            stopVoiceListening();
        }
    };
}

function toggleVoiceAssistant() {
    if (!speechRecognition) {
        alert("Voice recognition is not supported in your browser. Please try Google Chrome or Microsoft Edge.");
        return;
    }

    if (isVoiceListening) {
        speechRecognition.stop();
        stopVoiceListening();
    } else {
        try {
            speechRecognition.start();
            isVoiceListening = true;
            document.getElementById("btn-voice").classList.add("listening");
            const banner = document.getElementById("voice-banner");
            banner.style.display = "block";
            banner.innerHTML = `<span class="voice-pulse">🔴</span> <b>Listening...</b> Speak clearly now (e.g. "Turn on light", "Turn off fan", "Start pump", "Silence alarm")`;
        } catch (err) {
            console.error("Failed to start speech recognition:", err);
        }
    }
}

function stopVoiceListening() {
    isVoiceListening = false;
    document.getElementById("btn-voice").classList.remove("listening");
    setTimeout(() => {
        if (!isVoiceListening) {
            document.getElementById("voice-banner").style.display = "none";
        }
    }, 2000);
}

function processVoiceCommand(cmd) {
    const banner = document.getElementById("voice-banner");

    // English, Hindi, Gujarati, Spanish key aliases
    const isLight = cmd.includes("light") || cmd.includes("लाइट") || cmd.includes("લાઇટ") || cmd.includes("luz");
    const isFan = cmd.includes("fan") || cmd.includes("पंखा") || cmd.includes("પંખો") || cmd.includes("ventilador");
    const isPump = cmd.includes("pump") || cmd.includes("water") || cmd.includes("पानी") || cmd.includes("પંપ") || cmd.includes("bomba");
    const isAlarm = cmd.includes("silence") || cmd.includes("mute") || cmd.includes("alarm") || cmd.includes("buzzer") || cmd.includes("अलार्म") || cmd.includes("બઝર") || cmd.includes("alarma");
    const isTheme = cmd.includes("theme") || cmd.includes("dark mode") || cmd.includes("light mode") || cmd.includes("डार्क") || cmd.includes("લાઇટ મોડ") || cmd.includes("modo");

    const isOff = cmd.includes("off") || cmd.includes("stop") || cmd.includes("disable") || cmd.includes("close") || cmd.includes("बंद") || cmd.includes("બંધ") || cmd.includes("apagar");
    const isFlicker = cmd.includes("flicker") || cmd.includes("blink") || cmd.includes("strobe") || cmd.includes("ब्लिंक");

    if (isLight) {
        if (isFlicker) {
            controlDevice("light", "ON", "FLICKER");
            banner.innerHTML = `💡 Voice Command: <b>Light FLICKER Mode Activated</b>`;
            speakText("Light set to flicker mode");
        } else if (isOff) {
            controlDevice("light", "OFF", stateCache.devices.light.mode);
            banner.innerHTML = `💡 Voice Command: <b>Turned Light OFF</b>`;
            speakText("Turning light OFF");
        } else {
            controlDevice("light", "ON", stateCache.devices.light.mode);
            banner.innerHTML = `💡 Voice Command: <b>Turned Light ON</b>`;
            speakText("Turning light ON");
        }
    } else if (isFan) {
        let targetSpeed = stateCache.devices.fan.mode || "1";
        if (cmd.includes("speed 4") || cmd.includes("speed four") || cmd.includes("level 4") || cmd.includes("4") || cmd.includes("max")) {
            targetSpeed = "4";
        } else if (cmd.includes("speed 3") || cmd.includes("speed three") || cmd.includes("level 3") || cmd.includes("3")) {
            targetSpeed = "3";
        } else if (cmd.includes("speed 2") || cmd.includes("speed two") || cmd.includes("level 2") || cmd.includes("2")) {
            targetSpeed = "2";
        } else if (cmd.includes("speed 1") || cmd.includes("speed one") || cmd.includes("level 1") || cmd.includes("1")) {
            targetSpeed = "1";
        }

        if (isOff) {
            controlDevice("fan", "OFF", targetSpeed);
            banner.innerHTML = `🌀 Voice Command: <b>Turned Fan OFF</b>`;
            speakText("Turning fan OFF");
        } else {
            controlDevice("fan", "ON", targetSpeed);
            banner.innerHTML = `🌀 Voice Command: <b>Turned Fan ON (Speed ${targetSpeed})</b>`;
            speakText(`Turning fan ON at speed ${targetSpeed}`);
        }
    } else if (isPump) {
        if (isOff) {
            controlDevice("pump", "OFF", "MANUAL");
            banner.innerHTML = `🌱 Voice Command: <b>Turned Water Pump OFF</b>`;
            speakText("Turning water pump OFF");
        } else {
            controlDevice("pump", "ON", "MANUAL");
            banner.innerHTML = `🌱 Voice Command: <b>Turned Water Pump ON</b>`;
            speakText("Turning water pump ON");
        }
    } else if (isAlarm) {
        controlDevice("buzzer", "MUTE");
        banner.innerHTML = `🔕 Voice Command: <b>Alarm Silenced</b>`;
        speakText("Alarm silenced");
    } else if (isTheme) {
        if (cmd.includes("dark") || cmd.includes("night") || cmd.includes("डार्क")) {
            applyTheme("dark");
            banner.innerHTML = `🌙 Voice Command: <b>Switched to Dark Neumorphism Mode</b>`;
            speakText("Dark mode enabled");
        } else {
            applyTheme("light");
            banner.innerHTML = `☀️ Voice Command: <b>Switched to Light Neumorphism Mode</b>`;
            speakText("Light mode enabled");
        }
    } else {
        banner.innerHTML = `❓ Command unrecognized: <i>"${cmd}"</i>. Try "turn on light" or "लाइट चालू करो".`;
        speakText("Command not recognized.");
    }
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const langSelect = document.getElementById("voice-lang-select");
        if (langSelect) utterance.lang = langSelect.value;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// --- 5. DESKTOP PUSH NOTIFICATIONS ---
function initDesktopNotifications() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function triggerDesktopNotification(title, message) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body: message, icon: "🏠" });
    }
}

function showNotification(title, message, icon = "ℹ️", type = "info") {
    // 1. Desktop Browser Push Notification
    triggerDesktopNotification(title, message);

    // 2. In-App Neumorphic Floating Toast Banner
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast-card ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-body">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100px)";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- 6. EVENT LISTENERS ---
function initEventListeners() {
    // Theme Switcher Button
    const btnThemeToggle = document.getElementById("btn-theme-toggle");
    if (btnThemeToggle) btnThemeToggle.addEventListener("click", toggleTheme);

    // Light & Fan
    document.getElementById("btn-toggle-light").addEventListener("click", () => {
        const target = stateCache.devices.light.state === "ON" ? "OFF" : "ON";
        controlDevice("light", target, stateCache.devices.light.mode);
    });

    document.getElementById("btn-toggle-fan").addEventListener("click", () => {
        const target = stateCache.devices.fan.state === "ON" ? "OFF" : "ON";
        controlDevice("fan", target, stateCache.devices.fan.mode);
    });

    // Light Modes (Normal / Flicker)
    const btnLightNormal = document.getElementById("light-mode-normal");
    const btnLightFlicker = document.getElementById("light-mode-flicker");
    if (btnLightNormal) btnLightNormal.addEventListener("click", () => setLightMode("NORMAL"));
    if (btnLightFlicker) btnLightFlicker.addEventListener("click", () => setLightMode("FLICKER"));

    // Fan Speed Levels (1, 2, 3, 4)
    ["1", "2", "3", "4"].forEach(speed => {
        const btn = document.getElementById(`fan-speed-${speed}`);
        if (btn) btn.addEventListener("click", () => setFanSpeed(speed));
    });

    // Pump
    document.getElementById("btn-toggle-pump").addEventListener("click", () => {
        const target = stateCache.devices.pump.state === "ON" ? "OFF" : "ON";
        controlDevice("pump", target, stateCache.devices.pump.mode);
    });

    document.getElementById("mode-auto").addEventListener("click", () => setPumpMode("AUTO"));
    document.getElementById("mode-manual").addEventListener("click", () => setPumpMode("MANUAL"));

    // Buzzer
    document.getElementById("btn-toggle-buzzer").addEventListener("click", () => {
        const current = stateCache.devices.buzzer.state;
        const target = (current === "ON" || current === "ALERT") ? "MUTE" : "OFF";
        controlDevice("buzzer", target);
    });

    // Threshold & Eco Mode
    const thresholdSlider = document.getElementById("threshold-slider");
    thresholdSlider.addEventListener("change", (e) => {
        updateSettings(parseFloat(e.target.value), document.getElementById("chk-eco-mode").checked);
    });
    thresholdSlider.addEventListener("input", (e) => {
        document.getElementById("threshold-val").innerText = `${e.target.value}%`;
    });

    document.getElementById("chk-eco-mode").addEventListener("change", (e) => {
        updateSettings(parseFloat(thresholdSlider.value), e.target.checked);
    });

    // Voice Mic Button
    document.getElementById("btn-voice").addEventListener("click", toggleVoiceAssistant);

    // Auth Login/Logout
    document.getElementById("btn-login-logout").addEventListener("click", () => {
        if (currentUser) {
            // Log out user
            localStorage.removeItem("smarthome_auth");
            currentUser = null;
            updateAuthUI();
        } else {
            document.getElementById("login-modal").classList.add("active");
        }
    });

    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const u = document.getElementById("login-username").value;
        const p = document.getElementById("login-password").value;
        
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: u, password: p })
            });
            const data = await res.json();
            if (res.ok && data.user) {
                currentUser = { username: data.user.username, role: data.user.role, token: data.token };
                localStorage.setItem("smarthome_auth", JSON.stringify(currentUser));
                updateAuthUI();
                document.getElementById("login-modal").classList.remove("active");
                document.getElementById("login-error").innerText = "";
                return;
            }
        } catch (err) {
            console.warn("Backend API unavailable, using client-side verification:", err);
        }

        // Fallback Client Verification (Enables login on static Vercel deployment)
        if ((u === "admin" && p === "admin123") || (u === "guest" && p === "guest123")) {
            const role = u === "admin" ? "ADMIN" : "GUEST";
            currentUser = { username: u, role: role, token: `token-${u}-${role}` };
            localStorage.setItem("smarthome_auth", JSON.stringify(currentUser));
            updateAuthUI();
            document.getElementById("login-modal").classList.remove("active");
            document.getElementById("login-error").innerText = "";
            showNotification("Authentication", `Logged in as ${u.toUpperCase()} (${role})`, "🔐", "success");
        } else {
            document.getElementById("login-error").innerText = "Invalid credentials (Use admin / admin123 or guest / guest123)";
        }
    });

    // Schedule Modal
    document.getElementById("btn-open-schedule-modal").addEventListener("click", () => {
        document.getElementById("schedule-modal").classList.add("active");
    });

    document.getElementById("btn-close-sched-modal").addEventListener("click", () => {
        document.getElementById("schedule-modal").classList.remove("active");
    });

    document.getElementById("schedule-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const device_name = document.getElementById("sched-device").value;
        const target_state = document.getElementById("sched-state").value;
        const time_hhmm = document.getElementById("sched-time").value;

        await fetch(`${API_BASE}/api/schedules/add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_name, target_state, time_hhmm })
        });
        document.getElementById("schedule-modal").classList.remove("active");
        fetchSchedules();
    });

    const tariffInput = document.getElementById("tariff-input");
    if (tariffInput) {
        tariffInput.addEventListener("input", updateEnergyCalculator);
    }
}

// --- 7. API CALLS & RENDERING ---
async function fetchSystemStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (!res.ok) return;
        const data = await res.json();
        
        // Trigger alert on fire
        if (data.telemetry.fire_detected && !stateCache.telemetry.fire_detected) {
            showNotification("🚨 FIRE EMERGENCY", "Fire detected! Emergency alarm and strobe light activated.", "🔥", "alert");
        }

        stateCache = data;
        renderUI();
    } catch (err) {
        console.error("Status fetch error:", err);
    }
}

async function controlDevice(device, state, mode = null) {
    if (!currentUser) {
        document.getElementById("login-modal").classList.add("active");
        return;
    }
    if (currentUser.role !== "ADMIN" && device !== "buzzer") {
        showNotification("Access Denied", "Guest users cannot control devices. Log in as Admin.", "🔒", "alert");
        return;
    }

        const devName = device.toUpperCase();
        let detailStr = `Set to ${state}`;
        let icon = "⚙️";
        if (device === "light") {
            icon = "💡";
            detailStr = `Light set to ${state} (${mode || 'NORMAL'})`;
        } else if (device === "fan") {
            icon = "🌀";
            detailStr = `Fan set to ${state} (Speed Level ${mode || '1'})`;
        } else if (device === "pump") {
            icon = "🌱";
            detailStr = `Water Pump set to ${state} (${mode || 'AUTO'})`;
        } else if (device === "buzzer") {
            icon = "🔊";
            detailStr = `Buzzer set to ${state}`;
        }

        try {
            const bodyData = { state };
            if (mode) bodyData.mode = mode;

            await fetch(`${API_BASE}/api/control/${device}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData)
            });

            fetchSystemStatus();
        } catch (err) {
            // Local state cache update fallback for static Vercel host
            if (stateCache.devices && stateCache.devices[device]) {
                stateCache.devices[device].state = state;
                if (mode) stateCache.devices[device].mode = mode;
            }
            renderUI();
        }
        showNotification(`${devName} Control`, detailStr, icon, "success");
}

async function setLightMode(mode) {
    const targetState = (mode === "FLICKER") ? "ON" : (stateCache.devices.light.state || "ON");
    controlDevice("light", targetState, mode);
}

async function setFanSpeed(speed) {
    controlDevice("fan", "ON", speed);
}

async function setPumpMode(mode) {
    controlDevice("pump", stateCache.devices.pump.state, mode);
}

async function updateSettings(threshold, eco_mode) {
    try {
        await fetch(`${API_BASE}/api/settings/threshold`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ moisture_threshold: threshold, eco_mode: eco_mode })
        });
        fetchSystemStatus();
    } catch (err) {
        console.error("Settings update error:", err);
    }
}

async function fetchSchedules() {
    try {
        const res = await fetch(`${API_BASE}/api/schedules`);
        if (!res.ok) return;
        const data = await res.json();
        renderSchedules(data.schedules);
    } catch (err) {
        console.error("Fetch schedules error:", err);
    }
}

async function removeSchedule(id) {
    try {
        await fetch(`${API_BASE}/api/schedules/delete/${id}`, { method: "POST" });
        fetchSchedules();
    } catch (err) {
        console.error("Delete schedule error:", err);
    }
}

function renderUI() {
    const { devices, telemetry, settings, weather, recent_logs } = stateCache;

    // --- Weather Widget ---
    if (weather) {
        document.getElementById("weather-temp").innerText = `${weather.temperature}°C`;
        document.getElementById("weather-desc").innerText = weather.condition;
    }

    // --- Light UI ---
    const lightOn = devices.light.state === "ON";
    const lightMode = devices.light.mode || "NORMAL";
    const lightBadge = document.getElementById("badge-light");
    const bulbGlow = document.getElementById("bulb-glow");
    const btnLight = document.getElementById("btn-toggle-light");
    const btnLightNormal = document.getElementById("light-mode-normal");
    const btnLightFlicker = document.getElementById("light-mode-flicker");

    if (lightMode === "FLICKER") {
        if (btnLightNormal) btnLightNormal.className = "btn-mode";
        if (btnLightFlicker) btnLightFlicker.className = "btn-mode active";
    } else {
        if (btnLightNormal) btnLightNormal.className = "btn-mode active";
        if (btnLightFlicker) btnLightFlicker.className = "btn-mode";
    }

    if (lightOn) {
        lightBadge.className = "device-badge active-light";
        lightBadge.innerText = lightMode === "FLICKER" ? "FLICKER 🚨" : "ACTIVE";
        bulbGlow.className = lightMode === "FLICKER" ? "bulb-glow flicker" : "bulb-glow on";
        btnLight.className = "btn-toggle btn-on";
        btnLight.innerText = "Turn Light OFF";
    } else {
        lightBadge.className = "device-badge";
        lightBadge.innerText = "OFF";
        bulbGlow.className = "bulb-glow";
        btnLight.className = "btn-toggle btn-off";
        btnLight.innerText = "Turn Light ON";
    }

    // --- Fan UI ---
    const fanOn = devices.fan.state === "ON";
    const fanSpeed = devices.fan.mode || "1";
    const fanBadge = document.getElementById("badge-fan");
    const fanSpinner = document.getElementById("fan-spinner");
    const btnFan = document.getElementById("btn-toggle-fan");

    // Update speed level selector buttons
    ["1", "2", "3", "4"].forEach(speed => {
        const btn = document.getElementById(`fan-speed-${speed}`);
        if (btn) {
            btn.className = (fanSpeed === speed) ? "btn-mode active" : "btn-mode";
        }
    });

    if (fanOn) {
        fanBadge.className = "device-badge active-fan";
        fanBadge.innerText = `SPEED ${fanSpeed}`;
        fanSpinner.className = `fan-spinner spinning speed-${fanSpeed}`;
        btnFan.className = "btn-toggle btn-on";
        btnFan.innerText = "Turn Fan OFF";
    } else {
        fanBadge.className = "device-badge";
        fanBadge.innerText = "OFF";
        fanSpinner.className = "fan-spinner";
        btnFan.className = "btn-toggle btn-off";
        btnFan.innerText = "Turn Fan ON";
    }

    // --- Fire UI ---
    const isFire = telemetry.fire_detected;
    const buzzerState = devices.buzzer.state;
    const fireBadge = document.getElementById("badge-fire");
    const fireIndicator = document.getElementById("fire-indicator");
    const fireStatusText = document.getElementById("fire-status-text");
    const btnBuzzer = document.getElementById("btn-toggle-buzzer");

    if (isFire) {
        fireBadge.className = "device-badge active-fire";
        fireBadge.innerText = "FIRE DETECTED";
        fireIndicator.className = "fire-indicator danger";
        fireStatusText.innerText = "EMERGENCY ALARM!";
    } else {
        fireBadge.className = "device-badge active-safe";
        fireBadge.innerText = "SAFE";
        fireIndicator.className = "fire-indicator";
        fireStatusText.innerText = "System Safe";
    }

    if (buzzerState === "ON") {
        btnBuzzer.className = "btn-toggle btn-alert";
        btnBuzzer.innerText = "🔊 Silence Buzzer";
    } else if (buzzerState === "MUTE") {
        btnBuzzer.className = "btn-toggle btn-off";
        btnBuzzer.innerText = "🔇 Alarm Silenced";
    } else {
        btnBuzzer.className = "btn-toggle btn-off";
        btnBuzzer.innerText = "Buzzer Idle";
    }

    // --- Moisture & Pump UI ---
    const moisture = telemetry.soil_moisture;
    const threshold = settings.moisture_threshold;
    const pumpOn = devices.pump.state === "ON";
    const pumpMode = devices.pump.mode || "AUTO";

    document.getElementById("moisture-val").innerText = `${moisture.toFixed(1)}%`;
    document.getElementById("moisture-bar").style.width = `${Math.min(100, Math.max(0, moisture))}%`;
    document.getElementById("threshold-val").innerText = `${threshold}%`;
    document.getElementById("chk-eco-mode").checked = settings.eco_mode;
    
    if (document.activeElement.id !== "threshold-slider") {
        document.getElementById("threshold-slider").value = threshold;
    }

    const pumpBadge = document.getElementById("badge-pump");
    const btnPump = document.getElementById("btn-toggle-pump");
    const btnAuto = document.getElementById("mode-auto");
    const btnManual = document.getElementById("mode-manual");

    if (pumpMode === "AUTO") {
        btnAuto.className = "btn-mode active";
        btnManual.className = "btn-mode";
    } else {
        btnAuto.className = "btn-mode";
        btnManual.className = "btn-mode active";
    }

    if (pumpOn) {
        pumpBadge.className = "device-badge active-pump";
        pumpBadge.innerText = "PUMPING";
        btnPump.className = "btn-toggle btn-on";
        btnPump.innerText = "Turn Pump OFF";
    } else {
        pumpBadge.className = "device-badge";
        pumpBadge.innerText = "IDLE";
        btnPump.className = "btn-toggle btn-off";
        btnPump.innerText = "Turn Pump ON";
    }

    renderLogs(recent_logs);
    updateEnergyCalculator();
}

function renderSchedules(schedules) {
    const list = document.getElementById("schedule-list");
    if (!schedules || schedules.length === 0) {
        list.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem;">No automated schedules configured</div>`;
        return;
    }

    list.innerHTML = schedules.map(s => `
        <div class="schedule-item">
            <div class="sched-info">
                <span class="sched-time">${s.time_hhmm}</span>
                <span>${s.device_name.toUpperCase()} ➔ <b>${s.target_state}</b></span>
            </div>
            <button class="btn-del" onclick="removeSchedule(${s.id})">✖</button>
        </div>
    `).join("");
}

function renderLogs(logs) {
    const feed = document.getElementById("log-feed");
    if (!logs || logs.length === 0) {
        feed.innerHTML = `<div class="log-item"><span class="log-msg">No logs available</span></div>`;
        return;
    }

    feed.innerHTML = logs.map(log => `
        <div class="log-item ${log.severity}">
            <span class="log-msg">${log.message}</span>
            <span class="log-time">${formatTime(log.timestamp)}</span>
        </div>
    `).join("");
}

function formatTime(timestampStr) {
    if (!timestampStr) return "";
    const isoStr = timestampStr.includes("T") ? timestampStr : timestampStr.replace(" ", "T");
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return timestampStr;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// --- 8. ENERGY CALCULATOR ENGINE ---
function updateEnergyCalculator() {
    const { devices } = stateCache;
    if (!devices) return;

    // Wattages: Light (Normal 10W, Flicker 15W), Fan (Speed 1: 15W, 2: 30W, 3: 55W, 4: 75W), Pump (120W), Buzzer (5W)
    let lightWatts = 0;
    if (devices.light && devices.light.state === "ON") {
        lightWatts = (devices.light.mode === "FLICKER") ? 15 : 10;
    }

    let fanWatts = 0;
    if (devices.fan && devices.fan.state === "ON") {
        const speed = devices.fan.mode || "1";
        if (speed === "4") fanWatts = 75;
        else if (speed === "3") fanWatts = 55;
        else if (speed === "2") fanWatts = 30;
        else fanWatts = 15;
    }

    let pumpWatts = (devices.pump && devices.pump.state === "ON") ? 120 : 0;
    let buzzerWatts = (devices.buzzer && (devices.buzzer.state === "ON" || devices.buzzer.state === "ALERT")) ? 5 : 0;

    const totalActiveWatts = lightWatts + fanWatts + pumpWatts + buzzerWatts;

    // Daily kWh estimation based on active load scaled over 24h (typical daily usage baseline: active load * 8 hours / 1000)
    const dailyKWh = (totalActiveWatts * 8) / 1000;
    const monthlyKWh = dailyKWh * 30;

    const tariffInput = document.getElementById("tariff-input");
    const tariffRate = tariffInput ? (parseFloat(tariffInput.value) || 8.0) : 8.0;
    const monthlyCost = monthlyKWh * tariffRate;

    const activeEl = document.getElementById("energy-active-watts");
    const breakdownEl = document.getElementById("energy-breakdown-text");
    const dailyEl = document.getElementById("energy-daily-kwh");
    const monthlyEl = document.getElementById("energy-monthly-cost");
    const tariffSubEl = document.getElementById("energy-tariff-sub");

    if (activeEl) activeEl.innerText = `${totalActiveWatts} W`;
    if (breakdownEl) breakdownEl.innerText = `Light: ${lightWatts}W | Fan: ${fanWatts}W | Pump: ${pumpWatts}W`;
    if (dailyEl) dailyEl.innerText = `${dailyKWh.toFixed(2)} kWh`;
    if (monthlyEl) monthlyEl.innerText = `₹ ${monthlyCost.toFixed(2)}`;
    if (tariffSubEl) tariffSubEl.innerText = `@ ₹${tariffRate.toFixed(2)} / kWh rate`;
}

// --- 9. VIRTUAL ESP32 HARDWARE SIMULATOR ---
let simAutoLoopInterval = null;

function initESP32Simulator() {
    const btnOpen = document.getElementById("btn-open-sim-modal");
    const btnClose = document.getElementById("btn-close-sim-modal");
    const btnCloseX = document.getElementById("btn-close-sim-modal-x");
    const simModal = document.getElementById("esp32-sim-modal");

    if (btnOpen) {
        btnOpen.addEventListener("click", () => {
            if (simModal) simModal.classList.add("active");
        });
    }

    const closeModalFunc = () => {
        if (simModal) simModal.classList.remove("active");
    };

    if (btnClose) btnClose.addEventListener("click", closeModalFunc);
    if (btnCloseX) btnCloseX.addEventListener("click", closeModalFunc);

    // Slider
    const simSlider = document.getElementById("sim-moisture-slider");
    const simMoistureVal = document.getElementById("sim-moisture-val");
    if (simSlider && simMoistureVal) {
        simSlider.addEventListener("input", (e) => {
            simMoistureVal.innerText = `${e.target.value}%`;
        });
    }

    // Flame sensor mode buttons
    const btnSafe = document.getElementById("sim-flame-safe");
    const btnFire = document.getElementById("sim-flame-fire");

    if (btnSafe && btnFire) {
        btnSafe.addEventListener("click", () => {
            btnSafe.className = "btn-mode active";
            btnFire.className = "btn-mode";
        });
        btnFire.addEventListener("click", () => {
            btnSafe.className = "btn-mode";
            btnFire.className = "btn-mode active";
        });
    }

    // Auto loop checkbox
    const chkAutoLoop = document.getElementById("sim-auto-loop");
    if (chkAutoLoop) {
        chkAutoLoop.addEventListener("change", (e) => {
            if (e.target.checked) {
                appendSimLog("🔄 Auto telemetry stream enabled (every 3s)...");
                simAutoLoopInterval = setInterval(() => {
                    pushSimulatedTelemetry(true);
                }, 3000);
            } else {
                if (simAutoLoopInterval) clearInterval(simAutoLoopInterval);
                simAutoLoopInterval = null;
                appendSimLog("⏹️ Auto telemetry stream paused.");
            }
        });
    }

    // Form submit
    const simForm = document.getElementById("sim-form");
    if (simForm) {
        simForm.addEventListener("submit", (e) => {
            e.preventDefault();
            pushSimulatedTelemetry(false);
        });
    }
}

async function pushSimulatedTelemetry(isAuto = false) {
    const simSlider = document.getElementById("sim-moisture-slider");
    const btnFire = document.getElementById("sim-flame-fire");

    const soil_moisture = parseFloat(simSlider ? simSlider.value : 45);
    const fire_detected = btnFire ? btnFire.classList.contains("active") : false;

    try {
        const res = await fetch(`${API_BASE}/api/telemetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ soil_moisture, fire_detected })
        });
        const data = await res.json();
        
        const timestamp = new Date().toLocaleTimeString();
        appendSimLog(`[${timestamp}] 📡 POST /api/telemetry -> Moisture: ${soil_moisture}%, Fire: ${fire_detected ? "YES 🚨" : "NO ✅"} | Resp: Pump=${data.pump}, Buzzer=${data.buzzer}`);
        
        fetchSystemStatus();
    } catch (err) {
        appendSimLog(`❌ Error posting telemetry: ${err.message}`);
    }
}

function appendSimLog(msg) {
    const term = document.getElementById("sim-terminal-log");
    if (!term) return;
    const line = document.createElement("div");
    line.innerText = msg;
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
}

