# Controlled Container Restart Approval Documentation

## Purpose
Governs operational container restart execution through `docker-operations-service` using explicit two-person approval workflows.

## Restart Workflow States
1. `awaiting_approval` — Request created by user.
2. `approved` / `executing` — SRE or Admin approves request.
3. `verifying` — System verifies post-restart health and new container start timestamp.
4. `completed` / `failed` — Final verified state.

## Configuration & Protected Services
```env
RESTARTABLE_DOCKER_SERVICES=github-intelligence-service,aws-intelligence-service,azure-intelligence-service,mcp-server-service,notification-service,ai-rca-service,frontend
PROTECTED_DOCKER_SERVICES=postgres,api-gateway-service,auth-service,docker-operations-service
```

## Permissions Required
- `containers:restart_request`
- `containers:restart_approve`
