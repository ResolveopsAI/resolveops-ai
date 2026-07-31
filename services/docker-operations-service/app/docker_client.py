"""
Docker SDK wrapper for container operations.
"""
import logging
import docker
from fastapi import HTTPException, status

logger = logging.getLogger("docker-operations-service")

_docker_client = None


def get_docker_client():
    global _docker_client
    if _docker_client is None:
        try:
            _docker_client = docker.from_env(timeout=30)
        except Exception as exc:
            logger.error(f"Failed to connect to Docker socket: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Docker daemon unavailable on host socket."
            )
    return _docker_client


def get_container_by_service_name(service_name: str):
    client = get_docker_client()
    containers = client.containers.list(all=True)
    for c in containers:
        labels = c.labels or {}
        compose_service = labels.get("com.docker.compose.service", "").lower()
        if service_name == compose_service or service_name in c.name.lower():
            return c
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Container for service '{service_name}' not found."
    )


def capture_container_state(container) -> dict:
    container.reload()
    state_data = container.attrs.get("State", {})
    health_data = state_data.get("Health", {})
    return {
        "container_id": container.id[:12],
        "container_name": container.name,
        "status": container.status,
        "health_status": health_data.get("Status", "none") if health_data else "none",
        "started_at": state_data.get("StartedAt"),
        "finished_at": state_data.get("FinishedAt"),
        "restart_count": state_data.get("RestartCount", 0),
        "exit_code": state_data.get("ExitCode"),
    }
