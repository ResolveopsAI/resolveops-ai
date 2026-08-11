"use client";

import React, { useState, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";

const ExcalidrawBoard = dynamic(
  () => import("@/components/common/ExcalidrawBoard"),
  { ssr: false }
);

function findExcalidrawCode(children) {
  if (!children) return null;
  if (Array.isArray(children)) {
    for (const child of children) {
      const res = findExcalidrawCode(child);
      if (res) return res;
    }
    return null;
  }
  if (children.props) {
    const className = children.props.className || "";
    if (typeof className === "string" && (className.includes("language-excalidraw") || className.includes("language-json"))) {
      const childrenVal = children.props.children;
      const codeText = Array.isArray(childrenVal) ? childrenVal.join("") : String(childrenVal || "");
      if (className.includes("language-excalidraw") || codeText.includes('"type": "excalidraw"')) {
        return { codeText };
      }
    }
    if (children.props.children) {
      return findExcalidrawCode(children.props.children);
    }
  }
  return null;
}

function CodeBlock({ children, ...props }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef(null);

  const excalidraw = useMemo(() => {
    return findExcalidrawCode(children);
  }, [children]);

  const language = useMemo(() => {
    if (children && children.props && children.props.className) {
      const match = /language-(\w+)/.exec(children.props.className);
      return match ? match[1] : "";
    }
    return "";
  }, [children]);

  if (excalidraw) {
    try {
      let cleanedJsonText = excalidraw.codeText.trim();
      cleanedJsonText = cleanedJsonText.replace(/,\s*([\]}])/g, '$1');
      const parsedElements = JSON.parse(cleanedJsonText);
      return <ExcalidrawBoard elements={parsedElements.elements || []} />;
    } catch (e) {
      return (
        <div>
          <div className="bg-rose-950/20 border border-rose-500/30 text-rose-400 p-3 rounded-lg text-xs font-mono my-2 animate-in fade-in">
            Failed to render diagram canvas. details: {String(e)}
          </div>
          <pre className="bg-[#020617] border border-white/10 rounded-lg p-4 overflow-x-auto font-mono text-xs text-slate-400 mt-2">
            {excalidraw.codeText}
          </pre>
        </div>
      );
    }
  }

  const handleCopy = async () => {
    if (codeRef.current) {
      const text = codeRef.current.innerText || "";
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group my-3 rounded-xl border border-white/10 overflow-hidden bg-[#020617]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/60 border-b border-white/[0.06] text-xs">
        <span className="text-slate-400 font-mono uppercase tracking-wider text-[11px]">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer font-sans"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre
        ref={codeRef}
        className="p-4 overflow-x-auto font-mono text-xs text-slate-300 bg-transparent custom-scrollbar"
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

export default function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      components={{
        pre: ({ node, ...props }) => <CodeBlock {...props} />,
        code: ({ node, ...props }) => <code className="bg-white/10 text-sky-300 px-1.5 py-0.5 rounded text-xs font-mono border border-white/5" {...props} />,
        h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-white mt-4 mb-2 first:mt-0" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-md font-semibold text-white mt-3 mb-1 first:mt-0" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-sm font-semibold text-slate-200 mt-2 mb-1 first:mt-0" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1 my-2" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1 my-2" {...props} />,
        li: ({ node, ...props }) => <li className="text-slate-300" {...props} />,
        p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed text-sm text-slate-300" {...props} />,
        a: ({ node, ...props }) => <a className="text-sky-400 hover:text-sky-300 hover:underline transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
