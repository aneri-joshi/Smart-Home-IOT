import urllib.request
import json
import logging

def fetch_weather_forecast(latitude: float = 21.17, longitude: float = 72.83):
    """
    Fetches 7-day weather forecast from Open-Meteo API (Free, keyless API).
    Returns temperature, precipitation probability, and weather condition description.
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={latitude}&longitude={longitude}&"
        f"current_weather=true&hourly=precipitation_probability,precipitation"
    )
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SmartHomeSystem/2.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                current = data.get("current_weather", {})
                hourly = data.get("hourly", {})
                
                # Check next 6 hours precipitation probability
                precip_probs = hourly.get("precipitation_probability", [])[:6]
                precip_amounts = hourly.get("precipitation", [])[:6]
                
                max_prob = max(precip_probs) if precip_probs else 0
                total_precip = sum(precip_amounts) if precip_amounts else 0.0
                
                # Weather code interpretation
                wcode = current.get("weathercode", 0)
                condition = interpret_weather_code(wcode)
                
                is_rain_likely = (max_prob >= 60) or (total_precip >= 1.0) or (wcode in [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99])
                
                return {
                    "status": "success",
                    "temperature": current.get("temperature", 25.0),
                    "windspeed": current.get("windspeed", 10.0),
                    "weather_code": wcode,
                    "condition": condition,
                    "max_rain_probability_6h": max_prob,
                    "rain_likely": is_rain_likely
                }
    except Exception as e:
        logging.warning(f"Failed to fetch weather forecast: {e}")
        
    return {
        "status": "fallback",
        "temperature": 26.0,
        "windspeed": 5.0,
        "weather_code": 0,
        "condition": "Clear Sky",
        "max_rain_probability_6h": 10,
        "rain_likely": False
    }

def interpret_weather_code(code: int) -> str:
    codes = {
        0: "Clear Sky",
        1: "Mainly Clear",
        2: "Partly Cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Depositing Rime Fog",
        51: "Light Drizzle",
        53: "Moderate Drizzle",
        55: "Dense Drizzle",
        61: "Slight Rain",
        63: "Moderate Rain",
        65: "Heavy Rain",
        71: "Slight Snow",
        80: "Slight Rain Showers",
        81: "Moderate Rain Showers",
        82: "Violent Rain Showers",
        95: "Thunderstorm",
        96: "Thunderstorm with Hail"
    }
    return codes.get(code, "Clear")
