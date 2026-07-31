"use client";

import { useState, useEffect, useRef } from "react";
import { X, Terminal, Play, Pause, Search, Copy, Trash2, ArrowDown, Shield, Check } from "lucide-react";

export default function ContainerLogModal({ serviceName, onClose }) {
  const [logs, setLogs] = useState([]);
  const [streaming, setStreaming] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [status, setStatus] = useState("connecting");
  const [duration, setDuration] = useState(0);

  const eventSourceRef = useRef(null);
  const terminalEndRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!serviceName) return;

    const token = localStorage.getItem("token");
    const streamUrl = `/api/v1/containers/${serviceName}/logs/stream`;

    // Connect via EventSource
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    setStatus("streaming");

    es.addEventListener("log", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.line) {
          setLogs((prev) => [...prev.slice(-999), data.line]);
        }
      } catch (err) {
        console.error("Error parsing log line:", err);
      }
    });

    es.addEventListener("connected", () => {
      setStatus("connected");
    });

    es.addEventListener("timeout", () => {
      setStatus("timed_out (max 300s)");
      es.close();
      setStreaming(false);
    });

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
      setStreaming(false);
    };

    // Duration timer
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [serviceName]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const togglePauseResume = () => {
    if (streaming) {
      if (eventSourceRef.current) eventSourceRef.current.close();
      setStreaming(false);
      setStatus("paused");
    } else {
      // Re-connect
      const es = new EventSource(`/api/v1/containers/${serviceName}/logs/stream`);
      eventSourceRef.current = es;
      setStreaming(true);
      setStatus("streaming");
      es.addEventListener("log", (e) => {
        const data = JSON.parse(e.data);
        if (data.line) setLogs((prev) => [...prev.slice(-999), data.line]);
      });
    }
  };

  const handleCopy = () => {
    const text = filteredLogs.join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((line) =>
    searchTerm ? line.toLowerCase().includes(searchTerm.toLowerCase()) : true
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-5xl h-[85vh] bg-[#090d16] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0d121f] border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Terminal size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Live Log Stream: {serviceName}
                <span className={`w-2 h-2 rounded-full ${streaming ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              </h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Status: <span className="text-indigo-300 capitalize">{status}</span> • Duration: {duration}s / 300s max
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px]">
              <Shield size={12} /> Live Redaction Active
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[#070a12] border-b border-white/5 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 focus-within:border-indigo-500">
            <Search size={14} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search log output..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent border-none outline-none text-white text-xs w-full placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={togglePauseResume}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                streaming
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
              }`}
            >
              {streaming ? <Pause size={12} /> : <Play size={12} />}
              {streaming ? "Pause Stream" : "Resume Stream"}
            </button>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                autoScroll
                  ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDown size={12} /> Auto-Scroll
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy Output"}
            </button>

            <button
              onClick={() => setLogs([])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>

        {/* Log Viewer Body */}
        <div className="flex-1 p-5 bg-[#05070d] font-mono text-xs text-slate-300 overflow-y-auto space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 italic">
              <Terminal size={32} className="mb-2 opacity-40" />
              Waiting for live log stream...
            </div>
          ) : (
            filteredLogs.map((line, idx) => (
              <div key={idx} className="hover:bg-white/[0.03] px-2 py-0.5 rounded leading-relaxed break-all">
                <span className="text-slate-600 select-none mr-3">{idx + 1}</span>
                {line}
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#090d16] border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
          <span>Displaying {filteredLogs.length} line(s)</span>
          <span className="text-slate-500">Sensitive key redaction enforced on server</span>
        </div>

      </div>
    </div>
  );
}
