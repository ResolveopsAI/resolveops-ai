"use client";

import { useState, useEffect } from "react";
import { Server, RefreshCw, Shield, Terminal, Play, AlertTriangle, Activity, CheckCircle2 } from "lucide-react";
import ContainerDrawer from "@/components/monitoring/ContainerDrawer";
import ContainerStatusBadge from "@/components/monitoring/ContainerStatusBadge";
import { fetchApi } from "@/lib/api";

export default function ContainerMonitoringPage() {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [userRole, setUserRole] = useState("admin");

  const loadContainers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi("/api/v1/containers");
      setContainers(data.containers || []);
    } catch (err) {
      setError(err.message || "Failed to load container services.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContainers();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">
            <Server size={14} /> Docker Service Visibility & Operations
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Container Monitoring</h1>
          <p className="text-xs text-slate-400 mt-1">
            Read-only container inspection, live SSE log streaming, and approved restart controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadContainers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Services
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {containers.map((c) => {
          const isProtected = ["postgres", "api-gateway-service", "auth-service", "docker-operations-service"].includes(c.service_name.toLowerCase());
          return (
            <div
              key={c.service_name}
              onClick={() => setSelectedContainer(c.service_name)}
              className="group p-5 rounded-2xl bg-[#090d16] border border-white/10 hover:border-indigo-500/40 hover:bg-[#0b101d] transition-all cursor-pointer shadow-lg space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center gap-2">
                    {c.service_name}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">{c.container_name}</p>
                </div>
                <ContainerStatusBadge status={c.state} healthStatus={c.health_status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-white/5">
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Image</span>
                  <p className="font-mono text-slate-300 truncate">{c.image}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-semibold">Restarts</span>
                  <p className={`font-mono font-bold ${c.restart_count > 2 ? 'text-rose-400' : 'text-slate-300'}`}>{c.restart_count}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
                {isProtected ? (
                  <span className="text-rose-400/80 font-medium text-[10px]">🔒 Protected Service</span>
                ) : (
                  <span className="text-emerald-400/80 font-medium text-[10px]">✓ Restartable</span>
                )}
                <span className="group-hover:translate-x-1 transition-transform text-indigo-400">Inspect &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drawer */}
      {selectedContainer && (
        <ContainerDrawer
          containerName={selectedContainer}
          onClose={() => setSelectedContainer(null)}
          userRole={userRole}
        />
      )}
    </div>
  );
}
