"use client";

import { MessageSquare, Plus, PanelLeftClose, PanelLeft, Search } from "lucide-react";
import ProviderStatusBadge from "./ProviderStatusBadge";

export default function ChatHeader({
  onToggleDrawer,
  onNewChat,
  providerStatus,
  providerLoading,
  currentTitle,
}) {
  return (
    <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-[var(--bg-base)]/90 shrink-0 gap-4">
      {/* Left section: Drawer Toggle + Agent Title + Session Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleDrawer}
          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/8 transition-colors flex items-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
          title="Toggle Chat History Drawer"
          aria-label="Toggle Conversation History"
        >
          <PanelLeft size={16} className="text-sky-400" />
          <span className="hidden sm:inline">Chats</span>
        </button>

        <div className="min-w-0 flex items-center gap-2" aria-live="polite">
          <h1 className="text-sm font-bold text-white tracking-tight shrink-0 flex items-center gap-1.5">
            <MessageSquare size={16} className="text-sky-400" />
            AI-RCA Agent
          </h1>
          {currentTitle && (
            <>
              <span className="text-slate-600 text-xs hidden md:inline">/</span>
              <span className="text-xs text-slate-400 truncate max-w-[200px] lg:max-w-[300px] hidden md:inline font-normal">
                {currentTitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right section: Provider Status Badge + New Chat Button */}
      <div className="flex items-center gap-2.5 shrink-0">
        <ProviderStatusBadge providerStatus={providerStatus} loading={providerLoading} />

        <button
          onClick={onNewChat}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-sky-900/30 shrink-0 cursor-pointer"
          title="Start New Chat"
          aria-label="New Chat"
        >
          <Plus size={14} />
          <span className="hidden sm:inline">New Chat</span>
        </button>
      </div>
    </header>
  );
}
