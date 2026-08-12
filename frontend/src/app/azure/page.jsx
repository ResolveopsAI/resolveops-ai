"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Cloud, Server, Database, AppWindow, Hexagon, Activity, CheckCircle, AlertTriangle, AlertCircle, RefreshCw, Network, Zap, ShieldAlert, DollarSign } from "lucide-react";
import { fetchApi } from "@/lib/api";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MermaidDiagram from "@/components/common/MermaidDiagram";

export default function AzureHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [resources, setResources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [costData, setCostData] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  // Architecture Diagram State
  const [showArchModal, setShowArchModal] = useState(false);
  const [archCode, setArchCode] = useState(null);
  const [generatingArch, setGeneratingArch] = useState(false);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetchApi("/api/v1/cloud/resources").catch(() => []),
      fetchApi("/api/v1/cloud/logs").catch(() => []),
      fetchApi("/api/v1/cloud/azure/cost").catch(() => ({}))
    ]).then(([resData, logsData, cData]) => {
      const azureResources = Array.isArray(resData) ? resData.filter(r => r.provider === "Azure") : [];
      setResources(azureResources);
      
      const azureResourceIds = new Set(azureResources.map(r => r.id));
      const azureLogs = Array.isArray(logsData) ? logsData.filter(l => azureResourceIds.has(l.resource_id)) : [];
      setLogs(azureLogs);
      
      setCostData(cData && !cData.error ? cData : null);
      setLoading(false);
    });
  };

  const handleGenerateArchitecture = async () => {
    setGeneratingArch(true);
    setShowArchModal(true);
    try {
      const res = await fetchApi("/api/v1/cloud/architecture/generate", {
        method: "POST",
        body: JSON.stringify({ provider: "Azure" })
      });
      if (res.mermaid) {
        setArchCode(res.mermaid);
      }
    } catch (e) {
      console.error(e);
      setArchCode("graph TD\n    Error[Failed to generate diagram]");
    } finally {
      setGeneratingArch(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchData();
  }, [router]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-50 rounded-full animate-pulse"></div>
            <Activity className="animate-spin text-blue-400 w-12 h-12 relative z-10" />
          </div>
          <p className="text-slate-400 font-mono text-sm tracking-widest uppercase">Syncing Azure Environment...</p>
        </div>
      </DashboardLayout>
    );
  }

  const getResourceIcon = (type) => {
    if (!type) return <Hexagon size={18} />;
    const t = type.toLowerCase();
    if (t.includes("virtualmachine") || t.includes("compute")) return <Server size={18} />;
    if (t.includes("database") || t.includes("sql") || t.includes("storage")) return <Database size={18} />;
    if (t.includes("web") || t.includes("app")) return <AppWindow size={18} />;
    if (t.includes("network") || t.includes("vnet")) return <Network size={18} />;
    return <Hexagon size={18} />;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800/80 p-8 lg:p-10">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-blue-600/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
          
          <div className="relative z-10 flex justify-between items-end">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-wider rounded-full border border-blue-500/20 mb-4">
                <Cloud size={12} className="text-blue-400" /> Azure Intelligence
              </div>
              <h2 className="text-3xl font-bold tracking-wide text-white mb-2">
                Azure Platform Hub
              </h2>
              <p className="text-sm text-slate-400 max-w-xl">
                Comprehensive telemetry, infrastructure state, relationship graphs, and operational logs for your entire Azure environment.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGenerateArchitecture}
                className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-indigo-500/30 backdrop-blur-md"
              >
                <Network size={16} /> Architecture Map
              </button>
              <button
                onClick={() => {
                  setLoading(true);
                  fetchApi("/api/v1/cloud/azure/cost/refresh", { method: "POST" })
                    .then(() => fetchData())
                    .catch(() => fetchData());
                }}
                className="bg-white/5 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-white/10 hover:shadow-[0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-md"
              >
                <RefreshCw size={16} /> Sync Resources
              </button>
            </div>
          </div>
        </div>

        {/* Top Section: Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="glass-panel border border-slate-800 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group hover:border-emerald-500/30 transition-all cursor-default">
            {costData && costData.subscription_cost && costData.subscription_cost.status === "permission_required" ? (
              <>
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <ShieldAlert size={14} /> Permission Required
                </span>
                <div className="text-sm font-bold text-slate-400 tracking-tight leading-snug">Cost Management Reader missing</div>
              </>
            ) : (
              <>
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-emerald-500/20 duration-500"></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <DollarSign size={14} className="text-emerald-500" /> MTD Cloud Cost
                </span>
                <div className="text-3xl font-black text-white tracking-tight flex items-baseline gap-1">
                  {costData && costData.subscription_cost ? (
                    <>
                      <span className="text-lg">{costData.subscription_cost.currency_symbol}</span>
                      {costData.subscription_cost.month_to_date_actual.toLocaleString(undefined, {minimumFractionDigits: 2})}
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase ml-2">{costData.subscription_cost.currency}</span>
                    </>
                  ) : "$0.00"}
                </div>
              </>
            )}
          </div>
          <div className="glass-panel border border-slate-800 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group hover:border-blue-500/30 transition-all cursor-default">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/20 duration-500"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Cloud size={14} className="text-blue-500" /> Total Resources
            </span>
            <div className="text-4xl font-black text-white tracking-tight">{resources.length}</div>
          </div>
          <div className="glass-panel border border-slate-800 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group hover:border-emerald-500/30 transition-all cursor-default">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-emerald-500/20 duration-500"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" /> Active Services
            </span>
            <div className="text-4xl font-black text-emerald-400 tracking-tight">
              {resources.filter(r => (r.status || '').toLowerCase() === 'active' || (r.status || '').toLowerCase() === 'running').length}
            </div>
          </div>
          <div className="glass-panel border border-slate-800 rounded-2xl p-6 flex flex-col justify-center relative overflow-hidden group hover:border-rose-500/30 transition-all cursor-default">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-rose-500/20 duration-500"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-rose-500" /> Anomalies/Alerts
            </span>
            <div className="text-4xl font-black text-rose-400 tracking-tight">
              {logs.filter(l => l.level === 'ERROR' || l.level === 'WARNING').length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 items-start">
          {/* Left Column: Resources Table */}
          <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-800 bg-black/30 flex justify-between items-center">
              <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Server size={16} className="text-blue-400" /> Discovered Resources
              </h3>
            </div>
            
            {resources.length === 0 ? (
              <div className="p-16 text-center text-slate-500 flex flex-col items-center">
                <Cloud size={40} className="opacity-30 mb-4" />
                <p className="text-sm font-semibold">No Azure resources synchronized.</p>
                <p className="text-xs mt-2">Connect your Service Principal in Integrations.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50 bg-background/20 max-h-[500px] overflow-y-auto">
                {(() => {
                  const grouped = resources.reduce((acc, r) => {
                    const rg = r.resource_group || "Unknown Resource Group";
                    if (!acc[rg]) acc[rg] = [];
                    acc[rg].push(r);
                    return acc;
                    }, {});
                  
                  return Object.entries(grouped).map(([rgName, rgResources], idx) => (
                    <div key={idx} className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Database size={16} className="text-indigo-400" />
                        <h4 className="font-bold text-sm text-indigo-300 uppercase tracking-wider">{rgName}</h4>
                      </div>
                      <div className="pl-2 border-l-2 border-slate-800/80 space-y-2">
                        {rgResources.map((r, i) => {
                          const formattedType = (r.type || '').replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase()) || 'Resource';
                          const rStatus = (r.status || 'unknown').toLowerCase();
                          
                          return (
                            <Link href={`/azure/resource/${encodeURIComponent(r.id)}`} key={i} className="p-3 bg-white/[0.02] rounded-xl flex justify-between items-center hover:bg-white/[0.05] transition-colors group cursor-pointer border border-transparent hover:border-blue-500/30 block">
                              <div className="flex items-start gap-3 overflow-hidden pr-4">
                                <div className="p-2 bg-slate-800/80 rounded border border-slate-700/50 text-blue-400 shrink-0 mt-0.5 group-hover:bg-blue-500/10 group-hover:border-blue-500/20 group-hover:text-blue-300 transition-colors shadow-sm">
                                  {getResourceIcon(r.type)}
                                </div>
                                <div className="truncate flex flex-col justify-center">
                                  <h4 className="font-semibold text-xs text-slate-200 truncate group-hover:text-white transition-colors" title={r.name}>{r.name}</h4>
                                  <div className="flex items-center space-x-2 mt-1">
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-800/80 text-blue-200/70 border border-slate-700/50 uppercase tracking-widest">{formattedType}</span>
                                    <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1 before:content-['•'] before:text-slate-700 before:mr-1">{r.region}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {r.type === 'Resource Group' && costData?.resource_group_costs?.[r.name.toLowerCase()] && (
                                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                                    {costData.resource_group_costs[r.name.toLowerCase()].currency_symbol}
                                    {costData.resource_group_costs[r.name.toLowerCase()].month_to_date_actual.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    <span className="text-[8px] text-emerald-500/70">{costData.resource_group_costs[r.name.toLowerCase()].currency}</span>
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 shadow-sm capitalize tracking-wide ${
                                  rStatus === 'active' || rStatus === 'running'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : rStatus === 'unknown'
                                  ? 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  {rStatus === 'active' || rStatus === 'running' ? <CheckCircle size={10} /> : <Activity size={10} />}
                                  {r.status}
                                </span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
            
            {resources.length > itemsPerPage && (
              <div className="p-4 border-t border-border bg-black/10 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, resources.length)} of {resources.length}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 rounded bg-card border border-border text-xs font-semibold text-slate-300 disabled:opacity-50 hover:bg-white/5 transition-colors">Prev</button>
                  <button onClick={() => setCurrentPage(p => (p * itemsPerPage < resources.length ? p + 1 : p))} disabled={currentPage * itemsPerPage >= resources.length} className="px-3 py-1.5 rounded bg-card border border-border text-xs font-semibold text-slate-300 disabled:opacity-50 hover:bg-white/5 transition-colors">Next</button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Telemetry Logs */}
          <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden flex flex-col max-h-[550px]">
            <div className="p-5 border-b border-slate-800 bg-black/30 flex justify-between items-center">
              <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Activity size={16} className="text-indigo-400" /> Operational Log Feed
              </h3>
            </div>
            
            {logs.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center justify-center text-slate-500 bg-background/20 h-full">
                <div className="relative">
                  <Activity size={40} className="text-slate-700/50 mb-4 animate-pulse relative z-10" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-slate-800/30 rounded-full blur-xl"></div>
                </div>
                <p className="font-semibold text-slate-400">No recent telemetry logs</p>
                <p className="text-xs text-slate-600 mt-2 max-w-[250px]">
                  When active operations or anomalies occur on your Azure resources, logs will stream here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border bg-background/20 overflow-y-auto">
                {logs.map((log, idx) => {
                  const resource = resources.find(r => r.id === log.resource_id);
                  const isError = log.level === "ERROR" || log.level === "CRITICAL" || log.level === "FATAL";
                  const isWarning = log.level === "WARNING" || log.level === "WARN";

                  return (
                    <div key={idx} className="p-5 hover:bg-white/[0.02] transition-colors flex flex-col space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          {isError ? <AlertCircle size={14} className="text-rose-400 shrink-0" /> 
                           : isWarning ? <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                           : <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                          }
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isError ? 'bg-rose-500/10 text-rose-400' 
                            : isWarning ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {log.level}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      
                      <p className="text-sm text-slate-300 leading-relaxed font-mono mt-1 break-words">
                        {log.message}
                      </p>
                      
                      <div className="mt-2 text-[10px] text-slate-500 font-mono truncate bg-black/20 p-1.5 rounded inline-block max-w-max">
                        Ref: {resource ? resource.name : log.resource_id.split('/').pop()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
      
      {/* Architecture Diagram Modal */}
      <Dialog open={showArchModal} onOpenChange={setShowArchModal}>
        <DialogContent className="sm:max-w-4xl bg-[#0B0C10] border-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-400">
              <Network size={20} /> Auto-Generated Architecture Diagram
            </DialogTitle>
          </DialogHeader>
          <div className="h-[60vh] w-full">
            {generatingArch ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Activity className="animate-spin text-blue-500 w-10 h-10" />
                <p className="text-slate-400 font-mono text-sm animate-pulse">Mapping relationships...</p>
              </div>
            ) : archCode ? (
              <div className="h-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                <MermaidDiagram chart={archCode} />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

