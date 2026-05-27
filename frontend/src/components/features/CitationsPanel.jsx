import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  Landmark,
  Library,
  Scale,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

const CATEGORY_META = {
  case_law: { label: "Case Law", icon: Landmark, accent: "text-emerald-300" },
  statutes: { label: "Statutes", icon: Scale, accent: "text-blue-300" },
  uploaded_documents: { label: "Uploaded Documents", icon: FileText, accent: "text-gold-300" },
  citations: { label: "Citations", icon: Library, accent: "text-indigo-300" },
  ai_sources: { label: "AI Sources", icon: ShieldCheck, accent: "text-pink-300" },
};

const CATEGORY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "case_law", label: "Case Law" },
  { value: "statutes", label: "Statutes" },
  { value: "uploaded_documents", label: "Uploaded Docs" },
  { value: "citations", label: "Citations" },
  { value: "ai_sources", label: "AI Sources" },
];

function classifyCitation(item) {
  if (!item) return "citations";
  if (item.type === "document") return "uploaded_documents";
  if (item.type === "kanoon") {
    const isStatute = /(ipc|crpc|cpc|constitution|evidence|act|section)/i.test(
      `${item.title || ""} ${item.section || ""} ${item.citation || ""}`,
    );
    return isStatute ? "statutes" : "case_law";
  }
  if (item.type === "ai") return "ai_sources";
  if (item.section) return "statutes";
  return "citations";
}

function scoreToPercent(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const value = Number(score);
  return value <= 1 ? Math.round(value * 100) : Math.min(100, Math.round(value));
}

function EmptyState() {
  return (
    <div className="mx-2 mt-4 rounded-2xl border border-border-subtle bg-bg-elevated p-4">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/10">
        <BookOpen size={18} className="text-gold-300" />
      </div>
      <h3 className="text-[13px] font-semibold text-text-primary">No references yet</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
        Legal references will appear here while LexAI analyzes your query and cites supporting material.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {[
          "Supreme Court judgments",
          "High Court judgments",
          "Statutes and sections (IPC, CrPC, Evidence)",
          "Uploaded document citations",
          "Research snippets and AI sources",
        ].map((line) => (
          <div key={line} className="rounded-lg border border-border-subtle bg-bg-secondary px-2.5 py-2 text-[10px] text-text-muted">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

function CitationCard({ citation }) {
  const [expanded, setExpanded] = useState(false);
  const score = scoreToPercent(citation.score);

  const copyCitation = async () => {
    const payload = citation.citation || citation.title || "";
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Citation copied.");
    } catch (error) {
      toast.error("Unable to copy citation.");
    }
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-elevated p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[11px] font-semibold text-text-primary">{citation.title || "Untitled reference"}</p>
          <p className="mt-1 text-[10px] text-text-muted">
            {[citation.court, citation.date].filter(Boolean).join(" · ") || "Reference source"}
          </p>
        </div>
        {citation.url ? (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-text-muted transition hover:bg-emerald-500/12 hover:text-emerald-300"
            aria-label="Open source"
          >
            <ExternalLink size={11} />
          </a>
        ) : null}
      </div>

      {score !== null ? (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="text-text-muted">Relevance</span>
            <span className="font-semibold text-emerald-300">{score}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
            />
          </div>
        </div>
      ) : null}

      {citation.snippet ? (
        <p className={cn("mt-2 text-[10px] leading-relaxed text-text-secondary", !expanded && "line-clamp-2")}>
          {citation.snippet}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={copyCitation}
          className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-secondary px-2 py-1 text-[10px] text-text-muted hover:text-text-primary"
        >
          <Copy size={10} />
          Copy citation
        </button>

        {citation.snippet ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-secondary px-2 py-1 text-[10px] text-text-muted hover:text-text-primary"
          >
            {expanded ? (
              <>
                <ChevronDown size={10} />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight size={10} />
                Expand
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Section({ id, title, icon: Icon, accent, items, collapsed, onToggle }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-secondary">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-2.5 py-2"
      >
        <div className="flex items-center gap-1.5">
          <Icon size={12} className={accent} />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
          <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-muted">{items.length}</span>
        </div>
        {collapsed ? <ChevronRight size={11} className="text-text-muted" /> : <ChevronDown size={11} className="text-text-muted" />}
      </button>

      {!collapsed ? (
        <div className="space-y-2 border-t border-border-subtle px-2 py-2">
          {items.map((item, index) => (
            <CitationCard key={`${item.title || "ref"}-${index}`} citation={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CitationsPanel() {
  const {
    rightPanelOpen,
    toggleRightPanel,
    activeWorkspaceId,
    activeChatByWorkspace,
    citationsByChat,
    verdictByChat,
    referencesQuery,
    referencesFilter,
    referencesCollapsedSections,
    setReferencesQuery,
    setReferencesFilter,
    toggleReferencesSection,
    isStreaming,
  } = useAppStore((state) => ({
    rightPanelOpen: state.rightPanelOpen,
    toggleRightPanel: state.toggleRightPanel,
    activeWorkspaceId: state.activeWorkspaceId,
    activeChatByWorkspace: state.activeChatByWorkspace,
    citationsByChat: state.citationsByChat,
    verdictByChat: state.verdictByChat,
    referencesQuery: state.referencesQuery,
    referencesFilter: state.referencesFilter,
    referencesCollapsedSections: state.referencesCollapsedSections,
    setReferencesQuery: state.setReferencesQuery,
    setReferencesFilter: state.setReferencesFilter,
    toggleReferencesSection: state.toggleReferencesSection,
    isStreaming: state.isStreaming,
  }));

  const activeChatId = activeWorkspaceId ? activeChatByWorkspace[activeWorkspaceId] || null : null;
  const citations = activeChatId ? citationsByChat[activeChatId] || [] : [];
  const verdict = activeChatId ? verdictByChat[activeChatId] || null : null;

  const grouped = useMemo(() => {
    const next = {
      case_law: [],
      statutes: [],
      uploaded_documents: [],
      citations: [],
      ai_sources: [],
    };

    citations.forEach((citation) => {
      const category = classifyCitation(citation);
      next[category].push(citation);
    });
    return next;
  }, [citations]);

  const filteredSections = useMemo(() => {
    const query = referencesQuery.trim().toLowerCase();
    return Object.entries(grouped).map(([key, list]) => {
      const filtered = list.filter((item) => {
        const haystack = `${item.title || ""} ${item.court || ""} ${item.date || ""} ${item.citation || ""} ${item.snippet || ""}`.toLowerCase();
        const matchQuery = !query || haystack.includes(query);
        const matchFilter = referencesFilter === "all" || referencesFilter === key;
        return matchQuery && matchFilter;
      });
      return [key, filtered];
    });
  }, [grouped, referencesFilter, referencesQuery]);

  const totalReferences = citations.length;
  const hasAny = filteredSections.some(([, list]) => list.length > 0);

  return (
    <>
      <AnimatePresence>
        {rightPanelOpen ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/45 lg:hidden"
            onClick={toggleRightPanel}
            aria-label="Close references panel overlay"
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        animate={{
          width: rightPanelOpen ? 340 : 0,
          opacity: rightPanelOpen ? 1 : 0,
        }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed right-0 top-0 bottom-0 z-40 flex flex-col border-l border-border-subtle bg-bg-secondary shadow-xl lg:static lg:z-auto lg:shadow-none",
          rightPanelOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-3 py-3">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-gold-300" />
            <p className="text-[12px] font-semibold text-text-primary">Legal References</p>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">
              {totalReferences}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleRightPanel}
            className="rounded-md border border-border-subtle p-1 text-text-muted hover:text-text-primary"
            aria-label="Close references panel"
          >
            <X size={12} />
          </button>
        </div>

        <div className="space-y-2 border-b border-border-subtle px-3 py-2.5">
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-2.5 text-text-muted" />
            <input
              value={referencesQuery}
              onChange={(event) => setReferencesQuery(event.target.value)}
              placeholder="Search references"
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated py-1.5 pl-7 pr-2 text-[11px] text-text-primary outline-none focus:border-gold-500/35"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={11} className="text-text-muted" />
            <select
              value={referencesFilter}
              onChange={(event) => setReferencesFilter(event.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-elevated px-2 py-1.5 text-[11px] text-text-primary outline-none focus:border-gold-500/35"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {verdict ? (
            <div className="mb-2 rounded-xl border border-border-subtle bg-bg-elevated p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Verdict Snapshot</p>
              <div className="mt-2 space-y-1.5">
                {[
                  { key: "guilty", label: "Guilty", color: "from-red-500 to-red-300" },
                  { key: "not_guilty", label: "Not Guilty", color: "from-emerald-500 to-emerald-300" },
                  { key: "partial_relief", label: "Partial Relief", color: "from-gold-500 to-gold-300" },
                ].map((row) => {
                  const value = Number(verdict[row.key] || 0);
                  return (
                    <div key={row.key}>
                      <div className="mb-0.5 flex items-center justify-between text-[10px] text-text-secondary">
                        <span>{row.label}</span>
                        <span>{value.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          className={cn("h-full bg-gradient-to-r", row.color)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isStreaming && !totalReferences ? (
            <div className="space-y-2 px-2 py-2">
              <div className="skeleton h-16 w-full rounded-xl" />
              <div className="skeleton h-16 w-full rounded-xl" />
              <div className="skeleton h-16 w-full rounded-xl" />
            </div>
          ) : null}

          {!totalReferences && !isStreaming ? <EmptyState /> : null}

          {hasAny ? (
            <div className="space-y-2">
              {filteredSections.map(([key, list]) => {
                if (!list.length) return null;
                const meta = CATEGORY_META[key];
                return (
                  <Section
                    key={key}
                    id={key}
                    title={meta.label}
                    icon={meta.icon}
                    accent={meta.accent}
                    items={list}
                    collapsed={Boolean(referencesCollapsedSections[key])}
                    onToggle={toggleReferencesSection}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </motion.aside>
    </>
  );
}

