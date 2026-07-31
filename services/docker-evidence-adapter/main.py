"""
Docker Evidence Adapter — Read-Only Container Inspection & Log Streaming Service.

Accesses /var/run/docker.sock strictly in READ-ONLY mode.
Supports bounded log retrieval, SSE streaming, CPU/Memory stats, and strict service allow-listing.
Does NOT expose any container mutation, start, stop, restart, or shell execution APIs.
"""
from __future__ import annotations

import os
import re
import json
import time
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, AsyncGenerator

import docker
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker-evidence-adapter")

app = FastAPI(title="docker-evidence-adapter", version="2.0.0")

# Service Allow-List Configuration
_ALLOWED_SERVICES_RAW = os.getenv(
    "ALLOWED_DOCKER_SERVICES",
    "frontend,api-gateway-service,ai-rca-service,aws-intelligence-service,"
    "github-intelligence-service,mcp-server-service,notification-service,"
    "docker-evidence-adapter,auth-service,azure-intelligence-service,postgres"
)
ALLOWED_SERVICES = frozenset(s.strip().lower() for s in _ALLOWED_SERVICES_RAW.split(",") if s.strip())

# Log Bounds Configuration
DEFAULT_TAIL = int(os.getenv("DOCKER_LOG_DEFAULT_TAIL", "200"))
MAX_TAIL = int(os.getenv("DOCKER_LOG_MAX_TAIL", "1000"))
MAX_MINUTES = int(os.getenv("DOCKER_LOG_MAX_MINUTES", "60"))
MAX_CHARACTERS = int(os.getenv("DOCKER_LOG_MAX_CHARACTERS", "50000"))
STREAM_MAX_SECONDS = int(os.getenv("DOCKER_LOG_STREAM_MAX_SECONDS", "300"))

_docker_client = None


def get_docker_client():
    global _docker_client
    if _docker_client is None:
        try:
            _docker_client = docker.from_env(timeout=10)
        except Exception as exc:
            logger.error(f"Failed to connect to Docker socket: {exc}")
            raise HTTPException(
                status_code=503,
                detail="Docker socket unavailable on host.",
            )
    return _docker_client


def validate_service_name(service_name: str) -> str:
    name = service_name.strip().lower()

    # Reject hex container IDs
    if re.match(r"^[0-9a-f]{12,64}$", name):
        raise HTTPException(
            status_code=403,
            detail="Direct container ID access is disallowed. Specify an allowed Compose service name.",
        )

    if name not in ALLOWED_SERVICES:
        raise HTTPException(
            status_code=403,
            detail=f"Service '{service_name}' is not in the allowed service list.",
        )

    return name


def sanitize_log_text(text: str) -> str:
    """
    Redact secrets, authorization headers, tokens, DB connections, API keys.
    """
    patterns = [
        (r"(Bearer\s+)[A-Za-z0-9\-\._~\+\/]+=*", r"\1[REDACTED_TOKEN]"),
        (r"(?:password|secret|passwd|token|api_key|access_key|private_key)\s*[:=]\s*[\"']?([^\s\"']{6,})[\"']?", r"\1: [REDACTED]"),
        (r"postgres(?:ql)?://([^:]+):([^@]+)@", r"postgres://\1:[REDACTED]@"),
        (r"sk-[A-Za-z0-9]{32,}", r"[REDACTED_OPENAI_KEY]"),
        (r"ghp_[A-Za-z0-9]{36}", r"[REDACTED_GITHUB_TOKEN]"),
        (r"AKIA[0-9A-Z]{16}", r"[REDACTED_AWS_KEY]"),
    ]
    cleaned = text
    for pat, repl in patterns:
        cleaned = re.sub(pat, repl, cleaned, flags=re.IGNORECASE)
    return cleaned


def find_container_for_service(service_name: str):
    client = get_docker_client()
    containers = client.containers.list(all=True)
    target = None
    for c in containers:
        c_name = c.name.lower()
        labels = c.labels or {}
        compose_service = labels.get("com.docker.compose.service", "").lower()
        if service_name == compose_service or service_name in c_name:
            target = c
            break
    if not target:
        raise HTTPException(status_code=404, detail=f"Container for service '{service_name}' not found.")
    return target


@app.get("/health")
def health_check():
    client_status = "connected"
    try:
        get_docker_client().ping()
    except Exception:
        client_status = "disconnected"

    return {
        "status": "healthy" if client_status == "connected" else "degraded",
        "service": "docker-evidence-adapter",
        "docker_socket": client_status,
        "allowed_services_count": len(ALLOWED_SERVICES),
    }


@app.get("/api/v1/containers")
def list_containers():
    """
    Return all allow-listed containers with basic health/state summary.
    """
    client = get_docker_client()
    containers = client.containers.list(all=True)
    result = []

    for c in containers:
        labels = c.labels or {}
        compose_service = labels.get("com.docker.compose.service", "").lower() or c.name.replace("resolveops-", "").replace("-1", "")
        
        if compose_service not in ALLOWED_SERVICES and c.name.lower() not in ALLOWED_SERVICES:
            continue

        state_data = c.attrs.get("State", {})
        health_data = state_data.get("Health", {})
        health_status = health_data.get("Status", "none") if health_data else "none"

        result.append({
            "service_name": compose_service,
            "container_name": c.name,
            "image": c.image.tags[0] if c.image.tags else str(c.image.id)[:12],
            "state": c.status,  # running, exited, paused
            "health_status": health_status,
            "restart_count": state_data.get("RestartCount", 0),
            "started_at": state_data.get("StartedAt"),
        })

    return {"containers": result, "count": len(result)}


@app.get("/api/v1/containers/{service_name}")
def get_container_details(service_name: str):
    name = validate_service_name(service_name)
    target = find_container_for_service(name)
    
    state_data = target.attrs.get("State", {})
    health_data = state_data.get("Health", {})
    health_status = health_data.get("Status", "none") if health_data else "none"

    # Compute uptime string
    started_at = state_data.get("StartedAt", "")

    return {
        "service_name": name,
        "container_name": target.name,
        "image": target.image.tags[0] if target.image.tags else str(target.image.id)[:12],
        "state": target.status,
        "health_status": health_status,
        "restart_count": state_data.get("RestartCount", 0),
        "started_at": started_at,
        "exit_code": state_data.get("ExitCode"),
        "error": state_data.get("Error", ""),
        "labels": {
            k: v for k, v in (target.labels or {}).items()
            if k.startswith("com.docker.compose") or k in ("maintainer", "version")
        }
    }


@app.get("/api/v1/containers/{service_name}/stats")
def get_container_stats(service_name: str):
    name = validate_service_name(service_name)
    target = find_container_for_service(name)

    if target.status != "running":
        return {
            "service_name": name,
            "cpu_percent": 0.0,
            "memory_usage_bytes": 0,
            "memory_limit_bytes": 0,
            "memory_percent": 0.0,
            "status": target.status,
        }

    try:
        stats = target.stats(stream=False)
        # CPU calculation
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})

        cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
        online_cpus = cpu_stats.get("online_cpus") or len(cpu_stats.get("cpu_usage", {}).get("percpu_usage", [1]))

        cpu_percent = 0.0
        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = round((cpu_delta / system_delta) * online_cpus * 100.0, 2)

        # Memory calculation
        mem_stats = stats.get("memory_stats", {})
        mem_usage = mem_stats.get("usage", 0)
        mem_limit = mem_stats.get("limit", 1)
        mem_percent = round((mem_usage / mem_limit) * 100.0, 2) if mem_limit > 0 else 0.0

        return {
            "service_name": name,
            "container_name": target.name,
            "cpu_percent": cpu_percent,
            "memory_usage_bytes": mem_usage,
            "memory_limit_bytes": mem_limit,
            "memory_percent": mem_percent,
            "status": target.status,
        }
    except Exception as exc:
        logger.error(f"Error fetching stats for '{name}': {exc}")
        return {
            "service_name": name,
            "cpu_percent": 0.0,
            "memory_usage_bytes": 0,
            "memory_limit_bytes": 0,
            "memory_percent": 0.0,
            "error": str(exc),
        }


@app.get("/api/v1/containers/{service_name}/logs")
def get_container_logs(
    service_name: str,
    tail: int = Query(DEFAULT_TAIL, ge=1, le=MAX_TAIL),
    since_minutes: Optional[int] = Query(None, ge=1, le=MAX_MINUTES),
    search: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
):
    name = validate_service_name(service_name)
    target = find_container_for_service(name)

    since_timestamp = None
    if since_minutes:
        since_timestamp = int(time.time()) - (since_minutes * 60)

    try:
        logs_bytes = target.logs(
            stdout=True,
            stderr=True,
            tail=tail,
            since=since_timestamp,
            timestamps=True
        )
        raw_text = logs_bytes.decode("utf-8", errors="replace")
        lines = raw_text.splitlines()

        filtered = []
        for line in lines:
            if not line.strip():
                continue
            if search and search.lower() not in line.lower():
                continue
            if level and level.lower() not in line.lower():
                continue
            filtered.append(sanitize_log_text(line))

        # Enforce total character limit
        full_output = "\n".join(filtered)
        if len(full_output) > MAX_CHARACTERS:
            full_output = full_output[-MAX_CHARACTERS:] + "\n[LOG OUTPUT TRUNCATED AT 50KB LIMIT]"
            filtered = full_output.splitlines()

        return {
            "service_name": name,
            "container_name": target.name,
            "tail": tail,
            "returned_lines": len(filtered),
            "logs": filtered,
        }
    except Exception as exc:
        logger.error(f"Error retrieving logs for '{name}': {exc}")
        raise HTTPException(status_code=500, detail=f"Log retrieval error: {type(exc).__name__}")


@app.get("/api/v1/containers/{service_name}/logs/stream")
async def stream_container_logs(service_name: str, request: Request):
    name = validate_service_name(service_name)
    target = find_container_for_service(name)

    async def log_generator() -> AsyncGenerator[str, None]:
        start_time = time.time()
        yield f"event: connected\ndata: {json.dumps({'message': f'Streaming logs for {name}', 'max_seconds': STREAM_MAX_SECONDS})}\n\n"

        try:
            # Fetch log stream from Docker SDK
            log_stream = target.logs(stdout=True, stderr=True, stream=True, tail=50, timestamps=True)
            loop = asyncio.get_event_loop()

            for chunk in log_stream:
                # Check stream timeout
                if time.time() - start_time > STREAM_MAX_SECONDS:
                    yield f"event: timeout\ndata: {json.dumps({'message': 'Stream reached maximum 300s limit'})}\n\n"
                    break

                # Check client disconnect
                if await request.is_disconnected():
                    logger.info(f"Client disconnected from SSE stream for '{name}'.")
                    break

                text = chunk.decode("utf-8", errors="replace").strip()
                if text:
                    clean_line = sanitize_log_text(text)
                    yield f"event: log\ndata: {json.dumps({'line': clean_line})}\n\n"

                # Brief yields to allow event loop context switching
                await asyncio.sleep(0.01)

        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            yield f"event: closed\ndata: {json.dumps({'message': 'Stream ended'})}\n\n"

    return StreamingResponse(
        log_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
