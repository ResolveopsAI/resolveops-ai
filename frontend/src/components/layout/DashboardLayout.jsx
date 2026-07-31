"use client";

import SidebarNavigation from "./SidebarNavigation";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Shield, Activity, ChevronRight, User, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { getUserRole } from "@/lib/api";

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState("user");

  useEffect(() => {
    setUserRole(getUserRole());
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("jwt_token");
    router.push("/login");
  };

  // Map route to human readable titles
  const getPageTitle = (path) => {
    if (path === "/") return "Command Center";
    if (path.startsWith("/chat")) return "AI Copilot";
    if (path.startsWith("/suggestions")) return "AI Suggestions";
    if (path === "/analytics/monitoring") return "Live Kubernetes Monitoring";
    if (path.startsWith("/analytics")) return "System Analytics";
    if (path.startsWith("/integrations")) return "Infrastructure Integrations";
    if (path.startsWith("/github")) return "GitHub Sync";
    if (path.startsWith("/azure")) return "Azure Hub";
    if (path.startsWith("/aws")) return "AWS Hub";
    if (path.startsWith("/audit")) return "Audit Logs";
    return "ResolveOps AI";
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-200" style={{ background: "#06091a" }}>
      {/* Sidebar Navigation (Sticky Viewport Locked) */}
      <SidebarNavigation />

      {/* Main Content Area with Sticky Header */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Bar (Fixed at top of page view) */}
        <header className="sticky top-0 z-10 px-6 py-3.5 flex items-center justify-between border-b border-white/[0.06] bg-[#06091a]/80 backdrop-blur-xl shrink-0">
          
          {/* Left Breadcrumb & Page Info */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span>Platform</span>
              <ChevronRight size={12} className="text-slate-600" />
              <span className="text-sky-400 font-semibold">{getPageTitle(pathname)}</span>
            </div>
          </div>

          {/* Right Header Status & Top Logout Button */}
          <div className="flex items-center gap-3">
            {/* Live Telemetry Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Telemetry Active</span>
            </div>

            {/* Quick Logout Header Trigger */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-300 hover:text-rose-300 text-xs font-medium transition-all cursor-pointer shadow-sm"
              title="Logout from session"
            >
              <User size={13} className="text-sky-400" />
              <span className="capitalize">{userRole}</span>
              <span className="text-slate-600">|</span>
              <LogOut size={13} className="text-rose-400" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Scrollable Page Body */}
        <main className="flex-1 p-5 overflow-y-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

