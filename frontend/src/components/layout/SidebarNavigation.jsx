"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Cloud, GitBranch, LayoutDashboard, MessageSquareCode, Lightbulb,
  BarChart3, Settings, Server, PanelLeftClose, PanelLeftOpen,
  MonitorDot, Zap
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchApi, getUserRole } from "@/lib/api";

const LOGO = (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="7" fill="url(#lg)" />
    {/* Hexagonal Ops Shield */}
    <path d="M14 5L22 9.5V18.5L14 23L6 18.5V9.5L14 5Z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinejoin="round" fill="rgba(255,255,255,0.06)"/>
    {/* AI Incident Resolution Waveform Pulse */}
    <path d="M8.5 14H11.5L13 10.5L15 17.5L16.5 12.5L17.5 14H19.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="14" cy="14" r="1.5" fill="white" />
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#c084fc"/>
        <stop offset="0.5" stopColor="#a78bfa"/>
        <stop offset="1" stopColor="#8b5cf6"/>
      </linearGradient>
    </defs>
  </svg>
);

export default function SidebarNavigation() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [integrations, setIntegrations] = useState({ github: false, aws: false, azure: false });
  const [systemTime, setSystemTime] = useState("");
  const [userRole, setUserRole] = useState("user");

  useEffect(() => {
    setUserRole(getUserRole());
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved === "true") setIsCollapsed(true);
  }, []);

  useEffect(() => {
    const tick = () => setSystemTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  const loadIntegrations = () => {
    const token = typeof window !== "undefined" && localStorage.getItem("jwt_token");
    if (!token) return;
    fetchApi("/api/v1/integrations")
      .then((data) => { if (data) setIntegrations(data); })
      .catch(() => {});
  };

  useEffect(() => { loadIntegrations(); }, [pathname]);

  const navItems = [
    ...(userRole === "admin" ? [{ name: "Command Center", path: "/", icon: LayoutDashboard }] : []),
    ...(integrations.github ? [{ name: "GitHub Sync",   path: "/github",       icon: GitBranch }] : []),
    ...(integrations.azure  ? [{ name: "Azure Hub",     path: "/azure",        icon: Cloud }] : []),
    ...(integrations.aws    ? [{ name: "AWS Hub",       path: "/aws",          icon: Server }] : []),
    { name: "AI Copilot",     path: "/chat",        icon: MessageSquareCode, always: true },
    { name: "Suggestions",    path: "/suggestions", icon: Lightbulb, always: true },
    { name: "Analytics",      path: "/analytics",   icon: BarChart3, always: true },
    ...(userRole === "admin" ? [{ name: "Monitoring",     path: "/analytics/monitoring", icon: MonitorDot }] : []),
    ...(userRole === "admin" ? [{ name: "Self-Healing",   path: "/healing",              icon: Zap }] : []),
    { name: "Integrations",   path: "/integrations",icon: Settings,   always: true },
  ];

  return (
    <aside
      role="navigation"
      aria-label="Main navigation"
      aria-expanded={!isCollapsed}
      className={`sticky top-3 h-[calc(100vh-24px)] z-20 my-3 ml-3 mr-0 rounded-2xl shrink-0 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        isCollapsed ? "w-[68px]" : "w-[230px]"
      }`}
      style={{
        background: "linear-gradient(180deg, #0d1424 0%, #080d1a 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "1px 0 0 rgba(255,255,255,0.03) inset, 0 4px 30px rgba(0,0,0,0.5)"
      }}
    >
      {/* Top glow strip */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent pointer-events-none" />

      {/* Logo header */}
      <div className={`flex items-center gap-3 p-4 shrink-0 ${isCollapsed ? "justify-center" : ""}`}>
        <div className="shrink-0">{LOGO}</div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-[13px] tracking-tight leading-none text-white">ResolveOps AI</h1>
            <p className="text-[11px] text-violet-400/80 mt-0.5 uppercase tracking-[0.15em] font-semibold">Command Center</p>
          </div>
        )}
        {!isCollapsed && (
          <button
            onClick={toggleCollapse}
            className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <PanelLeftClose size={17} />
          </button>
        )}
      </div>

      {/* Collapse button when collapsed */}
      {isCollapsed && (
        <div className="px-2.5 mb-2 flex justify-center shrink-0">
          <button
            onClick={toggleCollapse}
            className="w-full flex justify-center items-center py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-violet-400 rounded-lg border border-white/5 transition-colors cursor-pointer"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 mb-2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent shrink-0" />

      {/* Nav items */}
      <nav className="flex-1 px-2.5 space-y-1 overflow-y-auto py-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <Link key={item.name} href={item.path} title={isCollapsed ? item.name : undefined} aria-current={isActive ? "page" : undefined}>
              <div
                className={`w-full flex items-center rounded-xl transition-all duration-150 group cursor-pointer
                  ${isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"}
                  ${isActive
                    ? "nav-active"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06]"
                  }`}
              >
                <Icon
                  size={17}
                  className={`shrink-0 transition-colors ${isActive ? "text-violet-400" : "text-slate-400 group-hover:text-slate-200"}`}
                />
                {!isCollapsed && (
                  <span className="font-medium text-[13px] whitespace-nowrap tracking-tight">
                    {item.name}
                  </span>
                )}
                {!isCollapsed && isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 pulse-dot" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section (Sticky at bottom of sidebar) */}
      <div className="mt-auto shrink-0 pb-2">
        <div className="mx-4 mb-2.5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* System status row */}
        {!isCollapsed && (
          <div className="mx-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-bold">System</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-emerald-400 font-bold">ONLINE</span>
              </div>
            </div>
            <p className="font-mono text-xs text-slate-400 tracking-wider">{systemTime} UTC+5:30</p>
          </div>
        )}
      </div>

      {/* Bottom glow strip */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent pointer-events-none" />
    </aside>
  );
}


