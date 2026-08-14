import { useState, useEffect, useCallback } from "react";
import { fetchApi } from "@/lib/api";

export function useConversations(currentSessionId, onNewChat, onSessionSelect) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const data = await fetchApi("/api/chat/sessions");
      if (Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (b.timestamp || "").localeCompare(a.timestamp || "");
        });
        setSessions(sorted);
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const handler = () => loadSessions();
    window.addEventListener("chat-updated", handler);
    return () => window.removeEventListener("chat-updated", handler);
  }, [loadSessions]);

  const deleteSession = async (sessionId) => {
    try {
      await fetchApi(`/api/chat/history?session_id=${sessionId}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      if (currentSessionId === sessionId) {
        onNewChat?.();
      }
      // Notify other parts of the UI that conversations changed
      window.dispatchEvent(new Event("chat-updated"));
    } catch (err) {
      console.error("Delete session failed:", err);
    }
  };

  const renameSession = async (sessionId, newTitle) => {
    if (!newTitle.trim()) return;
    try {
      await fetchApi(`/api/v1/chat/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === sessionId ? { ...s, title: newTitle.trim() } : s
        )
      );
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === sessionId ? { ...s, title: newTitle.trim() } : s
        )
      );
    }
  };

  return {
    sessions,
    loading,
    loadSessions,
    deleteSession,
    renameSession,
  };
}
