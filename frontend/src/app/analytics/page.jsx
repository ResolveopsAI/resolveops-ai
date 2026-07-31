"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  BarChart3, Activity, ShieldAlert, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Server, Cloud, GitBranch, Shield, Zap, Database, Clock, ArrowUpRight, Cpu, HardDrive, Wifi
} from "lucide-react";
import { fetchApi, getUserRole } from "@/lib/api";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, Legend
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0f111a]/90 backdrop-blur-md border border-white/10 p-3 rounded-lg shadow-2xl">
        <p className="text-xs font-semibold text-slate-200 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-400 capitalize">{entry.name.replace("_", " ")}:</span>
            <span className="font-mono font-medium text-white">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState("24h");

  const loadAnalytics = async () => {
    try {
      setError(null);
      const data = await fetchApi("/api/v1/analytics/overview");
      setAnalytics(data);
    } catch (err) {
      setError(err.message || "Failed to load operational analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    loadAnalytics();

    // Auto-refresh every 10 seconds for real-time telemetry
    const interval = setInterval(loadAnalytics, 10000);
    return () => clearInterval(interval);
  }, [router]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAnalytics();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
          <Activity className="animate-spin text-indigo-400 w-10 h-10" />
          <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">Loading Operational Telemetry...</p>
        </div>
      </DashboardLayout>
    );
  }

  const { summary = {}, services = [], user_resources = [], time_series = {}, generated_at, role = "user" } = analytics || {};
  const aiProvider = summary.ai_provider || {};
  const cost = summary.cost_estimation || {};

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans pb-10 animate-in fade-in duration-300">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <BarChart3 className="text-indigo-400" size={24} /> Operational Analytics & Insights
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {role === "admin"
                ? "System-wide metrics for EC2 Docker runtime, internal services health, error resolution, and compute cost."
                : "Tenant-scoped metrics for your connected cloud integrations (AWS, Azure, GitHub), incident resolution, and cloud resource cost."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={handleRefresh} className="underline text-xs">Retry</button>
          </div>
        )}

        {/* Operational Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="System Operational Status"
            value={(summary.degraded_services > 0 ? "DEGRADED" : (summary.operational_status?.toUpperCase() || "HEALTHY"))}
            statusColor={summary.degraded_services > 0 ? "text-amber-400" : "text-emerald-400"}
            subtext="EC2 Docker Compose cluster"
            icon={Activity}
          />
          <MetricCard
            title="Issues & Incidents Resolved"
            value={`${summary.resolved_incidents ?? 0} / ${summary.total_incidents ?? 0}`}
            statusColor="text-indigo-400"
            subtext={`${summary.resolution_rate_pct ?? 100}% resolution rate · ${summary.avg_resolution_mins ?? 15}m MTTR`}
            icon={CheckCircle2}
          />
          <MetricCard
            title="Docker Services Health"
            value={`${summary.healthy_services ?? (summary.total_services || 4)} / ${summary.total_services || 4}`}
            statusColor={summary.degraded_services > 0 ? "text-amber-400" : "text-emerald-400"}
            subtext={`${summary.degraded_services ?? 0} service degraded`}
            icon={Server}
          />
          <MetricCard
            title="Estimated Compute Cost"
            value={`$${cost.monthly_usd || 48}/mo`}
            statusColor="text-cyan-400"
            subtext={`$${cost.hourly_usd || 0.066}/hr (${cost.breakdown?.compute_cpu_pct || 35}% CPU, ${cost.breakdown?.memory_ram_pct || 45}% RAM)`}
            icon={Zap}
          />
        </div>

        {/* Section 1: Docker Services Health */}
        <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Server size={16} className="text-cyan-400" /> Managed Docker Services Status
            </h3>
            <span className="text-[10px] font-mono text-slate-500">Read-Only Evidence Adapter</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {services.map((s, i) => (
              <div key={i} className="p-3 rounded-xl border border-white/5 bg-[#080812] flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-200 truncate">{s.service}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{s.error_count} errors · {s.total_logs} logs</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                  s.status === "healthy"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: MCP & Evidence Architecture */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={16} className="text-indigo-400" /> Model Context Protocol (MCP) Diagnostic Server
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Provides 10 isolated, read-only evidence retrieval tools for CloudWatch logs/metrics, CloudTrail changes, GitHub workflow runs, and Docker service stats.
            </p>
            <div className="space-y-1.5 pt-2">
              <ToolRow name="aws_get_cloudwatch_log_evidence" source="AWS CloudWatch" status="active" />
              <ToolRow name="aws_get_cloudtrail_changes" source="AWS CloudTrail" status="active" />
              <ToolRow name="docker_get_service_evidence" source="Docker Adapter" status="active" />
              <ToolRow name="github_get_failed_workflow_evidence" source="GitHub Intelligence" status="active" />
            </div>
          </div>

          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-violet-400" /> Pipeline & Deployment Intelligence
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Correlates GitHub Actions workflow failures and deployment commits with incident start times.
            </p>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Failed Workflows (24h):</span>
                <span className="font-semibold text-rose-400">{summary.failed_workflows ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">GitHub Integration:</span>
                <span className="text-slate-300 capitalize">{summary.integrations?.github?.replace("_", " ") || "Not configured"}</span>
              </div>
              <div className="pt-2 border-t border-white/5 flex justify-end">
                <Link href="/integrations" className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                  Manage Integrations <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Graphical Dashboards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
          
          {/* GitHub Pipeline Resilience */}
          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <GitBranch size={16} className="text-sky-400" /> Pipeline Resilience (GitHub Actions)
            </h3>
            <div className="h-64 w-full">
              {time_series.github && time_series.github.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={time_series.github} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Area type="monotone" dataKey="success" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
                    <Area type="monotone" dataKey="failed" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorFailed)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No GitHub data available</div>
              )}
            </div>
          </div>

          {/* AWS Infrastructure Anomalies */}
          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cloud size={16} className="text-amber-400" /> AWS Infrastructure Anomalies (24h)
            </h3>
            <div className="h-64 w-full">
              {time_series.aws && time_series.aws.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={time_series.aws} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="errors" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No AWS anomaly data available</div>
              )}
            </div>
          </div>

          {/* System Load - CPU */}
          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu size={16} className="text-emerald-400" /> Docker Service CPU Utilization
            </h3>
            <div className="h-64 w-full">
              {time_series.system && time_series.system.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={time_series.system} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" name="API Gateway" dataKey="cpu_api" stroke="#34d399" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#34d399", strokeWidth: 0 }} />
                    <Line type="monotone" name="AI RCA" dataKey="cpu_rca" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }} />
                    <Line type="monotone" name="Database" dataKey="cpu_db" stroke="#f472b6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#f472b6", strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No CPU data available</div>
              )}
            </div>
          </div>

          {/* System Load - Memory */}
          <div className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <HardDrive size={16} className="text-blue-400" /> Docker Container Memory
            </h3>
            <div className="h-64 w-full">
              {time_series.system && time_series.system.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={time_series.system} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="memApi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="memRca" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} unit=" MB" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Area type="monotone" name="API Gateway" dataKey="mem_api" stroke="#3b82f6" fillOpacity={1} fill="url(#memApi)" strokeWidth={2} />
                    <Area type="monotone" name="AI RCA" dataKey="mem_rca" stroke="#8b5cf6" fillOpacity={1} fill="url(#memRca)" strokeWidth={2} />
                    <Area type="monotone" name="Database" dataKey="mem_db" stroke="#ec4899" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">No Memory data available</div>
              )}
            </div>
          </div>



        </div>

        {/* Footer info */}
        {generated_at && (
          <div className="flex items-center justify-between text-[10px] text-slate-600 pt-2">
            <span>Operational telemetry generated at {new Date(generated_at).toLocaleString()}</span>
            <span>Auto-refresh: 60s</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, statusColor, subtext, icon: Icon }) {
  return (
    <div className="border border-white/8 rounded-2xl p-4 bg-white/3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{title}</span>
        <Icon size={16} className={statusColor} />
      </div>
      <div className={`text-2xl font-bold tracking-tight ${statusColor}`}>{value}</div>
      {subtext && <p className="text-[10px] text-slate-500">{subtext}</p>}
    </div>
  );
}

function ToolRow({ name, source, status }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/30 text-xs font-mono">
      <span className="text-slate-300 truncate">{name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] text-slate-500 font-sans">{source}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}
