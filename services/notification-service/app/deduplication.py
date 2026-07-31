"""
Alert Cooldown and Deduplication Manager.
"""
import time
import os
import logging
from typing import Dict

logger = logging.getLogger("notification-service")

# Memory cache: {dedup_key: last_sent_timestamp}
_dedup_cache: Dict[str, float] = {}
COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_MINUTES", "15")) * 60


def is_duplicate_alert(dedup_key: str) -> bool:
    if not dedup_key:
        return False
    now = time.time()
    last_sent = _dedup_cache.get(dedup_key)
    if last_sent and (now - last_sent < COOLDOWN_SECONDS):
        logger.info(f"Alert '{dedup_key}' suppressed due to cooldown ({COOLDOWN_SECONDS}s).")
        return True
    _dedup_cache[dedup_key] = now
    return False
