import { memo, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MessageSquare, Send, Sparkles, Square } from "lucide-react";
import toast from "react-hot-toast";

import ChatMessage from "../components/features/ChatMessage";
import { useAppStore } from "../store";
import { useStream } from "../hooks/useStream";
import { getWorkspaceMessages, normalizeApiError, streamChat } from "../services/api";
import { cn } from "../lib/utils";

const SUGGESTIONS = [
  "What are the strongest defense arguments in this case?",
  "Which IPC and CrPC provisions are most relevant here?",
  "Summarize the FIR and identify weak points for prosecution.",
  "List Supreme Court precedents supporting bail.",
  "Prepare a hearing strategy for tomorrow's mention.",
  "Draft an issue matrix from these facts and allegations.",
];

const NON_LEGAL_PATTERNS = [
  "python",
  "javascript",
  "react",
  "html",
  "css",
  "movie",
  "music",
  "recipe",
  "crypto",
  "stock",
  "gaming",
];

function isLikelyLegalQuery(text) {
  const normalized = text.toLowerCase();
  return !NON_LEGAL_PATTERNS.some((term) => normalized.includes(term));
}

function MessageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 py-2">
      <div className="skeleton h-16 w-3/4 rounded-xl" />
      <div className="skeleton ml-auto h-14 w-2/3 rounded-xl" />
      <div className="skeleton h-20 w-4/5 rounded-xl" />
    </div>
  );
}

const EmptyChat = memo(function EmptyChat({ onSuggestion }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/30 bg-gold-500/10">
        <Sparkles size={22} className="text-gold-300" />
      </div>
      <h2 className="text-[20px] font-bold text-text-primary">Start a legal conversation</h2>
      <p className="mt-1 max-w-2xl text-[12px] text-text-secondary">
        Ask LexAI about precedents, statutes, drafting strategy, or case preparation. Responses are persisted per
        workspace and chat.
      </p>
      <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-2 md:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            className="rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2 text-left text-[11px] text-text-secondary transition hover:border-gold-500/30 hover:text-text-primary"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
});

export default function ChatPage() {
  const {
    activeWorkspaceId,
    activeChatByWorkspace,
    chatThreadsByWorkspace,
    messagesByChat,
    messagesMetaByChat,
    isStreaming,
    currentStage,
    setActiveMode,
    setMessages,
    setMessagesMeta,
    setSelectedPage,
    getActiveWorkspace,
  } = useAppStore((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    activeChatByWorkspace: state.activeChatByWorkspace,
    chatThreadsByWorkspace: state.chatThreadsByWorkspace,
    messagesByChat: state.messagesByChat,
    messagesMetaByChat: state.messagesMetaByChat,
    isStreaming: state.isStreaming,
    currentStage: state.currentStage,
    setActiveMode: state.setActiveMode,
    setMessages: state.setMessages,
    setMessagesMeta: state.setMessagesMeta,
    setSelectedPage: state.setSelectedPage,
    getActiveWorkspace: state.getActiveWorkspace,
  }));

  const activeWorkspace = getActiveWorkspace();
  const activeChatId = activeWorkspaceId ? activeChatByWorkspace[activeWorkspaceId] || null : null;
  const chatThreads = activeWorkspaceId ? chatThreadsByWorkspace[activeWorkspaceId]?.items || [] : [];
  const messages = activeChatId ? messagesByChat[activeChatId] || [] : [];
  const messageMeta = activeChatId ? messagesMetaByChat[activeChatId] || {} : {};

  const { startStream, abort } = useStream();

  const [input, setInput] = useState("");
  const [loadError, setLoadError] = useState("");

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    setActiveMode("chat");
    setSelectedPage("/workspace/chat");
  }, [setActiveMode, setSelectedPage]);

  useEffect(() => {
    if (!activeWorkspaceId || !activeChatId) return;
    if (messageMeta.loading) return;
    const needsLoad = !messageMeta.loadedAt || Date.now() - messageMeta.loadedAt > 15000;
    if (!needsLoad) return;

    let mounted = true;

    async function loadMessages() {
      try {
        setMessagesMeta(activeChatId, { loading: true });
        const response = await getWorkspaceMessages(activeWorkspaceId, activeChatId, {
          force: needsLoad,
          offset: 0,
          limit: 120,
        });
        if (!mounted) return;
        setMessages(activeChatId, response || [], {
          append: false,
          hasMore: Array.isArray(response) && response.length >= 120,
          nextOffset: response?.length || 0,
        });
        setLoadError("");
      } catch (error) {
        if (!mounted) return;
        setMessagesMeta(activeChatId, { loading: false });
        setLoadError(normalizeApiError(error, "Failed to load conversation."));
      }
    }

    loadMessages();
    return () => {
      mounted = false;
    };
  }, [
    activeChatId,
    activeWorkspaceId,
    messageMeta.loadedAt,
    messages.length,
    setMessages,
    setMessagesMeta,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const history = useMemo(
    () =>
      messages
        .filter((message) => !message.isStreaming && message.content)
        .slice(-12)
        .map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  const sendMessage = (text) => {
    if (!activeWorkspaceId || !activeChatId) return;
    const normalizedText = text.trim();
    if (!normalizedText) return;
    if (isStreaming) return;

    if (!isLikelyLegalQuery(normalizedText)) {
      toast.error("LexAI is restricted to Indian legal matters.");
      return;
    }

    startStream(
      (callbacks) => streamChat(activeWorkspaceId, normalizedText, history, activeChatId, callbacks),
      normalizedText,
      { chatId: activeChatId },
    );
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleRegenerate = (index) => {
    const userMessage = [...messages.slice(0, index)].reverse().find((message) => message.role === "user");
    if (!userMessage?.content) return;
    sendMessage(userMessage.content);
  };

  const retryLoad = async () => {
    if (!activeWorkspaceId || !activeChatId) return;
    try {
      setMessagesMeta(activeChatId, { loading: true });
      const response = await getWorkspaceMessages(activeWorkspaceId, activeChatId, {
        force: true,
        offset: 0,
        limit: 120,
      });
      setMessages(activeChatId, response || [], {
        append: false,
        hasMore: Array.isArray(response) && response.length >= 120,
        nextOffset: response?.length || 0,
      });
      setLoadError("");
    } catch (error) {
      setLoadError(normalizeApiError(error, "Retry failed."));
    }
  };

  if (!activeWorkspaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="max-w-sm rounded-2xl border border-border-subtle bg-bg-elevated p-5 text-center">
          <MessageSquare size={20} className="mx-auto mb-2 text-gold-300" />
          <h2 className="text-[15px] font-semibold text-text-primary">No workspace selected</h2>
          <p className="mt-1 text-[12px] text-text-secondary">Select a workspace from the sidebar to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border-subtle bg-bg-secondary/75 px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-semibold text-text-primary">{activeWorkspace?.name || "Workspace"}</h1>
            <p className="truncate text-[11px] text-text-muted">
              {activeChatId ? `Chat ${activeChatId.slice(0, 8)} · ${chatThreads.length} thread(s)` : "Create a chat to begin"}
            </p>
          </div>
          <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
            {isStreaming ? "Streaming..." : "Ready"}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
        {messageMeta.loading ? (
          <div className="mx-auto max-w-4xl py-1">
            <p className="mb-2 text-[11px] text-text-muted">Loading conversation...</p>
            <MessageSkeleton />
          </div>
        ) : null}

        {!messageMeta.loading && loadError ? (
          <div className="mx-auto mt-6 w-full max-w-xl rounded-xl border border-border-default bg-bg-elevated p-4 text-center">
            <p className="text-[12px] text-text-secondary">{loadError}</p>
            <button type="button" onClick={retryLoad} className="btn-ghost mt-2 px-3 py-1.5 text-[11px]">
              Retry
            </button>
          </div>
        ) : null}

        {!messageMeta.loading && !loadError && messages.length === 0 ? (
          <EmptyChat
            onSuggestion={(suggestion) => {
              setInput(suggestion);
              inputRef.current?.focus();
            }}
          />
        ) : null}

        {!messageMeta.loading && !loadError && messages.length > 0 ? (
          <div className="mx-auto max-w-4xl">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id || `${index}-${message.role}`}
                message={message}
                onRegenerate={
                  message.role === "assistant" && !message.isStreaming ? () => handleRegenerate(index) : undefined
                }
              />
            ))}
            {isStreaming && currentStage ? (
              <div className="mb-2 flex items-center gap-2 text-[10px] text-text-muted">
                <Loader2 size={11} className="animate-spin" />
                {currentStage}
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        ) : null}
      </div>

      <div className="sticky-input-safe border-t border-border-subtle bg-bg-secondary/85 px-4 py-3 md:px-5">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-end gap-2">
            <textarea
              ref={(node) => {
                textareaRef.current = node;
                inputRef.current = node;
              }}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              onInput={(event) => {
                const target = event.target;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 190)}px`;
              }}
              rows={1}
              placeholder="Ask about statutes, precedents, drafting, strategy, or case facts..."
              disabled={!activeChatId || isStreaming}
              className={cn(
                "max-h-[190px] min-h-[48px] w-full resize-none rounded-2xl border border-border-default bg-bg-elevated px-3.5 py-3 text-[12px] text-text-primary outline-none focus:border-gold-500/40",
                (!activeChatId || isStreaming) && "cursor-not-allowed opacity-65",
              )}
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={abort}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/12 text-red-300"
                aria-label="Stop generation"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || !activeChatId}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  input.trim() && activeChatId
                    ? "btn-gold"
                    : "border border-border-subtle bg-bg-elevated text-text-muted",
                )}
                aria-label="Send message"
              >
                <Send size={14} />
              </button>
            )}
          </div>
          <p className="mt-1 text-center text-[10px] text-text-muted">
            Indian legal assistance only · Verify filings with a licensed advocate.
          </p>
        </div>
      </div>
    </div>
  );
}
