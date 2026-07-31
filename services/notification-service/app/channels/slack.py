"""
Slack Webhook Channel Adapter.
"""
import os
import logging
import httpx

logger = logging.getLogger("notification-service")


async def send_slack_alert(event: dict) -> bool:
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        logger.warning("SLACK_WEBHOOK_URL not configured. Skipping Slack alert.")
        return False

    severity = event.get("severity", "info").upper()
    emoji_map = {"CRITICAL": "🚨", "ERROR": "❌", "WARNING": "⚠️", "INFO": "ℹ️"}
    emoji = emoji_map.get(severity, "📢")

    payload = {
        "text": f"{emoji} *[{severity}] {event.get('title', 'Operational Alert')}*",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} [{severity}] {event.get('title')}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Service:* {event.get('service', 'Unknown')}"},
                    {"type": "mrkdwn", "text": f"*Severity:* {severity}"},
                    {"type": "mrkdwn", "text": f"*Timestamp:* {event.get('timestamp', '')}"},
                    {"type": "mrkdwn", "text": f"*Incident ID:* {event.get('incident_id', 'N/A')}"}
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Summary:* {event.get('summary', '')}"
                }
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code == 200:
                logger.info("Successfully delivered Slack alert.")
                return True
            else:
                logger.error(f"Slack webhook returned status {resp.status_code}: {resp.text}")
                return False
    except Exception as exc:
        logger.error(f"Error posting to Slack webhook: {exc}")
        return False
