"use client";

import { useState, useEffect } from "react";
import { X, Server, Activity, Terminal, ShieldAlert, RefreshCw, Cpu, HardDrive } from "lucide-react";
import LogPanel from "./LogPanel";

export default function PodDrawer({ podName, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [logs, setLogs] = useState([]);

  if (!podName) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#070a12] border-l border-white/10 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-[#0a0e1a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Server size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {podName}
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Kubernetes Pod · Namespace: resolveops</p>
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
            { id: "logs", label: "Pod Logs", icon: Terminal },
            { id: "events", label: "Cluster Events", icon: ShieldAlert },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 flex items-center gap-2 border-b-2 transition-all ${
                  isActive
                    ? "border-violet-500 text-violet-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5">
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Pod Resource Limits vs Requests</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">CPU Request / Limit:</span>
                      <span className="font-mono text-emerald-400">250m / 500m (Actual: 45m)</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full w-[18%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Memory Request / Limit:</span>
                      <span className="font-mono text-blue-400">256Mi / 512Mi (Actual: 180Mi)</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full w-[35%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Node Assignment</p>
                  <p className="text-sm font-bold text-slate-200 mt-1 font-mono">node-worker-01</p>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Restarts</p>
                  <p className="text-sm font-bold text-slate-200 mt-1 font-mono">0</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <LogPanel containerName={podName} isK8s={true} />
          )}

          {activeTab === "events" && (
            <div className="space-y-2">
              <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs">
                <p className="font-semibold text-slate-200">Scheduled</p>
                <p className="text-slate-400 mt-1">Successfully assigned pod to node-worker-01</p>
                <p className="text-[10px] text-slate-600 mt-1 font-mono">2h ago</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
