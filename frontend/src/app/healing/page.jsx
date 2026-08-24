"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fetchApi, getUserRole } from "@/lib/api";
import {
  Zap, Shield, Activity, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, ChevronDown, ChevronUp, Play, Settings, Clock,
  Server, Cpu, HardDrive, Wifi, Terminal, ToggleLeft, ToggleRight,
  TrendingUp, Eye
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status) {
  if (status === "success")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase badge-success">
        <CheckCircle size={11} /> Auto-Healed
      </span>
    );
  if (status === "simulated")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase badge-warning">
        <Terminal size={11} /> Simulated
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase badge-danger">
      <XCircle size={11} /> Failed
    </span>
  );
}

function actionLabel(action) {
  const map = {
    k8s_rollout_restart: "K8s Rollout Restart",
    ec2_start: "EC2 Instance Start",
    sqs_purge_dlq: "SQS DLQ Purge",
    simulated: "Simulated",
  };
  return map[action] || action?.replace(/_/g, " ") || "—";
}

function timeAgo(isoString) {
  if (!isoString) return "—";
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(isoString).toLocaleDateString();
}

const TRIGGER_CONDITIONS = [
  {
    icon: Cpu,
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.2)",
    title: "OOM / Memory Pressure",
    description: "Detects sequential memory utilisation growth beyond 80% across recent logs.",
    action: "K8s Rollout Restart",
  },
  {
    icon: HardDrive,
    color: "#f87171",
    glow: "rgba(248,113,113,0.2)",
    title: "Disk Saturation",
    description: "Detects disk usage trending beyond 85% — triggers SQS DLQ purge or K8s restart.",
    action: "SQS Purge / K8s Restart",
  },
  {
    icon: Wifi,
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.2)",
    title: "Latency Spike / Connection Exhaustion",
    description: "Latest latency >2× the moving average and >800ms triggers rolling restart.",
    action: "K8s Rollout Restart",
  },
  {
    icon: TrendingUp,
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.2)",
    title: "Warning Rate Acceleration",
    description: "Warns double rate in recent half vs older half of log window (≥3 warnings).",
    action: "K8s Rollout Restart",
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function HealingDashboard() {
  const router = useRouter();
  const userRole = typeof window !== "undefined" ? getUserRole() : "user";
  const isAdmin = userRole === "admin" || userRole === "administrator";

  const [actions, setActions] = useState([]);
  const [config, setConfig] = useState({ enabled: true, confidence_threshold: 85, cooldown_seconds: 600 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Manual trigger state
  const [triggerService, setTriggerService] = useState("");
  const [triggerReason, setTriggerReason] = useState("");
  const [triggerType, setTriggerType] = useState("OOM Potential (Manual)");
  const [triggerLoading, setTriggerLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState(null);

  // Config edit state
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [newThreshold, setNewThreshold] = useState(85);

  const loadData = useCallback(async () => {
    try {
      const [actionsData, configData] = await Promise.all([
        fetchApi("/api/v1/healing/actions?limit=50").catch(() => []),
        fetchApi("/api/v1/healing/config").catch(() => null),
      ]);
      setActions(Array.isArray(actionsData) ? actionsData : []);
      if (configData) {
        setConfig(configData);
        setNewThreshold(configData.confidence_threshold);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== "undefined" && localStorage.getItem("jwt_token");
    if (!token) { router.replace("/login"); return; }
    loadData();
  }, [router, loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleEnabled = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetchApi("/api/v1/healing/config", {
        method: "PUT",
        body: JSON.stringify({ enabled: !config.enabled }),
      });
      if (res?.status === "updated") setConfig(res);
    } catch (e) { console.error(e); }
  };

  const handleUpdateThreshold = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetchApi("/api/v1/healing/config", {
        method: "PUT",
        body: JSON.stringify({ confidence_threshold: Number(newThreshold) }),
      });
      if (res?.status === "updated") { setConfig(res); setEditingThreshold(false); }
    } catch (e) { console.error(e); }
  };

  const handleManualTrigger = async (e) => {
    e.preventDefault();
    if (!triggerService.trim() || !triggerReason.trim()) return;
    setTriggerLoading(true);
    setTriggerResult(null);
    try {
      const res = await fetchApi("/api/v1/healing/trigger", {
        method: "POST",
        body: JSON.stringify({
          service: triggerService.trim(),
          failure_type: triggerType,
          reason: triggerReason.trim(),
        }),
      });
      setTriggerResult(res);
      loadData(); // Refresh timeline
    } catch (e) {
      setTriggerResult({ status: "error", message: String(e) });
    } finally {
      setTriggerLoading(false);
    }
  };

  // Stats
  const healed24h = actions.filter(a => {
    if (!a.triggered_at) return false;
    return (Date.now() - new Date(a.triggered_at).getTime()) < 86400000;
  });
  const successCount = healed24h.filter(a => a.status === "success").length;
  const simulatedCount = healed24h.filter(a => a.status === "simulated").length;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border border-violet-500/20 flex items-center justify-center">
              <Zap className="text-violet-400 w-7 h-7 animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-xl animate-pulse" />
          </div>
          <p className="text-slate-400 text-sm">Loading Self-Healing Engine...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 pb-10">

        {/* ── Hero Header ─────────────────────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden p-7 lg:p-9"
          style={{
            background: "linear-gradient(135deg, #100f24 0%, #090a16 60%, #05060f 100%)",
            border: "1px solid rgba(139,92,246,0.12)",
            boxShadow: "0 0 60px rgba(139,92,246,0.04), 0 4px 30px rgba(0,0,0,0.4)"
          }}>
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-wrap md:flex-nowrap justify-between items-start md:items-center gap-5">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Zap size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white">
                    Self-Healing Engine
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Autonomous anomaly detection & remediation
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Engine status toggle */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                config.enabled 
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" 
                  : "border-rose-500/20 bg-rose-500/5 text-rose-400"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${config.enabled ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
                <span>{config.enabled ? "HEALING ACTIVE" : "HEALING PAUSED"}</span>
                {isAdmin && (
                  <button
                    onClick={handleToggleEnabled}
                    className="p-0 border-none bg-transparent cursor-pointer text-slate-500 hover:text-slate-200 flex ml-1.5"
                    title="Toggle self-healing"
                  >
                    {config.enabled ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} className="text-rose-500" />}
                  </button>
                )}
              </div>

              <button
                onClick={handleRefresh}
                className="btn-ghost"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          {/* Stat pills */}
          <div className="flex gap-3 mt-5 flex-wrap">
            {[
              { label: "Auto-Heals (24h)", value: successCount, badge: "badge-success" },
              { label: "Simulated (24h)", value: simulatedCount, badge: "badge-warning" },
              { label: "Total Actions", value: actions.length, badge: "badge-info" },
              { label: "Confidence Gate", value: `≥${config.confidence_threshold}%`, badge: "badge-neutral" },
              { label: "Cooldown", value: `${config.cooldown_seconds / 60}min`, badge: "badge-neutral" },
            ].map((s, i) => (
              <div key={i} className="px-4 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-2">
                <span className="text-xs text-slate-500">{s.label}:</span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold font-mono ${s.badge}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

          {/* Left: Healing Timeline */}
          <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-white/[0.07] bg-[#0d1424]">
            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-violet-400" />
                <span className="text-sm font-bold text-slate-100">Healing Timeline</span>
              </div>
              <span className="text-xs text-slate-500">{actions.length} events</span>
            </div>

            {actions.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <Shield size={36} className="text-slate-700 mb-3" />
                <p className="text-sm text-slate-300 font-semibold">No healing events yet</p>
                <p className="text-xs text-slate-500 mt-1">Events appear here when the engine fires</p>
              </div>
            ) : (
              <div>
                {actions.map((a) => (
                  <div key={a.id} className="border-b border-white/[0.04]">
                    <div
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      className="px-5 py-3.5 flex items-center gap-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Service icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        a.status === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                        a.status === "simulated" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                        "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      }`}>
                        <Server size={15} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-200">{a.service}</span>
                          {statusBadge(a.status)}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">{a.failure_type}</span>
                          <span className="text-[10px] text-violet-400 font-mono">{actionLabel(a.action_taken)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 font-mono">
                            Risk <span className="text-rose-400 font-bold">{a.risk_score || "—"}</span>
                            {" "}| Conf <span className="text-violet-400 font-bold">{a.confidence_score || "—"}</span>
                          </div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{timeAgo(a.triggered_at)}</div>
                        </div>
                        {expandedId === a.id ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expandedId === a.id && (
                      <div className="px-5 pb-4 pl-16 bg-black/10">
                        <div className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.01] space-y-2">
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Result</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{a.result_message}</p>
                          </div>
                          {a.target_resource && (
                            <div className="text-[10px] text-slate-500">
                              Target Resource: <span className="text-violet-400 font-mono">{a.target_resource}</span>
                            </div>
                          )}
                          <div className="text-[9px] text-slate-500">
                            Triggered At: {new Date(a.triggered_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-4">

            {/* Config Panel */}
            <div className="glass-panel rounded-2xl border border-violet-500/20 overflow-hidden shadow-xl">
              <div className="p-4 border-b border-white/[0.06] flex items-center gap-2 bg-black/20">
                <Settings size={14} className="text-violet-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Engine Config</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Confidence Threshold</p>
                  {editingThreshold && isAdmin ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" min={50} max={99} value={newThreshold}
                        onChange={e => setNewThreshold(e.target.value)}
                        className="w-16 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 border border-violet-500/30 text-slate-200 outline-none"
                      />
                      <button onClick={handleUpdateThreshold} className="px-3 py-1 rounded-lg text-[11px] font-bold bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-all cursor-pointer">Save</button>
                      <button onClick={() => setEditingThreshold(false)} className="px-2 py-1 rounded-lg text-[11px] font-bold bg-transparent border border-white/5 text-slate-500 hover:text-slate-300 transition-all cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-violet-400 tracking-tight">{config.confidence_threshold}%</span>
                      {isAdmin && (
                        <button onClick={() => setEditingThreshold(true)} className="bg-transparent border-none cursor-pointer text-slate-500 hover:text-slate-200 p-0 flex">
                          <Eye size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Cooldown Window</p>
                  <span className="text-base font-bold text-blue-400 font-mono">{config.cooldown_seconds / 60} min</span>
                  <p className="text-[10px] text-slate-600 mt-0.5">Per-service cooldown gate</p>
                </div>
              </div>
            </div>

            {/* Trigger Conditions */}
            <div className="glass-panel rounded-2xl border border-white/[0.07] overflow-hidden shadow-xl">
              <div className="p-4 border-b border-white/[0.06] flex items-center gap-2 bg-black/20">
                <Shield size={14} className="text-blue-400" />
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Trigger Conditions</span>
              </div>
              <div className="p-3.5 flex flex-col gap-2.5">
                {TRIGGER_CONDITIONS.map((tc, i) => {
                  const Icon = tc.icon;
                  return (
                    <div key={i} className="flex gap-2.5 items-start p-2.5 rounded-xl border border-white/[0.04] bg-white/[0.01]">
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                        style={{ backgroundColor: tc.glow, borderColor: `${tc.color}40` }}
                      >
                        <Icon size={14} style={{ color: tc.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200">{tc.title}</p>
                        <p className="text-[10px] text-slate-500 leading-normal mt-0.5">{tc.description}</p>
                        <span className="text-[10px] font-mono font-bold block mt-1" style={{ color: tc.color }}>→ {tc.action}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manual Trigger (Admin only) */}
            {isAdmin && (
              <div className="glass-panel rounded-2xl border border-rose-500/20 overflow-hidden shadow-xl">
                <div className="p-4 border-b border-white/[0.06] flex items-center gap-2 bg-black/20">
                  <Play size={14} className="text-rose-400" />
                  <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">Manual Trigger</span>
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-widest">ADMIN</span>
                </div>
                <form onSubmit={handleManualTrigger} className="p-4 flex flex-col gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Service Name</label>
                    <input
                      value={triggerService}
                      onChange={e => setTriggerService(e.target.value)}
                      placeholder="e.g. payments-api"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/8 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-rose-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Failure Type</label>
                    <select
                      value={triggerType}
                      onChange={e => setTriggerType(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/8 text-slate-200 text-xs outline-none focus:border-rose-500/30 transition-all cursor-pointer"
                    >
                      <option>OOM Potential (Manual)</option>
                      <option>Potential Disk Saturation Outage</option>
                      <option>Service Latency Degradation / Connection Pool Exhaustion</option>
                      <option>Cascading Warning Rate Acceleration</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Reason</label>
                    <input
                      value={triggerReason}
                      onChange={e => setTriggerReason(e.target.value)}
                      placeholder="Reason for manual trigger"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/8 text-slate-200 text-xs outline-none placeholder:text-slate-600 focus:border-rose-500/30 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={triggerLoading}
                    className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      triggerLoading 
                        ? "bg-rose-500/10 border border-rose-500/20 text-rose-400 cursor-not-allowed" 
                        : "bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400"
                    }`}
                  >
                    {triggerLoading ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play size={13} />
                        Trigger Healing
                      </>
                    )}
                  </button>

                  {triggerResult && (
                    <div className={`p-3 rounded-xl border ${
                      triggerResult.status === "success" ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400" :
                      triggerResult.status === "skipped" ? "border-amber-500/25 bg-amber-500/5 text-amber-400" :
                      "border-rose-500/25 bg-rose-500/5 text-rose-400"
                    }`}>
                      <p className="text-xs leading-relaxed">
                        <strong className="uppercase">{triggerResult.status}:</strong>{" "}
                        {triggerResult.result_message || triggerResult.message}
                      </p>
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </div>


      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </DashboardLayout>
  );
}
