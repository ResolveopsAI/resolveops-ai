"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { GitBranch, Server, Database, Activity, Key, Eye, EyeOff, CheckCircle, ArrowRight, ShieldCheck, Link2 } from "lucide-react";
import { fetchApi, getUserRole } from "@/lib/api";
import Link from "next/link";

export default function IntegrationsManager() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ 
    github: false, aws: false, azure: false
  });
  const [githubDetails, setGithubDetails] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [successToast, setSuccessToast] = useState({ show: false, title: "", message: "" });
  
  // Modal Fields
  const [githubPat, setGithubPat] = useState("");
  const [awsAccessKey, setAwsAccessKey] = useState("");
  const [awsSecretKey, setAwsSecretKey] = useState("");
  const [awsSessionToken, setAwsSessionToken] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsErrorModal, setAwsErrorModal] = useState({ show: false, code: "", message: "" });
  const [azureTenant, setAzureTenant] = useState("");
  const [azureClient, setAzureClient] = useState("");
  const [azureSecret, setAzureSecret] = useState("");
  const [showAzureSecret, setShowAzureSecret] = useState(false);
  const [azureScope, setAzureScope] = useState("account");
  const [azureSubscription, setAzureSubscription] = useState("");
  const [githubEmail, setGithubEmail] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const handleClearData = async () => {
    setClearingData(true);
    try {
      await fetchApi("/api/v1/admin/clear-data", { method: "DELETE" });
      setShowClearDataModal(false);
      setSuccessToast({ show: true, title: "Data Cleared", message: "All operational data was successfully deleted." });
      setTimeout(() => setSuccessToast({ show: false, title: "", message: "" }), 3000);
    } catch (e) {
      alert("Failed to clear data: " + e.message);
    } finally {
      setClearingData(false);
    }
  };

  const loadIntegrations = () => {
    fetchApi("/api/v1/integrations/status")
      .then((data) => {
        if (data) {
          setStatus({
            github: data?.github?.connected ?? false,
            aws: data?.aws?.connected ?? false,
            azure: data?.azure?.connected ?? false
          });
          if (data?.github?.username) {
            setGithubDetails(data.github.username);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    loadIntegrations();
  }, [router]);

  const handleToggleConnect = async (service, isConnect, credentials) => {
    // AWS specific validation before sending
    if (service === "aws" && isConnect) {
      if (!credentials.access_key_id) {
        setAwsErrorModal({ show: true, code: "ValidationError", message: "Access Key ID is required." });
        return;
      }
      if (!credentials.secret_access_key) {
        setAwsErrorModal({ show: true, code: "ValidationError", message: "Secret Access Key is required." });
        return;
      }
      if (!credentials.region) {
        setAwsErrorModal({ show: true, code: "ValidationError", message: "Region is required." });
        return;
      }
      const isPlaceholder = /^(•+|-+|\*+)$/.test(credentials.secret_access_key) || credentials.secret_access_key === "empty string";
      if (isPlaceholder) {
        setAwsErrorModal({ show: true, code: "ValidationError", message: "Please enter your actual Secret Access Key, not a masked placeholder." });
        return;
      }
      if (credentials.access_key_id.startsWith("ASIA") && !credentials.session_token) {
        setAwsErrorModal({ show: true, code: "ValidationError", message: "A Session Token is required for temporary AWS credentials (ASIA...)." });
        return;
      }
    }

    try {
      const data = await fetchApi("/api/v1/integrations/connect", {
        method: "POST",
        body: JSON.stringify({
          service,
          connected: isConnect,
          credentials
        })
      });
      if (data?.integrations) {
        setStatus({
          github: !!data.integrations.github,
          aws: !!data.integrations.aws,
          azure: !!data.integrations.azure
        });
        if (data.integrations.github_details !== undefined) {
          setGithubDetails(data.integrations.github_details);
        }
      }
      if (isConnect) {
        const title = service === "github" ? "GitHub Connected" : "Connection Successful";
        const msg = service === "github" && data?.integrations?.github_details 
          ? `Successfully authenticated as ${data.integrations.github_details}` 
          : `Successfully connected top-level ${service.toUpperCase()} account`;
          
        setSuccessToast({ show: true, title, message: msg });
        setTimeout(() => setSuccessToast(prev => ({ ...prev, show: false })), 4000);
      }
      setActiveModal(null);
      // Reset inputs
      setGithubPat("");
      setAwsAccessKey("");
      setAwsSecretKey("");
      setAzureSecret("");
      setAzureSubscription("");
      setGithubEmail("");
      setGithubToken("");
    } catch (err) {
      let message =
        err?.message ||
        err?.detail ||
        err?.error ||
        err?.status ||
        err;
        
      if (typeof message !== "string") {
        try {
          message = JSON.stringify(message);
        } catch(e) {
          message = String(message);
        }
      }
      
      if (message.includes("[object Object]")) {
        try {
          if (err instanceof Error) {
            message = JSON.stringify({ name: err.name, message: err.message, stack: err.stack });
          } else {
            message = JSON.stringify(err);
          }
        } catch (e) {
          message = "An unknown error occurred during validation.";
        }
      }
        
      if (process.env.NODE_ENV === "development") {
        console.debug("Connection error:", err);
      }
      
      if (service === "aws") {
        const errCode = err?.detail?.code || err?.code || "AuthenticationError";
        const errMsg = err?.detail?.details || err?.detail?.error || message || "Failed to update AWS integration";
        setAwsErrorModal({ 
           show: true, 
           code: errCode, 
           message: errMsg
        });
      } else {
        alert(message || "Failed to update integration connection");
      }
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-50 rounded-full animate-pulse"></div>
            <Activity className="animate-spin text-indigo-400 w-12 h-12 relative z-10" />
          </div>
          <p className="text-slate-400 font-mono text-sm tracking-widest uppercase">Fetching Security Policies...</p>
        </div>
      </DashboardLayout>
    );
  }

  const renderCard = (
    key, 
    title, 
    desc, 
    icon, 
    color, 
    bg, 
    modalKey
  ) => {
    const isConnected = status[key];
    const Icon = icon;
    
    return (
      <div className={`glass-panel border ${isConnected ? `border-${color.split('-')[1]}-500/50` : 'border-slate-800/80'} rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group hover:border-${color.split('-')[1]}-500/30 transition-all`} key={key}>
        {isConnected && <div className={`absolute top-0 right-0 w-32 h-32 ${bg} rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none`}></div>}
        <div>
          <div className="flex justify-between items-start mb-6">
            <div className={`p-3 rounded-xl ${bg} ${color} border border-${color.split('-')[1]}-500/20 shadow-sm`}>
              <Icon size={24} />
            </div>
            <div className="flex flex-col items-end">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                isConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-800 text-slate-500 border-slate-700"
              }`}>
                {isConnected ? "Connected" : "Disconnected"}
              </span>
              {isConnected && key === "github" && githubDetails && (
                <span className="text-[10px] text-slate-400 mt-2 font-mono bg-white/5 px-2 py-0.5 rounded">{githubDetails}</span>
              )}
            </div>
          </div>
          <h3 className="text-white font-bold text-xl mb-2">{title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
        </div>
        <button
          onClick={() => {
            if (isConnected) {
              handleToggleConnect(key, false);
            } else {
              if (modalKey) {
                setActiveModal(key);
              } else {
                handleToggleConnect(key, true);
              }
            }
          }}
          className={`mt-6 w-full py-3 rounded-xl text-xs font-bold tracking-wide border cursor-pointer transition-all flex justify-center items-center gap-2 shadow-sm ${
            isConnected 
              ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40" 
              : "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 hover:shadow-indigo-500/20"
          }`}
        >
          {isConnected ? <><ShieldAlert size={16} /> Disconnect Account</> : <><Link2 size={16} /> Connect Account</>}
        </button>
      </div>
    );
  };

  // Helper missing above
  const ShieldAlert = ({size}) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 8 4-1 9c-1.5 5.5-5 8-7 9-2-1-5.5-3.5-7-9l-1-9z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-8 font-sans pb-10 relative animate-in fade-in duration-500">
        
        {/* Success Toast */}
        <div className={`fixed top-6 right-6 z-50 transition-all duration-300 transform ${successToast.show ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}>
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl shadow-lg flex items-center gap-3 backdrop-blur-md">
            <CheckCircle size={20} />
            <div>
              <h4 className="font-bold text-sm tracking-wide">{successToast.title}</h4>
              <p className="text-xs text-emerald-400/80 font-mono mt-0.5">{successToast.message}</p>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="relative rounded-3xl overflow-hidden glass-panel border border-slate-800/80 p-8 lg:p-10">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-600/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider rounded-full border border-indigo-500/20 mb-4">
                <ShieldCheck size={12} className="text-indigo-400" /> Security & Access
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-3">
                Integrations Manager
              </h2>
              <p className="text-sm md:text-base text-slate-400 max-w-2xl leading-relaxed">
                Authenticate your cloud providers and source control platforms to unlock dynamic log streaming, relationship mapping, and autonomous event analysis.
              </p>
            </div>
            {(status.aws || status.azure) && (
              <Link href="/" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20">
                Manage Cloud Hub <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <GitBranch size={14} className="text-slate-400" /> Version Control & CI/CD
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {renderCard("github", "GitHub Actions", "Connect source repositories to autonomously log releases and run AI diagnosis on failed pipelines.", GitBranch, "text-purple-400", "bg-purple-500/10", "github")}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Server size={14} className="text-slate-400" /> Cloud Infrastructure
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {renderCard("azure", "Microsoft Azure", "Connect via Service Principal to dynamically map resource groups, analyze VMSS logs, and predict costs.", Database, "text-sky-400", "bg-sky-500/10", "azure")}
            {renderCard("aws", "Amazon Web Services", "Connect via IAM Access Keys to discover VPCs, EC2 instances, and stream CloudWatch telemetry.", Server, "text-amber-400", "bg-amber-500/10", "aws")}
          </div>
        </div>

        {getUserRole() === "admin" && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
              <ShieldCheck size={14} className="text-slate-400" /> Admin Data Management
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-panel border border-rose-500/30 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm">
                      <Activity size={24} />
                    </div>
                  </div>
                  <h3 className="text-white font-bold text-xl mb-2">Clear Operational Data</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Permanently delete all operational telemetry, incidents, deployments, and logs for your tenant. Your configurations, users, and API keys will be preserved.
                  </p>
                </div>
                <button
                  onClick={() => setShowClearDataModal(true)}
                  className="mt-6 w-full py-3 rounded-xl text-xs font-bold tracking-wide border cursor-pointer transition-all flex justify-center items-center gap-2 shadow-sm bg-rose-600/20 border-rose-500/30 text-rose-400 hover:bg-rose-500/30 hover:border-rose-500/50"
                >
                  <ShieldAlert size={16} /> Clear System Data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GitHub Modal */}
        {activeModal === "github" && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel border border-slate-700 w-full max-w-md rounded-2xl overflow-hidden relative shadow-2xl p-8 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <GitBranch className="text-purple-400" size={24} /> Connect GitHub
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Provide your GitHub authentication details to authorize workflow monitoring and deployment synchronization.
              </p>
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    GitHub Email
                  </label>
                  <input
                    type="email"
                    value={githubEmail}
                    onChange={(e) => setGithubEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                    Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-500 leading-relaxed mt-3">
                    <strong className="text-purple-400/80">Required Scopes:</strong> <code className="bg-purple-500/10 text-purple-400 px-1 py-0.5 rounded">repo</code>, <code className="bg-purple-500/10 text-purple-400 px-1 py-0.5 rounded">workflow</code>, and <code className="bg-purple-500/10 text-purple-400 px-1 py-0.5 rounded">user:email</code>.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-5 py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleToggleConnect("github", true, { 
                      github_token: githubToken, 
                      github_email: githubEmail 
                    });
                  }}
                  disabled={!githubEmail || !githubToken}
                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20"
                >
                  Authenticate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AWS Modal */}
        {activeModal === "aws" && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel border border-slate-700 w-full max-w-md rounded-2xl overflow-hidden relative shadow-2xl p-8 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Key className="text-amber-400" size={24} /> Connect AWS
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Provide AWS Access Keys to dynamically discover EC2, EKS, RDS, and stream CloudWatch logs.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Access Key ID</label>
                  <input
                    type="text"
                    value={awsAccessKey}
                    onChange={(e) => setAwsAccessKey(e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Secret Access Key</label>
                  <input
                    type="password"
                    value={awsSecretKey}
                    onChange={(e) => setAwsSecretKey(e.target.value)}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Default Region</label>
                  <input
                    type="text"
                    value={awsRegion}
                    onChange={(e) => setAwsRegion(e.target.value)}
                    placeholder="us-east-1"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                  />
                </div>
                {awsAccessKey.startsWith("ASIA") && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Session Token</label>
                    <input
                      type="password"
                      value={awsSessionToken}
                      onChange={(e) => setAwsSessionToken(e.target.value)}
                      placeholder="IQoJb3JpZ2luX2VjEGoaCXVzLWVhc3QtMSJGMEQC..."
                      className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-5 py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleToggleConnect("aws", true, { access_key_id: awsAccessKey, secret_access_key: awsSecretKey, region: awsRegion, session_token: awsSessionToken })}
                  disabled={!awsAccessKey || !awsSecretKey || !awsRegion || (awsAccessKey.startsWith("ASIA") && !awsSessionToken)}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
                >
                  Authenticate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AWS Error Modal */}
        {awsErrorModal.show && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-rose-500/50 w-full max-w-sm rounded-2xl overflow-hidden relative shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <ShieldAlert className="text-rose-500 w-5 h-5" size={20} /> AWS authentication failed
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {awsErrorModal.message}
              </p>
              {awsErrorModal.code && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded text-xs text-rose-400 font-mono">
                  Technical code: {awsErrorModal.code}
                </div>
              )}
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setAwsErrorModal({ show: false, code: "", message: "" })}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Azure Modal */}
        {activeModal === "azure" && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel border border-slate-700 w-full max-w-md rounded-2xl overflow-hidden relative shadow-2xl p-8 space-y-6">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Key className="text-sky-400" size={24} /> Connect Azure
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Provide Service Principal credentials to authorize resource discovery and log analytics querying.
              </p>
              <div className="bg-sky-500/10 border border-sky-500/20 p-3 rounded-lg flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="text-sky-400 mt-0.5" size={16} shrink-0 />
                  <p className="text-xs text-sky-200">
                    <strong className="text-sky-300">Note for AKS:</strong> To securely view internal Kubernetes workloads, ensure the Service Principal is assigned the <strong>Azure Kubernetes Service Cluster User Role</strong>. Do not use the Admin role for security reasons.
                  </p>
                </div>
                <div className="flex items-start gap-2 pt-2 border-t border-sky-500/20">
                  <Key className="text-sky-400 mt-0.5" size={16} shrink-0 />
                  <div className="text-xs text-sky-200">
                    <strong className="text-sky-300">Permission Requirements:</strong>
                    <ul className="list-disc ml-4 mt-1 space-y-1">
                      <li>Go to <strong>Subscriptions</strong> in the Azure Portal and select your subscription.</li>
                      <li>Click <strong>Access control (IAM)</strong> &gt; <strong>Add role assignment</strong>.</li>
                      <li>Assign the <strong>Reader</strong> or <strong>Contributor</strong> role to your Service Principal (Client ID).</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex bg-black/40 p-1.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAzureScope("account")}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                      azureScope === "account" ? "bg-sky-600 text-white shadow-md" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Entire Subscription
                  </button>
                  <button
                    type="button"
                    onClick={() => setAzureScope("application")}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                      azureScope === "application" ? "bg-sky-600 text-white shadow-md" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Resource Group
                  </button>
                </div>

                {azureScope === "account" && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Subscription ID</label>
                    <input
                      type="text"
                      value={azureSubscription}
                      onChange={(e) => setAzureSubscription(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 font-mono"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Tenant ID</label>
                  <input
                    type="text"
                    value={azureTenant}
                    onChange={(e) => setAzureTenant(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Client ID</label>
                  <input
                    type="text"
                    value={azureClient}
                    onChange={(e) => setAzureClient(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Client Secret</label>
                  <div className="relative">
                    <input
                      type={showAzureSecret ? "text" : "password"}
                      value={azureSecret}
                      onChange={(e) => setAzureSecret(e.target.value)}
                      placeholder="••••••••••••••••"
                      className="w-full bg-black/40 border border-slate-800 rounded-xl px-4 py-3 pr-10 text-sm text-slate-200 focus:outline-none focus:border-sky-500/50 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAzureSecret(!showAzureSecret)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showAzureSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-5 py-3 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleToggleConnect("azure", true, { scope: azureScope, subscription_id: azureSubscription, client_id: azureClient, client_secret: azureSecret, tenant_id: azureTenant })}
                  disabled={!azureTenant || !azureClient || !azureSecret || (azureScope === "account" && !azureSubscription)}
                  className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-sky-500/20"
                >
                  Authenticate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Data Confirmation Modal */}
        {showClearDataModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel border border-rose-500/50 w-full max-w-md rounded-2xl overflow-hidden relative shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-200">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/20 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <ShieldAlert className="text-rose-500" size={24} /> Clear Operational Data
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Are you absolutely sure? This will permanently delete all operational telemetry, incidents, deployments, and chat history for your organization.
              </p>
              <p className="text-xs text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                Warning: This action cannot be undone. User accounts and API keys will be preserved.
              </p>
              
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-800/80">
                <button
                  onClick={() => setShowClearDataModal(false)}
                  disabled={clearingData}
                  className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 px-5 py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  disabled={clearingData}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl disabled:opacity-50 transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2"
                >
                  {clearingData ? "Clearing..." : "Yes, Clear Data"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

