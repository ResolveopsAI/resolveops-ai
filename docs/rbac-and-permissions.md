# Role-Based Access Control (RBAC) Documentation

## Overview
Backend authorization layer enforcing fine-grained role permissions across 4 standard roles.

## Role Matrix
- **Admin**: Full access to view, request, approve, manage integrations, and audit records.
- **SRE**: Access to view, request, approve operational restarts, view audit logs.
- **Developer**: Access to view allowed services and logs, request restarts (cannot approve own request).
- **Auditor**: Read-only access to incidents, actions, and audit records.

## Permission Constants
- `containers:read`
- `containers:logs`
- `containers:restart_request`
- `containers:restart_approve`
- `audit:read`
- `integrations:manage`
- `alerts:manage`
