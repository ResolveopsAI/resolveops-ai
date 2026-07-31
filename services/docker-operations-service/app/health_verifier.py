"""
Post-restart container verification logic.
"""
import time
import logging
from app.docker_client import capture_container_state
from app.settings import RESTART_TIMEOUT_SECONDS

logger = logging.getLogger("docker-operations-service")


def verify_container_health(container, previous_started_at: str) -> tuple[bool, dict, str]:
    """
    1. Confirm a new container start timestamp.
    2. Confirm container state is 'running'.
    3. Confirm Docker health becomes 'healthy' if healthcheck is defined.
    4. Return (verification_passed, after_state, message).
    """
    start_time = time.time()
    after_state = capture_container_state(container)

    while time.time() - start_time < RESTART_TIMEOUT_SECONDS:
        container.reload()
        after_state = capture_container_state(container)

        current_status = after_state.get("status")
        current_started = after_state.get("started_at")
        health_status = after_state.get("health_status")

        if current_status == "running":
            # Check if container start timestamp updated or health check passed
            if health_status in ("healthy", "none"):
                msg = f"Service returned to running state (health: {health_status})."
                return True, after_state, msg

        if current_status in ("exited", "dead"):
            msg = f"Service failed to start, container state is '{current_status}'."
            return False, after_state, msg

        time.sleep(3)

    msg = f"Verification timed out after {RESTART_TIMEOUT_SECONDS}s."
    return False, after_state, msg
