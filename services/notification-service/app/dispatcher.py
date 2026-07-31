"""
Multi-Channel Alert Dispatcher.
"""
import asyncio
import logging
from typing import List, Dict, Any
from app.deduplication import is_duplicate_alert
from app.channels.slack import send_slack_alert
from app.channels.teams import send_teams_alert
from app.channels.pagerduty import send_pagerduty_alert

logger = logging.getLogger("notification-service")


async def dispatch_alert_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Dispatch an alert event to enabled notification channels based on severity.
    """
    dedup_key = event.get("deduplication_key") or f"{event.get('service')}:{event.get('title')}"
    if is_duplicate_alert(dedup_key):
        return {
            "event_id": event.get("event_id"),
            "status": "suppressed",
            "reason": "cooldown_active",
            "channels": []
        }

    severity = event.get("severity", "info").upper()
    delivery_results = {}

    # Always attempt Slack & Teams webhooks if configured
    tasks = [
        ("slack", send_slack_alert(event)),
        ("teams", send_teams_alert(event)),
    ]

    # Send to PagerDuty only for CRITICAL / ERROR severity
    if severity in ("CRITICAL", "ERROR"):
        tasks.append(("pagerduty", send_pagerduty_alert(event)))

    for channel_name, task in tasks:
        try:
            success = await task
            delivery_results[channel_name] = "delivered" if success else "failed_or_unconfigured"
        except Exception as exc:
            logger.error(f"Failed to deliver alert to {channel_name}: {exc}")
            delivery_results[channel_name] = f"error: {type(exc).__name__}"

    return {
        "event_id": event.get("event_id"),
        "status": "dispatched",
        "severity": severity,
        "delivery": delivery_results
    }
