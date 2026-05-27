import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAppStore } from "../../store";
import { listDocuments, normalizeApiError, uploadDocuments } from "../../services/api";
import { cn } from "../../lib/utils";

const ACCEPTED_TYPES = [".pdf", ".docx", ".doc", ".txt"];

const STATUS_META = {
  pending: { label: "Ready", tone: "text-text-muted", icon: FileText },
  uploading: { label: "Uploading", tone: "text-gold-300", icon: Loader2, spin: true },
  processing: { label: "Indexing", tone: "text-blue-300", icon: Loader2, spin: true },
  ready: { label: "Indexed", tone: "text-emerald-300", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "text-red-300", icon: AlertTriangle },
};

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function QueueItem({ item, onRemove }) {
  const meta = STATUS_META[item.status] || STATUS_META.pending;
  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated px-3 py-2"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/10">
        <FileText size={13} className="text-gold-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-text-primary">{item.file.name}</p>
        <p className="text-[10px] text-text-muted">
          {formatFileSize(item.file.size)} · {new Date(item.addedAt).toLocaleString()}
        </p>
      </div>
      <div className={cn("inline-flex items-center gap-1.5 text-[10px] font-semibold", meta.tone)}>
        <Icon size={11} className={meta.spin ? "animate-spin" : ""} />
        {meta.label}
      </div>
      {item.status === "pending" ? (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="rounded p-1 text-text-muted opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-300"
          aria-label={`Remove ${item.file.name}`}
        >
          <X size={12} />
        </button>
      ) : null}
    </motion.div>
  );
}

export default function UploadDropzone({ compact = false }) {
  const inputRef = useRef(null);
  const {
    activeWorkspaceId,
    addDocument,
    setDocuments,
    setDocumentsMeta,
    documentsByWorkspace,
  } = useAppStore((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    addDocument: state.addDocument,
    setDocuments: state.setDocuments,
    setDocumentsMeta: state.setDocumentsMeta,
    documentsByWorkspace: state.documentsByWorkspace,
  }));

  const [queue, setQueue] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const workspaceDocs = activeWorkspaceId ? documentsByWorkspace[activeWorkspaceId] || [] : [];

  const pendingCount = useMemo(() => queue.filter((item) => item.status === "pending").length, [queue]);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const addFilesToQueue = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const validFiles = incoming.filter((file) => {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
      return ACCEPTED_TYPES.includes(extension);
    });

    if (!validFiles.length) {
      toast.error("Unsupported file type. Use PDF, DOCX, DOC, or TXT.");
      return;
    }

    setQueue((previous) => {
      const existing = new Set(previous.map((item) => `${item.file.name}-${item.file.size}`));
      const additions = validFiles
        .filter((file) => !existing.has(`${file.name}-${file.size}`))
        .map((file) => ({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
          file,
          status: "pending",
          addedAt: Date.now(),
        }));
      return [...previous, ...additions];
    });
  };

  const handleInputChange = (event) => {
    addFilesToQueue(event.target.files);
    event.target.value = "";
  };

  const handleRemoveQueueItem = (id) => {
    setQueue((previous) => previous.filter((item) => item.id !== id));
  };

  const refreshDocuments = async () => {
    if (!activeWorkspaceId) return [];
    const docs = await listDocuments(activeWorkspaceId, { force: true });
    setDocuments(activeWorkspaceId, docs || []);
    return docs || [];
  };

  const pollProcessingStatus = async (trackedNames) => {
    if (!activeWorkspaceId || !trackedNames.length) return;
    let attempts = 0;
    const maxAttempts = 40;
    const names = new Set(trackedNames);
    let finished = false;

    while (!finished && attempts < maxAttempts) {
      attempts += 1;
      try {
        const docs = await refreshDocuments();
        const tracked = docs.filter((doc) => names.has(doc.filename));
        finished = tracked.length > 0 && tracked.every((doc) => doc.status === "ready" || doc.status === "failed");
        if (!finished) {
          await new Promise((resolve) => setTimeout(resolve, 1800));
        }
      } catch (error) {
        break;
      }
    }
  };

  const handleUpload = async () => {
    if (!activeWorkspaceId) {
      toast.error("Select a workspace before uploading.");
      return;
    }
    const pending = queue.filter((item) => item.status === "pending");
    if (!pending.length) return;

    setUploading(true);
    setUploadProgress(0);
    setQueue((previous) =>
      previous.map((item) => (item.status === "pending" ? { ...item, status: "uploading" } : item)),
    );

    try {
      const payload = await uploadDocuments(
        activeWorkspaceId,
        pending.map((item) => item.file),
        (progress) => setUploadProgress(progress),
      );

      const uploadedDocs = payload.documents || [];
      uploadedDocs.forEach((doc) => {
        addDocument(activeWorkspaceId, doc);
      });

      setQueue((previous) =>
        previous.map((item) =>
          pending.some((pendingItem) => pendingItem.id === item.id) ? { ...item, status: "processing" } : item,
        ),
      );

      setDocumentsMeta(activeWorkspaceId, { loading: true });
      await pollProcessingStatus(uploadedDocs.map((doc) => doc.filename));
      setDocumentsMeta(activeWorkspaceId, { loading: false });
      setQueue((previous) =>
        previous.map((item) =>
          pending.some((pendingItem) => pendingItem.id === item.id) ? { ...item, status: "ready" } : item,
        ),
      );
      setUploadProgress(100);
      toast.success("Upload complete. Documents are indexed.");
    } catch (error) {
      const message = normalizeApiError(error, "Upload failed.");
      setQueue((previous) =>
        previous.map((item) =>
          pending.some((pendingItem) => pendingItem.id === item.id) ? { ...item, status: "failed" } : item,
        ),
      );
      toast.error(message);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1200);
    }
  };

  useEffect(() => {
    if (!activeWorkspaceId) return;
    refreshDocuments().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const handleDropZoneKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const dropzoneClass = cn("upload-zone", dragOver && "drag-over", compact ? "p-4" : "p-5");

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleInputChange}
      />

      <div
        role="button"
        tabIndex={0}
        className={dropzoneClass}
        onClick={openPicker}
        onKeyDown={handleDropZoneKeyDown}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addFilesToQueue(event.dataTransfer.files);
        }}
        aria-label="Upload legal documents"
      >
        <div className="mx-auto flex max-w-xl flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-500/25 bg-gold-500/12">
            <UploadCloud size={20} className="text-gold-300" />
          </div>
          <p className="text-[13px] font-semibold text-text-primary">Upload legal files</p>
          <p className="text-[11px] text-text-secondary">Drag and drop files or click anywhere in this area.</p>
          <button
            type="button"
            className="btn-ghost mt-1 px-3 py-1.5 text-[11px]"
            onClick={(event) => {
              event.stopPropagation();
              openPicker();
            }}
          >
            Browse Files
          </button>
          <p className="text-[10px] text-text-muted">PDF, DOCX, DOC, TXT · Max 50MB/file</p>
        </div>
      </div>

      {uploadProgress > 0 ? (
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-text-secondary">
            <span>Upload progress</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${uploadProgress}%` }}
              className="h-full bg-gradient-to-r from-gold-500 to-emerald-400"
            />
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {queue.length ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {queue.map((item) => (
              <QueueItem key={item.id} item={item} onRemove={handleRemoveQueueItem} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {pendingCount > 0 ? (
        <button
          type="button"
          onClick={handleUpload}
          className="btn-gold w-full px-3 py-2 text-[12px]"
          disabled={uploading}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" />
              Uploading...
            </span>
          ) : (
            `Upload ${pendingCount} file${pendingCount > 1 ? "s" : ""}`
          )}
        </button>
      ) : null}

      {workspaceDocs.length ? (
        <p className="text-[10px] text-text-muted">Recent uploads in this workspace: {workspaceDocs.length}</p>
      ) : null}
    </div>
  );
}
