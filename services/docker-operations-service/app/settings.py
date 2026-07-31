"""
Configuration & Environment Settings for Docker Operations Service.
"""
import os

INTERNAL_SERVICE_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "internal-dev-token-secret")

_RESTARTABLE_RAW = os.getenv(
    "RESTARTABLE_DOCKER_SERVICES",
    "github-intelligence-service,aws-intelligence-service,azure-intelligence-service,"
    "mcp-server-service,notification-service,ai-rca-service,frontend"
)
RESTARTABLE_SERVICES = frozenset(s.strip().lower() for s in _RESTARTABLE_RAW.split(",") if s.strip())

_PROTECTED_RAW = os.getenv(
    "PROTECTED_DOCKER_SERVICES",
    "postgres,api-gateway-service,auth-service,docker-operations-service"
)
PROTECTED_SERVICES = frozenset(s.strip().lower() for s in _PROTECTED_RAW.split(",") if s.strip())

APPROVAL_REQUIRED = os.getenv("CONTAINER_ACTION_APPROVAL_REQUIRED", "true").lower() == "true"
EXPIRY_MINUTES = int(os.getenv("CONTAINER_ACTION_EXPIRY_MINUTES", "15"))
RESTART_TIMEOUT_SECONDS = int(os.getenv("CONTAINER_RESTART_TIMEOUT_SECONDS", "120"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://resolveopsadmin:local-db-pass@postgres:5432/resolveopsdb")
