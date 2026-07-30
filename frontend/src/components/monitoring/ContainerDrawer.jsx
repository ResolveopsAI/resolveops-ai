"use client";

import { useState, useEffect } from "react";
import { X, Server, Activity, Terminal, Shield, RefreshCw, CheckCircle2, AlertTriangle, Cpu, HardDrive } from "lucide-react";
import LogPanel from "./LogPanel";

import { fetchApi } from "@/lib/api";

export default function ContainerDrawer({ containerName, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDetails = async () => {
    if (!containerName) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi(`/api/v1/monitoring/container/${containerName}`);
      setDetails(data);
    } catch (err) {
      setError(err.message || "Failed to fetch container details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [containerName]);

  if (!containerName) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#070a12] border-l border-white/10 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#0a0e1a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Server size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {containerName}
                {details?.status === "running" && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {details?.id || "fetching..."}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-[#090c16] px-5 gap-6 text-xs font-semibold">
          {[
            { id: "overview", label: "Overview", icon: Activity },
            { id: "logs", label: "Live Logs", icon: Terminal },
            { id: "config", label: "Config & Envs", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 flex items-center gap-2 border-b-2 transition-all ${
                  isActive
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Drawer Content Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              ⚠️ {error}
            </div>
          )}

          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</p>
                  <p className="text-lg font-bold text-emerald-400 uppercase mt-1">{details?.status || "RUNNING"}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Health: {details?.health || "healthy"}</p>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Restarts</p>
                  <p className={`text-lg font-bold mt-1 ${details?.restart_count > 2 ? "text-rose-400" : "text-slate-200"}`}>
                    {details?.restart_count ?? 0}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">Exit Code: {details?.exit_code ?? 0}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Image Tag</p>
                <p className="text-xs font-mono text-indigo-300 break-all">{details?.image || "resolveops/service:latest"}</p>
              </div>

              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Volume Mounts</p>
                {details?.mounts?.length > 0 ? (
                  details.mounts.map((m, i) => (
                    <p key={i} className="text-xs font-mono text-slate-400">{m}</p>
                  ))
                ) : (
                  <p className="text-xs text-slate-600 italic">No custom volume mounts attached.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <LogPanel containerName={containerName} isK8s={false} />
          )}

          {activeTab === "config" && (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Filtered Environment Variables</h4>
              <div className="space-y-1.5 font-mono text-xs max-h-[400px] overflow-y-auto">
                {details?.env_vars?.map((env, i) => (
                  <div key={i} className="p-2 rounded bg-black/40 border border-white/5 text-slate-300 truncate">
                    {env}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#090c16] flex justify-end">
          <button
            onClick={fetchDetails}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh Stats
          </button>
        </div>

      </div>
    </div>
  );
}
