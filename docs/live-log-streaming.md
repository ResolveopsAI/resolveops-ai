# Live Log Streaming Documentation

## Purpose
Enables real-time, bounded, redacted log streaming using Server-Sent Events (SSE).

## Endpoints
- `GET /api/v1/containers/{service_name}/logs` — Historical log endpoint.
- `GET /api/v1/containers/{service_name}/logs/stream` — SSE live log stream.

## Configuration Limits
```env
DOCKER_LOG_DEFAULT_TAIL=200
DOCKER_LOG_MAX_TAIL=1000
DOCKER_LOG_MAX_MINUTES=60
DOCKER_LOG_MAX_CHARACTERS=50000
DOCKER_LOG_STREAM_MAX_SECONDS=300
```

## Permissions Required
- `containers:logs`

## Redaction Safeguards
Secrets matching Authorization headers, Bearer tokens, API keys, database connection URIs, AWS keys, OpenAI keys, and GitHub PATs are automatically redacted with `[REDACTED]` prior to streaming.
