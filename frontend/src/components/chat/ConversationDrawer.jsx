"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus, Search, MessageSquare, Trash2, Pencil, Check, X, Pin,
  Clock, ChevronRight, Loader2, XCircle
} from "lucide-react";
import { useConversations } from "@/hooks/useConversations";

function timeAgo(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const seconds = Math.floor((Date.now() - date) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ConversationDrawer({
  isOpen,
  onClose,
  currentSessionId,
  onSessionSelect,
  onNewChat,
}) {
  const { sessions, loading, deleteSession, renameSession } = useConversations(
    currentSessionId,
    onNewChat,
    onSessionSelect
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const drawerRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap / click outside
  const handleClickOutside = useCallback(
    (e) => {
      if (isOpen && drawerRef.current && !drawerRef.current.contains(e.target)) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, handleClickOutside]);

  if (!isOpen) return null;

  const handleDelete = (e, sessionId) => {
    e.stopPropagation();
    // Single-click delete with confirmation
    const ok = window.confirm("Delete this conversation? This action cannot be undone.");
    if (ok) {
      deleteSession(sessionId);
      setDeletingId(null);
      // notify other components to refresh
      window.dispatchEvent(new Event("chat-updated"));
    }
  };

  const startRename = (e, session) => {
    e.stopPropagation();
    setRenamingId(session.session_id);
    setRenameValue(session.title || "New Chat");
  };

  const confirmRename = (e, sessionId) => {
    e.stopPropagation();
    if (renameValue.trim()) {
      renameSession(sessionId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const filteredSessions = sessions.filter((s) =>
    !searchQuery || (s.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div
        ref={drawerRef}
        className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-[var(--bg-base)] border-r border-white/10 shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-sky-400" />
            <h2 id="drawer-title" className="text-sm font-bold text-white tracking-tight">Conversations</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                onNewChat();
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="New Chat"
              aria-label="Start New Chat"
            >
              <Plus size={14} />
              <span className="text-[11px]">New</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors ml-1 cursor-pointer"
              aria-label="Close conversation drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <label htmlFor="search-conversations" className="sr-only">Search conversations</label>
            <input
              id="search-conversations"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1.5 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={18} className="animate-spin text-slate-600" />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <MessageSquare size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 leading-relaxed">
                {searchQuery ? "No matching conversations." : "No saved conversations yet."}
              </p>
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isActive = s.session_id === currentSessionId;
              const isRenaming = renamingId === s.session_id;
              const isDeleting = deletingId === s.session_id;

              return (
                <div
                  key={s.session_id}
                  onClick={() => {
                    onSessionSelect(s.session_id);
                    onClose();
                  }}
                  className={`group relative flex flex-col gap-1.5 px-3.5 py-3 rounded-xl cursor-pointer transition-all duration-150 border min-h-[52px] ${
                    isActive
                      ? "bg-sky-500/10 border-sky-500/25 text-white"
                      : "hover:bg-white/5 text-slate-400 border-transparent hover:border-white/5"
                  }`}
                >
                  {isRenaming ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename(e, s.session_id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 bg-white/10 border border-indigo-500/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none min-w-0"
                      />
                      <button onClick={(e) => confirmRename(e, s.session_id)} className="text-emerald-400 hover:text-emerald-300">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setRenamingId(null)} className="text-slate-500 hover:text-slate-300">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-1">
                        <span className={`text-xs font-medium truncate flex-1 leading-snug ${isActive ? "text-white" : "text-slate-300"}`}>
                          {s.title || "New Chat"}
                        </span>
                        <div className={`flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? "opacity-100" : ""}`}>
                          <button
                            onClick={(e) => startRename(e, s)}
                            className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-slate-300"
                            title="Rename"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, s.session_id)}
                            className={`p-1 rounded transition-colors ${
                              isDeleting
                                ? "bg-rose-500/20 text-rose-400"
                                : "hover:bg-white/10 text-slate-500 hover:text-rose-400"
                            }`}
                            title={isDeleting ? "Click again to confirm" : "Delete"}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span className="truncate">{s.last_message || "No messages"}</span>
                        <span className="shrink-0 ml-2">{timeAgo(s.timestamp)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
