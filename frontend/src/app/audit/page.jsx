"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Search, Filter, RefreshCw, Eye, Lock, Hash, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";

export default function AuditPage() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);

  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const loadAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "15",
      });
      if (actorFilter) params.append("actor", actorFilter);
      if (actionFilter) params.append("action", actionFilter);

      const data = await fetchApi(`/api/v1/audit-logs?${params.toString()}`);
      setAuditLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load audit records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
  }, [page]);

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck size={14} /> Append-Only Tamper-Evident Governance
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Audit Trail & Governance Logs</h1>
          <p className="text-xs text-slate-400 mt-1">
            Cryptographically chained SHA-256 audit log records for administrative operations and container actions.
          </p>
        </div>

        <button
          onClick={loadAuditLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Audit Logs
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          ⚠️ {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-[#090d16] border border-white/10 text-xs">
        <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10 flex-1 max-w-xs">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Filter by Actor Email..."
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-white text-xs w-full placeholder-slate-500"
          />
        </div>

        <div className="flex items-center gap-2 bg-white/5 px-3 py-2 rounded-xl border border-white/10 flex-1 max-w-xs">
          <Filter size={14} className="text-slate-400" />
          <input
            type="text"
            placeholder="Filter by Action (e.g. container:restart)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-transparent border-none outline-none text-white text-xs w-full placeholder-slate-500"
          />
        </div>

        <button
          onClick={loadAuditLogs}
          className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-colors"
        >
          Apply Filters
        </button>
      </div>

      {/* Audit Logs Table */}
      <div className="rounded-2xl bg-[#090d16] border border-white/10 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c111e] border-b border-white/10 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Action</th>
                <th className="p-4">Target</th>
                <th className="p-4">Status</th>
                <th className="p-4">Event Hash</th>
                <th className="p-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                    No audit records found matching criteria.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-mono text-slate-400 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A"}
                    </td>
                     <td className="p-4">
                      <div className="font-medium text-white">{log.actor_email || "System"}</div>
                      <div className="text-[10px] text-violet-400 capitalize">{log.actor_role || "system"}</div>
                    </td>
                    <td className="p-4 font-mono text-amber-300 font-bold">{log.action}</td>
                    <td className="p-4 font-mono text-slate-300">
                      {log.target_name} ({log.target_type})
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${log.status === 'success' || log.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-slate-500 truncate max-w-[120px]">
                      {log.event_hash ? `${log.event_hash.substring(0, 12)}...` : "N/A"}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-violet-300 transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 bg-[#0c111e] border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <span>Total Records: {total}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-3 py-1 font-mono text-slate-300">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={auditLogs.length < 15}
              className="px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#090d16] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Hash size={18} className="text-violet-400" /> Audit Event Details
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500 uppercase text-[10px]">Log ID</span>
                  <p className="font-mono text-slate-200 mt-0.5">{selectedLog.id}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                  <span className="text-slate-500 uppercase text-[10px]">Timestamp</span>
                  <p className="font-mono text-slate-200 mt-0.5">{selectedLog.timestamp}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-slate-500 uppercase text-[10px]">Tamper Evidence (SHA-256 Chain)</span>
                <p className="font-mono text-violet-300 mt-1 break-all">Event Hash: {selectedLog.event_hash}</p>
                <p className="font-mono text-slate-500 mt-1 break-all">Prev Hash: {selectedLog.previous_event_hash}</p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <span className="text-slate-500 uppercase text-[10px]">Sanitized Request Parameters</span>
                <pre className="font-mono text-slate-300 p-2 bg-black/40 rounded border border-white/5 max-h-40 overflow-y-auto">
                  {JSON.stringify(selectedLog.sanitized_parameters, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
