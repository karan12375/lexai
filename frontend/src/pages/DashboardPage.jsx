import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, FolderOpen, MessageSquare, RefreshCcw, Scale, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import ActivityTimeline from "../components/features/ActivityTimeline";
import { useAppStore } from "../store";
import { getWorkspaceStats, normalizeApiError } from "../services/api";
import { cn } from "../lib/utils";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-1 text-[22px] font-bold text-text-primary">{value}</p>
      <p className="text-[11px] text-text-secondary">{subtitle}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="skeleton h-24 w-full rounded-2xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspaceId,
    setActiveChatId,
    setSelectedPage,
    getActiveWorkspace,
  } = useAppStore((state) => ({
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    setActiveWorkspaceId: state.setActiveWorkspaceId,
    setActiveChatId: state.setActiveChatId,
    setSelectedPage: state.setSelectedPage,
    getActiveWorkspace: state.getActiveWorkspace,
  }));

  const activeWorkspace = getActiveWorkspace();

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = async (force = false) => {
    if (!activeWorkspaceId) return;
    try {
      setLoading(true);
      const data = await getWorkspaceStats(activeWorkspaceId, { force });
      setStats(data);
      setError("");
    } catch (loadError) {
      setError(normalizeApiError(loadError, "Failed to load dashboard."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedPage("/workspace/dashboard");
  }, [setSelectedPage]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    fetchStats(false);
  }, [activeWorkspaceId]);

  const computed = useMemo(
    () => ({
      totalDocuments: stats?.total_documents ?? 0,
      totalChats: stats?.total_chats ?? 0,
      totalMessages: stats?.total_messages ?? 0,
      totalChunks: stats?.total_chunks ?? 0,
    }),
    [stats],
  );

  if (!activeWorkspace && workspaces.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5">
        <div className="max-w-md rounded-2xl border border-border-subtle bg-bg-elevated p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/10">
            <Scale size={22} className="text-gold-300" />
          </div>
          <h2 className="text-[18px] font-semibold text-text-primary">No workspaces yet</h2>
          <p className="mt-1 text-[12px] text-text-secondary">
            Create your first workspace from the sidebar to start persistent legal chat and document indexing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-5">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border-subtle bg-gradient-to-br from-bg-elevated to-bg-secondary p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-gold-500/25 bg-gold-500/10 px-2 py-1">
                <Sparkles size={11} className="text-gold-300" />
                <span className="text-[10px] font-semibold text-gold-200">AI Legal Workspace</span>
              </div>
              <h1 className="text-[20px] font-bold text-text-primary">{activeWorkspace?.name || "Workspace"}</h1>
              <p className="mt-1 text-[12px] text-text-secondary">
                {activeWorkspace?.description || "Persistent legal drafting and research workspace."}
              </p>
            </div>

            {error ? (
              <button
                type="button"
                onClick={() => fetchStats(true)}
                className="btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px]"
              >
                <RefreshCcw size={11} />
                Reload
              </button>
            ) : null}
          </div>
        </motion.section>

        {loading ? <StatSkeleton /> : null}

        {!loading && error ? (
          <div className="rounded-xl border border-border-default bg-bg-elevated p-3 text-center">
            <p className="text-[12px] text-text-secondary">{error}</p>
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Documents" value={computed.totalDocuments} subtitle="Uploaded in workspace" />
              <StatCard title="Chats" value={computed.totalChats} subtitle="Conversation threads" />
              <StatCard title="Messages" value={computed.totalMessages} subtitle="Persisted chat messages" />
              <StatCard title="Indexed Chunks" value={computed.totalChunks} subtitle="RAG retrieval units" />
            </section>

            <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                <div className="mb-3 flex items-center gap-1.5">
                  <FolderOpen size={12} className="text-gold-300" />
                  <h2 className="text-[12px] font-semibold text-text-primary">Workspace List</h2>
                </div>
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {workspaces.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => setActiveWorkspaceId(workspace.id)}
                      className={cn(
                        "w-full rounded-xl border px-2.5 py-2 text-left transition",
                        activeWorkspaceId === workspace.id
                          ? "border-gold-500/35 bg-gold-500/10"
                          : "border-border-subtle bg-bg-secondary hover:border-border-default",
                      )}
                    >
                      <p className="truncate text-[12px] font-medium text-text-primary">{workspace.name}</p>
                      <p className="truncate text-[10px] text-text-muted">{workspace.description || "No description"}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3">
                <div className="mb-3 flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-gold-300" />
                  <h2 className="text-[12px] font-semibold text-text-primary">Recent Chats</h2>
                </div>
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                  {(stats?.recent_chats || []).length ? (
                    stats.recent_chats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        onClick={() => {
                          if (activeWorkspaceId) {
                            setActiveChatId(activeWorkspaceId, chat.id);
                          }
                          navigate("/workspace/chat");
                        }}
                        className="w-full rounded-xl border border-border-subtle bg-bg-secondary px-2.5 py-2 text-left transition hover:border-border-default"
                      >
                        <p className="truncate text-[12px] font-medium text-text-primary">{chat.title}</p>
                        <p className="truncate text-[10px] text-text-muted">{chat.last_message || "No messages yet"}</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-[11px] text-text-muted">No chats yet. Create one from the sidebar.</p>
                  )}
                </div>
              </div>

              <div>
                <ActivityTimeline />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
