"use client";

import { Sparkles, ShieldAlert, Container, GitBranch, Box, DollarSign } from "lucide-react";

export default function ChatWelcomeState({ fullName, onSelectPrompt }) {
  const firstName = fullName?.split(" ")[0] || "";

  const PROMPT_CHIPS = [
    {
      title: "Investigate active incident",
      prompt: "Investigate active incident in api-gateway-service and determine root cause.",
      icon: ShieldAlert,
      color: "text-rose-400 border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10",
    },
    {
      title: "Check unhealthy Docker services",
      prompt: "Check logs and health status of all managed Docker Compose services.",
      icon: Container,
      color: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10",
    },
    {
      title: "Analyse failed GitHub workflow",
      prompt: "Check recent failed GitHub Actions workflow runs and pinpoint the failing step.",
      icon: GitBranch,
      color: "text-violet-400 border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10",
    },
    {
      title: "Review recent AWS changes",
      prompt: "Review recent CloudTrail events and EC2 status checks for operational anomalies.",
      icon: Box,
      color: "text-amber-400 border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="w-12 h-12 rounded-2xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center shadow-lg shadow-sky-950/30">
        <Sparkles size={22} className="text-sky-400" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          {firstName ? `Welcome, ${firstName}!` : "Welcome to ResolveOps AI-RCA"}
        </h1>
        <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          Evidence-first incident investigation agent. I correlate AWS CloudWatch, CloudTrail, Docker services, and GitHub pipeline telemetry.
        </p>
      </div>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
        {PROMPT_CHIPS.map((chip, idx) => {
          const Icon = chip.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(chip.prompt)}
              aria-label={`Try sample query: ${chip.title}`}
              className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer group min-h-[96px] ${chip.color} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} />
                <span className="text-xs font-semibold">{chip.title}</span>
              </div>
              <p className="text-xs text-slate-400 group-hover:text-slate-200 line-clamp-2 leading-relaxed">
                &ldquo;{chip.prompt}&rdquo;
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
