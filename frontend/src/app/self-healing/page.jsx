"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  HeartPulse,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Terminal,
  Server,
  ChevronDown,
  ChevronUp,
  Play,
  Ban,
  History,
  Cpu,
  Activity,
  Eye,
  Loader2,
  RefreshCw,
  ArrowRight,
  Info,
} from "lucide-react";

const RISK_COLORS = {
  none: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20" },
  low: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  high: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  critical: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
};

const STATUS_STYLES = {
  pending: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: Clock },
  approved: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", icon: CheckCircle2 },
  executing: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20", icon: Loader2 },
  success: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", icon: CheckCircle2 },
  partial_success: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", icon: AlertTriangle },
  failed: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20", icon: XCircle },
  rejected: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/20", icon: Ban },
};

export default function SelfHealingPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingActions, setPendingActions] = useState([]);
  const [historyActions, setHistoryActions] = useState([]);
  const [expandedAction, setExpandedAction] = useState(null);
  const [selectedSteps, setSelectedSteps] = useState({});
  const [executingId, setExecutingId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadActions();
  }, [activeTab]);

  const loadActions = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "pending") {
        const res = await fetchApi("/api/v1/self-heal/pending");
        if (res?.actions) setPendingActions(res.actions);
      } else {
        const res = await fetchApi("/api/v1/self-heal/history");
        if (res?.actions) setHistoryActions(res.actions);
      }
    } catch (err) {
      console.error("Failed to load actions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const toggleStep = (actionId, step) => {
    setSelectedSteps((prev) => {
      const key = `${actionId}-${step}`;
      const updated = { ...prev };
      if (updated[key]) {
        delete updated[key];
      } else {
        updated[key] = true;
      }
      return updated;
    });
  };

  const getSelectedStepsForAction = (actionId, commands) => {
    return commands
      .filter((cmd) => selectedSteps[`${actionId}-${cmd.step}`])
      .map((cmd) => cmd.step);
  };

  const handleApprove = async (actionId, commands) => {
    const approvedSteps = getSelectedStepsForAction(actionId, commands);
    if (approvedSteps.length === 0) {
      showNotification("error", "Select at least one command to approve");
      return;
    }

    setExecutingId(actionId);
    try {
      const res = await fetchApi(`/api/v1/self-heal/${actionId}/approve`, {
        method: "POST",
        body: JSON.stringify({ approved_step_numbers: approvedSteps }),
      });
      showNotification("success", res.message || "Execution completed");
      loadActions();
    } catch (err) {
      showNotification("error", err.message);
    } finally {
      setExecutingId(null);
    }
  };

  const handleReject = async (actionId) => {
    try {
      await fetchApi(`/api/v1/self-heal/${actionId}/reject`, { method: "POST" });
      showNotification("success", "Remediation proposal rejected");
      loadActions();
    } catch (err) {
      showNotification("error", err.message);
    }
  };

  const selectAllSteps = (actionId, commands) => {
    const updated = { ...selectedSteps };
    commands.forEach((cmd) => {
      updated[`${actionId}-${cmd.step}`] = true;
    });
    setSelectedSteps(updated);
  };

  const renderActionPhase = (phaseName, commands, actionId, isInteractive) => {
    if (!commands || commands.length === 0) return null;

    const phaseIcons = {
      diagnostic: { icon: Eye, color: "text-blue-400" },
      remediation: { icon: Terminal, color: "text-amber-400" },
      verification: { icon: CheckCircle2, color: "text-emerald-400" },
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          {React.createElement(phaseIcons[phaseName]?.icon || Terminal, {
            size: 14,
            className: phaseIcons[phaseName]?.color || "text-slate-400",
          })}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {phaseName} Phase
          </span>
        </div>

        {commands.map((cmd) => {
          const risk = RISK_COLORS[cmd.risk_level] || RISK_COLORS.none;
          const isSelected = selectedSteps[`${actionId}-${cmd.step}`];

          return (
            <div
              key={cmd.step}
              className={`rounded-lg border transition-all ${
                isSelected
                  ? "bg-indigo-500/5 border-indigo-500/20"
                  : "bg-slate-900/30 border-slate-800/30"
              }`}
            >
              <div className="p-3 flex items-start gap-3">
                {isInteractive && (
                  <button
                    onClick={() => toggleStep(actionId, cmd.step)}
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-indigo-500 border-indigo-500 text-white"
                        : "border-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {isSelected && <CheckCircle2 size={12} />}
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-slate-500 font-mono">
                      Step {cmd.step}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${risk.bg} ${risk.text} ${risk.border} border font-medium`}
                    >
                      {cmd.risk_level}
                    </span>
                    {cmd.causes_downtime && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                        ⚠️ downtime
                      </span>
                    )}
                    {cmd.reversible === false && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                        irreversible
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-300 mb-2">{cmd.description}</p>

                  <div className="bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/30">
                    <code className="text-xs text-emerald-400 font-mono break-all">
                      $ {cmd.command}
                    </code>
                  </div>

                  {cmd.rollback_command && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <RefreshCw size={10} />
                      <span>Rollback:</span>
                      <code className="font-mono text-slate-400">
                        {cmd.rollback_command}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderActionCard = (action, isInteractive = false) => {
    const statusStyle = STATUS_STYLES[action.status] || STATUS_STYLES.pending;
    const StatusIcon = statusStyle.icon;
    const isExpanded = expandedAction === action.id;
    const commands = action.proposed_commands || [];

    // Group commands by action_type
    const diagnostic = commands.filter((c) => c.action_type === "diagnostic");
    const remediation = commands.filter((c) => c.action_type === "remediation");
    const verification = commands.filter((c) => c.action_type === "verification");

    return (
      <div
        key={action.id}
        className="glass-panel rounded-xl overflow-hidden transition-all"
      >
        {/* Header */}
        <div
          className="p-5 cursor-pointer hover:bg-white/[0.01] transition-colors"
          onClick={() => setExpandedAction(isExpanded ? null : action.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg ${statusStyle.bg} border ${statusStyle.border}`}
              >
                {action.status === "pending" ? (
                  <AlertTriangle size={18} className="text-amber-400" />
                ) : (
                  <StatusIcon
                    size={18}
                    className={`${statusStyle.text} ${
                      action.status === "executing" ? "animate-spin" : ""
                    }`}
                  />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-200">
                    {action.status === "pending" ? "🚨 ISSUE DETECTED" : action.problem_summary?.substring(0, 60)}
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border font-medium`}
                  >
                    {action.status}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Server size={12} />
                    {action.instance_id}
                  </span>
                  {action.detected_os && (
                    <span className="flex items-center gap-1">
                      <Cpu size={12} />
                      {action.detected_os} ({action.ssh_user})
                    </span>
                  )}
                  {action.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(action.created_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button className="text-slate-500 p-1">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {action.status === "pending" && (
            <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800/30">
              <p className="text-sm text-slate-300">{action.problem_summary}</p>
            </div>
          )}
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-5 pb-5 space-y-4 border-t border-slate-800/30 pt-4">
            {/* Problem Summary (for non-pending) */}
            {action.status !== "pending" && (
              <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-800/30">
                <div className="flex items-center gap-2 mb-1.5">
                  <Info size={14} className="text-slate-500" />
                  <span className="text-xs font-semibold text-slate-500 uppercase">
                    Problem
                  </span>
                </div>
                <p className="text-sm text-slate-300">{action.problem_summary}</p>
              </div>
            )}

            {/* Command Phases */}
            {diagnostic.length > 0 &&
              renderActionPhase("diagnostic", diagnostic, action.id, isInteractive)}
            {remediation.length > 0 &&
              renderActionPhase("remediation", remediation, action.id, isInteractive)}
            {verification.length > 0 &&
              renderActionPhase("verification", verification, action.id, isInteractive)}

            {/* Execution Results */}
            {action.command_results && action.command_results.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Terminal size={14} className="text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Execution Results
                  </span>
                </div>
                {action.command_results.map((result, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 ${
                      result.status === "success"
                        ? "bg-emerald-500/5 border-emerald-500/15"
                        : "bg-rose-500/5 border-rose-500/15"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.status === "success" ? (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      ) : (
                        <XCircle size={14} className="text-rose-400" />
                      )}
                      <code className="text-xs text-slate-400 font-mono">
                        $ {result.command}
                      </code>
                      <span
                        className={`text-xs ml-auto ${
                          result.exit_code === 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        exit: {result.exit_code}
                      </span>
                    </div>
                    {result.stdout && (
                      <pre className="text-xs text-slate-400 bg-slate-950/50 rounded p-2 overflow-x-auto max-h-40 font-mono">
                        {result.stdout}
                      </pre>
                    )}
                    {result.stderr && (
                      <pre className="text-xs text-rose-400/80 bg-slate-950/50 rounded p-2 overflow-x-auto max-h-40 font-mono mt-1">
                        {result.stderr}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons (only for pending) */}
            {isInteractive && action.status === "pending" && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => selectAllSteps(action.id, commands)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline transition-colors"
                >
                  Select all
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => handleReject(action.id)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl font-semibold text-sm transition-all"
                >
                  <Ban size={14} />
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(action.id, commands)}
                  disabled={
                    executingId === action.id ||
                    getSelectedStepsForAction(action.id, commands).length === 0
                  }
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {executingId === action.id ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Approve & Execute
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Notification Toast */}
        {notification && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${
              notification.type === "success"
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <HeartPulse size={22} className="text-emerald-400" />
              </div>
              Self-Healing Dashboard
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              AI-powered remediation proposals. Review, approve, and execute — you&apos;re always in control.
            </p>
          </div>
          <button
            onClick={loadActions}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-200 border border-slate-700/50 rounded-xl transition-all text-sm"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Safety Banner */}
        <div className="glass-panel rounded-xl p-4 flex items-start gap-3 border-l-4 border-l-emerald-500/50">
          <Shield size={18} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              Human-in-the-Loop
            </p>
            <p className="text-xs text-slate-400 mt-1">
              The AI proposes remediation commands with full context. Nothing executes until
              you explicitly approve. Select specific commands, review risk levels, and execute
              only what you&apos;re comfortable with.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/30 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "pending"
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertTriangle size={14} />
            Pending Approval
            {pendingActions.length > 0 && (
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-semibold">
                {pendingActions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "history"
                ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <History size={14} />
            Action History
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="text-indigo-400 animate-spin" />
          </div>
        ) : activeTab === "pending" ? (
          <div className="space-y-4">
            {pendingActions.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <CheckCircle2 size={40} className="text-emerald-500/30 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No pending remediation proposals</p>
                <p className="text-slate-500 text-xs mt-1">
                  When the AI detects issues on your EC2 instances, proposals will appear here
                </p>
              </div>
            ) : (
              pendingActions.map((action) => renderActionCard(action, true))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {historyActions.length === 0 ? (
              <div className="glass-panel rounded-xl p-12 text-center">
                <History size={40} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No action history yet</p>
                <p className="text-slate-500 text-xs mt-1">
                  Completed, rejected, and failed actions will appear here as an audit trail
                </p>
              </div>
            ) : (
              historyActions.map((action) => renderActionCard(action, false))
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
