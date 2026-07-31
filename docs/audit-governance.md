# Audit Governance Documentation

## Overview
Append-only, tamper-evident audit log records stored in PostgreSQL (`audit_logs`).

## Cryptographic Hash Chaining
Each audit entry computes a SHA-256 hash over event metadata and the previous event's hash:
`hash = SHA256(timestamp + actor_email + action + target_name + previous_event_hash)`

## Endpoints
- `GET /api/v1/audit-logs` — Query audit trail with pagination and filters.
- `GET /api/v1/audit-logs/{id}` — Fetch specific audit event.

## Governance Guarantees
- No `UPDATE` or `DELETE` endpoints exposed.
- All request parameters sanitized of secrets prior to storage.
