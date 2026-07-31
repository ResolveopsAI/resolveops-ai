"""
Microsoft Teams Webhook / Workflow Channel Adapter.
"""
import os
import logging
import httpx

logger = logging.getLogger("notification-service")


async def send_teams_alert(event: dict) -> bool:
    webhook_url = os.getenv("TEAMS_WEBHOOK_URL")
    if not webhook_url:
        logger.warning("TEAMS_WEBHOOK_URL not configured. Skipping Teams alert.")
        return False

    severity = event.get("severity", "info").upper()
    color_map = {"CRITICAL": "d9534f", "ERROR": "f0ad4e", "WARNING": "ffc107", "INFO": "0275d8"}

    payload = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": color_map.get(severity, "0275d8"),
        "summary": event.get("title", "ResolveOps Operational Alert"),
        "sections": [
            {
                "activityTitle": f"[{severity}] {event.get('title')}",
                "activitySubtitle": f"Service: {event.get('service', 'N/A')}",
                "facts": [
                    {"name": "Severity", "value": severity},
                    {"name": "Service", "value": event.get("service", "N/A")},
                    {"name": "Incident ID", "value": event.get("incident_id", "N/A")},
                    {"name": "Timestamp", "value": event.get("timestamp", "")}
                ],
                "text": event.get("summary", "")
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code in (200, 202):
                logger.info("Successfully delivered MS Teams alert.")
                return True
            else:
                logger.error(f"MS Teams webhook returned status {resp.status_code}: {resp.text}")
                return False
    except Exception as exc:
        logger.error(f"Error posting to MS Teams webhook: {exc}")
        return False
