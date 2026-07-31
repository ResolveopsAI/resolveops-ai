# Container Monitoring Documentation

## Purpose
Provides read-only visibility into Docker Compose services using the `docker-evidence-adapter` service.

## Prerequisites
- Docker socket (`/var/run/docker.sock`) mounted read-only (`:ro`) into `docker-evidence-adapter`.
- Configured `ALLOWED_DOCKER_SERVICES` allow-list.

## Required Inputs & Configuration
Configured in `.env`:
```env
ALLOWED_DOCKER_SERVICES=frontend,api-gateway-service,ai-rca-service,aws-intelligence-service,github-intelligence-service,mcp-server-service,notification-service,docker-evidence-adapter,auth-service,azure-intelligence-service,postgres
```

## Permissions Required
- `containers:read`

## Safe Configuration & Endpoints
- `GET /api/v1/containers` — List allow-listed containers.
- `GET /api/v1/containers/{service_name}` — Detailed container state and health.
- `GET /api/v1/containers/{service_name}/stats` — CPU & Memory usage metrics.

## Common Errors & Security Warnings
- **Arbitrary Container Access Blocked**: Specifying hex container IDs or non-allowlisted services returns `403 Forbidden`.
- **Read-Only Guarantee**: `docker-evidence-adapter` exposes no write or restart capabilities.
