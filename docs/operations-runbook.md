# Operations Runbook

## Restarting Allowed Services
1. Log into ResolveOps UI as SRE or Admin.
2. Navigate to **Monitoring** -> Select service.
3. Click **Restart Service** -> Enter operational reason.
4. Review approval status in action dialog -> Approve & Execute.

## Protected Services Manual Procedure
Protected services (`postgres`, `api-gateway-service`, `auth-service`, `docker-operations-service`) cannot be restarted via API. Run host-level commands via SSH:
```bash
docker compose restart postgres
```
