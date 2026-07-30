"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Copy, Check, RefreshCw, ArrowDown, Terminal } from "lucide-react";

export default function LogPanel({ containerName, isK8s = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tailCount, setTailCount] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef(null);

  const fetchLogs = async () => {
    if (!containerName) return;
    setLoading(true);
    try {
      const endpoint = isK8s
        ? `/api/v1/monitoring/k8s/pod/${containerName}/logs?tail=${tailCount}`
        : `/api/v1/monitoring/container/${containerName}/logs?tail=${tailCount}`;
        
      const token = localStorage.getItem("jwt_token");
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.lines || []);
    } catch (err) {
      setLogs([`[ERROR] Unable to retrieve logs for ${containerName}: ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [containerName, tailCount]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(line => 
    line.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-[480px] bg-[#05070d] rounded-xl border border-white/10 overflow-hidden font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#090d16] border-b border-white/10 text-slate-400">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-emerald-400" />
          <span className="font-bold text-slate-200">{containerName}</span>
          <span className="text-[10px] text-slate-500 font-sans">({filteredLogs.length} lines)</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-md pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={tailCount}
            onChange={(e) => setTailCount(Number(e.target.value))}
            className="bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
          >
            <option value={50}>Tail 50</option>
            <option value={100}>Tail 100</option>
            <option value={200}>Tail 200</option>
          </select>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 transition-colors flex items-center gap-1 text-[10px]"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-white/10 select-text">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic py-8 text-center">
            {searchTerm ? "No log lines match your search filter." : "No logs available."}
          </div>
        ) : (
          filteredLogs.map((line, i) => {
            const isError = line.includes("ERROR") || line.includes("Exception") || line.includes("500");
            const isWarn = line.includes("WARN") || line.includes("404");
            return (
              <div
                key={i}
                className={`leading-relaxed whitespace-pre-wrap break-all ${
                  isError ? "text-rose-400 bg-rose-500/10 px-1 rounded" : isWarn ? "text-amber-300" : "text-slate-300"
                }`}
              >
                {line}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      <div className="flex items-center justify-between px-3 py-1 bg-[#090d16] border-t border-white/5 text-[10px] text-slate-500 font-sans">
        <span>Auto-scroll: {autoScroll ? "ON" : "OFF"}</span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 ${autoScroll ? "text-indigo-400" : "text-slate-500"}`}
        >
          <ArrowDown size={10} /> Scroll to bottom
        </button>
      </div>
    </div>
  );
}
