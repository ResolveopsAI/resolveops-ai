# Troubleshooting Guide

## Docker Adapter Unreachable
- Symptom: `502 Bad Gateway` on `/api/v1/containers`
- Resolution: Check `docker compose ps` to ensure `docker-evidence-adapter` is healthy and socket permission is granted.

## Restart Request Expired
- Symptom: `400 Action expired`
- Resolution: Action requests expire after 15 minutes. Submit a new request.
