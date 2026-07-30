# Implementation Plan - Per-Container & Kubernetes Monitoring System

## Overview
Implement Phase 1 (Per-Container Docker Deep-Dive & Log Streaming) and Phase 2 (Kubernetes Node/Pod & Cluster Events Monitoring) as documented in 20-monitoring-percontainer-k8s-context.md.

## User Review Required
- **Docker Socket Mount**: Requires mounting /var/run/docker.sock:ro to pi-gateway-service in docker-compose.yml so the backend can directly read Docker container stats and logs.
- **Dependencies**: Adding nsi-to-react (or custom ANSI parsing) for live log terminal formatting in the frontend, and kubernetes package to Python equirements.txt.

## Proposed Changes

### Docker Compose & Backend API (pi-gateway-service)

#### [MODIFY] [docker-compose.yml](file:///c:/Users/307393/Desktop/ResolveOps-AI/docker-compose.yml)
- Mount /var/run/docker.sock:/var/run/docker.sock:ro under pi-gateway-service.volumes.

#### [MODIFY] [requirements.txt](file:///c:/Users/307393/Desktop/ResolveOps-AI/services/api-gateway-service/requirements.txt)
- Add kubernetes==29.0.0 for K8s API client.

#### [MODIFY] [api.py](file:///c:/Users/307393/Desktop/ResolveOps-AI/services/api-gateway-service/api.py)
- Implement GET /api/v1/monitoring/container/{name} endpoint for container details (restarts, exit codes, health status, mounts, safe env vars).
- Implement GET /api/v1/monitoring/container/{name}/logs endpoint for live container log tailing.
- Add K8s auto-detection (KUBERNETES_SERVICE_HOST check).
- Implement K8s endpoints:
  - GET /api/v1/monitoring/k8s/nodes
  - GET /api/v1/monitoring/k8s/pods
  - GET /api/v1/monitoring/k8s/pod/{name}/logs
  - GET /api/v1/monitoring/k8s/events
- Enrich SSE payload with untime (docker vs kubernetes) and container detail fields.

---

### Frontend Components & Pages (rontend)

#### [NEW] [MetricGauge.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/components/monitoring/MetricGauge.jsx)
- Modularized SVG radial gauge component for CPU, Memory, Disk, and Network stats.

#### [NEW] [LogPanel.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/components/monitoring/LogPanel.jsx)
- Dark terminal UI component with ANSI color rendering, tail depth selector, search filter, auto-scroll toggle, and copy logs action.

#### [NEW] [ContainerDrawer.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/components/monitoring/ContainerDrawer.jsx)
- Slide-in detail drawer for per-container stats with tabs: Overview, Metrics, Logs, Config.

#### [NEW] [PodDrawer.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/components/monitoring/PodDrawer.jsx)
- Slide-in detail drawer for K8s pods with tabs: Overview, Containers (request/limit/actual tri-bars), Logs, Events.

#### [NEW] [NodeCard.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/components/monitoring/NodeCard.jsx)
- Node fleet status card for Kubernetes cluster monitoring.

#### [MODIFY] [page.jsx](file:///c:/Users/307393/Desktop/ResolveOps-AI/frontend/src/app/analytics/monitoring/page.jsx)
- Integrate runtime switcher ([Docker Containers] | [Kubernetes Cluster]).
- Connect service/pod click handlers to trigger ContainerDrawer / PodDrawer.
- Render Kubernetes Node Fleet, Namespace filter selector, Pod Health Matrix, and Cluster Warning Events feed.

## Verification Plan

### Automated Tests
- Test backend endpoints using FastAPI client or curl.
- Verify JSON payload structure for both Docker and K8s mock responses.

### Manual Verification
- Test clicking microservice cards in /analytics/monitoring to verify ContainerDrawer opens smoothly with live metrics and log tail.
- Verify toggle between Docker and K8s views.
- Test log search filter and auto-refresh toggle in LogPanel.

