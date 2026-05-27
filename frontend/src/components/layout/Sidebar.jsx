import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  FolderOpen,
  Gavel,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import {
  createChatThread,
  deleteChatThread,
  deleteWorkspace,
  getChatThreads,
  normalizeApiError,
  renameChatThread,
  renameWorkspace,
} from "../../services/api";
import { NewWorkspaceModal } from "../features/NewWorkspaceModal";

const NAV_ITEMS = [
  { to: "/workspace/chat", icon: MessageSquare, label: "AI Chat", mode: "chat" },
  { to: "/workspace/search", icon: Search, label: "Legal Search", mode: "search" },
  { to: "/workspace/counter-args", icon: ShieldAlert, label: "Counter Arguments", mode: "counter_args" },
  { to: "/workspace/verdict", icon: Gavel, label: "Verdict Predictor", mode: "verdict" },
  { to: "/workspace/draft", icon: FileText, label: "AI Drafter", mode: "draft" },
  { to: "/workspace/documents", icon: FolderOpen, label: "Documents", mode: "documents" },
];

function ConfirmDialog({ open, title, message, confirmText, onCancel, onConfirm, loading = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-secondary p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{message}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-ghost flex-1 px-3 py-2 text-[12px]" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger flex-1 px-3 py-2 text-[12px]"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameDialog({ open, title, initialValue, onCancel, onConfirm, loading = false }) {
  const [value, setValue] = useState(initialValue || "");

  useEffect(() => {
    if (open) setValue(initialValue || "");
  }, [initialValue, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-secondary p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <input
          type="text"
          value={value}
          maxLength={100}
          onChange={(event) => setValue(event.target.value)}
          className="mt-3 w-full rounded-xl border border-border-default bg-bg-elevated px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
          placeholder="Enter name"
          autoFocus
        />
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-ghost flex-1 px-3 py-2 text-[12px]" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-gold flex-1 px-3 py-2 text-[12px]"
            onClick={() => onConfirm(value)}
            disabled={loading || !value.trim()}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

const VirtualizedList = memo(function VirtualizedList({
  items,
  rowHeight,
  className,
  renderRow,
  emptyState,
  onReachEnd,
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(320);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver(() => setHeight(element.clientHeight || 320));
    resizeObserver.observe(element);
    setHeight(element.clientHeight || 320);
    return () => resizeObserver.disconnect();
  }, []);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight) + 6;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const offsetY = startIndex * rowHeight;
  const visibleItems = items.slice(startIndex, endIndex);

  const handleScroll = (event) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    setScrollTop(nextScrollTop);
    const target = event.currentTarget;
    if (onReachEnd && target.scrollTop + target.clientHeight >= target.scrollHeight - rowHeight * 1.5) {
      onReachEnd();
    }
  };

  if (!items.length) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <div ref={containerRef} className={className} onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, index) => (
            <div key={item.id || `${startIndex + index}`} style={{ height: rowHeight }}>
              {renderRow(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

function WorkspaceSelector({ workspaces, activeWorkspaceId, onSelectWorkspace }) {
  return (
    <select
      value={activeWorkspaceId || ""}
      onChange={(event) => onSelectWorkspace(event.target.value)}
      className="w-full rounded-xl border border-border-default bg-bg-elevated px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
      aria-label="Select workspace"
    >
      {workspaces.length === 0 ? <option value="">No workspaces</option> : null}
      {workspaces.map((workspace) => (
        <option key={workspace.id} value={workspace.id}>
          {workspace.name}
        </option>
      ))}
    </select>
  );
}

function WorkspaceRow({
  workspace,
  active,
  onSelect,
  onRename,
  onDelete,
  compact,
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2 py-1.5",
        active
          ? "border-gold-500/35 bg-gold-500/10 text-gold-200"
          : "border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-default hover:text-text-primary",
      )}
    >
      <button type="button" className="flex-1 text-left" onClick={() => onSelect(workspace.id)}>
        <p className="truncate text-[12px] font-medium">{workspace.name}</p>
        {!compact ? <p className="truncate text-[10px] text-text-muted">{workspace.case_type || "general"}</p> : null}
      </button>
      <button
        type="button"
        onClick={() => onRename(workspace)}
        className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white/5 hover:text-text-primary"
        aria-label={`Rename ${workspace.name}`}
      >
        <Edit3 size={11} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(workspace)}
        className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-300"
        aria-label={`Delete ${workspace.name}`}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function ChatRow({ chat, active, onSelect, onRename, onDelete }) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2 py-1.5",
        active
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
          : "border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-default hover:text-text-primary",
      )}
    >
      <button type="button" className="flex-1 text-left" onClick={() => onSelect(chat.id)}>
        <p className="truncate text-[12px] font-medium">{chat.title || "Untitled Chat"}</p>
        <p className="truncate text-[10px] text-text-muted">{chat.last_message_preview || "No messages yet"}</p>
      </button>
      <button
        type="button"
        onClick={() => onRename(chat)}
        className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-white/5 hover:text-text-primary"
        aria-label={`Rename ${chat.title || "chat"}`}
      >
        <Edit3 size={11} />
      </button>
      <button
        type="button"
        onClick={() => onDelete(chat)}
        className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-300"
        aria-label={`Delete ${chat.title || "chat"}`}
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function SidebarShell({
  sidebarCollapsed,
  user,
  workspaces,
  activeWorkspaceId,
  workspaceSearch,
  setWorkspaceSearch,
  onSelectWorkspace,
  onShowNewWorkspace,
  onCreateChat,
  workspacesLoading,
  workspaceRows,
  chatRows,
  chatThreadsLoading,
  chatSearch,
  setChatSearch,
  onNavigateMode,
  onLogout,
  toggleSidebar,
  closeMobile,
  onWorkspaceRename,
  onWorkspaceDelete,
  onChatRename,
  onChatDelete,
  onLoadMoreChats,
}) {
  const fullName = user?.user_metadata?.full_name || user?.email || "User";
  const initials = fullName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col border-r border-border-subtle bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-3">
        <div className={cn("flex items-center gap-2", sidebarCollapsed && "w-full justify-center")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-500 to-saffron text-bg-primary">
            <Scale size={15} />
          </div>
          {!sidebarCollapsed ? (
            <div>
              <p className="text-[13px] font-semibold text-text-primary">LexAI</p>
              <p className="text-[10px] text-text-muted">Legal Workspace</p>
            </div>
          ) : null}
        </div>

        {!sidebarCollapsed ? (
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded p-1.5 text-text-muted transition hover:bg-white/5 hover:text-text-primary"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute -right-3 top-4 rounded-full border border-border-default bg-bg-elevated p-1 text-text-muted hover:text-text-primary"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      {sidebarCollapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn("sidebar-item justify-center px-0", isActive && "active")}
              title={item.label}
              onClick={() => {
                onNavigateMode(item.mode);
                closeMobile();
              }}
            >
              <item.icon size={15} />
            </NavLink>
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-border-subtle px-3 py-3">
            <WorkspaceSelector
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={onSelectWorkspace}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onShowNewWorkspace}
                className="btn-ghost inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px]"
              >
                <Plus size={11} />
                Workspace
              </button>
              <button
                type="button"
                onClick={onCreateChat}
                className="btn-gold inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px]"
              >
                <MessageSquare size={11} />
                New Chat
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-border-subtle px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Workspaces</p>
                {workspacesLoading ? <Loader2 size={12} className="animate-spin text-text-muted" /> : null}
              </div>
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-2.5 text-text-muted" />
                <input
                  value={workspaceSearch}
                  onChange={(event) => setWorkspaceSearch(event.target.value)}
                  placeholder="Search workspaces"
                  className="w-full rounded-lg border border-border-subtle bg-bg-elevated py-1.5 pl-7 pr-2 text-[11px] text-text-primary outline-none focus:border-gold-500/35"
                />
              </div>
            </div>

            <VirtualizedList
              items={workspaceRows}
              rowHeight={52}
              className="max-h-[30vh] min-h-[120px] overflow-y-auto border-b border-border-subtle px-2 py-2"
              emptyState={
                <div className="rounded-lg border border-border-subtle bg-bg-elevated px-2 py-3 text-[11px] text-text-muted">
                  No workspaces found.
                </div>
              }
              renderRow={(workspace) => (
                <WorkspaceRow
                  workspace={workspace}
                  active={workspace.id === activeWorkspaceId}
                  onSelect={onSelectWorkspace}
                  onRename={onWorkspaceRename}
                  onDelete={onWorkspaceDelete}
                />
              )}
            />

            <div className="px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Chats</p>
                {chatThreadsLoading ? <Loader2 size={12} className="animate-spin text-text-muted" /> : null}
              </div>
              <div className="relative">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-2.5 text-text-muted" />
                <input
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.target.value)}
                  placeholder="Search chats"
                  className="w-full rounded-lg border border-border-subtle bg-bg-elevated py-1.5 pl-7 pr-2 text-[11px] text-text-primary outline-none focus:border-gold-500/35"
                />
              </div>
            </div>

            <VirtualizedList
              items={chatRows}
              rowHeight={58}
              className="flex-1 overflow-y-auto px-2 pb-2"
              emptyState={
                <div className="rounded-lg border border-border-subtle bg-bg-elevated px-2 py-3 text-[11px] text-text-muted">
                  No chats yet. Create one to begin.
                </div>
              }
              renderRow={(chat) => (
                <ChatRow
                  chat={chat}
                  active={chat.active}
                  onSelect={chat.onSelect}
                  onRename={onChatRename}
                  onDelete={onChatDelete}
                />
              )}
              onReachEnd={onLoadMoreChats}
            />
          </div>
        </>
      )}

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-500/15 text-[12px] font-semibold text-gold-300">
            {initials}
          </div>
          {!sidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-text-primary">{fullName}</p>
              <p className="truncate text-[10px] text-text-muted">{user?.email || ""}</p>
            </div>
          ) : null}
          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-border-subtle bg-bg-secondary px-2 py-1 text-[10px] text-text-muted hover:text-text-primary"
            >
              <LogOut size={10} className="inline-block" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const {
    sidebarCollapsed,
    mobileSidebarOpen,
    closeMobileSidebar,
    toggleSidebar,
    workspaces,
    workspacesLoading,
    activeWorkspaceId,
    activeChatByWorkspace,
    chatThreadsByWorkspace,
    chatThreadsMetaByWorkspace,
    workspaceSearch,
    chatSearch,
    setWorkspaceSearch,
    setChatSearch,
    setActiveWorkspaceId,
    setChatThreads,
    setChatThreadsMeta,
    upsertChatThread,
    updateChatThread,
    removeChatThread,
    setActiveChatId,
    setActiveMode,
    setSelectedPage,
    clearSession,
    removeWorkspace,
    updateWorkspace,
    setWorkspaces,
  } = useAppStore((state) => ({
    sidebarCollapsed: state.sidebarCollapsed,
    mobileSidebarOpen: state.mobileSidebarOpen,
    closeMobileSidebar: state.closeMobileSidebar,
    toggleSidebar: state.toggleSidebar,
    workspaces: state.workspaces,
    workspacesLoading: state.workspacesLoading,
    activeWorkspaceId: state.activeWorkspaceId,
    activeChatByWorkspace: state.activeChatByWorkspace,
    chatThreadsByWorkspace: state.chatThreadsByWorkspace,
    chatThreadsMetaByWorkspace: state.chatThreadsMetaByWorkspace,
    workspaceSearch: state.workspaceSearch,
    chatSearch: state.chatSearch,
    setWorkspaceSearch: state.setWorkspaceSearch,
    setChatSearch: state.setChatSearch,
    setActiveWorkspaceId: state.setActiveWorkspaceId,
    setChatThreads: state.setChatThreads,
    setChatThreadsMeta: state.setChatThreadsMeta,
    upsertChatThread: state.upsertChatThread,
    updateChatThread: state.updateChatThread,
    removeChatThread: state.removeChatThread,
    setActiveChatId: state.setActiveChatId,
    setActiveMode: state.setActiveMode,
    setSelectedPage: state.setSelectedPage,
    clearSession: state.clearSession,
    removeWorkspace: state.removeWorkspace,
    updateWorkspace: state.updateWorkspace,
    setWorkspaces: state.setWorkspaces,
  }));

  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false);
  const [user, setUser] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [renameDialog, setRenameDialog] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null,
    [activeWorkspaceId, workspaces],
  );

  const activeChatId = activeWorkspaceId ? activeChatByWorkspace[activeWorkspaceId] || null : null;
  const chatThreads = activeWorkspaceId ? chatThreadsByWorkspace[activeWorkspaceId]?.items || [] : [];
  const chatMeta = activeWorkspaceId ? chatThreadsMetaByWorkspace[activeWorkspaceId] || {} : {};

  const filteredWorkspaces = useMemo(() => {
    const query = workspaceSearch.trim().toLowerCase();
    if (!query) return workspaces;
    return workspaces.filter((workspace) => {
      const haystack = `${workspace.name} ${workspace.description || ""} ${workspace.case_type || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [workspaceSearch, workspaces]);

  const filteredChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    const list = !query
      ? chatThreads
      : chatThreads.filter((thread) =>
          `${thread.title || ""} ${thread.last_message_preview || ""}`.toLowerCase().includes(query),
        );
    return list.map((chat) => ({
      ...chat,
      active: chat.id === activeChatId,
      onSelect: (chatId) => {
        setActiveChatId(activeWorkspaceId, chatId);
        setActiveMode("chat");
        setSelectedPage("/workspace/chat");
        navigate("/workspace/chat");
        closeMobileSidebar();
      },
    }));
  }, [
    activeChatId,
    activeWorkspaceId,
    chatSearch,
    chatThreads,
    closeMobileSidebar,
    navigate,
    setActiveChatId,
    setActiveMode,
    setSelectedPage,
  ]);

  const loadThreads = async ({ force = false, append = false } = {}) => {
    if (!activeWorkspaceId) return;
    const offset = append ? chatMeta.nextOffset || chatThreads.length : 0;
    const limit = 60;
    try {
      setChatThreadsMeta(activeWorkspaceId, { loading: true });
      const data = await getChatThreads(activeWorkspaceId, {
        force,
        query: chatSearch.trim(),
        offset,
        limit,
      });
      setChatThreads(activeWorkspaceId, data || [], {
        append,
        hasMore: Array.isArray(data) && data.length === limit,
        nextOffset: offset + (data?.length || 0),
      });
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to load chats."));
      setChatThreadsMeta(activeWorkspaceId, { loading: false });
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const cached = chatThreadsByWorkspace[activeWorkspaceId];
    if (!cached?.items?.length || Date.now() - (cached.loadedAt || 0) > 25_000) {
      loadThreads({ force: true, append: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const timer = setTimeout(() => {
      loadThreads({ force: true, append: false });
    }, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSearch, activeWorkspaceId]);

  const handleWorkspaceSelect = (workspaceId) => {
    if (!workspaceId) return;
    setActiveWorkspaceId(workspaceId);
    setActiveMode("chat");
    setSelectedPage("/workspace/chat");
    navigate("/workspace/chat");
    closeMobileSidebar();
  };

  const handleCreateChat = async () => {
    if (!activeWorkspaceId) {
      toast.error("Create or select a workspace first.");
      return;
    }
    try {
      const thread = await createChatThread(activeWorkspaceId, { title: "New Chat" });
      upsertChatThread(activeWorkspaceId, thread, true);
      setSelectedPage("/workspace/chat");
      setActiveMode("chat");
      navigate("/workspace/chat");
      closeMobileSidebar();
    } catch (error) {
      toast.error(normalizeApiError(error, "Unable to create chat."));
    }
  };

  const handleWorkspaceDelete = (workspace) => {
    setConfirmDialog({
      type: "workspace",
      title: "Delete workspace?",
      message:
        "This permanently deletes all chats, messages, documents, citations, analyses, and drafts in this workspace.",
      item: workspace,
      confirmText: "Delete Workspace",
    });
  };

  const handleChatDelete = (chat) => {
    setConfirmDialog({
      type: "chat",
      title: "Delete chat?",
      message: "This permanently deletes all messages in this conversation.",
      item: chat,
      confirmText: "Delete Chat",
    });
  };

  const handleWorkspaceRename = (workspace) => {
    setRenameDialog({
      type: "workspace",
      title: "Rename workspace",
      item: workspace,
      initialValue: workspace.name,
    });
  };

  const handleChatRename = (chat) => {
    setRenameDialog({
      type: "chat",
      title: "Rename chat",
      item: chat,
      initialValue: chat.title || "",
    });
  };

  const confirmDelete = async () => {
    if (!confirmDialog) return;
    setActionLoading(true);

    if (confirmDialog.type === "workspace") {
      const workspace = confirmDialog.item;
      const previous = [...workspaces];
      const previousActiveWorkspaceId = activeWorkspaceId;
      removeWorkspace(workspace.id);
      try {
        await deleteWorkspace(workspace.id);
        toast.success("Workspace deleted.");
        navigate("/workspace/dashboard");
      } catch (error) {
        setWorkspaces(previous);
        if (previousActiveWorkspaceId) {
          setActiveWorkspaceId(previousActiveWorkspaceId);
        }
        toast.error(normalizeApiError(error, "Failed to delete workspace."));
      } finally {
        setActionLoading(false);
        setConfirmDialog(null);
      }
      return;
    }

    if (confirmDialog.type === "chat") {
      const chat = confirmDialog.item;
      const workspaceId = activeWorkspaceId;
      const snapshot = [...chatThreads];
      const snapshotActive = activeChatId;
      removeChatThread(workspaceId, chat.id);
      try {
        await deleteChatThread(workspaceId, chat.id);
        toast.success("Chat deleted.");
        const nextActive = useAppStore.getState().activeChatByWorkspace[workspaceId];
        if (!nextActive) {
          const created = await createChatThread(workspaceId, { title: "New Chat" });
          upsertChatThread(workspaceId, created, true);
        }
      } catch (error) {
        setChatThreads(workspaceId, snapshot, { append: false, hasMore: false, nextOffset: snapshot.length });
        setActiveChatId(workspaceId, snapshotActive);
        toast.error(normalizeApiError(error, "Failed to delete chat."));
      } finally {
        setActionLoading(false);
        setConfirmDialog(null);
      }
    }
  };

  const confirmRename = async (value) => {
    if (!renameDialog) return;
    const name = value.trim();
    if (!name) return;
    setActionLoading(true);

    if (renameDialog.type === "workspace") {
      const workspace = renameDialog.item;
      const before = workspace.name;
      updateWorkspace(workspace.id, { name });
      try {
        await renameWorkspace(workspace.id, { name });
        toast.success("Workspace renamed.");
      } catch (error) {
        updateWorkspace(workspace.id, { name: before });
        toast.error(normalizeApiError(error, "Failed to rename workspace."));
      } finally {
        setActionLoading(false);
        setRenameDialog(null);
      }
      return;
    }

    if (renameDialog.type === "chat") {
      const chat = renameDialog.item;
      const before = chat.title;
      updateChatThread(activeWorkspaceId, chat.id, { title: name });
      try {
        await renameChatThread(activeWorkspaceId, chat.id, { title: name });
        toast.success("Chat renamed.");
      } catch (error) {
        updateChatThread(activeWorkspaceId, chat.id, { title: before });
        toast.error(normalizeApiError(error, "Failed to rename chat."));
      } finally {
        setActionLoading(false);
        setRenameDialog(null);
      }
    }
  };

  const handleLoadMoreChats = () => {
    if (!activeWorkspaceId) return;
    if (chatMeta.loading || !chatMeta.hasMore || chatSearch.trim()) return;
    loadThreads({ force: true, append: true });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearSession();
    navigate("/login", { replace: true });
  };

  const sidebarProps = {
    sidebarCollapsed,
    user,
    workspaces,
    workspacesLoading,
    activeWorkspaceId,
    workspaceSearch,
    setWorkspaceSearch,
    onSelectWorkspace: handleWorkspaceSelect,
    onShowNewWorkspace: () => setShowNewWorkspaceModal(true),
    onCreateChat: handleCreateChat,
    workspaceRows: filteredWorkspaces,
    chatRows: filteredChats,
    chatThreadsLoading: Boolean(chatMeta.loading),
    chatSearch,
    setChatSearch,
    onNavigateMode: (mode) => {
      if (mode) setActiveMode(mode);
    },
    onLogout: handleLogout,
    toggleSidebar,
    closeMobile: closeMobileSidebar,
    onWorkspaceRename: handleWorkspaceRename,
    onWorkspaceDelete: handleWorkspaceDelete,
    onChatRename: handleChatRename,
    onChatDelete: handleChatDelete,
    onLoadMoreChats: handleLoadMoreChats,
  };

  return (
    <>
      <aside className={cn("relative hidden h-screen md:block", sidebarCollapsed ? "w-16" : "w-80")}>
        <SidebarShell {...sidebarProps} />
      </aside>

      <AnimatePresence>
        {mobileSidebarOpen ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={closeMobileSidebar}
              aria-label="Close sidebar overlay"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.2 }}
              className="fixed left-0 top-0 bottom-0 z-50 w-[88vw] max-w-[350px] md:hidden"
            >
              <button
                type="button"
                onClick={closeMobileSidebar}
                className="absolute right-2 top-2 z-10 rounded-full border border-border-default bg-bg-elevated p-1.5 text-text-muted"
                aria-label="Close sidebar"
              >
                <X size={14} />
              </button>
              <SidebarShell {...sidebarProps} sidebarCollapsed={false} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmText={confirmDialog?.confirmText}
        loading={actionLoading}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={confirmDelete}
      />

      <RenameDialog
        open={Boolean(renameDialog)}
        title={renameDialog?.title}
        initialValue={renameDialog?.initialValue}
        loading={actionLoading}
        onCancel={() => setRenameDialog(null)}
        onConfirm={confirmRename}
      />

      {showNewWorkspaceModal ? <NewWorkspaceModal onClose={() => setShowNewWorkspaceModal(false)} /> : null}
    </>
  );
}
