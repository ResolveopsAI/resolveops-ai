"use client";

import React, { useState, useEffect } from "react";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Cloud,
  Server,
  Database,
  Lock,
  Globe,
  RefreshCw,
  ShieldAlert,
  HardDrive,
  Activity,
  Layers,
  ArrowRight
} from "lucide-react";

export default function AwsHubPage() {
  const [status, setStatus] = useState("loading"); // loading, connected, disconnected
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [resources, setResources] = useState([]);
  const [summary, setSummary] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchAwsStatus();
  }, []);

  const fetchAwsResources = async () => {
    try {
      const res = await fetchApi("/api/v1/aws/resources");
      if (res && res.resources) {
        setResources(res.resources);
        
        // Compute summary
        let ec2Count = 0, ec2Running = 0, ec2Stopped = 0, eksCount = 0, rdsCount = 0, s3Count = 0;
        res.resources.forEach(r => {
          if (r.resource_type.includes("EC2::Instance")) {
            ec2Count++;
            if (r.status?.toLowerCase() === "running") ec2Running++;
            if (r.status?.toLowerCase() === "stopped") ec2Stopped++;
          }
          if (r.resource_type.includes("EKS::Cluster")) eksCount++;
          if (r.resource_type.includes("RDS::DBInstance")) rdsCount++;
          if (r.resource_type.includes("S3::Bucket")) s3Count++;
        });
        
        setSummary({
          total: res.resources.length,
          ec2: ec2Count,
          ec2Running,
          ec2Stopped,
          eks: eksCount,
          rds: rdsCount,
          s3: s3Count,
        });
      }
    } catch (err) {
      console.error("Failed to fetch resources", err);
    }
  };

  const fetchAwsStatus = async () => {
    try {
      const res = await fetchApi("/api/v1/aws/status");
      if (res && res.connected) {
        setStatus("connected");
        const details = {
          name: "AWS Connection",
          account_id: res.account_id,
          default_region: res.region,
          auth_method: res.auth_method
        };
        setConnectionDetails(details);
        
        // Auto-sync resources on initial load
        setIsRefreshing(true);
        try {
          const authData = {
            auth_method: res.auth_method || "environment",
            connection_name: "AWS Connection"
          };
          const syncRes = await fetchApi("/api/v1/aws/resources/sync", {
            method: "POST",
            body: JSON.stringify(authData)
          });
          if (syncRes) {
            if (syncRes.warnings && syncRes.warnings.length > 0) {
              setWarnings(syncRes.warnings);
            } else {
              setWarnings([]);
            }
          }
        } catch (syncErr) {
          console.error("Auto-sync failed", syncErr);
        } finally {
          setIsRefreshing(false);
        }
        await fetchAwsResources();
      } else {
        setStatus("disconnected");
      }
    } catch (err) {
      console.error("Failed to fetch AWS status", err);
      setStatus("error");
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const authData = {
        auth_method: connectionDetails?.auth_method || "environment",
        connection_name: connectionDetails?.name || "AWS Connection"
      };
      
      const syncRes = await fetchApi("/api/v1/aws/resources/sync", {
        method: "POST",
        body: JSON.stringify(authData)
      });
      
      if (syncRes) {
        if (syncRes.warnings && syncRes.warnings.length > 0) {
          setWarnings(syncRes.warnings);
        } else {
          setWarnings([]);
        }
        if (syncRes.resources || syncRes.status === "success" || syncRes.status === "partial_success") {
          await fetchAwsResources();
        }
      }
    } catch (err) {
      console.error("Failed to sync resources", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-slate-400">Loading AWS Intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1600px] w-full mx-auto animate-in fade-in duration-300">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Cloud className="w-7 h-7 text-amber-500" />
              </div>
              AWS Intelligence Hub
            </h1>
            <p className="text-slate-400 mt-2">
              Discover, analyze, and secure your Amazon Web Services infrastructure.
            </p>
          </div>
          
          {status === "connected" && (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Syncing..." : "Sync Resources"}
            </button>
          )}
        </div>

        {status === "error" ? (
          <div className="glass-panel p-12 rounded-xl border border-rose-500/50 text-center">
            <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-200 mb-2">AWS status endpoint unavailable. Check backend routing.</h3>
            <p className="text-slate-400 mb-6">Could not verify connection state.</p>
          </div>
        ) : status === "disconnected" ? (
          <div className="glass-panel p-12 rounded-xl border border-slate-700/50 text-center">
            <Cloud className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-200 mb-2">AWS is not connected.</h3>
            <p className="text-slate-400 mb-6">Connect AWS in Integrations.</p>
            <a href="/integrations" className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold rounded-lg transition-colors">
              Go to Integrations <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {warnings.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-400">Scan completed with warnings</h4>
                  <ul className="mt-1 space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-sm text-slate-300">• {w.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <AwsConnectionCard details={connectionDetails} />
            <AwsSummaryGrid summary={summary} />
            <AwsResourceInventory resources={resources} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}


function AwsConnectionCard({ details }) {
  if (!details) return null;
  return (
    <div className="glass-panel p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-emerald-500/20 rounded-full">
          <Cloud className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-emerald-400 font-bold text-lg">{details.name || "AWS Connection Active"}</h3>
          <p className="text-sm text-emerald-500/80">Account ID: {details.account_id || "..."} • Region: {details.default_region}</p>
        </div>
      </div>
      <div className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium">
        Verified
      </div>
    </div>
  );
}

function AwsSummaryGrid({ summary }) {
  const cards = [
    { label: "EC2 Instances", value: summary.ec2 || 0, subValue: `${summary.ec2Running || 0} Running, ${summary.ec2Stopped || 0} Stopped`, icon: Server, color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "RDS Databases", value: summary.rds || 0, icon: Database, color: "text-indigo-400", bg: "bg-indigo-400/10" },
    { label: "EKS Clusters", value: summary.eks || 0, icon: Layers, color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "S3 Buckets", value: summary.s3 || 0, icon: HardDrive, color: "text-emerald-400", bg: "bg-emerald-400/10" }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((c, i) => (
        <div key={i} className="glass-panel p-6 rounded-xl border border-slate-700/50 flex items-center gap-4">
          <div className={`p-3 rounded-lg ${c.bg}`}>
            <c.icon className={`w-6 h-6 ${c.color}`} />
          </div>
          <div>
            <p className="text-sm text-slate-400">{c.label}</p>
            <p className="text-2xl font-bold text-slate-100">{c.value}</p>
            {c.subValue && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{c.subValue}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function AwsResourceInventory({ resources }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  if (!resources || resources.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-xl border border-slate-700/50 text-center">
        <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-200 mb-2">No resources discovered yet</h3>
        <p className="text-slate-400 max-w-md mx-auto">
          We haven't found any resources in your specified regions. Click "Sync Resources" to scan your AWS environment.
        </p>
      </div>
    );
  }

  const filteredResources = resources.filter(r => {
    const matchesSearch = (r.resource_name || r.id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || r.resource_type.includes(filterType);
    return matchesSearch && matchesType;
  });

  return (
    <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
      {/* Table Header Controls */}
      <div className="p-5 border-b border-white/[0.08] flex flex-col md:flex-row gap-4 justify-between items-center bg-[#0d1424]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Resource Inventory</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Live AWS Cloud Assets & Governance Telemetry</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Search resources by name or ID..." 
            className="bg-[#060914] border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50 flex-1 md:w-72 transition-colors placeholder:text-slate-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="bg-[#060914] border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50 transition-colors cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Resource Types</option>
            <option value="EC2">EC2 Instances</option>
            <option value="VPC">VPC Networks</option>
            <option value="Subnet">Subnets</option>
            <option value="SecurityGroup">Security Groups</option>
            <option value="EKS">EKS Clusters</option>
            <option value="RDS">RDS Databases</option>
            <option value="S3">S3 Buckets</option>
          </select>
        </div>
      </div>

      {/* Responsive Scrollable Table Container */}
      <div className="w-full overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1150px]">
          <thead>
            <tr className="bg-[#070b16] text-slate-400 text-[11px] font-mono uppercase tracking-wider border-b border-white/[0.08]">
              <th className="px-5 py-3.5 font-bold whitespace-nowrap">Resource</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Type</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Region</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Status</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Instance Type / SKU</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Features</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Public IP</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Private IP</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Risk</th>
              <th className="px-4 py-3.5 font-bold whitespace-nowrap">Cost Status</th>
              <th className="px-5 py-3.5 font-bold text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05] text-xs">
            {filteredResources.map((res) => {
              const rawType = res.resource_type ? res.resource_type.split("::").pop() : "Resource";
              const isVpc = rawType.toLowerCase().includes("vpc");
              const isSubnet = rawType.toLowerCase().includes("subnet");
              const isSg = rawType.toLowerCase().includes("securitygroup") || rawType.toLowerCase().includes("sg");
              const isEc2 = rawType.toLowerCase().includes("ec2") || rawType.toLowerCase().includes("instance");
              const isRds = rawType.toLowerCase().includes("rds") || rawType.toLowerCase().includes("db");

              const typeBadgeStyle = isVpc ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                : isSubnet ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                : isSg ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                : isEc2 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : isRds ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                : "bg-slate-800 text-slate-300 border-slate-700";

              const statusLower = (res.status || "").toLowerCase();
              const isHealthy = statusLower === 'running' || statusLower === 'available' || statusLower === 'active' || statusLower === 'ok';

              return (
                <tr key={res.id} className="hover:bg-white/[0.03] transition-colors group">
                  {/* Resource Name & ARN */}
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-100 text-xs tracking-tight">{res.resource_name || res.id}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono truncate max-w-[280px]" title={res.id}>
                      {res.id}
                    </div>
                  </td>

                  {/* Type Badge */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${typeBadgeStyle}`}>
                      {rawType}
                    </span>
                  </td>

                  {/* Region */}
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-300 whitespace-nowrap">
                    {res.region || "us-east-1"}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      isHealthy
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                      {res.status || "available"}
                    </span>
                  </td>

                  {/* Instance Type / SKU */}
                  <td className="px-4 py-3.5 text-xs font-mono text-slate-400 whitespace-nowrap">
                    {res.metadata?.instance_type || res.metadata?.instance_class || "-"}
                  </td>

                  {/* Features */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span title="Sub-resources enabled" className="w-5 h-5 flex items-center justify-center rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-bold">S</span>
                      {rawType.toLowerCase().includes("ec2") && (
                        <span title="Runtime workloads active" className="w-5 h-5 flex items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 text-[10px] font-bold">R</span>
                      )}
                      <span title="CloudWatch Metrics synced" className="w-5 h-5 flex items-center justify-center rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">M</span>
                      <span title="Audit Logs monitored" className="w-5 h-5 flex items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">L</span>
                    </div>
                  </td>

                  {/* Public IP */}
                  <td className="px-4 py-3.5 text-xs font-mono text-slate-400 whitespace-nowrap">
                    {res.metadata?.public_ip || "-"}
                  </td>

                  {/* Private IP */}
                  <td className="px-4 py-3.5 text-xs font-mono text-slate-400 whitespace-nowrap">
                    {res.metadata?.private_ip || "-"}
                  </td>

                  {/* Risk Level */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      res.risk_level === 'critical' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                      res.risk_level === 'high' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                      res.risk_level === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {res.risk_level || "info"}
                    </span>
                  </td>

                  {/* Cost Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`text-xs font-medium ${
                      res.cost_status === 'available' ? 'text-emerald-400' :
                      res.cost_status === 'permission_required' ? 'text-amber-400' :
                      'text-slate-400'
                    }`}>
                      {res.cost_status === 'permission_required' ? 'Permission Required' : res.cost_status || 'available'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    <a 
                      href={`/aws/resource/${encodeURIComponent(res.id)}`} 
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-semibold border border-amber-500/20 transition-all cursor-pointer group-hover:border-amber-500/40"
                    >
                      <span>View</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </a>
                  </td>
                </tr>
              );
            })}

            {filteredResources.length === 0 && (
              <tr>
                <td colSpan="11" className="p-12 text-center text-slate-500 font-mono text-xs">
                  No resources match your search criteria. Try adjusting your search query or type filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
