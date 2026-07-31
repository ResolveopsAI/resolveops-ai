"""
Approved action execution workflow.
"""
import time
import datetime
import logging
from app.docker_client import get_container_by_service_name, capture_container_state
from app.health_verifier import verify_container_health

logger = logging.getLogger("docker-operations-service")


def execute_approved_restart(service_name: str) -> tuple[bool, dict, dict, str]:
    """
    1. Resolve Compose service container
    2. Capture before state
    3. Perform target.restart(timeout=10)
    4. Run health verification
    Returns (success, before_state, after_state, message)
    """
    container = get_container_by_service_name(service_name)
    before_state = capture_container_state(container)

    logger.info(f"Restarting service '{service_name}' (container {container.name})...")

    try:
        container.restart(timeout=15)
        time.sleep(2)
        success, after_state, message = verify_container_health(container, before_state.get("started_at", ""))
        return success, before_state, after_state, message
    except Exception as exc:
        logger.error(f"Error during container restart for '{service_name}': {exc}")
        after_state = capture_container_state(container)
        return False, before_state, after_state, str(exc)
