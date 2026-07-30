# Monitoring Dashboard — Per-Container & Kubernetes Context

> **Status**: Deferred — implement after current SSE monitoring is stable.
> **Requested**: 2026-07-29
> **Priority**: High

---

## What Exists Today

The `/analytics/monitoring` page currently delivers:

| Feature | Detail |
|---|---|
| **SSE live push** | `GET /api/v1/monitoring/cluster/stream` pushes a JSON snapshot every 2s |
| **Host gauges** | RAM / CPU / Disk / Network radial SVG gauges via `psutil` |
| **Service health matrix** | 8 service cards with CPU%, MEM%, sparklines, uptime, CORE badge |
| **Per-service drill-down** | Click a card opens a LineChart for that service's rolling CPU+mem history |
| **Spike alerts** | Moving-average CPU/mem anomaly detection + monotonic OOM prediction |
| **Top consumers** | CPU & Memory leaderboards |

**Current limitation**: Service metrics fall back to `psutil` process scanning when Docker SDK is unavailable, so per-container isolation is best-effort. The `api-gateway-service` container does not currently have `/var/run/docker.sock` mounted.

---

## Container Topology (from docker-compose.yml)

```
resolveops-postgres                   postgres:15-alpine
resolveops-frontend                   Next.js 16, port 3000
resolveops-api-gateway-service        FastAPI, port 8000   <-- runs SSE endpoint
resolveops-auth-service               FastAPI, backend-net
resolveops-github-intelligence-service FastAPI, backend-net
resolveops-aws-intelligence-service   FastAPI, backend-net
resolveops-azure-intelligence-service FastAPI, backend-net
resolveops-mcp-server-service         FastAPI, backend-net
resolveops-docker-evidence-adapter    FastAPI, backend-net  <-- already has docker.sock:ro
resolveops-ai-rca-service             FastAPI, port 8005
resolveops-notification-service       FastAPI, backend-net
```

Networks: `frontend-net` (frontend <-> gateway), `backend-net` (gateway <-> all services)

---

## Phase 1 — Per-Container Deep-Dive (Docker Compose)

### Goal

Each service card in the health matrix must be **clickable to open a full detail drawer** showing real Docker container stats — not just aggregated host metrics — for that specific container.

### Data to expose per container

| Metric | Docker SDK source | Notes |
|---|---|---|
| CPU % | `stats.cpu_stats` delta calculation | Already at summary level |
| Memory used / limit | `stats.memory_stats.usage / limit` | MB and % |
| Network RX / TX bytes | `stats.networks[iface].rx_bytes / tx_bytes` | Per-interface, sum all |
| Block I/O read / write | `stats.blkio_stats.io_service_bytes_recursive` | Disk I/O |
| Restart count | `container.attrs['RestartCount']` | Red badge if > 3 |
| Health status | `container.attrs['State']['Health']['Status']` | healthy / unhealthy / starting |
| Started at | `container.attrs['State']['StartedAt']` | ISO timestamp -> uptime |
| Exit code | `container.attrs['State']['ExitCode']` | Non-zero = crashed |
| Live log tail | `container.logs(tail=100, stream=False)` | Last N lines |
| Image & tag | `container.image.tags[0]` | Version tracking |
| Port mappings | `container.ports` | Verify expected ports are bound |
| Safe env vars | `container.attrs['Config']['Env']` | Filter `*_KEY *_SECRET *_PASSWORD *_TOKEN` |
| Volume mounts | `container.attrs['HostConfig']['Binds']` | Show mount paths |

### Backend endpoints to build

```python
# 1. Full container detail (one-shot REST)
GET /api/v1/monitoring/container/{name}
# Returns: all metrics above as a single JSON object
# Auth: admin only

# 2. Container log tail
GET /api/v1/monitoring/container/{name}/logs?tail=100&since=300
# Returns: { "lines": ["...", ...], "container": "name", "truncated": false }
# Strips ANSI escape codes server-side OR sends raw for client-side rendering
# Auth: admin only
```

### docker-compose.yml change required

Mount the Docker socket on `api-gateway-service` so it can query sibling containers:

```yaml
api-gateway-service:
  volumes:
    - ./data:/app/data
    - generated_visuals:/app/data/visuals
    - /var/run/docker.sock:/var/run/docker.sock:ro   # ADD THIS
```

`docker-evidence-adapter` already has this pattern — exact same approach.

### Frontend components to build

```
frontend/src/components/monitoring/
├── ContainerDrawer.jsx    Main slide-in drawer component
├── LogPanel.jsx           Shared ANSI terminal panel (reusable for K8s too)
└── MetricGauge.jsx        Extract the RadialGauge from page.jsx into shared component
```

**ContainerDrawer tabs:**

| Tab | Content |
|---|---|
| Overview | Status pill, restart count badge, uptime, image tag, exit code, port mappings |
| Metrics | Radial gauges (CPU, MEM), Net I/O bar (RX vs TX), Disk I/O bar, time-series chart |
| Logs | LogPanel — monospace terminal, tail selector (50/100/200), search filter, auto-scroll |
| Config | Safe env vars list, volume mounts, exposed ports |

**Interaction model:**
- Service card click: instead of expanding inline chart, opens ContainerDrawer sliding in from right
- Drawer is 520px wide, full viewport height, backdrop blur overlay
- Drawer header: container name, status badge, "Reconnect stream" icon
- Drawer auto-refreshes its one-shot metrics every 4s while open
- Logs tab: initial load on tab open, "Refresh logs" button, tail count selector

---

## Phase 2 — Kubernetes Mode (Post-Deployment)

### Detection Strategy

```python
import os
IS_KUBERNETES = bool(os.environ.get("KUBERNETES_SERVICE_HOST"))
```

The SSE snapshot includes `"runtime": "kubernetes" | "docker"` so the frontend renders the correct view.

### K8s Data Hierarchy

```
Cluster
├── Nodes
│   ├── name, role (control-plane / worker)
│   ├── CPU: allocatable, requested, used (via metrics-server)
│   ├── Memory: allocatable, requested, used
│   ├── Conditions: Ready, DiskPressure, MemoryPressure, PIDPressure
│   └── Pods scheduled on this node
└── Namespace: resolveops (or configurable)
    └── Pods
        ├── name, phase (Running/Pending/CrashLoopBackOff/OOMKilled/Evicted)
        ├── containers[] { name, image, restartCount, cpu_req, cpu_lim, mem_req, mem_lim }
        ├── node assignment
        ├── startTime (-> age)
        └── conditions (Ready, Initialized, ContainersReady)
```

### Backend endpoints to build for K8s

```python
# Node list with resource summary
GET /api/v1/monitoring/k8s/nodes

# Pod list (namespace filter)
GET /api/v1/monitoring/k8s/pods?namespace=resolveops

# Pod logs (with container selector)
GET /api/v1/monitoring/k8s/pod/{name}/logs?container=app&tail=100&namespace=resolveops

# Cluster events (Warning events feed)
GET /api/v1/monitoring/k8s/events?namespace=resolveops

# HPA / Deployment status
GET /api/v1/monitoring/k8s/deployments?namespace=resolveops
```

Add to `requirements.txt`: `kubernetes==29.0.0`

In-cluster auth: `kubernetes.config.load_incluster_config()`
Local dev auth: `kubernetes.config.load_kube_config()`

For real-time in K8s mode, the SSE endpoint should use `kubernetes.watch.Watch` on pods and events instead of polling Docker stats.

### Frontend Layout for K8s Mode

The monitoring page gains a runtime tab switcher at the top:

```
[  Docker Containers  ]  [  Kubernetes  ]
```

**Kubernetes tab layout:**

```
+------------------------------------------+
| Cluster health banner (same pill)         |
+------------------------------------------+
| Node Fleet grid (NodeCard per node)       |
|  NodeCard: name, role, CPU%, MEM%,        |
|            pod count, conditions          |
+------------------------------------------+
| Namespace selector  [resolveops ▾]        |
+------------------------------------------+
| Pod Health Matrix (same grid as services) |
|  PodCard: name, status, restart#,         |
|           age, node, container count      |
|  Click -> PodDrawer                       |
+------------------------------------------+
| Cluster Events feed (Warning events)      |
+------------------------------------------+
| Deployments / HPA status                 |
|  replicas: 3/3, HPA: min 2 max 10        |
+------------------------------------------+
```

**PodDrawer tabs** (same pattern as ContainerDrawer):

| Tab | Content |
|---|---|
| Overview | Phase, node, age, conditions, pod IP |
| Containers | Per-container table: image, CPU req/lim/actual, mem req/lim/actual, restarts |
| Logs | LogPanel with container selector dropdown |
| Events | K8s events for this pod (reason, message, count, last timestamp) |

### K8s-specific UI enhancements over Docker mode

| Enhancement | Why |
|---|---|
| Resource request vs limit vs actual tri-bar | K8s has requests/limits Docker doesn't |
| CrashLoopBackOff exponential backoff indicator | K8s-specific failure mode |
| HPA current/min/max replicas pill | Auto-scaling visibility |
| Pod eviction warnings (OOMKill / node pressure) | K8s eviction events |
| Rolling deployment progress bar | Track rollouts live |
| Node -> Pod assignment map (table or force-graph) | Resource distribution |
| Namespace filter chips | Multi-namespace deployments |

---

## Design Language to Carry Forward

```
Background cards:   bg-[#06090f]
Drawer backgrounds: bg-[#080d1a]
Default borders:    border-white/8
Selected borders:   border-indigo-500/40
Monospace values:   font-mono
Status colors:
  healthy    -> emerald-400
  warning    -> amber-400
  critical   -> rose-400
  predictive -> violet-400
  offline    -> slate-400/500
Animations:
  progress bars    -> transition-all duration-700
  critical dots    -> animate-pulse
  gauge fill       -> transition: all 0.6s ease
  drawer open      -> slide-in from right, 300ms ease
  data update tick -> brief opacity flash or scale pulse on the changed value
```

The drawer component should use the same `RadialGauge` SVG component already built in `page.jsx` (extract to `frontend/src/components/monitoring/MetricGauge.jsx` when building the drawer).

---

## Implementation Checklist (when ready to build)

### Phase 1 — Docker Per-Container

- [ ] Mount `/var/run/docker.sock:ro` on `api-gateway-service` in `docker-compose.yml`
- [ ] Add `GET /api/v1/monitoring/container/{name}` endpoint in `api.py`
- [ ] Add `GET /api/v1/monitoring/container/{name}/logs` endpoint in `api.py`
- [ ] Enrich SSE snapshot with `restart_count`, `health_status`, `exit_code`, `net_rx_kb`, `net_tx_kb`, `blkio_read_mb`, `blkio_write_mb`
- [ ] Extract `RadialGauge` to `frontend/src/components/monitoring/MetricGauge.jsx`
- [ ] Build `LogPanel.jsx` — monospace terminal, ANSI support, tail selector, auto-scroll
- [ ] Build `ContainerDrawer.jsx` — slide-in drawer with 4 tabs
- [ ] Wire service card click in `page.jsx` to open `ContainerDrawer` instead of inline chart

### Phase 2 — Kubernetes

- [ ] Add `kubernetes==29.0.0` to `requirements.txt`
- [ ] Add runtime detection (`KUBERNETES_SERVICE_HOST`) in `api.py`
- [ ] Build K8s data layer endpoints (nodes, pods, events, deployments, logs)
- [ ] Replace Docker SSE with K8s Watch API when in K8s mode
- [ ] Build `NodeCard.jsx` component
- [ ] Build `PodDrawer.jsx` component (tabs: Overview / Containers / Logs / Events)
- [ ] Add `[Docker | Kubernetes]` tab switcher to monitoring page
- [ ] Add Namespace selector dropdown
- [ ] Add Cluster Events feed panel
- [ ] Add HPA / Deployment status section
- [ ] Add resource tri-bar (request / limit / actual) component

---

## Files That Will Change

| File | Action |
|---|---|
| `docker-compose.yml` | Add docker.sock mount on api-gateway-service |
| `services/api-gateway-service/api.py` | New container + K8s endpoints; enrich SSE |
| `services/api-gateway-service/requirements.txt` | Add `kubernetes` SDK |
| `frontend/src/app/analytics/monitoring/page.jsx` | Wire drawer, add K8s tab |
| `frontend/src/components/monitoring/MetricGauge.jsx` | **[NEW]** Extracted radial gauge |
| `frontend/src/components/monitoring/ContainerDrawer.jsx` | **[NEW]** Docker per-container drawer |
| `frontend/src/components/monitoring/LogPanel.jsx` | **[NEW]** Shared ANSI log terminal |
| `frontend/src/components/monitoring/PodDrawer.jsx` | **[NEW]** K8s pod detail drawer |
| `frontend/src/components/monitoring/NodeCard.jsx` | **[NEW]** K8s node card |

