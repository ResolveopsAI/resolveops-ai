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
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "3px 10px", borderRadius: "999px",
        background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
        color: "#34d399", fontSize: "11px", fontWeight: 700
      }}>
        <CheckCircle size={10} /> Auto-Healed
      </span>
    );
  if (status === "simulated")
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "3px 10px", borderRadius: "999px",
        background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)",
        color: "#fbbf24", fontSize: "11px", fontWeight: 700
      }}>
        <Terminal size={10} /> Simulated
      </span>
    );
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "999px",
      background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
      color: "#f87171", fontSize: "11px", fontWeight: 700
    }}>
      <XCircle size={10} /> Failed
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
    if (!token) { router.push("/login"); return; }
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: "16px" }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px solid rgba(56,189,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap style={{ color: "#38bdf8", width: 28, height: 28, animation: "spin 1s linear infinite" }} />
            </div>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Loading Self-Healing Engine...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingBottom: "40px" }}>

        {/* ── Hero Header ─────────────────────────────────────────────────── */}
        <div style={{
          position: "relative", borderRadius: "16px", overflow: "hidden", padding: "28px 32px",
          background: "linear-gradient(135deg, #0a1628 0%, #0d1a2d 60%, #0b1220 100%)",
          border: "1px solid rgba(56,189,248,0.1)",
          boxShadow: "0 0 60px rgba(56,189,248,0.05), 0 4px 24px rgba(0,0,0,0.4)"
        }}>
          <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: "radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, right: 0, width: 360, height: 360, background: "rgba(16,185,129,0.04)", borderRadius: "50%", filter: "blur(80px)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg, #10b981, #34d399)",
                  boxShadow: "0 0 20px rgba(16,185,129,0.4)"
                }}>
                  <Zap size={20} color="white" />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
                    Self-Healing Engine
                  </h1>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    Autonomous anomaly detection & remediation
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Engine status toggle */}
              <div style={{
                display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px",
                borderRadius: "10px", border: `1px solid ${config.enabled ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                background: config.enabled ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)"
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: config.enabled ? "#10b981" : "#ef4444",
                  boxShadow: config.enabled ? "0 0 8px #10b981" : "0 0 8px #ef4444",
                  animation: config.enabled ? "pulse 2s infinite" : "none"
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: config.enabled ? "#34d399" : "#f87171" }}>
                  {config.enabled ? "HEALING ACTIVE" : "HEALING PAUSED"}
                </span>
                {isAdmin && (
                  <button
                    onClick={handleToggleEnabled}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 0, display: "flex" }}
                    title="Toggle self-healing"
                  >
                    {config.enabled ? <ToggleRight size={20} color="#10b981" /> : <ToggleLeft size={20} color="#ef4444" />}
                  </button>
                )}
              </div>

              <button
                onClick={handleRefresh}
                style={{
                  display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px",
                  borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)", color: "#94a3b8",
                  cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s"
                }}
              >
                <RefreshCw size={13} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>
          </div>

          {/* Stat pills */}
          <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Auto-Heals (24h)", value: successCount, color: "#10b981" },
              { label: "Simulated (24h)", value: simulatedCount, color: "#f59e0b" },
              { label: "Total Actions", value: actions.length, color: "#38bdf8" },
              { label: "Confidence Gate", value: `≥${config.confidence_threshold}%`, color: "#a78bfa" },
              { label: "Cooldown", value: `${config.cooldown_seconds / 60}min`, color: "#64748b" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "8px 16px", borderRadius: "8px",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)"
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "20px", alignItems: "start" }}>

          {/* Left: Healing Timeline */}
          <div style={{
            borderRadius: "14px", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.07)",
            background: "linear-gradient(180deg, #0d1424 0%, #09111f 100%)"
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Activity size={15} color="#38bdf8" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Healing Timeline</span>
              </div>
              <span style={{ fontSize: 11, color: "#475569" }}>{actions.length} events</span>
            </div>

            {actions.length === 0 ? (
              <div style={{ padding: "48px 24px", textAlign: "center" }}>
                <Shield size={36} color="#1e3a5f" style={{ margin: "0 auto 12px" }} />
                <p style={{ color: "#334155", fontSize: 14, margin: 0 }}>No healing events yet</p>
                <p style={{ color: "#1e293b", fontSize: 12, marginTop: 6 }}>Events appear here when the engine fires</p>
              </div>
            ) : (
              <div>
                {actions.map((a) => (
                  <div key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div
                      onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      style={{
                        padding: "14px 20px", cursor: "pointer", transition: "background 0.15s",
                        display: "flex", alignItems: "center", gap: "14px"
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Service icon */}
                      <div style={{
                        width: 34, height: 34, borderRadius: "8px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: a.status === "success" ? "rgba(16,185,129,0.15)" : a.status === "simulated" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                        border: `1px solid ${a.status === "success" ? "rgba(16,185,129,0.3)" : a.status === "simulated" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}`
                      }}>
                        <Server size={15} color={a.status === "success" ? "#34d399" : a.status === "simulated" ? "#fbbf24" : "#f87171"} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{a.service}</span>
                          {statusBadge(a.status)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, color: "#64748b" }}>{a.failure_type}</span>
                          <span style={{ fontSize: 11, color: "#38bdf8", fontFamily: "monospace" }}>{actionLabel(a.action_taken)}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                            Risk <span style={{ color: "#f87171", fontWeight: 700 }}>{a.risk_score || "—"}</span>
                            {" "}| Conf <span style={{ color: "#a78bfa", fontWeight: 700 }}>{a.confidence_score || "—"}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{timeAgo(a.triggered_at)}</div>
                        </div>
                        {expandedId === a.id ? <ChevronUp size={14} color="#475569" /> : <ChevronDown size={14} color="#475569" />}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expandedId === a.id && (
                      <div style={{
                        padding: "0 20px 16px 68px",
                        background: "rgba(0,0,0,0.15)"
                      }}>
                        <div style={{
                          padding: "12px 14px", borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.06)",
                          background: "rgba(255,255,255,0.02)"
                        }}>
                          <p style={{ margin: "0 0 6px 0", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Result</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>{a.result_message}</p>
                          {a.target_resource && (
                            <p style={{ margin: "8px 0 0 0", fontSize: 11, color: "#64748b" }}>
                              Target: <span style={{ color: "#38bdf8", fontFamily: "monospace" }}>{a.target_resource}</span>
                            </p>
                          )}
                          <p style={{ margin: "4px 0 0 0", fontSize: 11, color: "#334155" }}>
                            {new Date(a.triggered_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Config Panel */}
            <div style={{
              borderRadius: "14px", border: "1px solid rgba(167,139,250,0.15)",
              background: "linear-gradient(135deg, #0d1424 0%, #09111f 100%)"
            }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Settings size={14} color="#a78bfa" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Engine Config</span>
              </div>
              <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <p style={{ margin: "0 0 8px 0", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Confidence Threshold</p>
                  {editingThreshold && isAdmin ? (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="number" min={50} max={99} value={newThreshold}
                        onChange={e => setNewThreshold(e.target.value)}
                        style={{
                          width: "70px", padding: "4px 8px", borderRadius: "6px", fontSize: 13,
                          background: "#0f172a", border: "1px solid rgba(167,139,250,0.3)",
                          color: "#e2e8f0", outline: "none"
                        }}
                      />
                      <button onClick={handleUpdateThreshold} style={{
                        padding: "4px 10px", borderRadius: "6px", fontSize: 12,
                        background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)",
                        color: "#a78bfa", cursor: "pointer", fontWeight: 600
                      }}>Save</button>
                      <button onClick={() => setEditingThreshold(false)} style={{
                        padding: "4px 8px", borderRadius: "6px", fontSize: 12,
                        background: "transparent", border: "1px solid rgba(255,255,255,0.06)",
                        color: "#475569", cursor: "pointer"
                      }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>{config.confidence_threshold}%</span>
                      {isAdmin && (
                        <button onClick={() => setEditingThreshold(true)} style={{
                          background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 0
                        }}>
                          <Eye size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Cooldown Window</p>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#38bdf8" }}>{config.cooldown_seconds / 60} min</span>
                  <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "#334155" }}>Per-service cooldown</p>
                </div>
              </div>
            </div>

            {/* Trigger Conditions */}
            <div style={{
              borderRadius: "14px", border: "1px solid rgba(255,255,255,0.07)",
              background: "linear-gradient(180deg, #0d1424 0%, #09111f 100%)"
            }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Shield size={14} color="#38bdf8" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Trigger Conditions</span>
              </div>
              <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {TRIGGER_CONDITIONS.map((tc, i) => {
                  const Icon = tc.icon;
                  return (
                    <div key={i} style={{
                      display: "flex", gap: "10px", alignItems: "flex-start", padding: "10px 12px",
                      borderRadius: "10px", border: "1px solid rgba(255,255,255,0.05)",
                      background: "rgba(255,255,255,0.02)"
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "8px", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: tc.glow, border: `1px solid ${tc.color}40`
                      }}>
                        <Icon size={14} color={tc.color} />
                      </div>
                      <div>
                        <p style={{ margin: "0 0 2px 0", fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{tc.title}</p>
                        <p style={{ margin: "0 0 4px 0", fontSize: 11, color: "#475569", lineHeight: 1.5 }}>{tc.description}</p>
                        <span style={{ fontSize: 10, color: tc.color, fontFamily: "monospace", fontWeight: 700 }}>→ {tc.action}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manual Trigger (Admin only) */}
            {isAdmin && (
              <div style={{
                borderRadius: "14px", border: "1px solid rgba(239,68,68,0.15)",
                background: "linear-gradient(135deg, #0d1424 0%, #09111f 100%)"
              }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Play size={14} color="#f87171" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9" }}>Manual Trigger</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#ef4444", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>ADMIN</span>
                </div>
                <form onSubmit={handleManualTrigger} style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#475569", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Service Name</label>
                    <input
                      value={triggerService}
                      onChange={e => setTriggerService(e.target.value)}
                      placeholder="e.g. payments-api"
                      required
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "8px",
                        background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#e2e8f0", fontSize: 13, outline: "none"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#475569", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Failure Type</label>
                    <select
                      value={triggerType}
                      onChange={e => setTriggerType(e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "8px",
                        background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#e2e8f0", fontSize: 13, outline: "none"
                      }}
                    >
                      <option>OOM Potential (Manual)</option>
                      <option>Potential Disk Saturation Outage</option>
                      <option>Service Latency Degradation / Connection Pool Exhaustion</option>
                      <option>Cascading Warning Rate Acceleration</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, color: "#475569", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Reason</label>
                    <input
                      value={triggerReason}
                      onChange={e => setTriggerReason(e.target.value)}
                      placeholder="Reason for manual trigger"
                      required
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "8px",
                        background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)",
                        color: "#e2e8f0", fontSize: 13, outline: "none"
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={triggerLoading}
                    style={{
                      padding: "9px 16px", borderRadius: "9px", border: "none",
                      background: triggerLoading ? "rgba(239,68,68,0.1)" : "linear-gradient(135deg, #ef4444, #f87171)",
                      color: "white", fontSize: 13, fontWeight: 700, cursor: triggerLoading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                    }}
                  >
                    {triggerLoading ? <><RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} /> Running...</> : <><Play size={13} /> Trigger Healing</>}
                  </button>

                  {triggerResult && (
                    <div style={{
                      padding: "10px 12px", borderRadius: "8px",
                      border: `1px solid ${triggerResult.status === "success" ? "rgba(16,185,129,0.3)" : triggerResult.status === "skipped" ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}`,
                      background: triggerResult.status === "success" ? "rgba(16,185,129,0.05)" : triggerResult.status === "skipped" ? "rgba(245,158,11,0.05)" : "rgba(239,68,68,0.05)"
                    }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
                        <strong style={{ color: triggerResult.status === "success" ? "#34d399" : triggerResult.status === "skipped" ? "#fbbf24" : "#f87171" }}>
                          {triggerResult.status?.toUpperCase()}:
                        </strong>{" "}
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
