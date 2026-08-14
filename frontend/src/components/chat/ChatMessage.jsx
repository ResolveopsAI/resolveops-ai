"use client";

import { useState, useEffect, useRef } from "react";
import {
  User, Bot, AlertTriangle, RefreshCw, Copy, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, Shield, Zap, Clock, Info, Activity,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import { GeneratedVisualCard, VisualErrorState } from "./GeneratedVisualCard";
import { StructuredDiagramCard } from "./StructuredDiagramCard";

// ── Mermaid initialization (strict security mode) ─────────────────────────────
mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true,
  securityLevel: "strict",
  theme: "dark",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: false,
    curve: "basis",
    nodeSpacing: 96,
    rankSpacing: 160,
  },
  themeVariables: {
    darkMode: true,
    background: "transparent",
    primaryColor: "#150e28",
    primaryTextColor: "#ffffff",
    primaryBorderColor: "#8b5cf6",
    lineColor: "#a78bfa",
    secondaryColor: "#080c18",
    tertiaryColor: "#12182c",
    nodeTextColor: "#ffffff",
    textColor: "#ffffff",
    fontSize: "14px",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
  },
});

// ── SVG style injection ───────────────────────────────────────────────────────
function injectSVGStyles(rawSvg) {
  if (!rawSvg) return "";

  let svg = rawSvg;

  // Remove restrictive max-width/height collapse from Mermaid v11
  svg = svg.replace(/style="([^"]*)"/gi, (match, styleContent) => {
    const cleanedStyle = styleContent
      .replace(/max-width:\s*0px;?/gi, "")
      .replace(/height:\s*0px;?/gi, "");
    return `style="width: 100%; height: auto; ${cleanedStyle}"`;
  });

  // Ensure svg root has width="100%"
  svg = svg.replace(/<svg\s+([^>]*)/i, (match, attrs) => {
    let newAttrs = attrs;
    if (!/width=/i.test(newAttrs)) newAttrs += ' width="100%"';
    return `<svg ${newAttrs}`;
  });

  const customStyle = `<style>
    .mermaid-svg-container svg {
      max-width: 100% !important;
      width: 100% !important;
      height: auto !important;
      min-height: 250px !important;
      display: block !important;
      margin: 0 auto !important;
      background: transparent !important;
    }
    .mermaid-svg-container svg .node rect,
    .mermaid-svg-container svg g.node rect,
    .mermaid-svg-container svg .node polygon,
    .mermaid-svg-container svg .node circle,
    .mermaid-svg-container svg rect.label-container,
    .mermaid-svg-container svg .label-container {
      fill: #150e28 !important;
      stroke: #8b5cf6 !important;
      stroke-width: 2px !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .mermaid-svg-container svg .cluster rect,
    .mermaid-svg-container svg g.cluster rect,
    .mermaid-svg-container svg g.cluster > rect {
      fill: #080c18 !important;
      fill-opacity: 0.8 !important;
      stroke: #1e293b !important;
      stroke-width: 1.5px !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .mermaid-svg-container svg text,
    .mermaid-svg-container svg tspan,
    .mermaid-svg-container svg .nodeLabel,
    .mermaid-svg-container svg .cluster-label,
    .mermaid-svg-container svg .label text,
    .mermaid-svg-container svg .edgeLabel text,
    .mermaid-svg-container svg text.actor {
      fill: #ffffff !important;
      color: #ffffff !important;
      font-family: ui-sans-serif, system-ui, sans-serif !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .mermaid-svg-container svg .edgePath path,
    .mermaid-svg-container svg .flowchart-link,
    .mermaid-svg-container svg path.path,
    .mermaid-svg-container svg .link {
      stroke: #a78bfa !important;
      stroke-width: 2px !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .mermaid-svg-container svg .edgeLabel rect {
      fill: #090d16 !important;
      stroke: #1f2937 !important;
      opacity: 1 !important;
    }
  </style>`;

  return svg.replace(/<svg[^>]*>/, (match) => `${match}${customStyle}`);
}

// ── Mermaid code sanitizer ────────────────────────────────────────────────────
function formatAndSanitizeMermaidCode(code) {
  let text = (code || "").trim();

  if (!text.includes("\n") || text.split("\n").length < 3) {
    text = text
      .replace(/\s*(subgraph\s+[A-Za-z0-9_"\-\[\]\s]+)/gi, "\n$1\n")
      .replace(/\s*(end)(?=\s|$)/gi, "\nend\n")
      .replace(/\s*(-->|->|-\.->|<-->)\s*/gi, " $1 ")
      .replace(/\]\s*([A-Za-z0-9_]+)\[/g, "]\n$1[")
      .replace(/("?\s*)([A-Za-z0-9_]+\[)/g, "$1\n$2");
  }

  text = text
    .replace(/-->\|([^|]+)\|>/g, "-->|$1|")
    .replace(/->\|([^|]+)\|>/g, "-->|$1|")
    .replace(/-->\|([^|]+)\| >/g, "-->|$1|")
    .replace(/<-->\|([^|]+)\|/g, "-->|$1|")
    .replace(/style\s+\w+\s+fill:[^;\n]+;\s*/gi, "")
    .replace(/style\s+\w+\s+fill:[^;\n]+$/gi, "");

  if (!/^(graph|flowchart|sequenceDiagram|classDiagram|gantt|erDiagram)/i.test(text.trim())) {
    text = "graph TD\n" + text;
  }

  text = text.replace(/subgraph\s+([A-Za-z0-9_ ]+?)(?=\n|\[|$)/gi, (match, name) => {
    if (name.includes("[") || name.startsWith('"')) return match;
    const trimmed = name.trim();
    if (trimmed.includes(" ")) {
      const safeId = trimmed.replace(/\s+/g, "_");
      return `subgraph ${safeId}["${trimmed}"]`;
    }
    return `subgraph ${trimmed}`;
  });

  text = text.replace(/^(\s*)(\w+)\s*\[\s*([^"\n\]]+?)\s*\]/gm, (match, indent, id, label) => {
    if (label.startsWith('"') && label.endsWith('"')) return match;
    return `${indent}${id}["${label}"]`;
  });

  return text;
}

// ── Mermaid SVG viewport fitter ───────────────────────────────────────────────
function fitSVGToViewBox(rawSvg) {
  if (typeof document === "undefined" || !rawSvg) return rawSvg;
  try {
    const tempContainer = document.createElement("div");
    tempContainer.style.cssText = "position:absolute;visibility:hidden;top:-9999px;left:-9999px;width:1200px;";
    tempContainer.innerHTML = rawSvg;
    document.body.appendChild(tempContainer);
    const svgElem = tempContainer.querySelector("svg");
    if (svgElem) {
      svgElem.removeAttribute("style");
      svgElem.setAttribute("style", "width: 100%; height: auto; display: block; margin: 0 auto;");
      svgElem.setAttribute("width", "100%");
      svgElem.removeAttribute("height");
      const rootGroup = svgElem.querySelector("g");
      if (rootGroup && typeof rootGroup.getBBox === "function") {
        const bbox = rootGroup.getBBox();
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          const padding = 24;
          svgElem.setAttribute(
            "viewBox",
            `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`
          );
        }
      }
    }
    const processedSvg = tempContainer.innerHTML;
    document.body.removeChild(tempContainer);
    return processedSvg;
  } catch {
    return rawSvg;
  }
}

// ── MermaidDiagram component ──────────────────────────────────────────────────
function MermaidDiagram({ code }) {
  const [mounted, setMounted] = useState(false);
  const [svgHtml, setSvgHtml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [pngScale, setPngScale] = useState(3);
  const [pngBackground, setPngBackground] = useState("transparent");
  const containerRef = useRef(null);
  const uniqueIdRef = useRef(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || !code) return;
    let isSubscribed = true;
    setLoading(true);
    setError(false);
    const formattedCode = formatAndSanitizeMermaidCode(code);
    const diagramId = uniqueIdRef.current;

    const renderDiagram = async () => {
      try {
        const { svg: rawSvg } = await mermaid.render(diagramId, formattedCode);
        if (isSubscribed) {
          const autoFittedSvg = fitSVGToViewBox(rawSvg);
          setSvgHtml(injectSVGStyles(autoFittedSvg));
          setLoading(false);
        }
      } catch {
        try {
          const fallbackCode = formattedCode.replace(/\|([^|]+)\|/g, "");
          const { svg: rawSvg } = await mermaid.render(`${diagramId}-fb`, fallbackCode);
          if (isSubscribed) {
            setSvgHtml(injectSVGStyles(fitSVGToViewBox(rawSvg)));
            setLoading(false);
          }
        } catch {
          if (isSubscribed) { setError(true); setLoading(false); }
        }
      } finally {
        document.querySelectorAll("[id^='dmermaid']").forEach((el) => el.remove());
      }
    };

    renderDiagram();
    return () => { isSubscribed = false; };
  }, [mounted, code]);

  if (!mounted) return (
    <div className="my-4 h-32 bg-[#030712] border border-indigo-500/20 rounded-2xl animate-pulse flex items-center justify-center text-xs text-slate-500">
      Initializing Diagram Engine...
    </div>
  );

  if (loading) return (
    <div className="my-4 p-6 bg-[#030712] border border-indigo-500/20 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-xl">
      <Activity className="animate-spin text-indigo-400 w-5 h-5" />
      <span className="text-xs font-medium text-slate-400">Rendering Diagram...</span>
    </div>
  );

  if (error) return (
    <div className="my-4 p-4 bg-slate-950/90 border border-amber-500/30 rounded-2xl shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
          <AlertTriangle size={15} />
          <span>Mermaid Diagram</span>
        </div>
        <button
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-md bg-white/5 border border-white/10 transition-colors cursor-pointer"
        >
          {showCode ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>{showCode ? "Hide Code" : "View Code"}</span>
        </button>
      </div>
      {showCode && (
        <div className="mt-3 p-3 bg-black/60 rounded-xl border border-white/10 font-mono text-xs text-slate-300 overflow-x-auto">
          <pre className="text-indigo-300 leading-relaxed">{formatAndSanitizeMermaidCode(code)}</pre>
        </div>
      )}
    </div>
  );

  return (
    <div className="my-4 group relative bg-[#030712] border border-indigo-500/20 rounded-2xl shadow-xl shadow-black/50 overflow-hidden">
      <div
        ref={containerRef}
        className="mermaid-svg-container p-5 overflow-x-auto w-full block"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
      <div className="px-4 py-2 bg-slate-950/80 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
          <Zap size={12} /> Mermaid Diagram
        </span>
        <button
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          {showCode ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{showCode ? "Hide Code" : "View Code"}</span>
        </button>
      </div>
      <div className="px-4 py-2 bg-slate-950/80 border-t border-white/5 flex items-center justify-end gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 flex items-center gap-2">
            <span className="text-[11px]">Export:</span>
            <select
              value={pngScale}
              onChange={(e) => setPngScale(Number(e.target.value))}
              className="bg-black/60 text-xs text-slate-300 rounded px-2 py-1 border border-white/10"
            >
              <option value={2}>2x</option>
              <option value={3}>3x</option>
              <option value={4}>4x</option>
            </select>
            <select
              value={pngBackground}
              onChange={(e) => setPngBackground(e.target.value)}
              className="bg-black/60 text-xs text-slate-300 rounded px-2 py-1 border border-white/10"
            >
              <option value="transparent">Transparent</option>
              <option value="white">White</option>
            </select>
          </label>
        </div>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatAndSanitizeMermaidCode(code) || "");
            } catch {}
          }}
          className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 rounded-md bg-white/5 border border-white/10 transition-colors"
        >
          <Copy size={12} />
          <span className="text-xs">Copy Code</span>
        </button>
        <button
          onClick={() => {
            const svgEl = containerRef.current?.querySelector("svg");
            if (!svgEl) return;
            const serializer = new XMLSerializer();
            const source = serializer.serializeToString(svgEl);
            const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "diagram.svg";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 rounded-md bg-white/5 border border-white/10 transition-colors"
        >
          <ChevronRight size={12} />
          <span className="text-xs">Download SVG</span>
        </button>
        <button
          onClick={async () => {
            const svgEl = containerRef.current?.querySelector("svg");
            if (!svgEl) return;
            const clone = svgEl.cloneNode(true);
            try {
              // derive width/height from viewBox or bounding box
              const vb = clone.viewBox && clone.viewBox.baseVal ? clone.viewBox.baseVal : null;
              let width = vb && vb.width ? vb.width : clone.getAttribute("width") || clone.clientWidth || 1200;
              let height = vb && vb.height ? vb.height : clone.getAttribute("height") || clone.clientHeight || 800;
              width = Number(width) || 1200;
              height = Number(height) || 800;
              const scale = Number(pngScale) || 3; // high-res multiplier
              const serializer = new XMLSerializer();
              const svgString = serializer.serializeToString(clone);
              const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
              const url = URL.createObjectURL(svgBlob);
              const img = new Image();
              img.onload = () => {
                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = Math.ceil(width * scale);
                  canvas.height = Math.ceil(height * scale);
                  const ctx = canvas.getContext("2d");
                  ctx.fillStyle = pngBackground === "white" ? "#ffffff" : "rgba(0,0,0,0)";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                  canvas.toBlob((blob) => {
                    if (!blob) return;
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = "diagram.png";
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(link.href);
                    URL.revokeObjectURL(url);
                  }, "image/png", 1);
                } catch (e) {
                  URL.revokeObjectURL(url);
                }
              };
              img.onerror = () => { URL.revokeObjectURL(url); };
              img.src = url;
            } catch (e) {}
          }}
          className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-1 rounded-md bg-white/5 border border-white/10 transition-colors"
        >
          <CheckCircle2 size={12} />
          <span className="text-xs">Export PNG (High‑Res)</span>
        </button>
      </div>
      {showCode && (
        <div className="p-3 bg-black/80 border-t border-white/10 font-mono text-xs text-indigo-300 overflow-x-auto">
          <pre>{formatAndSanitizeMermaidCode(code)}</pre>
        </div>
      )}
    </div>
  );
}

// ── Visual response parser ────────────────────────────────────────────────────
function tryParseVisualResponse(content) {
  if (!content || typeof content !== "string") return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const data = JSON.parse(trimmed);
    if (data.type === "visual_response") return data;
  } catch {}
  return null;
}

// ── Visual response renderer ──────────────────────────────────────────────────
function VisualResponseBlock({ data, onEdit }) {
  const [showExplanation, setShowExplanation] = useState(true);
  const visual = data.visual;

  return (
    <div className="space-y-3">
      {/* Title */}
      {data.title && (
        <h3 className="text-sm font-bold text-slate-100 mb-1">{data.title}</h3>
      )}

      {/* Introduction */}
      {data.introduction && (
        <p className="text-sm text-slate-300 leading-relaxed">{data.introduction}</p>
      )}

      {/* Visual */}
      {visual?.kind === "generated_image" && visual.url && (
        <GeneratedVisualCard
          visual={visual}
          title={data.title}
          onEdit={onEdit}
        />
      )}

      {visual?.kind === "structured_diagram" && visual.spec && (
        <StructuredDiagramCard spec={visual.spec} title={data.title} />
      )}

      {/* Visual error */}
      {data.visual_error && (
        <VisualErrorState
          errorCode={data.visual_error.error_code}
          title={data.title}
        />
      )}

      {/* Explanation sections */}
      {data.sections && data.sections.length > 0 && (
        <div>
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-2 transition-colors cursor-pointer"
          >
            {showExplanation ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>{showExplanation ? "Hide Explanation" : "Show Explanation"}</span>
          </button>
          {showExplanation && (
            <div className="space-y-3 mt-2">
              {data.sections.map((section, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/3 border border-white/8">
                  <p className="text-[11px] text-violet-400 uppercase tracking-wider font-semibold mb-1.5">
                    {section.heading}
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">{section.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key takeaway */}
      {data.key_takeaway && (
        <div className="p-3 rounded-xl bg-violet-500/8 border border-violet-500/20 mt-2">
          <p className="text-[10px] text-violet-400 uppercase tracking-wider font-semibold mb-1">
            Key Takeaway
          </p>
          <p className="text-xs text-slate-200 leading-relaxed">{data.key_takeaway}</p>
        </div>
      )}
    </div>
  );
}

// ── Markdown preprocessor — STRIPPED of all hardcoded Mermaid injection ──────
function preprocessMarkdownContent(content) {
  if (!content) return "";
  let processed = content;

  // Only fix code blocks that have the mermaid language already but missing identifier
  processed = processed.replace(
    /```\s*\n(graph\s+(?:TD|LR|TB|RL)|flowchart\s+(?:TD|LR|TB|RL)|sequenceDiagram|classDiagram|erDiagram|gantt)/gi,
    "```mermaid\n$1"
  );

  return processed;
}

// ── Time formatter ────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── CodeBlock with copy button ───────────────────────────────────────────────
function CodeBlock({ language, value }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="relative my-2">
      <pre className="bg-[#020617] border border-white/10 rounded-xl p-3 overflow-x-auto font-mono text-xs text-slate-300">
        <code className="text-xs font-mono text-slate-300">{value}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 bg-white/5 hover:bg-white/8 text-slate-300 px-2 py-1 rounded text-xs flex items-center gap-2"
      >
        {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

// ── ExecutionDetailsPanel ───────────────────────────────────────────────────
function ExecutionDetailsPanel({ execution }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!execution) return null;

  const mcpCalls = execution.mcpCalls || [];

  return (
    <div className="mt-3 pt-2.5 border-t border-white/5 text-xs text-slate-400">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
      >
        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Activity size={10} className="text-emerald-400 animate-pulse" />
        <span>Execution Details</span>
      </button>

      {isOpen && (
        <div className="mt-2 p-3 bg-black/40 rounded-xl border border-white/5 space-y-2 font-mono text-[10px]">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-slate-400">
            <div><span className="text-slate-600">Request ID:</span> {execution.requestId}</div>
            <div><span className="text-slate-600">Text Provider:</span> {execution.textProvider} ({execution.textModel})</div>
            <div><span className="text-slate-600">MCP Connected:</span> {execution.mcpUsed ? "Yes (Streamable HTTP)" : "No"}</div>
            <div><span className="text-slate-600">RAG Used:</span> {execution.ragUsed ? "Yes" : "No"}</div>
          </div>
          {mcpCalls.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">MCP Tool Invocations:</div>
              {mcpCalls.map((call, i) => (
                <div key={i} className="flex items-center justify-between py-0.5 border-b border-white/5 last:border-0 text-slate-350">
                  <span>{call.tool} ({call.domain})</span>
                  <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase font-bold ${call.status === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                    {call.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
export function MessageBubble({ msg, onRetry }) {
  const isRCA = msg.rca_data && (msg.rca_data.investigation_id || msg.rca_data.probable_root_cause);
  const isError = msg.is_error;

  // Check for structured visual response
  const visualData = tryParseVisualResponse(msg.content);

  if (isError) {
    return (
      <div className="flex gap-3 justify-start">
        <div className="w-8 h-8 rounded-xl bg-rose-600/60 flex items-center justify-center shrink-0">
          <Bot size={15} />
        </div>
        <ErrorCard
          error={msg.error}
          onRetry={onRetry ? () => onRetry(msg.original_prompt) : null}
        />
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[78%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed bg-indigo-600/25 border border-indigo-500/30 text-indigo-100 whitespace-pre-wrap">
          {msg.content}
        </div>
        <div className="w-8 h-8 rounded-xl bg-indigo-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/30">
          <User size={15} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-xl bg-emerald-600/80 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-900/30">
        <Bot size={15} />
      </div>
      <div className="max-w-[85%] min-w-[200px] px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8 text-slate-300 shadow-sm">
        {isRCA ? (
          <RCADisplay data={msg.rca_data} />
        ) : visualData ? (
          <VisualResponseBlock
            data={visualData}
            onEdit={onRetry ? (followUp) => onRetry(followUp) : undefined}
          />
        ) : (
          <div className="prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
              components={{
                pre({ children }) {
                  return <>{children}</>;
                },
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const codeString = String(children).replace(/\n$/, "");
                  const isInline = !className && !codeString.includes("\n");

                  if (
                    language === "mermaid" ||
                    codeString.trim().startsWith("graph ") ||
                    codeString.trim().startsWith("flowchart ")
                  ) {
                    return <MermaidDiagram code={codeString} />;
                  }

                  if (isInline) {
                    return (
                      <code
                        className="bg-slate-800/80 text-indigo-300 px-1.5 py-0.5 rounded text-xs font-mono inline border border-indigo-500/20"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }

                  return <CodeBlock language={language} value={codeString} />;
                },
                ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
                ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
                p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                h2: ({ ...props }) => <h2 className="text-sm font-bold text-slate-100 mt-3 mb-1.5" {...props} />,
                h3: ({ ...props }) => <h3 className="text-xs font-bold text-slate-200 mt-2 mb-1" {...props} />,
              }}
            >
              {preprocessMarkdownContent(msg.content)}
            </ReactMarkdown>
          </div>
        )}
        {msg.execution && <ExecutionDetailsPanel execution={msg.execution} />}
        {msg.timestamp && (
          <p className="text-[10px] text-slate-600 mt-2">{timeAgo(msg.timestamp)}</p>
        )}
      </div>
    </div>
  );
}

// ── ErrorCard ─────────────────────────────────────────────────────────────────
function ErrorCard({ error, onRetry }) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyRequestId = async () => {
    if (error?.request_id) {
      await navigator.clipboard.writeText(error.request_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border border-rose-500/20 rounded-2xl rounded-tl-sm p-4 bg-rose-500/5 max-w-[85%]" role="alert">
      <div className="flex items-start gap-2.5 mb-3">
        <AlertTriangle size={15} className="text-rose-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-rose-300 mb-0.5">AI Analysis Unavailable</p>
          <p className="text-xs text-rose-300/80 leading-relaxed break-all">{error?.message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {error?.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-600/30 transition-colors cursor-pointer"
          >
            <RefreshCw size={11} /> Retry
          </button>
        )}
        {error?.request_id && (
          <button
            onClick={copyRequestId}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-xs hover:bg-white/8 transition-colors cursor-pointer"
          >
            <Copy size={11} />
            {copied ? "Copied!" : "Copy ID"}
          </button>
        )}
      </div>
      {error?.request_id && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-500 mt-2 transition-colors cursor-pointer"
        >
          <Info size={9} />
          {showDetails ? "Hide" : "Show"} technical details
        </button>
      )}
      {showDetails && error?.request_id && (
        <div className="mt-2 p-2 bg-black/30 rounded-lg text-[10px] font-mono text-slate-500">
          <p>Request ID: {error.request_id}</p>
          {error.code && <p>Error code: {error.code}</p>}
        </div>
      )}
    </div>
  );
}

// ── RCADisplay ────────────────────────────────────────────────────────────────
function RCADisplay({ data }) {
  const [showTools, setShowTools] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const confidenceText = data.confidence
    ? `${data.confidence.charAt(0).toUpperCase() + data.confidence.slice(1)} confidence`
    : null;

  return (
    <div className="space-y-3 w-full">
      {data.insufficient_evidence_warning && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20" role="alert">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-0.5">Insufficient Evidence</p>
            <p className="text-xs text-amber-300/80">{data.insufficient_evidence_warning}</p>
          </div>
        </div>
      )}
      {data.incident_summary && (
        <div className="p-3 rounded-xl bg-white/4 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Incident Summary</p>
          <p className="text-xs text-slate-200 leading-relaxed">{data.incident_summary}</p>
        </div>
      )}
      {data.probable_root_cause && (
        <div className="p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-indigo-400 uppercase tracking-wider">Probable Root Cause</p>
            {confidenceText && (
              <span className="px-2 py-0.5 rounded-full text-[10px] border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
                {confidenceText}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{data.probable_root_cause}</p>
        </div>
      )}
      {data.impact && (
        <div className="p-3 rounded-xl bg-white/3 border border-white/8">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Impact</p>
          <p className="text-xs text-slate-300 leading-relaxed">{data.impact}</p>
        </div>
      )}
      {data.recommended_resolution && (
        <div className="p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/15">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Recommended Resolution</p>
          <div className="text-xs text-slate-300 leading-relaxed">
            <ReactMarkdown>{data.recommended_resolution}</ReactMarkdown>
          </div>
        </div>
      )}
      {data.live_evidence && data.live_evidence.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvidence((v) => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 mb-2 cursor-pointer"
          >
            {showEvidence ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Zap size={11} className="text-cyan-400" />
            {data.live_evidence.length} evidence items
          </button>
          {showEvidence && (
            <div className="space-y-2">
              {data.live_evidence.map((e, i) => (
                <div key={i} className="p-2.5 rounded-lg border border-white/5 bg-black/30 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span className="uppercase text-cyan-400">{e.source}</span>
                    <span>{e.evidence_type}</span>
                  </div>
                  <p className="text-slate-300 text-xs">{e.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-slate-600 pt-1 border-t border-white/4">
        {data.investigation_duration_seconds && (
          <span className="flex items-center gap-1">
            <Clock size={9} /> {data.investigation_duration_seconds}s
          </span>
        )}
        <span className="ml-auto capitalize">{data.execution_path?.replace(/_/g, " ")}</span>
      </div>
    </div>
  );
}
