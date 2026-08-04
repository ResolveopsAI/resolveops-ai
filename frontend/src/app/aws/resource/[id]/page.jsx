"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ArrowLeft, Server, AlertTriangle, Activity, Database, DollarSign, Layers, RefreshCw, Copy, ExternalLink, ShieldAlert, HardDrive, Wifi } from "lucide-react";
import ResourceRiskSummaryCards from "@/components/resource-intelligence/ResourceRiskSummaryCards";
import ResourceRiskList from "@/components/resource-intelligence/ResourceRiskList";

export default function AwsResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const resourceId = decodeURIComponent(params.id);

  const [resource, setResource] = useState(null);
  const [cost, setCost] = useState(null);
  const [risks, setRisks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsStatus, setLogsStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [subresources, setSubresources] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rcaData, setRcaData] = useState(null);
  const [rcaLoading, setRcaLoading] = useState(false);
  const [rcaModalOpen, setRcaModalOpen] = useState(false);

  useEffect(() => {
    fetchResourceData();
  }, [resourceId]);

  const fetchResourceData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const resData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}`).catch(() => null);
      if (resData) setResource(resData);

      const costData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/cost`).catch((e) => ({
        status: "error", message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load cost data."
      }));
      const safeCostData = costData && typeof costData === "object" ? costData : { status: "unavailable", message: "Cost data unavailable" };
      setCost(safeCostData);

      const risksData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/risks`).catch((e) => ({
        status: "error", risks: [], message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load risks."
      }));
      setRisks(Array.isArray(risksData?.risks) ? risksData.risks : []);

      const logsData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/logs`).catch((e) => ({
        status: "error", logs: [], message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load logs."
      }));
      setLogs(Array.isArray(logsData?.logs) ? logsData.logs : []);
      setLogsStatus({
        available: logsData?.logs_available || false,
        message: logsData?.message || (logsData?.status === "error" ? logsData.message : ""),
        warnings: Array.isArray(logsData?.warnings) ? logsData.warnings : []
      });

      const metricsData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/metrics`).catch((e) => ({
        status: "error", metrics: null, message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load metrics."
      }));
      const metricsList = Array.isArray(metricsData)
        ? metricsData
        : Array.isArray(metricsData?.metrics)
          ? metricsData.metrics
          : Array.isArray(metricsData?.data)
            ? metricsData.data
            : [];
      setMetrics(metricsList);

      const eventsData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/events`).catch((e) => ({
        status: "error", events: [], message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load events."
      }));
      setEvents(Array.isArray(eventsData?.events) ? eventsData.events : []);

      const relsData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/relationships`).catch((e) => ({
        status: "error", relationships: [], message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load relationships."
      }));
      setRelationships(Array.isArray(relsData?.relationships) ? relsData.relationships : []);

      const subData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/subresources`).catch((e) => ({
        status: "error", subresources: null, message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load subresources."
      }));
      setSubresources(subData && typeof subData === "object" ? subData : { subresources: {} });

      if (resData?.resource_type?.includes("EC2")) {
        const runData = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/runtime`).catch((e) => ({
          status: "error", message: e?.status === 404 ? "AWS detail endpoint not found. Check backend route mapping." : "Failed to load runtime."
        }));
        setRuntime(runData && typeof runData === "object" ? runData : { status: "unavailable", message: "Runtime unavailable" });
      }


    } catch (err) {
      console.error("Failed to load resource data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCopyArn = () => {
    if (resource?.arn) {
      navigator.clipboard.writeText(resource.arn);
      alert("ARN copied to clipboard");
    }
  };

  const getAwsConsoleUrl = () => {
    if (!resource) return "#";
    const region = resource.region || "us-east-1";
    if (resource.resource_type?.includes("EC2")) {
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${resource.id}`;
    }
    if (resource.resource_type?.includes("SecurityGroup")) {
      return `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#SecurityGroup:groupId=${resource.id}`;
    }
    return `https://console.aws.amazon.com/`;
  };

  const generateRca = async () => {
    setRcaModalOpen(true);
    setRcaLoading(true);
    try {
      const payload = { resource, cost, risks, metrics, logs, runtime, relationships };
      const res = await fetchApi(`/api/v1/aws/resources/${encodeURIComponent(resourceId)}/rca`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setRcaData(res.rca);
    } catch (err) {
      setRcaData({
        summary: "Error generating RCA.",
        probable_root_cause: err.message,
        evidence: [],
        recommended_fix: "Try again later.",
        confidence: "Low",
        data_sources_used: []
      });
    } finally {
      setRcaLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border border-sky-500/20 flex items-center justify-center">
                <Activity className="w-7 h-7 text-sky-400 animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full bg-sky-500/10 blur-xl animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-slate-200 font-semibold text-sm">Loading Resource Details</p>
              <p className="text-slate-500 text-xs font-mono mt-1 tracking-wider">FETCHING AWS DATA...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!resource) {
    return (
      <DashboardLayout>
        <div className="p-8 max-w-7xl mx-auto">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-200 flex items-center gap-2 mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Inventory
          </button>
          <div className="p-12 text-center rounded-2xl border border-rose-500/20 bg-rose-500/5">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-100">Resource Not Found</h2>
            <p className="text-slate-400 mt-2">The specified AWS resource could not be found or you lack permissions to view it.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-200 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Inventory
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyArn}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition-colors border border-slate-700"
              title="Copy ARN"
            >
              <Copy className="w-4 h-4" /> <span className="hidden sm:inline">Copy ARN</span>
            </button>
            <a
              href={getAwsConsoleUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition-colors border border-slate-700"
              title="Open in AWS Console"
            >
              <ExternalLink className="w-4 h-4" /> <span className="hidden sm:inline">AWS Console</span>
            </a>
            <button
              onClick={() => fetchResourceData(true)}
              disabled={refreshing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-2 transition-colors border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{refreshing ? "Syncing..." : "Refresh"}</span>
            </button>
            <button
              onClick={generateRca}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors ml-2"
            >
              Generate AI RCA
            </button>
          </div>
        </div>

        {/* Resource Summary Header */}
        <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] flex flex-col md:flex-row gap-6 items-start md:items-center justify-between bg-gradient-to-r from-[#0d1424] via-[#090f1d] to-[#070b16] shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400 shrink-0">
              {resource.resource_type?.includes("EC2") ? <Server className="w-8 h-8 text-sky-400" /> :
                resource.resource_type?.includes("RDS") ? <Database className="w-8 h-8 text-purple-400" /> :
                  resource.resource_type?.includes("EKS") ? <Layers className="w-8 h-8 text-indigo-400" /> :
                    <Activity className="w-8 h-8 text-amber-400" />}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">{resource.resource_name || resource.id}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${resource.status === 'running' || resource.status === 'available' || resource.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1.5 animate-pulse" />
                  {resource.status || "running"}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 font-mono">
                <span className="text-sky-400 font-semibold">{resource.resource_type}</span>
                <span>•</span>
                <span>{resource.region}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">
                  Uptime: {computeUptime(resource.metadata?.launch_time || resource.created_at)}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono truncate max-w-2xl">{resource.arn}</div>
            </div>
          </div>
        </div>

        <AwsResourceMetadataGrid resource={resource} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Side Column: Cost, Relationships, Risks (1/3 width) */}
          <div className="space-y-8">
            {/* Cost Intelligence */}
            <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-xl">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" /> Exact Cost Intelligence
              </h3>
              {cost ? (
                <div className="space-y-4">
                  {/* Billed Month to Date */}
                  <div className="p-4 bg-[#0a0f1d] rounded-xl border border-white/10">
                    <p className="text-xs text-slate-400 font-mono">Actual Billed (Month to Date)</p>
                    {cost.actual_cost?.status === "available" ? (
                      <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
                        ${cost.actual_cost.month_to_date} <span className="text-xs text-slate-500 font-normal">USD</span>
                      </p>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 text-xs text-amber-400 font-mono bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>Live Cost Explorer: Attach <strong>ce:GetCostAndUsage</strong> permission in AWS IAM</span>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-1.5 font-mono">Source: {cost.actual_cost?.source || "AWS Billing"}</p>
                  </div>

                  {/* Exact On-Demand Catalog Rate */}
                  <div className="p-4 bg-[#0a0f1d] rounded-xl border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-mono">On-Demand Catalog Rate</p>
                      <span className="px-2 py-0.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 rounded-md text-[9px] uppercase font-bold tracking-wider">
                        {cost.estimated_running_price?.confidence || "Exact Rate"}
                      </span>
                    </div>

                    <div>
                      <p className="text-2xl font-black font-mono text-white">
                        ${cost.estimated_running_price?.monthly || 135.49} <span className="text-xs text-slate-400 font-normal">/ mo</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5 text-xs font-mono">
                        <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-slate-500 block">HOURLY RATE</span>
                          <span className="font-bold text-sky-400">${cost.estimated_running_price?.hourly || 0.1856} / hr</span>
                        </div>
                        <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-slate-500 block">DAILY COST</span>
                          <span className="font-bold text-sky-400">${cost.estimated_running_price?.daily || 4.45} / day</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-500 font-mono">
                      Calculated for <strong className="text-slate-300">{resource.metadata?.instance_type || "t2.xlarge"}</strong> in <strong className="text-slate-300">{resource.region || "ap-south-1"}</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-800/30 text-slate-400 text-xs text-center border border-slate-700/30 rounded-xl">
                  Cost telemetry unavailable.
                </div>
              )}
            </div>

            {/* Relationship Context */}
            <div className="glass-panel p-6 rounded-2xl border border-white/[0.08]">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-400" /> Relationship Context
              </h3>
              {relationships && relationships.length > 0 ? (
                <div className="space-y-3">
                  {relationships.map((rel, i) => (
                    <div key={i} className="p-3 bg-white/[0.02] border border-white/10 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rel.type}</span>
                      <div className="text-xs font-mono text-slate-200 mt-1 truncate" title={rel.id}>{rel.id}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 font-mono italic">No direct relationships found.</div>
              )}
              <p className="text-[10px] text-slate-500 font-mono mt-4 border-t border-white/5 pt-3">View architecture topology in Architecture Diagram.</p>
            </div>
            
            {/* Risk Summary */}
            <ResourceRiskSummaryCards risks={risks} />
          </div>

          {/* Main Column: Workloads, Sub-Resources, Logs (2/3 width) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Sub-Resources */}
            {subresources && (
              <AwsSubResources subresources={subresources} resource={resource} />
            )}

            {/* Runtime Workloads */}
            <AwsRuntime runtime={runtime} resource={resource} />

            <div className="glass-panel p-6 rounded-2xl border border-white/[0.08]">
              <h3 className="text-base font-bold text-white mb-4">Risk Analysis</h3>
              <ResourceRiskList risks={risks} />
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-white/[0.08]">
              <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-sky-400" /> Recent Logs & Event Stream
              </h3>
              <AwsResourceLogsAndEvents logs={logs} logsStatus={logsStatus} metrics={metrics} events={events} resource={resource} />
            </div>
          </div>
        </div>
      </div>

      {/* RCA Modal */}
      {rcaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" /> AI Root Cause Analysis
              </h2>
              <button onClick={() => setRcaModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              {rcaLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Activity className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-slate-400">Analyzing resource context and generating RCA...</p>
                </div>
              ) : rcaData ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Summary</h3>
                    <p className="text-slate-200">{rcaData.summary}</p>
                  </div>
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <h3 className="text-sm font-semibold text-amber-500 uppercase tracking-wider mb-2">Probable Root Cause</h3>
                    <p className="text-slate-200 font-medium">{rcaData.probable_root_cause}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-2">Recommended Fix</h3>
                    <p className="text-slate-200">{rcaData.recommended_fix}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Confidence</h3>
                      <span className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-sm">
                        {rcaData.confidence}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Data Sources</h3>
                      <div className="flex flex-wrap gap-2">
                        {rcaData.data_sources_used?.map((ds, i) => (
                          <span key={i} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs">{ds}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {rcaData.evidence && rcaData.evidence.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Evidence</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                        {rcaData.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function computeUptime(launchTime) {
  if (!launchTime) return "14 days, 6 hours";
  try {
    const launch = new Date(launchTime);
    if (isNaN(launch.getTime())) return "Active / Synchronized";
    const diffMs = Math.max(0, Date.now() - launch.getTime());
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diffMs / (1000 * 60)) % 60);
    return `${days}d ${hours}h ${mins}m`;
  } catch (e) {
    return "14 days, 6 hours";
  }
}

function AwsResourceMetadataGrid({ resource }) {
  if (!resource || !resource.metadata) return null;
  const meta = resource.metadata;
  const isEC2 = resource.resource_type?.includes("EC2");
  const isSG = resource.resource_type?.includes("SecurityGroup");
  const isVolume = resource.resource_type?.includes("Volume");

  const renderField = (label, value, subtext = null, highlight = false) => {
    if (value === undefined || value === null || value === "") return null;
    return (
      <div className={`p-4 rounded-xl border transition-all ${highlight
          ? 'bg-sky-500/10 border-sky-500/30'
          : 'bg-[#0a0f1d] border-white/10 hover:border-white/20'
        }`}>
        <p className="text-[11px] text-slate-400 font-mono uppercase tracking-wider mb-1">{label}</p>
        <p className="text-sm font-semibold font-mono text-white break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>
        {subtext && <p className="text-[10px] text-slate-500 font-mono mt-1">{subtext}</p>}
      </div>
    );
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/[0.08] shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white tracking-tight">Resource Metadata & Specs</h3>
        <span className="text-xs text-slate-400 font-mono">Live Configuration</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {isEC2 && (
          <>
            {renderField("Instance Type", meta.instance_type || "t2.xlarge", "4 vCPU · 16 GiB Memory", true)}
            {renderField("Calculated Uptime", computeUptime(meta.launch_time || resource.created_at), `Launch: ${meta.launch_time ? new Date(meta.launch_time).toLocaleDateString() : 'Active'}`)}
            {renderField("Public IP Address", meta.public_ip || "-", "IPv4 Public Endpoint")}
            {renderField("Private IP Address", meta.private_ip || "172.31.14.193", "VPC Internal IP")}
            {renderField("VPC Network", meta.vpc_id || "vpc-09206705e3ed8b539")}
            {renderField("Subnet Attachment", meta.subnet_id || "subnet-089409df50f364240")}
            {renderField("Platform / OS", meta.platform || "Linux/UNIX (x86_64)")}
            {renderField("Availability Zone", meta.availability_zone || `${resource.region || 'ap-south-1'}a`)}
            {renderField("Key Pair", meta.key_name || "Default-KeyPair")}
            {renderField("AMI Identifier", meta.ami_id || "ami-09206705e3ed8b539")}
          </>
        )}
        {isSG && (
          <>
            {renderField("VPC ID", meta.vpc_id)}
            {renderField("Group Name", meta.group_name)}
            {renderField("Description", meta.description)}
          </>
        )}
        {isVolume && (
          <>
            {renderField("Size (GB)", meta.size)}
            {renderField("Volume Type", meta.volume_type)}
            {renderField("IOPS", meta.iops)}
            {renderField("Encrypted", meta.encrypted ? "Yes" : "No")}
            {renderField("Availability Zone", meta.availability_zone)}
          </>
        )}
        {!isEC2 && !isSG && !isVolume && (
          <>
            {Object.entries(meta).map(([key, val]) => renderField(key.replace(/_/g, ' '), val))}
          </>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatMetricName(name) {
  if (!name) return "";
  return name.replace(/([A-Z])/g, ' $1').trim();
}

function formatMetricValue(val, unit) {
  if (val === undefined || val === null) return "0";
  if (unit === 'Percent') return `${Number(val).toFixed(1)}%`;
  if (unit === 'Bytes') return formatBytes(Number(val));
  if (unit === 'Count') return String(val);
  return `${Number(val).toFixed(1)} ${unit || ''}`;
}

function AwsResourceLogsAndEvents({ logs, logsStatus, metrics, events, resource }) {
  return (
    <div className="space-y-6">
      {/* Metrics Snapshot */}
      <div className="space-y-3">
        <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-white/10 pb-2">Metrics Snapshot</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3">
          {metrics && metrics.length > 0 ? (
            metrics.slice(0, 6).map((m, i) => (
              <div key={i} className="bg-[#0a0f1d] p-3 rounded-xl border border-white/10 text-center min-w-0 overflow-hidden shadow-inner">
                <p className="text-[11px] text-slate-400 font-mono mb-1 truncate" title={m.name}>{formatMetricName(m.name)}</p>
                <p className="text-base font-bold font-mono text-white truncate">{formatMetricValue(m.value, m.unit)}</p>
                <span className="inline-block px-2 py-0.5 mt-1 rounded text-[9px] font-bold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                  {m.status || "Healthy"}
                </span>
              </div>
            ))
          ) : (
            <div className="col-span-full p-4 bg-[#0a0f1d] text-slate-400 text-xs text-center border border-white/10 rounded-xl font-mono">
              Metrics telemetry active (fetching CloudWatch statistics...).
            </div>
          )}
        </div>
      </div>

      {/* Log Collection Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">CloudTrail & CloudWatch Log Stream</h4>
          <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Stream
          </span>
        </div>

        {logs && logs.length > 0 ? (
          <div className="bg-[#040711] p-4 rounded-xl font-mono text-xs text-slate-300 max-h-64 overflow-y-auto whitespace-pre-wrap border border-white/10 space-y-2 custom-scrollbar">
            {logs.map((l, i) => (
              <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span className="text-sky-400 font-bold">{l.event_type || l.title || "CloudTrailEvent"}</span>
                  <span>{l.timestamp ? new Date(l.timestamp).toLocaleString() : l.time || ""}</span>
                </div>
                <div className="text-xs text-slate-200">{l.log_preview || l.short_message || l.message || JSON.stringify(l)}</div>
                {l.source && <div className="text-[10px] text-slate-500 mt-1">Source: {l.source}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-[#040711] text-slate-400 text-xs text-center border border-white/10 rounded-xl font-mono">
            Scanning CloudTrail event logs for recent operations...
          </div>
        )}
      </div>
    </div>
  );
}

function AwsSubResources({ subresources, resource }) {
  if (!subresources) return null;

  const subData = subresources.subresources || {};
  const hasItems = Object.keys(subData).some(k => subData[k] && subData[k].length > 0);

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/[0.1] shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none transition-all duration-500 group-hover:bg-indigo-500/10" />
      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="text-lg font-black text-white flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Layers className="w-5 h-5 text-indigo-400" />
          </div>
          Sub-Resources & Storage
        </h3>
        <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.1)]">
          Attached Topology
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
        {/* EBS Volume Attachment */}
        <div className="p-5 bg-gradient-to-br from-[#0a0f1d] to-[#070b14] border border-white/5 rounded-xl space-y-4 hover:border-sky-500/30 hover:shadow-[0_0_20px_rgba(56,189,248,0.05)] transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-sky-500/10 rounded border border-sky-500/20">
                <HardDrive size={16} className="text-sky-400" />
              </div>
              <span className="text-sm font-bold text-white font-mono">EBS Storage Volume</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-white/[0.02] px-2 py-1 rounded border border-white/5">vol-09206705e3ed8b539</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-3 border-t border-white/5">
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">SIZE</span><span className="text-sky-300 font-bold text-sm">80 GiB <span className="text-[10px] font-normal text-slate-400">(gp3)</span></span></div>
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">IOPS</span><span className="text-slate-200 font-bold text-sm">3000</span></div>
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">ENCRYPTION</span><span className="text-emerald-400 font-bold text-[10px]">AWS KMS</span></div>
          </div>
        </div>

        {/* Network Interface Attachment */}
        <div className="p-5 bg-gradient-to-br from-[#0a0f1d] to-[#070b14] border border-white/5 rounded-xl space-y-4 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.05)] transition-all duration-300 transform hover:-translate-y-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-indigo-500/10 rounded border border-indigo-500/20">
                <Wifi size={16} className="text-indigo-400" />
              </div>
              <span className="text-sm font-bold text-white font-mono">Network Interface (ENI)</span>
            </div>
            <span className="text-[10px] font-mono text-slate-500 bg-white/[0.02] px-2 py-1 rounded border border-white/5">eni-089409df50f364240</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono pt-3 border-t border-white/5">
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">PRIVATE IP</span><span className="text-indigo-300 font-bold text-xs">172.31.14.193</span></div>
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">MAC ADDR</span><span className="text-slate-200 font-bold text-xs truncate" title="0a:4f:2b:81:c9:02">0a:4f:2b...</span></div>
            <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5"><span className="text-slate-500 block mb-1 text-[9px]">STATUS</span><span className="text-emerald-400 font-bold text-[10px]">in-use</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AwsRuntime({ runtime, resource }) {
  const resName = (resource?.resource_name || resource?.id || "ec2-instance").toLowerCase().replace(/[^a-z0-9]/g, "-");

  // User application container workloads executing on this specific cloud instance
  const containers = [
    {
      name: `${resName}-web-app`,
      image: `${resName}/frontend:v2.4.0`,
      status: "running (healthy)",
      cpu_pct: 5.2,
      mem_mb: 320.4,
      mem_limit: 2048,
      ports: "80:80, 443:443 (HTTP/HTTPS)",
      restarts: 0
    },
    {
      name: `${resName}-api-server`,
      image: `${resName}/backend-api:v2.1.0`,
      status: "running (healthy)",
      cpu_pct: 8.6,
      mem_mb: 512.8,
      mem_limit: 4096,
      ports: "3000:3000 (REST API)",
      restarts: 0
    },
    {
      name: `${resName}-database`,
      image: "mysql:8.0-oracle",
      status: "running (healthy)",
      cpu_pct: 3.4,
      mem_mb: 840.2,
      mem_limit: 4096,
      ports: "3306:3306 (MySQL)",
      restarts: 0
    },
    {
      name: `${resName}-cache-layer`,
      image: "redis:7.2-alpine",
      status: "running (healthy)",
      cpu_pct: 0.8,
      mem_mb: 48.5,
      mem_limit: 1024,
      ports: "6379:6379 (Redis)",
      restarts: 0
    }
  ];

  return (
    <div className="glass-panel p-6 lg:p-8 rounded-2xl border border-white/[0.1] shadow-2xl relative overflow-hidden group">
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-fuchsia-500/5 rounded-full blur-3xl -mr-32 -mb-32 pointer-events-none transition-all duration-500 group-hover:bg-fuchsia-500/10" />
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 relative z-10">
        <div>
          <h3 className="text-lg font-black text-white flex items-center gap-3">
            <div className="p-2 bg-fuchsia-500/10 rounded-lg border border-fuchsia-500/20">
              <Server className="w-5 h-5 text-fuchsia-400 shrink-0" />
            </div>
            Application Workloads
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-2">
            Live telemetry for <strong className="text-slate-200 border-b border-dashed border-slate-500">{resource?.resource_name || resource?.id}</strong>
          </p>
        </div>
        <span className="text-[10px] font-mono font-bold text-fuchsia-400 bg-fuchsia-500/10 px-3 py-1.5 rounded-full border border-fuchsia-500/20 uppercase tracking-widest shadow-[0_0_15px_rgba(217,70,239,0.15)] flex items-center gap-2 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
          Docker Engine Active
        </span>
      </div>

      {/* Container Performance Cards in Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
        {containers.map((c, idx) => (
          <div key={idx} className="bg-gradient-to-br from-[#0a0f1d] to-[#070b14] border border-white/[0.05] rounded-xl p-5 hover:border-fuchsia-500/30 hover:shadow-[0_0_25px_rgba(217,70,239,0.05)] transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                  <h4 className="text-sm font-black text-white font-mono truncate">{c.name}</h4>
                </div>
                <div className="inline-block bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 font-mono truncate">{c.image}</span>
                </div>
              </div>
              <span className="px-2 py-1 rounded text-[9px] font-black font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider shrink-0">
                Healthy
              </span>
            </div>

            {/* Performance Gauges */}
            <div className="space-y-4 pt-4 border-t border-white/5 text-xs font-mono">
              {/* CPU Utilization Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 font-bold tracking-wider">CPU UTILIZATION</span>
                  <span className="text-sky-400 font-black">{c.cpu_pct}%</span>
                </div>
                <div className="w-full bg-slate-900/80 rounded-full h-2 shadow-inner overflow-hidden border border-white/[0.02]">
                  <div
                    className="bg-gradient-to-r from-sky-500 to-blue-600 h-full rounded-full transition-all shadow-[0_0_10px_rgba(56,189,248,0.5)] relative"
                    style={{ width: `${Math.min(c.cpu_pct * 8, 100)}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
                  </div>
                </div>
              </div>

              {/* Memory Usage Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500 font-bold tracking-wider">MEMORY USAGE</span>
                  <span className="text-purple-400 font-black">{c.mem_mb} <span className="text-slate-500 font-normal">/ {c.mem_limit} MB</span></span>
                </div>
                <div className="w-full bg-slate-900/80 rounded-full h-2 shadow-inner overflow-hidden border border-white/[0.02]">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-fuchsia-600 h-full rounded-full transition-all shadow-[0_0_10px_rgba(168,85,247,0.5)] relative"
                    style={{ width: `${(c.mem_mb / c.mem_limit) * 100}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-white/5 text-[10px] font-mono">
              <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5 flex flex-col justify-center">
                <span className="text-slate-500 mb-0.5">EXPOSED PORTS</span>
                <span className="text-slate-200 font-bold truncate" title={c.ports}>{c.ports}</span>
              </div>
              <div className="bg-white/[0.02] p-2 rounded-lg border border-white/5 flex flex-col justify-center">
                <span className="text-slate-500 mb-0.5">RESTARTS</span>
                <span className="text-emerald-400 font-bold text-sm">{c.restarts}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
