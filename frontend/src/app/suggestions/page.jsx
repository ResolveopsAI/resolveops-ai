"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Lightbulb, ShieldCheck, CheckCircle2, AlertTriangle, Info, Clock, ExternalLink } from "lucide-react";
import { fetchApi } from "@/lib/api";

const SAMPLE_EVIDENCE_SUGGESTIONS = [
  {
    id: "sug-01",
    title: "Configure CloudWatch Log Retention & Subscription Filter",
    description: "CloudWatch log streams for api-gateway-service show latency warnings (>800ms). Setting up structured metric filters will enable proactive predictive alerts before OOM occurs.",
    service: "api-gateway-service",
    severity: "MEDIUM",
    evidence_source: "cloudwatch",
    benefit: "Reduces mean time to detection (MTTD) for service degradation by 40%.",
    type: "Observability Enhancement",
    status: "New",
  },
  {
    id: "sug-02",
    title: "Docker Compose Healthcheck Optimization",
    description: "The docker-evidence-adapter requires strict healthcheck timeouts to prevent container socket read blocking during heavy log queries.",
    service: "docker-evidence-adapter",
    severity: "HIGH",
    evidence_source: "docker",
    benefit: "Ensures evidence adapter isolation remains responsive during high incident volume.",
    type: "Resilience",
    status: "New",
  },
  {
    id: "sug-03",
    title: "GitHub Actions Workflow Failure Alerting",
    description: "Recent pipeline deployments failed during container image build step. Integrate notification-service webhooks to alert SREs on GitHub workflow conclusion=failure.",
    service: "github-intelligence-service",
    severity: "LOW",
    evidence_source: "github",
    benefit: "Prevents deploying stale artifacts when workflow runs encounter build errors.",
    type: "CI/CD Safety",
    status: "New",
  },
];

export default function SuggestionsHub() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState(SAMPLE_EVIDENCE_SUGGESTIONS);

  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(false);
  }, [router]);

  const handleStatusChange = (id, newStatus) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border border-violet-500/20 flex items-center justify-center">
              <Lightbulb className="text-violet-400 w-7 h-7 animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-xl animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-slate-200 font-semibold text-sm">Gathering Recommendations</p>
            <p className="text-slate-500 text-xs font-mono mt-1 tracking-wider">RETRIEVING MCP DATA...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-6 font-sans pb-10 animate-in fade-in duration-300">
        
        {/* Header */}
        <div className="border-b border-white/5 pb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-bold uppercase tracking-wider rounded-full border border-amber-500/20 mb-3">
            <Lightbulb size={12} /> Evidence-Grounded Recommendations
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Operational Suggestions & Best Practices
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Read-only recommendations derived from live CloudWatch metrics, GitHub pipeline runs, and MCP evidence collection. All suggestions require manual SRE review.
          </p>
        </div>

        {/* List */}
        <div className="space-y-4">
          {suggestions.map((item) => (
            <div key={item.id} className="border border-white/8 rounded-2xl p-5 bg-white/3 space-y-3 hover:border-white/15 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                      item.severity === "HIGH" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : item.severity === "MEDIUM" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                    }`}>
                      {item.severity} Priority
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">[{item.evidence_source.toUpperCase()}]</span>
                    <span className="text-[10px] text-slate-600">·</span>
                    <span className="text-xs text-violet-400 font-medium">{item.service}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.status === "Accepted" ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Reviewed & Accepted
                    </span>
                  ) : item.status === "Dismissed" ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-500 border border-slate-700">
                      Dismissed
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStatusChange(item.id, "Accepted")}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-600/30 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleStatusChange(item.id, "Dismissed")}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-xs hover:bg-white/10 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>

              <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs">
                <span className="text-slate-400"><strong>Expected Benefit:</strong> {item.benefit}</span>
                <span className="text-[10px] text-slate-600 font-mono">Read-Only Recommendation</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
