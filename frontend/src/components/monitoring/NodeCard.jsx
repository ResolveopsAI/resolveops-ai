"use client";

import { Server, Cpu, HardDrive } from "lucide-react";

export default function NodeCard({ node }) {
  return (
    <div className="p-4 rounded-2xl border border-white/10 bg-[#06090f] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-violet-400" />
          <span className="text-xs font-bold text-slate-200">{node.name}</span>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
          {node.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
        <div className="p-2 rounded bg-black/40 border border-white/5">
          <p className="text-slate-500 font-sans">Role</p>
          <p className="text-slate-200 font-semibold mt-0.5">{node.role}</p>
        </div>
        <div className="p-2 rounded bg-black/40 border border-white/5">
          <p className="text-slate-500 font-sans">Kubelet</p>
          <p className="text-slate-200 font-semibold mt-0.5">{node.kubelet_version}</p>
        </div>
      </div>

      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between">
          <span className="text-slate-500 flex items-center gap-1"><Cpu size={10} className="text-emerald-400" /> CPU ({node.cpu_capacity})</span>
          <span className="font-mono font-bold text-slate-300">{node.cpu_pct ?? 24.5}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${node.cpu_pct ?? 24.5}%` }} />
        </div>

        <div className="flex justify-between pt-1">
          <span className="text-slate-500 flex items-center gap-1"><HardDrive size={10} className="text-blue-400" /> RAM ({node.mem_capacity})</span>
          <span className="font-mono font-bold text-slate-300">{node.mem_pct ?? 42.0}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${node.mem_pct ?? 42.0}%` }} />
        </div>
      </div>
    </div>
  );
}
