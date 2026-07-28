"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { fetchApi, getUserRole } from "@/lib/api";
import {
  Cloud, Box, GitBranch, ShieldAlert, Activity, DollarSign,
  AlertTriangle, CheckCircle, Server, RefreshCw, ChevronRight,
  Cpu, Database, Network, Key, Zap, TrendingUp, ArrowUpRight
} from "lucide-react";
import Link from "next/link";

export default function GlobalDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState({});
  const [stats, setStats] = useState({
    aws: 0, azure: 0,
    incidents: 0, risks: 0, cost: null,
    failures: 0, health: "100%"
  });
  const [deployments, setDeployments] = useState([]);

  useEffect(() => {
    if (getUserRole() !== "admin") {
      router.push("/chat");
    }
  }, [router]);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fetchApi("/api/v1/integrations").catch(() => ({})),
      fetchApi("/api/v1/cloud/resources").catch(() => []),
      fetchApi("/api/v1/github/deployments").catch(() => []),
      fetchApi("/api/v1/cloud/azure/cost").catch(() => ({}))
    ]).then(([integData, resData, depData, costData]) => {
      setIntegrations(integData);
      const awsCount   = Array.isArray(resData) ? resData.filter(r => r.provider === "AWS").length   : 0;
      const azureCount = Array.isArray(resData) ? resData.filter(r => r.provider === "Azure").length : 0;
      const failedPipelines = Array.isArray(depData) ? depData.filter(d => d.conclusion === "failure").length : 0;
      setDeployments(Array.isArray(depData) ? depData.slice(0, 4) : []);
      setStats({
        aws: awsCount, azure: azureCount,
        incidents: 0, risks: 0,
        cost: costData && !costData.error ? costData : null,
        failures: failedPipelines,
        health: failedPipelines > 0 ? "92.0%" : "100%"
      });
      setLoading(false);
    });
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) { router.push("/login"); return; }
    fetchData();
  }, [router]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border border-sky-500/20 flex items-center justify-center">
              <Activity className="text-sky-400 w-7 h-7 animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-sky-500/10 blur-xl animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-slate-200 font-semibold text-sm">Initializing Command Center</p>
            <p className="text-slate-500 text-xs font-mono mt-1 tracking-wider">LOADING TELEMETRY...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isAwsConnected    = !!integrations.aws;
  const isAzureConnected  = !!integrations.azure;
  const isGithubConnected = !!integrations.github;
  const totalConnected    = [isAwsConnected, isAzureConnected, isGithubConnected].filter(Boolean).length;
  const totalResources    = stats.aws + stats.azure;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5 pb-10 animate-in fade-in duration-500">

        {/* ── Hero ───────────────────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden p-7 lg:p-9"
          style={{
            background: "linear-gradient(135deg, #0d1a2d 0%, #0b1525 60%, #0d1220 100%)",
            border: "1px solid rgba(56,189,248,0.12)",
            boxShadow: "0 0 60px rgba(56,189,248,0.06), 0 4px 30px rgba(0,0,0,0.4)"
          }}>
          {/* Background grid + glow orbs */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
          <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />
          {/* Top border glow */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />

          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)", color: "#38bdf8" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                All Systems Nominal
              </div>
              <h1 className="text-3xl lg:text-4xl font-black tracking-tight mb-3 gradient-text-white">
                ResolveOps AI
                <span className="text-sky-400 ml-2 text-2xl font-light opacity-70">Command Center</span>
              </h1>
              <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                Unified SRE intelligence across Kubernetes, Azure, AWS, GitHub Actions, and Docker.
                AI-powered incident resolution, cost analysis, and pipeline diagnostics.
              </p>
            </div>
            <button onClick={fetchData}
              className="btn-ghost shrink-0 group">
              <RefreshCw size={15} className={`${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} text-sky-400`} />
              Sync Telemetry
            </button>
          </div>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard title="System Health" value={stats.health} icon={<Activity size={16}/>} color="emerald" pulse />
          <MetricCard title="Connected Orgs" value={`${totalConnected}/3`} icon={<Network size={16}/>} color="sky" />
          <MetricCard title="Resources" value={totalResources} icon={<Server size={16}/>} color="indigo" />
          <MetricCard title="Active Risks" value={stats.risks} icon={<ShieldAlert size={16}/>} color="amber" alert={stats.risks > 0} />
          <MetricCard title="Failed Pipelines" value={stats.failures} icon={<AlertTriangle size={16}/>} color="rose" alert={stats.failures > 0} />
          <CostMetricCard costData={stats.cost} />
        </div>

        {/* ── Platform Cards ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1">
          <div className="w-1 h-4 rounded-full bg-sky-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-widest">Infrastructure Integrations</h2>
          <div className="flex-1 h-px bg-white/5 ml-2" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlatformCard
            title="Microsoft Azure" desc="VMs, Resource Groups, AKS, Cost Analytics"
            icon={<Cloud size={22}/>} color="sky"
            isConnected={isAzureConnected} stats={`${stats.azure} Resources`} href="/azure"
          />
          <PlatformCard
            title="Amazon Web Services" desc="EC2, RDS, VPCs, CloudWatch, Cost Explorer"
            icon={<Box size={22}/>} color="amber"
            isConnected={isAwsConnected} stats={`${stats.aws} Resources`} href="/aws"
          />
          <PlatformCard
            title="GitHub Actions" desc="CI/CD pipelines, workflow runs, RCA engine"
            icon={<GitBranch size={22}/>} color="violet"
            isConnected={isGithubConnected} stats={`${deployments.length} Recent Runs`} href="/github"
          />
        </div>

        {/* ── Bottom 2-col ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* AI Recommendations */}
          <div className="lg:col-span-2 glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/20 to-transparent" />
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                  <Zap size={14} className="text-sky-400" />
                </div>
                AI Recommendations
              </h3>
              <span className="badge-neutral px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">Preview</span>
            </div>
            <div className="space-y-3 opacity-70">
              <RecommendRow type="risk" title="CPU Exhaustion — Azure VMSS" desc="VMSS-WebTier predicted to hit 95% CPU during peak hours. Recommend vertical scaling." />
              <RecommendRow type="cost" title="Unattached EBS Volumes — AWS" desc="3 unattached volumes in us-east-1 found. Deleting saves ~$45/month." />
              <RecommendRow type="security" title="Permissive NSG Rule" desc="NSG 'App-Security-Group' allows Any/Any on port 22. Restrict to known IPs." />
            </div>
          </div>

          {/* Pipeline Activity */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10">
                  <Activity size={14} className="text-slate-400" />
                </div>
                Pipeline Activity
              </h3>
            </div>
            <div className="space-y-2.5">
              {deployments.length > 0 ? deployments.map((dep, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                  {dep.conclusion === "failure"
                    ? <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
                    : <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{dep.repository}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{dep.workflow_name}</p>
                  </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Activity size={28} className="text-slate-700 mb-3" />
                  <p className="text-xs text-slate-500">No recent pipeline activity</p>
                </div>
              )}
              <Link href="/github" className="flex items-center justify-center gap-1 text-[11px] font-semibold text-sky-400 hover:text-sky-300 mt-2 pt-3 border-t border-white/[0.05] transition-colors">
                View All Pipelines <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─── Sub-components ───────────────────────────────────── */

function MetricCard({ title, value, icon, color, alert = false, pulse = false }) {
  const colorStyles = {
    emerald: { text: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
    sky:     { text: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.2)" },
    indigo:  { text: "#818cf8", bg: "rgba(129,140,248,0.08)", border: "rgba(129,140,248,0.2)" },
    amber:   { text: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
    rose:    { text: "#f43f5e", bg: "rgba(244,63,94,0.08)",  border: "rgba(244,63,94,0.2)"  },
  };
  const c = colorStyles[color] || colorStyles.sky;

  return (
    <div className={`glass-panel rounded-2xl p-5 flex flex-col justify-between transition-all hover:scale-[1.02] ${alert ? "border-rose-500/25" : ""}`}
      style={alert ? { boxShadow: "0 0 20px rgba(244,63,94,0.08)" } : {}}>
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
          {icon}
        </div>
        {pulse && <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" style={{ color: "#10b981" }} />}
        {alert && <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />}
      </div>
      <div>
        <p className="text-2xl font-black text-white tracking-tight mb-0.5">{value}</p>
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
    </div>
  );
}

function PlatformCard({ title, desc, icon, color, isConnected, stats, href }) {
  const colorStyles = {
    sky:    { text: "#38bdf8", bg: "rgba(56,189,248,0.08)",  border: "rgba(56,189,248,0.2)",  hoverBorder: "rgba(56,189,248,0.35)"  },
    amber:  { text: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)",  hoverBorder: "rgba(245,158,11,0.35)"  },
    violet: { text: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)", hoverBorder: "rgba(167,139,250,0.35)" },
  };
  const c = colorStyles[color] || colorStyles.sky;

  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col relative overflow-hidden group transition-all duration-200 hover:scale-[1.01]"
      style={{ "--hover-border": c.hoverBorder }}
      onMouseEnter={e => e.currentTarget.style.borderColor = c.hoverBorder}
      onMouseLeave={e => e.currentTarget.style.borderColor = ""}>
      <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${c.text}40, transparent)` }} />

      <div className="flex justify-between items-start mb-5">
        <div className="p-2.5 rounded-xl" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
          {icon}
        </div>
        {isConnected
          ? <span className="badge-success px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider">Connected</span>
          : <span className="badge-neutral px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider">Not configured</span>}
      </div>

      <h3 className="text-base font-bold text-white mb-1">{title}</h3>
      <p className="text-[11px] text-slate-400 mb-5 flex-1 leading-relaxed">{desc}</p>

      {isConnected ? (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.text }} />
            <p className="terminal-text text-slate-300">{stats}</p>
          </div>
          <Link href={href}
            className="w-full flex justify-center items-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all group-hover:opacity-100"
            style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
            Open Hub <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <Link href="/integrations"
          className="w-full flex justify-center items-center gap-2 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Key size={13} /> Configure Access
        </Link>
      )}
    </div>
  );
}

function RecommendRow({ type, title, desc }) {
  const styles = {
    risk:     { icon: <Activity size={14}/>,     text: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)"  },
    cost:     { icon: <DollarSign size={14}/>,   text: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
    security: { icon: <ShieldAlert size={14}/>,  text: "#f43f5e", bg: "rgba(244,63,94,0.08)",  border: "rgba(244,63,94,0.2)"  },
  };
  const s = styles[type] || styles.risk;

  return (
    <div className="flex gap-3 items-start p-3.5 rounded-xl hover:bg-white/[0.025] transition-colors"
      style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="p-1.5 rounded-lg mt-0.5 shrink-0"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
        {s.icon}
      </div>
      <div>
        <h4 className="text-xs font-semibold text-slate-200 mb-0.5">{title}</h4>
        <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function CostMetricCard({ costData }) {
  if (!costData?.subscription_cost) {
    return (
      <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between">
        <div className="mb-3">
          <div className="p-2 rounded-lg w-fit bg-slate-500/10 border border-slate-500/20 text-slate-400">
            <DollarSign size={16} />
          </div>
        </div>
        <div>
          <p className="text-2xl font-black text-white tracking-tight mb-0.5">$0.00</p>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Cloud Cost MTD</p>
        </div>
      </div>
    );
  }
  const sub = costData.subscription_cost;
  const isPermReq = sub.status === "permission_required";
  return (
    <div className="glass-panel rounded-2xl p-5 flex flex-col justify-between"
      style={{ border: "1px solid rgba(56,189,248,0.15)", boxShadow: "0 0 20px rgba(56,189,248,0.05)" }}>
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
          <DollarSign size={16} />
        </div>
        {isPermReq
          ? <span className="badge-danger px-2 py-0.5 rounded text-[9px] font-bold">N/A</span>
          : <span className="badge-success px-2 py-0.5 rounded text-[9px] font-bold">Live</span>}
      </div>
      <div>
        {isPermReq
          ? <p className="text-base font-bold text-slate-400 mb-0.5">Unavailable</p>
          : <p className="text-2xl font-black text-white tracking-tight mb-0.5">
              {sub.currency_symbol}{sub.month_to_date_actual?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>}
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Cloud Cost MTD</p>
      </div>
    </div>
  );
}
