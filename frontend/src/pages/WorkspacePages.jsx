import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  FileText,
  FolderOpen,
  Gavel,
  Loader2,
  Search,
  Send,
  ShieldAlert,
  Square,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import ChatMessage from "../components/features/ChatMessage";
import UploadDropzone from "../components/features/UploadDropzone";
import { useAppStore } from "../store";
import { useStream } from "../hooks/useStream";
import {
  deleteDocument,
  getWorkspaceMessages,
  listDocuments,
  normalizeApiError,
  streamCounterArgs,
  streamDraft,
  streamSearch,
  streamVerdict,
} from "../services/api";
import { cn } from "../lib/utils";

function useActiveChatContext() {
  const {
    activeWorkspaceId,
    activeChatByWorkspace,
    messagesByChat,
    messagesMetaByChat,
    getActiveWorkspace,
    setMessages,
    setMessagesMeta,
  } = useAppStore((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    activeChatByWorkspace: state.activeChatByWorkspace,
    messagesByChat: state.messagesByChat,
    messagesMetaByChat: state.messagesMetaByChat,
    getActiveWorkspace: state.getActiveWorkspace,
    setMessages: state.setMessages,
    setMessagesMeta: state.setMessagesMeta,
  }));

  const activeWorkspace = getActiveWorkspace();
  const activeChatId = activeWorkspaceId ? activeChatByWorkspace[activeWorkspaceId] || null : null;
  const messages = activeChatId ? messagesByChat[activeChatId] || [] : [];
  const messageMeta = activeChatId ? messagesMetaByChat[activeChatId] || {} : {};

  useEffect(() => {
    if (!activeWorkspaceId || !activeChatId) return;
    if (messageMeta.loading) return;
    if (messageMeta.loadedAt && Date.now() - messageMeta.loadedAt < 15_000) return;

    let mounted = true;
    async function loadHistory() {
      try {
        setMessagesMeta(activeChatId, { loading: true });
        const data = await getWorkspaceMessages(activeWorkspaceId, activeChatId, {
          force: true,
          offset: 0,
          limit: 120,
        });
        if (!mounted) return;
        setMessages(activeChatId, data || [], {
          append: false,
          hasMore: Array.isArray(data) && data.length >= 120,
          nextOffset: data?.length || 0,
        });
      } catch (error) {
        if (!mounted) return;
        setMessagesMeta(activeChatId, { loading: false });
      }
    }
    loadHistory();
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

  return {
    activeWorkspace,
    activeWorkspaceId,
    activeChatId,
    messages,
    messagesLoading: Boolean(messageMeta.loading),
  };
}

function StreamShell({
  icon: Icon,
  title,
  subtitle,
  children,
  messages,
  messagesLoading,
  isStreaming,
  abort,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border-subtle bg-bg-secondary/75 px-4 py-3 md:px-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-gold-300" />
            <div>
              <h1 className="text-[13px] font-semibold text-text-primary">{title}</h1>
              <p className="text-[11px] text-text-muted">{subtitle}</p>
            </div>
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={abort}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/35 bg-red-500/12 px-2 py-1 text-[10px] text-red-300"
            >
              <Square size={10} />
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
        {messagesLoading ? (
          <div className="mx-auto max-w-4xl space-y-2">
            <div className="skeleton h-14 w-3/4 rounded-xl" />
            <div className="skeleton ml-auto h-14 w-2/3 rounded-xl" />
            <div className="skeleton h-16 w-4/5 rounded-xl" />
          </div>
        ) : messages.length ? (
          <div className="mx-auto max-w-4xl">
            {messages.map((message, index) => (
              <ChatMessage key={message.id || `${message.role}-${index}`} message={message} />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center">{children}</div>
        )}
      </div>
    </div>
  );
}

export function CounterArgsPage() {
  const { activeWorkspaceId, activeChatId, messages, messagesLoading } = useActiveChatContext();
  const { isStreaming, setActiveMode, setSelectedPage } = useAppStore((state) => ({
    isStreaming: state.isStreaming,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
  }));
  const { startStream, abort } = useStream();
  const [petitionText, setPetitionText] = useState("");

  useEffect(() => {
    setActiveMode("counter_args");
    setSelectedPage("/workspace/counter-args");
  }, [setActiveMode, setSelectedPage]);

  const run = () => {
    if (!petitionText.trim() || !activeWorkspaceId || !activeChatId) return;
    startStream(
      (callbacks) => streamCounterArgs(activeWorkspaceId, petitionText.trim(), activeChatId, callbacks),
      `Generate counter arguments for: ${petitionText.trim().slice(0, 120)}`,
      { chatId: activeChatId },
    );
    setPetitionText("");
  };

  return (
    <StreamShell
      icon={ShieldAlert}
      title="Counter Arguments"
      subtitle="Generate defense strategy with legal reasoning and precedents."
      messages={messages}
      messagesLoading={messagesLoading}
      isStreaming={isStreaming}
      abort={abort}
    >
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-elevated p-4">
        <h3 className="text-[14px] font-semibold text-text-primary">Build counter arguments</h3>
        <p className="mt-1 text-[11px] text-text-secondary">
          Paste prosecution submissions, allegations, or key facts to generate defense strategy.
        </p>
        <textarea
          value={petitionText}
          onChange={(event) => setPetitionText(event.target.value)}
          rows={7}
          className="mt-3 w-full resize-none rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
          placeholder="Paste petition content, allegations, or statement of facts..."
        />
        <button
          type="button"
          onClick={run}
          disabled={!petitionText.trim() || isStreaming || !activeWorkspaceId || !activeChatId}
          className="btn-gold mt-3 w-full px-3 py-2 text-[12px] disabled:opacity-60"
        >
          Generate Counter Arguments
        </button>
      </div>
    </StreamShell>
  );
}

export function VerdictPage() {
  const { activeWorkspaceId, activeChatId, messages, messagesLoading } = useActiveChatContext();
  const { isStreaming, setActiveMode, setSelectedPage } = useAppStore((state) => ({
    isStreaming: state.isStreaming,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
  }));
  const { startStream, abort } = useStream();
  const [facts, setFacts] = useState("");

  useEffect(() => {
    setActiveMode("verdict");
    setSelectedPage("/workspace/verdict");
  }, [setActiveMode, setSelectedPage]);

  const run = () => {
    if (!facts.trim() || !activeWorkspaceId || !activeChatId) return;
    startStream(
      (callbacks) => streamVerdict(activeWorkspaceId, facts.trim(), activeChatId, callbacks),
      `Analyze likely outcome: ${facts.trim().slice(0, 120)}`,
      { chatId: activeChatId },
    );
    setFacts("");
  };

  return (
    <StreamShell
      icon={Gavel}
      title="Verdict Predictor"
      subtitle="Estimate probable outcomes from facts and similar judgments."
      messages={messages}
      messagesLoading={messagesLoading}
      isStreaming={isStreaming}
      abort={abort}
    >
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-elevated p-4">
        <h3 className="text-[14px] font-semibold text-text-primary">Predict verdict direction</h3>
        <p className="mt-1 text-[11px] text-text-secondary">
          Provide case facts, allegations, evidence posture, and procedural stage.
        </p>
        <textarea
          value={facts}
          onChange={(event) => setFacts(event.target.value)}
          rows={7}
          className="mt-3 w-full resize-none rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
          placeholder="Describe facts, charges, key evidence, witness posture, and defenses..."
        />
        <button
          type="button"
          onClick={run}
          disabled={!facts.trim() || isStreaming || !activeWorkspaceId || !activeChatId}
          className="btn-gold mt-3 w-full px-3 py-2 text-[12px] disabled:opacity-60"
        >
          Analyze Outcome
        </button>
      </div>
    </StreamShell>
  );
}

const DOC_TYPES = [
  { value: "petition", label: "Writ Petition" },
  { value: "bail_application", label: "Bail Application" },
  { value: "notice", label: "Legal Notice" },
  { value: "affidavit", label: "Affidavit" },
  { value: "complaint", label: "Criminal Complaint" },
  { value: "reply", label: "Reply to Notice" },
];

export function DraftPage() {
  const { activeWorkspaceId, activeChatId, messages, messagesLoading } = useActiveChatContext();
  const { isStreaming, setActiveMode, setSelectedPage } = useAppStore((state) => ({
    isStreaming: state.isStreaming,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
  }));
  const { startStream, abort } = useStream();
  const [docType, setDocType] = useState("petition");
  const [details, setDetails] = useState({
    petitioner: "",
    respondent: "",
    court: "",
    advocate: "",
    facts: "",
    relief: "",
  });

  useEffect(() => {
    setActiveMode("draft");
    setSelectedPage("/workspace/draft");
  }, [setActiveMode, setSelectedPage]);

  const run = () => {
    if (!activeChatId) return;
    startStream(
      (callbacks) => streamDraft(docType, details, activeWorkspaceId, activeChatId, callbacks),
      `Draft ${docType.replace("_", " ")} document`,
      { chatId: activeChatId },
    );
  };

  return (
    <StreamShell
      icon={FileText}
      title="AI Drafter"
      subtitle="Generate structured legal documents for advocate review."
      messages={messages}
      messagesLoading={messagesLoading}
      isStreaming={isStreaming}
      abort={abort}
    >
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-elevated p-4">
        <h3 className="text-[14px] font-semibold text-text-primary">Draft legal documents</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {DOC_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setDocType(type.value)}
              className={cn(
                "rounded-xl border px-2 py-1.5 text-[11px] transition",
                docType === type.value
                  ? "border-gold-500/35 bg-gold-500/10 text-gold-200"
                  : "border-border-subtle bg-bg-secondary text-text-secondary hover:border-border-default",
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {[
            ["petitioner", "Petitioner / Complainant"],
            ["respondent", "Respondent / Accused"],
            ["court", "Court"],
            ["advocate", "Advocate"],
          ].map(([key, label]) => (
            <input
              key={key}
              value={details[key]}
              onChange={(event) => setDetails((prev) => ({ ...prev, [key]: event.target.value }))}
              placeholder={label}
              className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
            />
          ))}
        </div>
        <textarea
          value={details.facts}
          onChange={(event) => setDetails((prev) => ({ ...prev, facts: event.target.value }))}
          rows={4}
          className="mt-2 w-full resize-none rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
          placeholder="Case facts and chronology..."
        />
        <input
          value={details.relief}
          onChange={(event) => setDetails((prev) => ({ ...prev, relief: event.target.value }))}
          placeholder="Relief sought"
          className="mt-2 w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
        />
        <button
          type="button"
          onClick={run}
          disabled={isStreaming || !activeChatId}
          className="btn-gold mt-3 w-full px-3 py-2 text-[12px] disabled:opacity-60"
        >
          Generate Draft
        </button>
      </div>
    </StreamShell>
  );
}

export function SearchPage() {
  const { activeWorkspaceId, activeChatId, messages, messagesLoading } = useActiveChatContext();
  const { isStreaming, setActiveMode, setSelectedPage } = useAppStore((state) => ({
    isStreaming: state.isStreaming,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
  }));
  const { startStream, abort } = useStream();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setActiveMode("search");
    setSelectedPage("/workspace/search");
  }, [setActiveMode, setSelectedPage]);

  const run = () => {
    if (!query.trim() || !activeWorkspaceId || !activeChatId) return;
    startStream(
      (callbacks) => streamSearch(activeWorkspaceId, query.trim(), activeChatId, callbacks),
      query.trim(),
      { chatId: activeChatId },
    );
    setQuery("");
  };

  return (
    <StreamShell
      icon={Search}
      title="Legal Search"
      subtitle="Search precedents, statutes, and uploaded records."
      messages={messages}
      messagesLoading={messagesLoading}
      isStreaming={isStreaming}
      abort={abort}
    >
      <div className="w-full rounded-2xl border border-border-subtle bg-bg-elevated p-4">
        <h3 className="text-[14px] font-semibold text-text-primary">Search legal references</h3>
        <p className="mt-1 text-[11px] text-text-secondary">
          Query statutes, Indian Kanoon precedents, and your indexed workspace documents.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") run();
            }}
            placeholder="e.g. Bail under section 437 CrPC"
            className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
          />
          <button
            type="button"
            onClick={run}
            disabled={!query.trim() || isStreaming || !activeWorkspaceId || !activeChatId}
            className="btn-gold inline-flex items-center gap-1 px-3 py-2 text-[12px] disabled:opacity-60"
          >
            {isStreaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Search
          </button>
        </div>
      </div>
    </StreamShell>
  );
}

function DocumentCard({ document, onDelete, onPreview }) {
  const statusTone =
    document.status === "ready"
      ? "text-emerald-300 border-emerald-500/25 bg-emerald-500/10"
      : document.status === "failed"
        ? "text-red-300 border-red-500/25 bg-red-500/10"
        : "text-blue-300 border-blue-500/25 bg-blue-500/10";

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/10">
          <FileText size={13} className="text-gold-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-text-primary">{document.filename}</p>
          <p className="text-[10px] text-text-muted">
            {((document.file_size || 0) / 1024).toFixed(1)} KB ·{" "}
            {document.created_at ? new Date(document.created_at).toLocaleString() : "Recently"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide", statusTone)}>
              {document.status}
            </span>
            <span className="rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 text-[9px] text-text-muted">
              {document.chunk_count || 0} chunks
            </span>
          </div>
          {document.error_message ? <p className="mt-1 text-[10px] text-red-300">{document.error_message}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPreview(document)}
          className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-secondary px-2 py-1 text-[10px] text-text-muted hover:text-text-primary"
        >
          <Eye size={10} />
          Preview
        </button>
        <button
          type="button"
          onClick={() => onDelete(document)}
          className="inline-flex items-center gap-1 rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/20"
        >
          <Trash2 size={10} />
          Delete
        </button>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const {
    activeWorkspaceId,
    setActiveMode,
    setSelectedPage,
    documentsByWorkspace,
    setDocuments,
    setDocumentsMeta,
    documentsMetaByWorkspace,
    removeDocument,
  } = useAppStore((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
    documentsByWorkspace: state.documentsByWorkspace,
    setDocuments: state.setDocuments,
    setDocumentsMeta: state.setDocumentsMeta,
    documentsMetaByWorkspace: state.documentsMetaByWorkspace,
    removeDocument: state.removeDocument,
  }));

  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const documents = activeWorkspaceId ? documentsByWorkspace[activeWorkspaceId] || [] : [];
  const loading = activeWorkspaceId ? documentsMetaByWorkspace[activeWorkspaceId]?.loading : false;

  useEffect(() => {
    setActiveMode("documents");
    setSelectedPage("/workspace/documents");
  }, [setActiveMode, setSelectedPage]);

  const loadDocuments = async (force = false) => {
    if (!activeWorkspaceId) return;
    try {
      setDocumentsMeta(activeWorkspaceId, { loading: true });
      const data = await listDocuments(activeWorkspaceId, { force });
      setDocuments(activeWorkspaceId, data || []);
      setDocumentsMeta(activeWorkspaceId, { loading: false });
      setError("");
    } catch (loadError) {
      setDocumentsMeta(activeWorkspaceId, { loading: false });
      setError(normalizeApiError(loadError, "Failed to load documents."));
    }
  };

  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadDocuments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const handleDelete = async (document) => {
    if (!activeWorkspaceId) return;
    const confirmed = window.confirm(`Delete "${document.filename}"?`);
    if (!confirmed) return;

    setDeletingId(document.doc_id);
    const snapshot = [...documents];
    removeDocument(activeWorkspaceId, document.doc_id);
    try {
      await deleteDocument(activeWorkspaceId, document.doc_id);
      toast.success("Document deleted.");
    } catch (deleteError) {
      setDocuments(activeWorkspaceId, snapshot);
      toast.error(normalizeApiError(deleteError, "Delete failed."));
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = (document) => {
    if (document.storage_path) {
      window.open(document.storage_path, "_blank", "noopener,noreferrer");
      return;
    }
    toast("Preview URL not available for this file yet.");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border-subtle bg-bg-secondary/75 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <FolderOpen size={14} className="text-gold-300" />
          <div>
            <h1 className="text-[13px] font-semibold text-text-primary">Documents</h1>
            <p className="text-[11px] text-text-muted">Upload, index, and manage legal records.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3.5">
            <h2 className="text-[12px] font-semibold text-text-primary">Upload files</h2>
            <p className="mb-2 text-[10px] text-text-secondary">Files appear immediately, then update while indexing.</p>
            <UploadDropzone compact />
          </div>

          <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3.5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold text-text-primary">Recent uploads</h2>
              <button type="button" onClick={() => loadDocuments(true)} className="btn-ghost px-2 py-1 text-[10px]">
                Refresh
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                <div className="skeleton h-16 w-full rounded-xl" />
                <div className="skeleton h-16 w-full rounded-xl" />
                <div className="skeleton h-16 w-full rounded-xl" />
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rounded-xl border border-border-default bg-bg-secondary p-3 text-center">
                <p className="text-[11px] text-text-secondary">{error}</p>
              </div>
            ) : null}

            {!loading && !error && !documents.length ? (
              <div className="rounded-xl border border-border-subtle bg-bg-secondary p-5 text-center">
                <FolderOpen size={18} className="mx-auto mb-2 text-text-muted" />
                <p className="text-[12px] font-medium text-text-primary">No documents uploaded</p>
                <p className="text-[10px] text-text-muted">Upload FIRs, petitions, judgments, affidavits, or evidence.</p>
              </div>
            ) : null}

            {!loading && !error && documents.length ? (
              <div className="space-y-2">
                {documents.map((document) => (
                  <div key={document.doc_id} className={cn(deletingId === document.doc_id && "opacity-60")}>
                    <DocumentCard document={document} onDelete={handleDelete} onPreview={handlePreview} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
