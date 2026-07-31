# Docker Socket Security Policy

## Isolation Boundaries
- `/var/run/docker.sock` is mounted **ONLY** into `docker-evidence-adapter` (read-only `:ro`) and `docker-operations-service` (writable for approved restarts).
- Socket access is **STRICTLY PROHIBITED** for `api-gateway-service`, `ai-rca-service`, `mcp-server-service`, `frontend`, `auth-service`, and `notification-service`.
