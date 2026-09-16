import urllib.request
import urllib.parse
import json
import logging

def send_telegram_alert(bot_token: str, chat_id: str, message: str):
    """
    Sends an instant push message via Telegram Bot API.
    """
    if not bot_token or not chat_id:
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }
    
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status == 200
    except Exception as e:
        logging.error(f"Failed to send Telegram alert: {e}")
        return False
