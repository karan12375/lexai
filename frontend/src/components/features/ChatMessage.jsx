import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import {
  CheckCheck,
  Copy,
  ExternalLink,
  RefreshCw,
  Scale,
  User,
} from "lucide-react";
import toast from "react-hot-toast";

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </div>
  );
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CodeBlock({ children, className = "" }) {
  const language = className.replace("language-", "");
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-[#0f1624]">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5 text-[10px] text-text-muted">
        <span>{language || "code"}</span>
      </div>
      <pre className={className}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function CitationTag({ citation }) {
  return (
    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1">
      <div className="flex items-center gap-1.5">
        <p className="max-w-[260px] truncate text-[10px] font-semibold text-emerald-200">{citation.title}</p>
        {citation.url ? (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-300 transition hover:text-emerald-200"
          >
            <ExternalLink size={10} />
          </a>
        ) : null}
      </div>
      <p className="truncate text-[10px] text-emerald-100/75">
        {[citation.court, citation.date, citation.section].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

function MessageBody({ message, onRegenerate }) {
  const [copied, setCopied] = useState(false);

  const timestamp = useMemo(() => formatTimestamp(message.created_at), [message.created_at]);

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (error) {
      toast.error("Unable to copy message.");
    }
  };

  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex justify-end gap-2">
        <div className="chat-user">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {timestamp ? <p className="mt-1 text-[10px] text-text-muted">{timestamp}</p> : null}
        </div>
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/18">
          <User size={12} className="text-gold-300" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="group mb-4 flex items-start gap-2">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-500 to-saffron text-bg-primary">
        <Scale size={12} />
      </div>
      <div className="min-w-0 flex-1">
        {message.isStreaming && message.stage ? (
          <div className="stage-badge mb-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300" />
            {message.stage}
          </div>
        ) : null}

        <div className="chat-ai">
          {message.isStreaming && !message.content ? (
            <ThinkingDots />
          ) : (
            <div className="prose-legal">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code: ({ className, children, ...props }) => {
                    const content = String(children || "");
                    const isBlock = String(className || "").startsWith("language-") || content.includes("\n");
                    if (isBlock) {
                      return <CodeBlock className={className}>{children}</CodeBlock>;
                    }
                    return (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content || ""}
              </ReactMarkdown>
              {message.isStreaming ? <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-gold-400" /> : null}
            </div>
          )}
        </div>

        {message.citations?.length ? (
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {message.citations.slice(0, 4).map((citation, index) => (
              <CitationTag key={`${citation.title || "cite"}-${index}`} citation={citation} />
            ))}
          </div>
        ) : null}

        <div className="mt-1.5 flex items-center gap-2">
          {timestamp ? <span className="text-[10px] text-text-muted">{timestamp}</span> : null}
          {!message.isStreaming ? (
            <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={copyContent}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              >
                {copied ? <CheckCheck size={10} className="text-emerald-300" /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy"}
              </button>
              {typeof onRegenerate === "function" ? (
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  <RefreshCw size={10} />
                  Regenerate
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

const ChatMessage = memo(MessageBody);
export default ChatMessage;
