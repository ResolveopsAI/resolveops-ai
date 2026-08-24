"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ChatHeader from "@/components/chat/ChatHeader";
import ConversationDrawer from "@/components/chat/ConversationDrawer";
import ChatWelcomeState from "@/components/chat/ChatWelcomeState";
import ChatComposer from "@/components/chat/ChatComposer";
import { MessageBubble } from "@/components/chat/ChatMessage";
import { useProviderStatus } from "@/hooks/useProviderStatus";
import { fetchApi } from "@/lib/api";
import { Activity, Bot } from "lucide-react";

// Secret Redaction helper
const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{36,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /(?:password|secret|token|key)\s*[:=]\s*["']?([^\s"']{8,})["']?/gi,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];
function redactSecrets(text) {
  let result = text;
  SECRET_PATTERNS.forEach((pattern) => {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  });
  return result;
}

function decodeJwtPayload(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

export default function AICopilot() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [currentTitle, setCurrentTitle] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState("preparing");
  const [fullName, setFullName] = useState("");
  const [imageFile, setImageFile] = useState(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [voiceSending, setVoiceSending] = useState(false);

  const messagesEndRef = useRef(null);
  const { providerStatus, loading: providerLoading, refetch: refetchProvider } = useProviderStatus();

  // Load session chat messages
  const loadSession = useCallback(async (sid) => {
    setLoading(true);
    try {
      const history = await fetchApi(`/api/chat/history?session_id=${sid}`);
      if (Array.isArray(history) && history.length > 0) {
        const safeParse = (val) => {
          if (!val) return null;
          if (typeof val === "object") return val;
          try { return JSON.parse(val); } catch { return null; }
        };
        setMessages(
          history.map((msg) => ({
            role: msg.role || "assistant",
            content:
              msg.role === "user" && msg.image_base64
                ? `🖼️ [Uploaded Architecture Diagram] ${msg.content || ""}`
                : msg.content || "",
            timestamp: msg.timestamp,
            execution: safeParse(msg.execution),
            rca_data: safeParse(msg.rca_data) || (msg.role === "assistant" && msg.content?.trim().startsWith("{") ? safeParse(msg.content) : null),
          }))
        );
        if (history[0]?.title) {
          setCurrentTitle(history[0].title);
        }
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialization & Auth check
  useEffect(() => {
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const payload = decodeJwtPayload(token);
    const name = payload.username || payload.full_name || payload.email?.split("@")[0] || "";
    setFullName(name);

    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (sid) {
      setSessionId(sid);
      loadSession(sid);
    } else {
      setMessages([]);
      setCurrentTitle("");
      setLoading(false);
    }
  }, [pathname, router, loadSession]);

  // Pre-fill query from URL search params
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && messages.length === 0) {
      handleSend(q);
    }
  }, [pathname]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSessionSelect = (sid) => {
    setSessionId(sid);
    router.replace(`/chat?session_id=${sid}`);
    loadSession(sid);
  };

  const startNewChat = () => {
    setSessionId(null);
    setCurrentTitle("");
    setImageFile(null);
    setMessages([]);
    router.replace("/chat");
  };

  // Voice toggle
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          setVoiceSending(true);
          try {
            const res = await fetchApi("/api/chat/voice", {
              method: "POST",
              body: JSON.stringify({ audio_base64: reader.result.split(",")[1] }),
            });
            if (res.text) handleSend(res.text);
          } catch {
            alert("Voice transcription failed.");
          } finally {
            setVoiceSending(false);
          }
        };
      };
      mr.start();
      setIsRecording(true);
    } catch {
      alert("Microphone access denied.");
    }
  };

  const handleSend = async (rawInput) => {
    if (!rawInput && !imageFile) return;
    const safeMsg = redactSecrets(rawInput);
    const userDisplayContent = imageFile
      ? `🖼️ [Uploaded Architecture Diagram] ${safeMsg}`
      : safeMsg;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userDisplayContent,
        timestamp: new Date().toISOString(),
      },
    ]);

    setSending(true);
    setSendingStatus("preparing");
    const currentImage = imageFile;
    setImageFile(null);

    // Status progression simulator
    const statusProgression = ["preparing", "collecting", "correlating", "generating"];
    let statusIdx = 0;
    const statusTimer = setInterval(() => {
      statusIdx = Math.min(statusIdx + 1, statusProgression.length - 1);
      setSendingStatus(statusProgression[statusIdx]);
    }, 4000);

    try {
      const payload = {
        message: safeMsg || "Analyze uploaded infrastructure diagram.",
        image_base64: currentImage,
      };
      if (sessionId) payload.session_id = sessionId;

      const data = await fetchApi("/api/chat", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      clearInterval(statusTimer);

      const rcaData =
        data.investigation_id || data.probable_root_cause ? data : null;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "",
          rca_data: rcaData,
          execution: data.execution,
          timestamp: new Date().toISOString(),
        },
      ]);

      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
        router.replace(`/chat?session_id=${data.session_id}`);
      }
      window.dispatchEvent(new Event("chat-updated"));
    } catch (err) {
      clearInterval(statusTimer);

      // Preserves original user message upon failure & displays friendly ErrorCard
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          is_error: true,
          error: {
            message: err.message || "AI service temporarily unavailable.",
            code: err.code,
            request_id: err.request_id,
            retryable: err.retryable ?? true,
          },
          original_prompt: safeMsg,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      setSendingStatus("preparing");
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5 bg-[#060610]">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border border-violet-500/20 flex items-center justify-center">
              <Activity className="text-violet-400 w-7 h-7 animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-xl animate-pulse" />
          </div>
          <div className="text-center">
            <p className="text-slate-200 font-semibold text-sm">Initializing AI Copilot</p>
            <p className="text-slate-500 text-xs font-mono mt-1 tracking-wider">CONNECTING INTELLIGENCE...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Workspace container - fills the <main> content area exactly (undoes p-5 padding) */}
      <div className="flex flex-col h-full -m-5 overflow-hidden bg-[#060610] min-w-0">
        
        {/* Header */}
        <ChatHeader
          onToggleDrawer={() => setDrawerOpen((prev) => !prev)}
          onNewChat={startNewChat}
          providerStatus={providerStatus}
          providerLoading={providerLoading}
          currentTitle={currentTitle}
        />

        {/* Collapsible Conversation History Drawer */}
        <ConversationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          onNewChat={startNewChat}
        />

        {/* Main Conversation Workspace */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6">
          {messages.length === 0 ? (
            <ChatWelcomeState
              fullName={fullName}
              onSelectPrompt={(prompt) => handleSend(prompt)}
            />
          ) : (
            <div className="max-w-7xl w-full mx-auto space-y-6">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  onRetry={msg.is_error && msg.original_prompt ? handleSend : null}
                />
              ))}

              {sending && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-violet-600/80 flex items-center justify-center shrink-0">
                    <Bot size={15} />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/4 border border-white/8">
                    <p className="text-xs text-violet-400 font-medium capitalize">
                      {sendingStatus} investigation...
                    </p>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" />
                      <div
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <div
                        className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Sticky Chat Composer */}
        <ChatComposer
          onSend={handleSend}
          disabled={sending}
          imageFile={imageFile}
          setImageFile={setImageFile}
          isRecording={isRecording}
          onToggleRecording={toggleRecording}
          voiceSending={voiceSending}
        />
      </div>
    </DashboardLayout>
  );
}
