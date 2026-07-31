"use client";

import { Cpu, HardDrive, Zap } from "lucide-react";

export default function ContainerStats({ stats }) {
  if (!stats) return null;

  const cpu = stats.cpu_percent || 0;
  const memUsageMb = Math.round((stats.memory_usage_bytes || 0) / (1024 * 1024));
  const memLimitMb = Math.round((stats.memory_limit_bytes || 1) / (1024 * 1024));
  const memPercent = stats.memory_percent || 0;

  return (
    <div className="grid grid-cols-2 gap-3 my-3">
      {/* CPU Usage Card */}
      <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Cpu size={14} className="text-cyan-400" /> CPU Usage
          </span>
          <span className="font-bold text-cyan-300 font-mono">{cpu}%</span>
        </div>
        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${cpu > 80 ? "bg-rose-500" : cpu > 50 ? "bg-amber-400" : "bg-cyan-400"}`}
            style={{ width: `${Math.min(cpu, 100)}%` }}
          />
        </div>
      </div>

      {/* Memory Usage Card */}
      <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <HardDrive size={14} className="text-indigo-400" /> Memory
          </span>
          <span className="font-bold text-indigo-300 font-mono">
            {memUsageMb} MB / {memLimitMb} MB ({memPercent}%)
          </span>
        </div>
        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${memPercent > 85 ? "bg-rose-500" : memPercent > 60 ? "bg-amber-400" : "bg-indigo-400"}`}
            style={{ width: `${Math.min(memPercent, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
