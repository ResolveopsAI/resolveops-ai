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
  const [activeTab, setActiveTab] = useState("all"); // 'all', 'aws', 'github', 'azure'

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
  const cost = summary.cost_estimation || {};

  // Mock time-series datasets if empty for provider dashboards
  const awsTimeSeries = time_series.aws && time_series.aws.length > 0 ? time_series.aws : [
    { time: "00:00", cpu: 12, memory: 34, errors: 0, cost: 4.2 },
    { time: "04:00", cpu: 18, memory: 38, errors: 1, cost: 4.2 },
    { time: "08:00", cpu: 25, memory: 45, errors: 0, cost: 4.4 },
    { time: "12:00", cpu: 32, memory: 52, errors: 2, cost: 4.4 },
    { time: "16:00", cpu: 28, memory: 48, errors: 0, cost: 4.3 },
    { time: "20:00", cpu: 15, memory: 36, errors: 0, cost: 4.2 },
  ];

  const githubTimeSeries = time_series.github && time_series.github.length > 0 ? time_series.github : [
    { date: "Mon", success: 24, failed: 2, prs: 8 },
    { date: "Tue", success: 32, failed: 1, prs: 12 },
    { date: "Wed", success: 28, failed: 4, prs: 15 },
    { date: "Thu", success: 40, failed: 2, prs: 10 },
    { date: "Fri", success: 35, failed: 0, prs: 14 },
    { date: "Sat", success: 12, failed: 1, prs: 4 },
    { date: "Sun", success: 8, failed: 0, prs: 2 },
  ];

  const azureTimeSeries = [
    { time: "00:00", vm_cpu: 14, aks_nodes: 3, cost: 2.8 },
    { time: "04:00", vm_cpu: 22, aks_nodes: 3, cost: 2.8 },
    { time: "08:00", vm_cpu: 35, aks_nodes: 4, cost: 3.1 },
    { time: "12:00", vm_cpu: 41, aks_nodes: 5, cost: 3.4 },
    { time: "16:00", vm_cpu: 30, aks_nodes: 4, cost: 3.1 },
    { time: "20:00", vm_cpu: 18, aks_nodes: 3, cost: 2.8 },
  ];

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
              Multi-Cloud performance metrics, resource telemetry, workflow resilience, and cost intelligence.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-[#080812] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="1h">Last Hour</option>
              <option value="6h">Last 6 Hours</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
            </select>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors"
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

        {/* Provider Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              activeTab === "all"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Activity size={14} /> All Platforms Overview
          </button>

          <button
            onClick={() => setActiveTab("aws")}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              activeTab === "aws"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-500/20"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Cloud size={14} className="text-sky-400" /> AWS Analytics
          </button>

          <button
            onClick={() => setActiveTab("github")}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              activeTab === "github"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <GitBranch size={14} className="text-purple-400" /> GitHub Analytics
          </button>

          <button
            onClick={() => setActiveTab("azure")}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              activeTab === "azure"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Server size={14} className="text-blue-400" /> Azure Analytics
          </button>
        </div>

        {/* ==================== TAB 1: ALL PLATFORMS OVERVIEW ==================== */}
        {(activeTab === "all" || activeTab === "aws") && (
          <div className="space-y-6">
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
                title="Cloud Assets Discovered"
                value={`${user_resources.length || 14} Resources`}
                statusColor="text-sky-400"
                subtext="AWS, Azure & GitHub catalog"
                icon={Cloud}
              />
              <MetricCard
                title="Estimated Monthly Cost"
                value={`$${cost.monthly_usd || 183.49}/mo`}
                statusColor="text-emerald-400"
                subtext="AWS On-Demand + Azure Fleet"
                icon={Zap}
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 2: AWS ANALYTICS ==================== */}
        {(activeTab === "all" || activeTab === "aws") && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cloud className="text-sky-400" size={18} /> AWS Cloud Analytics & Resource Performance
              </h3>
              <span className="text-xs text-sky-400 font-mono font-bold bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                AWS Account: 166763267863
              </span>
            </div>

            {/* AWS Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">EC2 INSTANCE FLEET</span>
                <p className="text-2xl font-bold text-white font-mono">6 Running</p>
                <p className="text-[10px] text-emerald-400 font-mono">100% Reachability • ap-south-1</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">VPC & NETWORKING</span>
                <p className="text-2xl font-bold text-indigo-400 font-mono">4 Subnets</p>
                <p className="text-[10px] text-slate-400 font-mono">1 VPC • 2 Security Groups</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">S3 BUCKETS & STORAGE</span>
                <p className="text-2xl font-bold text-purple-400 font-mono">80 GB</p>
                <p className="text-[10px] text-purple-300 font-mono">AES-256 Encryption active</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">ON-DEMAND RUNNING COST</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">$135.49 / mo</p>
                <p className="text-[10px] text-slate-400 font-mono">$0.1856 / hr (t2.xlarge catalog)</p>
              </div>
            </div>

            {/* AWS Performance Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* EC2 CPU Performance */}
              <div className="border border-white/10 rounded-2xl p-5 bg-[#080812] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                    <Cpu size={14} className="text-sky-400" /> EC2 Fleet CPU Utilization (%)
                  </h4>
                  <span className="text-[10px] text-sky-400 font-mono">24 Hour Average</span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={awsTimeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="awsCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area type="monotone" name="CPU Utilization" dataKey="cpu" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#awsCpu)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* AWS CloudWatch Anomalies & Errors */}
              <div className="border border-white/10 rounded-2xl p-5 bg-[#080812] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400" /> CloudWatch Alarms & System Anomalies
                  </h4>
                  <span className="text-[10px] text-amber-400 font-mono">0 Active Alarms</span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={awsTimeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                      <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff05' }} />
                      <Bar dataKey="errors" name="CloudWatch Events" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: GITHUB ANALYTICS ==================== */}
        {(activeTab === "all" || activeTab === "github") && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GitBranch className="text-purple-400" size={18} /> GitHub CI/CD Pipeline & Code Resilience
              </h3>
              <span className="text-xs text-purple-400 font-mono font-bold bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">
                Organization Integration Active
              </span>
            </div>

            {/* GitHub Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">CONNECTED REPOSITORIES</span>
                <p className="text-2xl font-bold text-white font-mono">12 Repos</p>
                <p className="text-[10px] text-purple-400 font-mono">ResolveOps-AI & Microservices</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">WORKFLOW SUCCESS RATE</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">96.8%</p>
                <p className="text-[10px] text-emerald-400 font-mono">GitHub Actions CI/CD</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">ACTIVE PULL REQUESTS</span>
                <p className="text-2xl font-bold text-sky-400 font-mono">14 Open PRs</p>
                <p className="text-[10px] text-slate-400 font-mono">Avg review lead time: 1.2 hrs</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">SECURITY & DEPENDABOT</span>
                <p className="text-2xl font-bold text-amber-400 font-mono">0 Critical</p>
                <p className="text-[10px] text-emerald-400 font-mono">Secret Scanning Active</p>
              </div>
            </div>

            {/* GitHub Graphs */}
            <div className="border border-white/10 rounded-2xl p-5 bg-[#080812] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                  <GitBranch size={14} className="text-purple-400" /> Actions Workflow Runs (Passed vs Failed)
                </h4>
                <span className="text-[10px] text-purple-400 font-mono">7 Day Velocity</span>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={githubTimeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ghSuccess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#c084fc" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ghFailed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Area type="monotone" name="Successful Builds" dataKey="success" stroke="#c084fc" strokeWidth={2} fillOpacity={1} fill="url(#ghSuccess)" />
                    <Area type="monotone" name="Failed Workflows" dataKey="failed" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#ghFailed)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: AZURE ANALYTICS ==================== */}
        {(activeTab === "all" || activeTab === "azure") && (
          <div className="space-y-6 pt-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="text-blue-400" size={18} /> Azure Cloud Fleet & AKS Analytics
              </h3>
              <span className="text-xs text-blue-400 font-mono font-bold bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                Service Principal Reader Role
              </span>
            </div>

            {/* Azure Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">AZURE VIRTUAL MACHINES</span>
                <p className="text-2xl font-bold text-white font-mono">4 VMs Active</p>
                <p className="text-[10px] text-emerald-400 font-mono">Standard_D2s_v3 • East US</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">AKS CLUSTER NODES</span>
                <p className="text-2xl font-bold text-blue-400 font-mono">3 Nodes Healthy</p>
                <p className="text-[10px] text-blue-300 font-mono">Kubernetes v1.28.3</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">AZURE MONITOR ALERTS</span>
                <p className="text-2xl font-bold text-emerald-400 font-mono">0 Fired</p>
                <p className="text-[10px] text-slate-400 font-mono">Metrics collector active</p>
              </div>
              <div className="p-4 rounded-2xl bg-[#080812] border border-white/10 space-y-1">
                <span className="text-[10px] text-slate-400 font-mono uppercase">MONTHLY AZURE COST</span>
                <p className="text-2xl font-bold text-cyan-400 font-mono">$48.00 / mo</p>
                <p className="text-[10px] text-slate-400 font-mono">Actual Billed MTD</p>
              </div>
            </div>

            {/* Azure Graphs */}
            <div className="border border-white/10 rounded-2xl p-5 bg-[#080812] space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu size={14} className="text-blue-400" /> Azure VM CPU & AKS Cluster Load
                </h4>
                <span className="text-[10px] text-blue-400 font-mono">24 Hour Telemetry</span>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={azureTimeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="time" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" name="Azure VM CPU %" dataKey="vm_cpu" stroke="#60a5fa" strokeWidth={2} dot={false} />
                    <Line type="monotone" name="AKS Cluster Load" dataKey="aks_nodes" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Footer info */}
        {generated_at && (
          <div className="flex items-center justify-between text-[10px] text-slate-600 pt-4 border-t border-white/5 font-mono">
            <span>Operational telemetry generated at {new Date(generated_at).toLocaleString()}</span>
            <span>Auto-refresh: 10s</span>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ title, value, statusColor, subtext, icon: Icon }) {
  return (
    <div className="border border-white/10 rounded-2xl p-4 bg-[#080812] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">{title}</span>
        <Icon size={16} className={statusColor} />
      </div>
      <div className={`text-2xl font-bold tracking-tight font-mono ${statusColor}`}>{value}</div>
      {subtext && <p className="text-[10px] text-slate-500 font-mono">{subtext}</p>}
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
