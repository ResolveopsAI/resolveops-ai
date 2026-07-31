"""
PagerDuty Events API v2 Channel Adapter.
"""
import os
import logging
import httpx

logger = logging.getLogger("notification-service")
PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue"


async def send_pagerduty_alert(event: dict) -> bool:
    routing_key = os.getenv("PAGERDUTY_ROUTING_KEY")
    if not routing_key:
        logger.warning("PAGERDUTY_ROUTING_KEY not configured. Skipping PagerDuty alert.")
        return False

    severity_map = {
        "CRITICAL": "critical",
        "ERROR": "error",
        "WARNING": "warning",
        "INFO": "info",
    }
    pd_severity = severity_map.get(event.get("severity", "info").upper(), "info")

    payload = {
        "routing_key": routing_key,
        "event_action": "trigger",
        "dedup_key": event.get("deduplication_key") or event.get("event_id"),
        "payload": {
            "summary": event.get("title", "Operational Alert"),
            "source": event.get("source", "ResolveOps AI"),
            "severity": pd_severity,
            "timestamp": event.get("timestamp"),
            "component": event.get("service"),
            "custom_details": {
                "summary": event.get("summary"),
                "incident_id": event.get("incident_id"),
                "evidence_reference": event.get("evidence_reference"),
            }
        }
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(PAGERDUTY_EVENTS_URL, json=payload)
            if resp.status_code in (200, 202):
                logger.info("Successfully delivered PagerDuty alert.")
                return True
            else:
                logger.error(f"PagerDuty API returned status {resp.status_code}: {resp.text}")
                return False
    except Exception as exc:
        logger.error(f"Error calling PagerDuty API: {exc}")
        return False
