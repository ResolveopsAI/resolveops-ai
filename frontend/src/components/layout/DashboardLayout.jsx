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
    if (path.startsWith("/healing")) return "Self-Healing Engine";
    return "ResolveOps AI";
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-slate-200" style={{ background: "#06091a" }}>
      {/* Keyboard Accessibility Skip Link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-sky-600 focus:text-white focus:rounded-md focus:m-2">
        Skip to main content
      </a>

      {/* Sidebar Navigation (Sticky Viewport Locked) */}
      <SidebarNavigation />

      {/* Main Content Area with Sticky Header */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Bar (Fixed at top of page view) */}
        <header role="banner" className="sticky top-0 z-10 px-6 py-3.5 flex items-center justify-between border-b border-white/[0.06] bg-[#06091a]/80 backdrop-blur-xl shrink-0">
          
          {/* Left Breadcrumb & Page Info */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-slate-400 font-medium">
              <span>Platform</span>
              <ChevronRight size={12} className="text-slate-600" />
              <span className="text-violet-400 font-semibold">{getPageTitle(pathname)}</span>
            </div>
          </div>

          {/* Right Header Status & Top Logout Button */}
          <div className="flex items-center gap-3">
            {/* Live Telemetry Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Telemetry Active</span>
            </div>

            {/* Role Pill (non-clickable) */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs font-medium">
              <User size={13} className="text-violet-400" />
              <span className="text-slate-300 capitalize">{userRole}</span>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-rose-500/15 border border-white/[0.08] hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-medium transition-all cursor-pointer"
              title="Logout from session"
              aria-label="Logout from session"
            >
              <LogOut size={13} className="text-rose-400" />
              <span>Logout</span>
            </button>

          </div>
        </header>

        {/* Page Body - child handles internal scrolling to avoid double scrollbars */}
        <main id="main-content" role="main" className="flex-1 p-5 overflow-auto min-w-0 min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}

