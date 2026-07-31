"use client";

import { useState, useEffect } from "react";
import { X, Server, Activity, Terminal, Shield, RefreshCw, Cpu, RotateCcw, FileText } from "lucide-react";
import ContainerStatusBadge from "./ContainerStatusBadge";
import ContainerStats from "./ContainerStats";
import ContainerLogModal from "./ContainerLogModal";
import ContainerActionDialog from "./ContainerActionDialog";
import { fetchApi } from "@/lib/api";

export default function ContainerDrawer({ containerName, onClose, userRole = "admin", userEmail = "admin@resolveops.ai" }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [details, setDetails] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);

  const fetchDetails = async () => {
    if (!containerName) return;
    setLoading(true);
    setError(null);
    try {
      const [data, statsData] = await Promise.all([
        fetchApi(`/api/v1/containers/${containerName}`).catch(() => null),
        fetchApi(`/api/v1/containers/${containerName}/stats`).catch(() => null),
      ]);
      setDetails(data);
      setStats(statsData);
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

  const isProtected = ["postgres", "api-gateway-service", "auth-service", "docker-operations-service"].includes(containerName.toLowerCase());

  return (
    <>
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
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Container: {details?.container_name || "fetching..."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <ContainerStatusBadge status={details?.state} healthStatus={details?.health_status} />
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors ml-2"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="flex items-center justify-between px-5 py-3 bg-[#080b14] border-b border-white/5 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowLogModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 font-medium transition-colors"
              >
                <Terminal size={13} /> Live Log Stream
              </button>
              <button
                onClick={() => setShowActionDialog(true)}
                disabled={isProtected}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  isProtected
                    ? "bg-slate-800/50 border-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30"
                }`}
              >
                <RotateCcw size={13} /> Restart Service
              </button>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              Restarts: {details?.restart_count ?? 0}
            </span>
          </div>

          {/* Stats Widget */}
          <div className="px-5 pt-2">
            <ContainerStats stats={stats} />
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-white/10 bg-[#090c16] px-5 gap-6 text-xs font-semibold">
            {[
              { id: "overview", label: "Overview", icon: Activity },
              { id: "config", label: "Labels & Metadata", icon: Shield },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
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

          {/* Drawer Body */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                ⚠️ {error}
              </div>
            )}

            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Image Tag</p>
                    <p className="font-mono text-indigo-300 break-all mt-1">{details?.image || "latest"}</p>
                  </div>
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Started Timestamp</p>
                    <p className="font-mono text-slate-300 mt-1">{details?.started_at ? new Date(details.started_at).toLocaleString() : "N/A"}</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-2 text-xs">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Protected Service Status</p>
                  {isProtected ? (
                    <p className="text-rose-400 font-semibold">⚠️ Protected Infrastructure Service (Direct API Restart Disabled)</p>
                  ) : (
                    <p className="text-emerald-400 font-semibold">✓ Allowed Restartable Operational Service</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "config" && (
              <div className="space-y-3 text-xs">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Safe Container Labels</h4>
                {details?.labels && Object.keys(details.labels).length > 0 ? (
                  <div className="space-y-1.5 font-mono max-h-[300px] overflow-y-auto">
                    {Object.entries(details.labels).map(([k, v]) => (
                      <div key={k} className="p-2 rounded bg-black/40 border border-white/5 text-slate-300 truncate">
                        <span className="text-indigo-400">{k}:</span> {v}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No custom labels configured.</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-[#090c16] flex justify-between items-center text-xs">
            <span className="text-slate-500">RBAC Enforcement Active</span>
            <button
              onClick={fetchDetails}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 transition-colors"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

        </div>
      </div>

      {/* Live Log Stream Modal */}
      {showLogModal && (
        <ContainerLogModal
          serviceName={containerName}
          onClose={() => setShowLogModal(false)}
        />
      )}

      {/* Restart Action Dialog */}
      {showActionDialog && (
        <ContainerActionDialog
          serviceName={containerName}
          currentState={details?.state}
          healthStatus={details?.health_status}
          restartCount={details?.restart_count}
          userRole={userRole}
          userEmail={userEmail}
          onClose={() => setShowActionDialog(false)}
          onSuccess={fetchDetails}
        />
      )}
    </>
  );
}
