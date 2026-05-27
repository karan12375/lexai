import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Menu, RefreshCcw, Scale, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import Sidebar from "../components/layout/Sidebar";
import CitationsPanel from "../components/features/CitationsPanel";
import { useAppStore } from "../store";
import { getWorkspaces, normalizeApiError } from "../services/api";

function WorkspaceLayoutSkeleton() {
  return (
    <div className="flex-1 p-4 md:p-5">
      <div className="mx-auto max-w-6xl space-y-3">
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceLayout() {
  const location = useLocation();

  const {
    session,
    rightPanelOpen,
    toggleRightPanel,
    activeWorkspaceId,
    workspaces,
    workspacesLoading,
    workspacesLoadedAt,
    setWorkspaces,
    setWorkspacesLoading,
    setActiveWorkspaceId,
    openMobileSidebar,
    setSelectedPage,
  } = useAppStore((state) => ({
    session: state.session,
    rightPanelOpen: state.rightPanelOpen,
    toggleRightPanel: state.toggleRightPanel,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    workspacesLoading: state.workspacesLoading,
    workspacesLoadedAt: state.workspacesLoadedAt,
    setWorkspaces: state.setWorkspaces,
    setWorkspacesLoading: state.setWorkspacesLoading,
    setActiveWorkspaceId: state.setActiveWorkspaceId,
    openMobileSidebar: state.openMobileSidebar,
    setSelectedPage: state.setSelectedPage,
  }));

  const [error, setError] = useState("");

  useEffect(() => {
    setSelectedPage(location.pathname);
  }, [location.pathname, setSelectedPage]);

  useEffect(() => {
    let mounted = true;
    const shouldRefresh = !workspacesLoadedAt || Date.now() - workspacesLoadedAt > 45_000;

    async function loadWorkspaces(force = false) {
      if (!session) return;
      try {
        if (mounted) setWorkspacesLoading(true);
        const data = await getWorkspaces({ force, limit: 300 });
        if (!mounted) return;

        setWorkspaces(data || []);
        if ((data || []).length && !activeWorkspaceId) {
          setActiveWorkspaceId(data[0].id);
        }
        setError("");
      } catch (loadError) {
        if (!mounted) return;
        const message = normalizeApiError(loadError, "Unable to load workspaces.");
        setError(message);
      } finally {
        if (mounted) setWorkspacesLoading(false);
      }
    }

    if (shouldRefresh || workspaces.length === 0) {
      loadWorkspaces(!shouldRefresh);
    }

    return () => {
      mounted = false;
    };
  }, [
    activeWorkspaceId,
    session,
    setActiveWorkspaceId,
    setWorkspaces,
    setWorkspacesLoading,
    workspaces.length,
    workspacesLoadedAt,
  ]);

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null,
    [activeWorkspaceId, workspaces],
  );

  const retryLoad = async () => {
    setWorkspacesLoading(true);
    try {
      const data = await getWorkspaces({ force: true, limit: 300 });
      setWorkspaces(data || []);
      if ((data || []).length && !activeWorkspaceId) {
        setActiveWorkspaceId(data[0].id);
      }
      setError("");
    } catch (retryError) {
      toast.error(normalizeApiError(retryError, "Retry failed."));
    } finally {
      setWorkspacesLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border-subtle bg-bg-secondary/80 px-3 md:px-5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="h-8 w-8 rounded-lg border border-border-default text-text-muted transition hover:text-text-primary md:hidden"
                onClick={openMobileSidebar}
                aria-label="Open sidebar"
              >
                <Menu size={15} className="mx-auto" />
              </button>

              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-gold-500/30 bg-gold-500/10">
                <Scale size={14} className="text-gold-300" />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-[13px] font-semibold text-text-primary">
                  {activeWorkspace?.name || "No Workspace Selected"}
                </h1>
                <p className="truncate text-[11px] text-text-muted">
                  {activeWorkspace?.description || "Persistent legal workspace"}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[10px] font-semibold text-emerald-300">Session Active</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1">
                <ShieldCheck size={11} className="text-blue-300" />
                <span className="text-[10px] font-semibold text-blue-300">Indian Legal AI</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {workspacesLoading ? (
            <WorkspaceLayoutSkeleton />
          ) : error ? (
            <div className="flex flex-1 items-center justify-center px-5">
              <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-elevated p-5 text-center">
                <p className="text-[13px] text-text-secondary">{error}</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="btn-ghost mt-3 inline-flex items-center gap-2 px-3 py-2 text-[12px]"
                >
                  <RefreshCcw size={12} />
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {!rightPanelOpen && (
        <motion.button
          type="button"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={toggleRightPanel}
          className="fixed right-4 top-1/2 z-30 flex h-16 w-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-border-default bg-bg-elevated/95 text-text-muted shadow-xl transition hover:border-gold-500/30 hover:text-gold-300"
          title="Show references panel"
          aria-label="Show references panel"
        >
          <BookOpen size={14} />
        </motion.button>
      )}

      <CitationsPanel />
    </div>
  );
}
