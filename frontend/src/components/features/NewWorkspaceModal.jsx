import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Briefcase, Loader2, Scale, X } from "lucide-react";
import toast from "react-hot-toast";

import { createWorkspace, normalizeApiError } from "../../services/api";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

const CASE_TYPES = [
  { value: "criminal", label: "Criminal", desc: "IPC, CrPC, FIR matters" },
  { value: "civil", label: "Civil", desc: "Property, contract, injunctions" },
  { value: "constitutional", label: "Constitutional", desc: "Rights, writ petitions" },
  { value: "family", label: "Family", desc: "Custody, matrimonial disputes" },
  { value: "corporate", label: "Corporate", desc: "Commercial and company law" },
  { value: "cybercrime", label: "Cyber Crime", desc: "IT Act, fraud, digital evidence" },
  { value: "taxation", label: "Taxation", desc: "GST, income tax disputes" },
  { value: "consumer", label: "Consumer", desc: "Consumer forum complaints" },
  { value: "employment", label: "Employment", desc: "Labor and service disputes" },
  { value: "general", label: "General", desc: "General legal workspace" },
];

export function NewWorkspaceModal({ onClose }) {
  const navigate = useNavigate();
  const { upsertWorkspace, setActiveWorkspaceId, setSelectedPage } = useAppStore((state) => ({
    upsertWorkspace: state.upsertWorkspace,
    setActiveWorkspaceId: state.setActiveWorkspaceId,
    setSelectedPage: state.setSelectedPage,
  }));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [caseType, setCaseType] = useState("criminal");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [loading, onClose]);

  const canSubmit = useMemo(() => name.trim().length >= 3 && !loading, [loading, name]);

  const handleCreate = async () => {
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = "Workspace name is required.";
    if (name.trim().length < 3) nextErrors.name = "Use at least 3 characters.";
    if (description.trim().length > 300) nextErrors.description = "Keep description within 300 characters.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    try {
      const workspace = await createWorkspace({
        name: name.trim(),
        description: description.trim(),
        case_type: caseType,
      });
      upsertWorkspace(workspace, true);
      setActiveWorkspaceId(workspace.id);
      setSelectedPage("/workspace/chat");
      toast.success("Workspace created.");
      onClose();
      navigate("/workspace/chat");
    } catch (error) {
      toast.error(normalizeApiError(error, "Failed to create workspace."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/55"
          onClick={() => !loading && onClose()}
          aria-label="Close modal backdrop"
        />

        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-border-default bg-bg-secondary shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold-500/25 bg-gold-500/12">
                <Briefcase size={16} className="text-gold-300" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">Create Workspace</h2>
                <p className="text-[11px] text-text-muted">Set up a persistent legal matter workspace.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => !loading && onClose()}
              className="rounded-lg border border-border-subtle p-1.5 text-text-muted hover:text-text-primary"
              aria-label="Close modal"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">Workspace Name</label>
                <input
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={cn(
                    "w-full rounded-xl border bg-bg-elevated px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40",
                    errors.name ? "border-red-500/45" : "border-border-default",
                  )}
                  placeholder="e.g. State vs Rahul Kumar"
                  maxLength={100}
                />
                {errors.name ? <p className="mt-1 text-[10px] text-red-300">{errors.name}</p> : null}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className={cn(
                    "w-full resize-none rounded-xl border bg-bg-elevated px-3 py-2 text-[12px] text-text-primary outline-none focus:border-gold-500/40",
                    errors.description ? "border-red-500/45" : "border-border-default",
                  )}
                  placeholder="Brief legal context, allegations, sections involved, or strategy notes."
                />
                <div className="mt-1 flex items-center justify-between">
                  {errors.description ? <p className="text-[10px] text-red-300">{errors.description}</p> : <span />}
                  <p className="text-[10px] text-text-muted">{description.trim().length}/300</p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
                  <Scale size={12} className="text-gold-300" />
                  Litigation Category
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CASE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setCaseType(type.value)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition",
                        caseType === type.value
                          ? "border-gold-500/30 bg-gold-500/12 text-gold-200"
                          : "border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-default",
                      )}
                    >
                      <p className="text-[12px] font-medium">{type.label}</p>
                      <p className="text-[10px] text-text-muted">{type.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-subtle px-4 py-3">
            <button type="button" className="btn-ghost flex-1 px-3 py-2 text-[12px]" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-gold flex-1 px-3 py-2 text-[12px]"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  Creating...
                </span>
              ) : (
                "Create Workspace"
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

