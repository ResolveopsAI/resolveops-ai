"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fetchApi, getUserRole } from "@/lib/api";
import {
  Activity, Cpu, HardDrive, Wifi, Server, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, ShieldAlert, BarChart3,
  TrendingUp, Clock, MemoryStick, Eye, ChevronRight, AlertCircle
} from "lucide-react";
import Link from "next/link";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Legend
} from "recharts";
import ContainerDrawer from "@/components/monitoring/ContainerDrawer";
import PodDrawer from "@/components/monitoring/PodDrawer";
import NodeCard from "@/components/monitoring/NodeCard";

//  Radial Gauge 
function RadialGauge({ value = 0, max = 100, label, sublabel, color, size = 130 }) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = 135;
  const sweepAngle = 270;
  const endAngle = startAngle + sweepAngle * pct;

  function polar(angle) {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arc(s, e) {
    const sp = polar(s), ep = polar(e);
    const large = e - s > 180 ? 1 : 0;
    return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${large} 1 ${ep.x} ${ep.y}`;
  }

  const strokeColor = value > 90 ? "#ef4444" : value > 75 ? "#f59e0b" : color;
  const glowId = `g-${label?.replace(/\s/g, "")}`;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size}>
        <defs>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={arc(startAngle, startAngle + sweepAngle)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" strokeLinecap="round" />
        {pct > 0.001 && (
          <path d={arc(startAngle, endAngle)} fill="none" stroke={strokeColor} strokeWidth="10"
            strokeLinecap="round" filter={`url(#${glowId})`}
            style={{ transition: "all 0.6s ease" }} />
        )}
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="20" fontWeight="800" fill="white" fontFamily="monospace">
          {Number(value).toFixed(1)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)" fontFamily="monospace">
          {max === 100 ? "%" : `/ ${max}`}
        </text>
      </svg>
      <div className="text-center leading-tight">
        <p className="text-xs font-semibold text-slate-200">{label}</p>
        {sublabel && <p className="text-[9px] text-slate-500 mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

//  Sparkline 
function Sparkline({ data = [], color = "#6366f1", height = 36 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const vals = data.map((d) => d.cpu ?? 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals) || 1;
  const W = 160, H = height;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - min) / (max - min || 1)) * (H - 4) - 2;
    return `${x},${y}`;
  });
  const area = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(" ")} L ${W},${H} L 0,${H} Z`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sl-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sl-${color.replace("#", "")})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

//  Status badge 
function StatusBadge({ status }) {
  const styles = {
    healthy:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    warning:    "bg-amber-500/15 text-amber-400 border-amber-500/25",
    critical:   "bg-rose-500/15 text-rose-400 border-rose-500/25",
    offline:    "bg-slate-600/15 text-slate-400 border-slate-600/25",
    unknown:    "bg-slate-600/15 text-slate-500 border-slate-600/25",
    degraded:   "bg-orange-500/15 text-orange-400 border-orange-500/25",
    predictive: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  };
  const dots = {
    healthy: "bg-emerald-400", warning: "bg-amber-400 animate-pulse",
    critical: "bg-rose-400 animate-pulse", offline: "bg-slate-500",
    unknown: "bg-slate-600", degraded: "bg-orange-400 animate-pulse",
    predictive: "bg-violet-400 animate-pulse",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${styles[status] || styles.unknown}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[status] || dots.unknown}`} />
      {status}
    </span>
  );
}

//  Progress bar 
function Bar({ value = 0, color = "#6366f1" }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const c = value > 90 ? "#ef4444" : value > 75 ? "#f59e0b" : color;
  return (
    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: c, boxShadow: `0 0 6px ${c}60` }} />
    </div>
  );
}

//  Chart tooltip 
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#080d1a]/95 backdrop-blur border border-white/10 rounded-lg p-2.5 shadow-2xl text-xs">
      <p className="font-mono text-slate-400 mb-1.5 text-[10px]">{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
          <span className="text-slate-400">{e.name}:</span>
          <span className="font-mono font-bold text-white">{Number(e.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

//  Uptime formatter 
const fmtUptime = (s) => {
  if (!s) return "";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Main Page
export default function MonitoringPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [frameCount, setFrameCount] = useState(0);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedContainerForDrawer, setSelectedContainerForDrawer] = useState(null);
  const [selectedPodForDrawer, setSelectedPodForDrawer] = useState(null);
  const [activeRuntimeTab, setActiveRuntimeTab] = useState("docker"); // "docker" | "k8s"
  const [hostChart, setHostChart] = useState([]);
  const abortRef = useRef(null);   // AbortController for the current SSE connection
  const retryRef = useRef(null);   // setTimeout handle for reconnect

  /**
   * Apply an incoming snapshot to state.
   * Called both by the SSE stream and by the manual one-shot REST fetch.
   */
  const applySnapshot = useCallback((res) => {
    setData(res);
    setLastUpdated(new Date());
    setError(null);
    setLoading(false);
    setFrameCount((n) => n + 1);
    if (res?.host) {
      setHostChart((prev) => [
        ...prev.slice(-24),
        {
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
          }),
          cpu:  res.host.cpu_pct,
          mem:  res.host.mem_pct,
          disk: res.host.disk_pct,
        },
      ]);
    }
  }, []);

  /** Fetch initial data via REST for immediate render and fallback */
  const fetchRESTSnapshot = useCallback(async () => {
    try {
      const snapshot = await fetchApi('/api/v1/monitoring/cluster');
      if (snapshot) {
        applySnapshot(snapshot);
      }
    } catch (err) {
      console.warn("REST snapshot fetch fallback failed:", err);
      setLoading(false);
    }
  }, [applySnapshot]);

  /**
   * Open an SSE stream to /api/v1/monitoring/cluster/stream.
   * The server pushes a JSON snapshot every 2 s over the same connection.
   * We pass the JWT as a query-param because fetch ReadableStream cannot
   * send custom headers after the connection is established.
   */
  const openStream = useCallback((token) => {
    // Cancel any in-flight stream first
    if (abortRef.current) abortRef.current.abort();
    clearTimeout(retryRef.current);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
    const url = `${API_BASE}/v1/monitoring/cluster/stream?token=${encodeURIComponent(token)}`;

    setConnected(false);

    (async () => {
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) {
          const txt = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(txt);
        }

        setConnected(true);
        setError(null);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });

          // SSE frames are separated by double-newline
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';   // keep incomplete tail

          for (const part of parts) {
            const line = part.trim();
            if (!line) continue;

            // Handle error event
            if (line.startsWith('event: error')) {
              const dataPart = parts.find((p) => p.startsWith('data:'));
              const msg = dataPart ? dataPart.slice(5).trim() : 'Stream error';
              setError(msg);
              continue;
            }

            // Standard data frame
            if (line.startsWith('data: ')) {
              try {
                const json = JSON.parse(line.slice(6));
                applySnapshot(json);
              } catch { /* malformed frame — skip */ }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return; // intentional close — no retry
        setConnected(false);
        setError(`Stream disconnected: ${err.message}. Reconnecting in 3s…`);
        fetchRESTSnapshot();
        // Reconnect after 3 s
        retryRef.current = setTimeout(() => {
          const t = localStorage.getItem('jwt_token');
          if (t) openStream(t);
        }, 3000);
      }
    })();
  }, [applySnapshot, fetchRESTSnapshot]);

  /** Manual re-connect: abort + reopen immediately. */
  const handleRefresh = useCallback(() => {
    fetchRESTSnapshot();
    const token = localStorage.getItem('jwt_token');
    if (token) openStream(token);
  }, [openStream, fetchRESTSnapshot]);

  useEffect(() => {
    const token = localStorage.getItem('jwt_token');
    if (!token) { router.push('/login'); return; }
    if (getUserRole() !== 'admin') { router.push('/chat'); return; }

    // Instant load via REST so UI renders immediately
    fetchRESTSnapshot();

    // Establish live SSE stream
    openStream(token);

    // REST Polling fallback interval (runs every 3s to guarantee live data updates)
    const pollInterval = setInterval(() => {
      fetchRESTSnapshot();
    }, 3000);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      clearTimeout(retryRef.current);
      clearInterval(pollInterval);
    };
  }, [router, openStream, fetchRESTSnapshot]);

  if (loading) return (
    <DashboardLayout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ping" />
          <div className="absolute inset-3 rounded-full border border-indigo-400/30 animate-pulse" />
          <div className="absolute inset-5 flex items-center justify-center">
            <Activity className="text-indigo-400 w-6 h-6 animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-slate-200 font-semibold text-sm">Connecting to Live Stream</p>
          <p className="text-slate-500 font-mono text-[10px] mt-1 tracking-widest">OPENING SSE CONNECTION...</p>
        </div>
      </div>
    </DashboardLayout>
  );

  const {
    host = {}, services = [], summary = {}, spike_alerts = [],
    top_cpu_consumers = [], top_mem_consumers = [], cluster_health, generated_at
  } = data || {};

  const healthCfg = {
    healthy:  { label: "All Systems Operational", dot: "bg-emerald-400", pill: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
    degraded: { label: "Cluster Degraded",        dot: "bg-amber-400 animate-pulse", pill: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
    critical: { label: "Critical Failure",         dot: "bg-rose-400 animate-pulse",  pill: "bg-rose-500/10 border-rose-500/20 text-rose-400" },
  }[cluster_health] || { label: "Status Unknown", dot: "bg-slate-500", pill: "bg-slate-500/10 border-slate-500/20 text-slate-400" };

  const selHistory = selectedService ? (data?.time_series?.[selectedService] ?? []) : [];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 pb-12 font-sans">

        {/*  Header  */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Link href="/analytics" className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">Analytics</Link>
              <ChevronRight size={10} className="text-slate-600" />
              <span className="text-[11px] text-indigo-400 font-medium">Monitoring</span>
            </div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2.5 tracking-tight">
              <Activity className="text-indigo-400" size={22} />
              Real-Time Cluster Monitoring
            </h2>
            <p className="text-xs text-slate-400 mt-1">SSE live push every 2s · Admin only · Click any service/pod card to inspect</p>
            
            {/* Runtime Switcher Tabs */}
            <div className="flex items-center gap-2 mt-3 bg-black/40 p-1 rounded-xl border border-white/10 w-fit">
              <button
                onClick={() => setActiveRuntimeTab("docker")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeRuntimeTab === "docker"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Docker Compose Containers
              </button>
              <button
                onClick={() => setActiveRuntimeTab("k8s")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  activeRuntimeTab === "k8s"
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Kubernetes Fleet
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* LIVE STATUS badge */}
            {(() => {
              const isLive = connected || (data && !error);
              const label = connected ? "LIVE STREAM" : data ? "LIVE (REST)" : "OFFLINE";
              return (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${
                  isLive
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isLive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                  }`} />
                  {label}
                </div>
              );
            })()}

            {/* Frame counter */}
            {frameCount > 0 && (
              <span className="text-[10px] font-mono text-slate-600">
                #{frameCount}
              </span>
            )}

            {/* Last updated */}
            {lastUpdated && (
              <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                <Clock size={10} /> {lastUpdated.toLocaleTimeString()}
              </span>
            )}

            {/* Manual reconnect */}
            <button
              onClick={handleRefresh}
              title="Force reconnect stream"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-all"
            >
              <RefreshCw size={12} />
              Reconnect
            </button>
          </div>
        </div>

        {/*  Error  */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => fetchData(false)} className="underline ml-2">Retry</button>
          </div>
        )}

        {/*  Cluster status pill  */}
        <div className={`flex flex-wrap items-center justify-between gap-4 px-5 py-3 rounded-2xl border ${healthCfg.pill}`}>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${healthCfg.dot}`} />
            <span className="font-bold text-sm">{healthCfg.label}</span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:block">{host.hostname || "resolveops-host"}  {host.platform}</span>
          </div>
          <div className="flex items-center gap-5 text-xs font-mono">
            <span className="text-emerald-400">{summary.healthy_services ?? 0} <span className="text-slate-500 font-sans text-[10px]">healthy</span></span>
            <span className="text-amber-400">{summary.warning_services ?? 0} <span className="text-slate-500 font-sans text-[10px]">warning</span></span>
            <span className="text-rose-400">{summary.critical_services ?? 0} <span className="text-slate-500 font-sans text-[10px]">critical</span></span>
            <span className="text-slate-500">{summary.offline_services ?? 0} <span className="font-sans text-[10px]">offline</span></span>
            {spike_alerts.length > 0 && (
              <span className="text-violet-400">{spike_alerts.length} <span className="text-slate-500 font-sans text-[10px]">alert{spike_alerts.length !== 1 ? "s" : ""}</span></span>
            )}
          </div>
        </div>

        {/*  4 Radial gauge cards  */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* RAM */}
          <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full">
              <MemoryStick size={13} className="text-blue-400" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">RAM</span>
            </div>
            <RadialGauge value={host.mem_pct ?? 0} label="Memory" sublabel={`${host.mem_used_gb ?? 0} GB used`} color="#3b82f6" size={130} />
            <div className="w-full space-y-1 border-t border-white/5 pt-2">
              {[
                ["Used",  `${host.mem_used_gb ?? 0} GB`],
                ["Free",  `${host.mem_total_gb && host.mem_used_gb ? (host.mem_total_gb - host.mem_used_gb).toFixed(2) : 0} GB`],
                ["Total", `${host.mem_total_gb ?? 0} GB`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CPU */}
          <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full">
              <Cpu size={13} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">CPU</span>
            </div>
            <RadialGauge value={host.cpu_pct ?? 0} label="Processor" sublabel={`${host.cpu_count ?? 0} logical cores`} color="#10b981" size={130} />
            <div className="w-full space-y-1 border-t border-white/5 pt-2">
              {[
                ["1m load",  host.cpu_load_avg?.[0] ?? 0],
                ["5m load",  host.cpu_load_avg?.[1] ?? 0],
                ["15m load", host.cpu_load_avg?.[2] ?? 0],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Disk */}
          <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full">
              <HardDrive size={13} className="text-violet-400" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Disk</span>
            </div>
            <RadialGauge value={host.disk_pct ?? 0} label="Persistent Storage" sublabel={`${host.disk_used_gb ?? 0} GB used`} color="#8b5cf6" size={130} />
            <div className="w-full space-y-1 border-t border-white/5 pt-2">
              {[
                ["Used",  `${host.disk_used_gb ?? 0} GB`],
                ["Free",  `${host.disk_total_gb && host.disk_used_gb ? (host.disk_total_gb - host.disk_used_gb).toFixed(2) : 0} GB`],
                ["Total", `${host.disk_total_gb ?? 0} GB`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Network */}
          <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 w-full">
              <Wifi size={13} className="text-sky-400" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Network</span>
            </div>
            <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 py-1">
              <div className="w-full text-center rounded-xl bg-sky-500/10 border border-sky-500/20 py-3">
                <p className="text-2xl font-black font-mono text-sky-400">{host.net_bytes_recv_mb ?? 0}</p>
                <p className="text-[9px] text-sky-400/60 uppercase tracking-wider">MB received</p>
              </div>
              <div className="w-full text-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 py-3">
                <p className="text-2xl font-black font-mono text-indigo-400">{host.net_bytes_sent_mb ?? 0}</p>
                <p className="text-[9px] text-indigo-400/60 uppercase tracking-wider">MB sent</p>
              </div>
            </div>
            <div className="w-full space-y-1 border-t border-white/5 pt-2">
              {[
                ["Uptime",   fmtUptime(host.uptime_seconds)],
                ["Platform", host.platform ?? ""],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-200 font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/*  Host rolling chart  */}
        <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-400" />
              Host Resource Utilisation  Live Rolling Window
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Last 25 samples  8s interval</span>
          </div>
          <div className="h-52">
            {hostChart.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hostChart} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <defs>
                    {[["cpu","#10b981"],["mem","#3b82f6"],["disk","#8b5cf6"]].map(([k,c]) => (
                      <linearGradient key={k} id={`ag-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="time" stroke="#ffffff20" fontSize={8} tickLine={false} axisLine={false} minTickGap={50} />
                  <YAxis stroke="#ffffff20" fontSize={8} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                  <Area type="monotone" name="CPU" dataKey="cpu" stroke="#10b981" strokeWidth={2} fill="url(#ag-cpu)" dot={false} />
                  <Area type="monotone" name="Memory" dataKey="mem" stroke="#3b82f6" strokeWidth={2} fill="url(#ag-mem)" dot={false} />
                  <Area type="monotone" name="Disk" dataKey="disk" stroke="#8b5cf6" strokeWidth={1.5} fill="url(#ag-disk)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-slate-600">
                Collecting samples refresh a few times to populate chart
              </div>
            )}
          </div>
        </div>

        {/*  Service Health Matrix (Docker or K8s View)  */}
        {activeRuntimeTab === "k8s" ? (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-3">
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-200">No Active Kubernetes Control Plane Detected</p>
                <p className="text-amber-400/80 text-[11px] mt-0.5">
                  This application is currently running in <strong>Docker Compose / Standalone Host Mode</strong>. Kubernetes pods/nodes will be automatically populated once a cluster (K8s/AKS/EKS) is connected.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Server size={14} className="text-violet-400" />
                Kubernetes Node Fleet (Host Mode)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NodeCard node={{
                  name: `${host.hostname || "local-host"} (Standalone)`,
                  role: "host / process-mode",
                  status: "No K8s Cluster",
                  kubelet_version: "N/A (Host Mode)",
                  cpu_capacity: `${host.cpu_count || 4} vCPU`,
                  mem_capacity: `${host.mem_total_gb || 16} GB`,
                  cpu_pct: host.cpu_pct ?? 0,
                  mem_pct: host.mem_pct ?? 0
                }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity size={14} className="text-emerald-400" />
                  Pod Health Matrix
                </h3>
                <span className="text-[10px] text-slate-500">0 active pods</span>
              </div>
              
              <div className="rounded-2xl border border-white/8 bg-[#06090f] p-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                  <Server size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">No Kubernetes Cluster Connected</h4>
                  <p className="text-xs text-slate-400 max-w-md mt-1">
                    Your microservices are running in <strong>Docker Compose / Host Process Mode</strong>. Click below to view your active container and service health metrics.
                  </p>
                </div>
                <button
                  onClick={() => setActiveRuntimeTab("docker")}
                  className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all flex items-center gap-2"
                >
                  <Server size={14} />
                  Switch to Docker Compose Containers
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Server size={14} className="text-cyan-400" />
                Service Health Matrix
              </h3>
              <span className="text-[10px] text-slate-500">{summary.total_services ?? 0} services · click a card to inspect container</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {services.map((svc) => {
                const hist = data?.time_series?.[svc.name] ?? [];
                const isSel = selectedService === svc.name;
                const svcColor = svc.status === "healthy" ? "#10b981" : svc.status === "warning" ? "#f59e0b" : "#ef4444";
                return (
                  <button key={svc.name} onClick={() => {
                      setSelectedService(isSel ? null : svc.name);
                      setSelectedContainerForDrawer(svc.name);
                    }}
                    className={`text-left rounded-2xl border p-4 transition-all duration-200 group cursor-pointer ${
                      isSel
                        ? "border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10"
                        : "border-white/8 bg-[#06090f] hover:border-white/15 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-slate-200 truncate">{svc.name}</p>
                        <p className="text-[9px] text-slate-600 font-mono mt-0.5">{svc.source}</p>
                      </div>
                      <StatusBadge status={svc.status} />
                    </div>

                    <div className="space-y-2 mb-3">
                      <div>
                        <div className="flex justify-between text-[9px] mb-0.5">
                          <span className="text-slate-500">CPU</span>
                          <span className="font-mono text-slate-300">{svc.cpu_pct}%</span>
                        </div>
                        <Bar value={svc.cpu_pct} color="#10b981" />
                      </div>
                      <div>
                        <div className="flex justify-between text-[9px] mb-0.5">
                          <span className="text-slate-500">MEM</span>
                          <span className="font-mono text-slate-300">{svc.mem_pct}%</span>
                        </div>
                        <Bar value={svc.mem_pct} color="#3b82f6" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono border-t border-white/5 pt-2">
                      <span>{svc.mem_mb} MB</span>
                      <span>{fmtUptime(svc.uptime_seconds)}</span>
                      {svc.critical && <span className="text-rose-500 font-bold">CORE</span>}
                    </div>

                    {hist.length > 2 && (
                      <div className="mt-2.5 opacity-50 group-hover:opacity-90 transition-opacity">
                        <Sparkline data={hist} color={svcColor} height={30} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/*  Per-service drill-down chart  */}
        {selectedService && selHistory.length > 1 && (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2">
                <Eye size={14} /> {selectedService}  CPU &amp; Memory Time Series
              </h3>
              <button onClick={() => setSelectedService(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-white/5">
                 Dismiss
              </button>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selHistory} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="time" stroke="#ffffff20" fontSize={8} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#ffffff20" fontSize={8} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "10px" }} />
                  <Line type="monotone" name="CPU" dataKey="cpu" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  <Line type="monotone" name="Memory" dataKey="mem" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/*  Spike Alerts + Top Consumers  */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Spike / Predictive Alerts */}
          <div className="lg:col-span-2 rounded-2xl border border-white/8 bg-[#06090f] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldAlert size={14} className="text-rose-400" />
                Spike Detection &amp; Predictive Alerts
              </h3>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                spike_alerts.length > 0 ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
              }`}>
                {spike_alerts.length} alert{spike_alerts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {spike_alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                <CheckCircle2 className="text-emerald-400" size={26} />
                <p className="text-sm font-medium text-emerald-400">No anomalies detected</p>
                <p className="text-[11px] text-slate-500 max-w-xs">All metrics within normal thresholds. Predictive analysis requires at least 5 samples per service.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {spike_alerts.map((a, i) => {
                  const sev = {
                    critical:   { Icon: XCircle,      cls: "border-rose-500/30 bg-rose-500/8",    ic: "text-rose-400",    tc: "text-rose-300" },
                    warning:    { Icon: AlertTriangle, cls: "border-amber-500/30 bg-amber-500/8",  ic: "text-amber-400",   tc: "text-amber-300" },
                    predictive: { Icon: TrendingUp,    cls: "border-violet-500/30 bg-violet-500/8",ic: "text-violet-400",  tc: "text-violet-300" },
                  }[a.severity] || { Icon: AlertCircle, cls: "border-slate-600/20 bg-slate-600/5", ic: "text-slate-400", tc: "text-slate-300" };
                  const { Icon } = sev;
                  return (
                    <div key={i} className={`p-3.5 rounded-xl border ${sev.cls}`}>
                      <div className="flex items-start gap-3">
                        <Icon size={14} className={`mt-0.5 flex-shrink-0 ${sev.ic}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs font-bold ${sev.tc}`}>{a.service}</span>
                            <StatusBadge status={a.severity} />
                            <span className="text-[9px] font-mono text-slate-500 uppercase">{a.metric}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">{a.message}</p>
                          <p className="text-[10px] text-slate-500 mt-1 italic">{a.recommendation}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xl font-black font-mono text-white">{a.current}%</p>
                          <p className="text-[9px] text-slate-500">avg {a.average}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Consumers */}
          <div className="rounded-2xl border border-white/8 bg-[#06090f] p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 size={14} className="text-amber-400" />
              Top Consumers
            </h3>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Cpu size={10} className="text-emerald-400" /> CPU
              </p>
              <div className="space-y-2.5">
                {top_cpu_consumers.length === 0 && <p className="text-[10px] text-slate-600">No data yet</p>}
                {top_cpu_consumers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-slate-600 w-3">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-300 font-medium truncate">{s.name.replace("-service", "")}</p>
                      <div className="h-1.5 rounded-full bg-white/5 mt-0.5 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                          style={{ width: `${Math.min(s.cpu_pct, 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 w-9 text-right shrink-0">{s.cpu_pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <HardDrive size={10} className="text-blue-400" /> Memory
              </p>
              <div className="space-y-2.5">
                {top_mem_consumers.length === 0 && <p className="text-[10px] text-slate-600">No data yet</p>}
                {top_mem_consumers.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-slate-600 w-3">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-300 font-medium truncate">{s.name.replace("-service", "")}</p>
                      <div className="h-1.5 rounded-full bg-white/5 mt-0.5 overflow-hidden">
                        <div className="h-full rounded-full bg-blue-400 transition-all duration-700"
                          style={{ width: `${Math.min(s.mem_pct, 100)}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-blue-400 w-12 text-right shrink-0">{s.mem_mb} MB</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/*  Footer  */}
        <div className="flex items-center justify-between text-[10px] text-slate-600 border-t border-white/5 pt-3 font-mono">
          <span>Source: psutil host + Docker SDK per-container  SSE push: 2s</span>
          {generated_at && <span>Snapshot: {new Date(generated_at).toLocaleString()}</span>}
        </div>

        {/* Slide-in Drawers */}
        {selectedContainerForDrawer && (
          <ContainerDrawer
            containerName={selectedContainerForDrawer}
            onClose={() => setSelectedContainerForDrawer(null)}
          />
        )}

        {selectedPodForDrawer && (
          <PodDrawer
            podName={selectedPodForDrawer}
            onClose={() => setSelectedPodForDrawer(null)}
          />
        )}

      </div>
    </DashboardLayout>
  );
}

