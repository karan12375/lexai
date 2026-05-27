import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, Clock3, FileText, MessageSquare, Scale } from "lucide-react";

import { useAppStore } from "../../store";

const TYPE_META = {
  document: { label: "Document", icon: FileText, accent: "text-blue-300" },
  message: { label: "Chat", icon: MessageSquare, accent: "text-emerald-300" },
  workspace: { label: "Workspace", icon: Scale, accent: "text-gold-300" },
};

export default function ActivityTimeline() {
  const { activeWorkspaceId, workspaces, documentsByWorkspace, messagesByChat, activeChatByWorkspace } = useAppStore(
    (state) => ({
      activeWorkspaceId: state.activeWorkspaceId,
      workspaces: state.workspaces,
      documentsByWorkspace: state.documentsByWorkspace,
      messagesByChat: state.messagesByChat,
      activeChatByWorkspace: state.activeChatByWorkspace,
    }),
  );

  const timeline = useMemo(() => {
    if (!activeWorkspaceId) return [];
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId);
    const activeChatId = activeChatByWorkspace[activeWorkspaceId];
    const docs = documentsByWorkspace[activeWorkspaceId] || [];
    const chatMessages = activeChatId ? messagesByChat[activeChatId] || [] : [];

    const docItems = docs.slice(0, 8).map((doc) => ({
      id: `doc-${doc.doc_id || doc.id}`,
      type: "document",
      title: `Uploaded ${doc.filename}`,
      subtitle: `${doc.status || "processing"} · ${doc.chunk_count || 0} chunks`,
      createdAt: doc.created_at,
    }));

    const messageItems = chatMessages
      .filter((message) => message.role === "user")
      .slice(-10)
      .map((message) => ({
        id: `message-${message.id}`,
        type: "message",
        title: "User query",
        subtitle: message.content?.slice(0, 120) || "Conversation update",
        createdAt: message.created_at,
      }));

    const workspaceItem = workspace
      ? [
          {
            id: `workspace-${workspace.id}`,
            type: "workspace",
            title: `${workspace.name} active`,
            subtitle: workspace.description || "Legal workspace initialized",
            createdAt: workspace.created_at,
          },
        ]
      : [];

    return [...workspaceItem, ...docItems, ...messageItems]
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [activeChatByWorkspace, activeWorkspaceId, documentsByWorkspace, messagesByChat, workspaces]);

  if (!timeline.length) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-4">
        <div className="mx-auto flex max-w-sm flex-col items-center py-8 text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/10">
            <Activity size={16} className="text-gold-300" />
          </div>
          <h3 className="text-[13px] font-semibold text-text-primary">No activity yet</h3>
          <p className="mt-1 text-[11px] text-text-secondary">
            Upload documents and start chat to build your workspace activity timeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-3">
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <Activity size={12} className="text-gold-300" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Activity Timeline</p>
      </div>
      <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
        {timeline.map((item, index) => {
          const meta = TYPE_META[item.type] || TYPE_META.message;
          const Icon = meta.icon;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-xl border border-border-subtle bg-bg-secondary px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated">
                  <Icon size={12} className={meta.accent} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-text-primary">{item.title}</p>
                  <p className="line-clamp-2 text-[10px] text-text-secondary">{item.subtitle}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-text-muted">
                    <Clock3 size={10} />
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Recently"}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

