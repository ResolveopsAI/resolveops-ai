"use client";

import { useState } from "react";
import { X, RefreshCw, AlertTriangle, ShieldCheck, CheckCircle2, XCircle, Clock, Send, Play } from "lucide-react";
import { fetchApi } from "@/lib/api";

export default function ContainerActionDialog({ serviceName, currentState, healthStatus, restartCount, userRole, userEmail, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeAction, setActiveAction] = useState(null);

  const isProtected = ["postgres", "api-gateway-service", "auth-service", "docker-operations-service"].includes(serviceName?.toLowerCase());
  const canApprove = ["admin", "sre"].includes((userRole || "").toLowerCase());

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.trim().length < 5) {
      setError("Please provide a valid operational reason (min 5 chars).");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchApi("/api/v1/container-actions/restart-requests", {
        method: "POST",
        body: JSON.stringify({
          service_name: serviceName,
          reason: reason.trim(),
        }),
      });
      setActiveAction(result);
    } catch (err) {
      setError(err.message || "Failed to submit restart request.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!activeAction?.action_id) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchApi(`/api/v1/container-actions/${activeAction.action_id}/approve`, {
        method: "POST",
      });
      setActiveAction(result);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || "Failed to approve and execute restart.");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!activeAction?.action_id) return;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchApi(`/api/v1/container-actions/${activeAction.action_id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: "Rejected by operational reviewer" }),
      });
      setActiveAction(result);
    } catch (err) {
      setError(err.message || "Failed to reject action.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0a0e1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#0d1222]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <RefreshCw size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Controlled Container Restart</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Target: <span className="text-amber-300 font-semibold">{serviceName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isProtected && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
              <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Protected Infrastructure Service</p>
                <p className="text-rose-400/80 mt-0.5">
                  '{serviceName}' is a protected core component. API restart operations are disabled for this service. Follow manual administrator runbook procedures.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              ⚠️ {error}
            </div>
          )}

          {!activeAction ? (
            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500 text-[10px] block">Current State</span>
                  <span className="font-bold text-emerald-400 uppercase mt-0.5 block">{currentState || "RUNNING"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500 text-[10px] block">Health</span>
                  <span className="font-bold text-slate-200 capitalize mt-0.5 block">{healthStatus || "healthy"}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500 text-[10px] block">Restart Count</span>
                  <span className="font-bold text-slate-200 mt-0.5 block">{restartCount ?? 0}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/15 text-amber-200/90 text-xs">
                ⚠️ <strong>Traffic Warning:</strong> Triggering a restart will temporarily interrupt connection pools for this service.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Operational Reason for Restart *</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Service memory leak causing degraded latency. Approved by SRE."
                  disabled={isProtected || loading}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProtected || loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Submit Restart Request
                </button>
              </div>
            </form>
          ) : (
            /* Progress Workflow Tracker */
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Action ID:</span>
                  <span className="font-mono text-indigo-300 font-bold">{activeAction.action_id}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-amber-400 uppercase">{activeAction.status}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Requested By:</span>
                  <span className="text-slate-200">{activeAction.requested_by}</span>
                </div>
              </div>

              {/* Status Stepper */}
              <div className="space-y-2 text-xs">
                <div className={`p-2.5 rounded-lg flex items-center gap-2 border ${activeAction.status === 'awaiting_approval' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                  <Clock size={14} /> 1. Request Submitted — Awaiting Approval
                </div>
                <div className={`p-2.5 rounded-lg flex items-center gap-2 border ${['approved', 'executing', 'completed'].includes(activeAction.status) ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                  <ShieldCheck size={14} /> 2. Approval Granted
                </div>
                <div className={`p-2.5 rounded-lg flex items-center gap-2 border ${activeAction.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : activeAction.status === 'failed' ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-white/5 border-white/5 text-slate-400'}`}>
                  {activeAction.status === 'completed' ? <CheckCircle2 size={14} /> : <Play size={14} />}
                  3. Execution & Health Verification: {activeAction.verification_status || 'Pending'}
                </div>
              </div>

              {/* Approver Controls */}
              {activeAction.status === "awaiting_approval" && (
                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  {canApprove ? (
                    <div className="flex gap-2 w-full justify-end">
                      <button
                        onClick={handleReject}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30 text-xs font-medium"
                      >
                        Reject
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
                      >
                        {loading ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        Approve & Execute Restart
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400 italic">
                      Requester permissions: Request submitted. Waiting for SRE or Admin review.
                    </p>
                  )}
                </div>
              )}

              {activeAction.status === "completed" && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} /> Container restart completed successfully and verified healthy!
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
