"use client";

import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

export default function ContainerStatusBadge({ status, healthStatus }) {
  const s = (status || "unknown").toLowerCase();
  const h = (healthStatus || "none").toLowerCase();

  let stateColor = "bg-slate-500/10 text-slate-400 border-slate-500/20";
  let Icon = Clock;

  if (s === "running") {
    stateColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    Icon = CheckCircle2;
  } else if (s === "exited" || s === "dead") {
    stateColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
    Icon = XCircle;
  } else if (s === "paused") {
    stateColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
    Icon = AlertTriangle;
  }

  let healthColor = "text-slate-400";
  if (h === "healthy") healthColor = "text-emerald-400 font-semibold";
  if (h === "unhealthy") healthColor = "text-rose-400 font-semibold animate-pulse";

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium uppercase tracking-wider ${stateColor}`}>
        <Icon size={12} />
        {s}
      </span>
      {h !== "none" && (
        <span className={`text-[11px] capitalize ${healthColor}`}>
          ({h})
        </span>
      )}
    </div>
  );
}
