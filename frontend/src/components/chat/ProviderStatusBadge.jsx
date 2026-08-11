"use client";

import { Activity, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";

export default function ProviderStatusBadge({ providerStatus, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/40 text-slate-400 text-[11px] font-medium" role="status">
        <Activity className="w-3 h-3 animate-spin text-indigo-400" />
        Provider status — Checking
      </div>
    );
  }

  const { provider, display_name, status, error_code } = providerStatus || {};
  const isAvailable = status === "available";

  let labelText = "";
  if (!provider || provider === "unknown" || status === "unavailable") {
    labelText = "AI provider — Unavailable";
  } else {
    const name = display_name || (provider === "openai" ? "OpenAI" : provider === "bedrock" ? "Amazon Bedrock" : provider);
    if (isAvailable) {
      labelText = `${name} — Active`;
    } else if (status === "rate_limited" || error_code === "AI_PROVIDER_RATE_LIMITED") {
      labelText = `${name} — Rate limited`;
    } else if (status === "quota_exceeded" || error_code === "AI_PROVIDER_QUOTA_EXCEEDED") {
      labelText = `${name} — Quota exceeded`;
    } else {
      labelText = `${name} — Degraded`;
    }
  }

  return (
    <div
      tabIndex={0}
      role="status"
      aria-live="polite"
      title={isAvailable ? "Provider operational" : "Provider degradation or misconfiguration detected"}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
        isAvailable
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-amber-500/10 border-amber-500/30 text-amber-400"
      }`}
    >
      {isAvailable ? (
        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
      ) : (
        <AlertTriangle size={13} className="text-amber-400 shrink-0" />
      )}
      <span>{labelText}</span>
    </div>
  );
}
