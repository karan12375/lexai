import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, FileText, Gavel, Scale, Search, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  { icon: Search, title: "Legal Search", desc: "Search judgments, statutes, and workspace files in one flow." },
  { icon: Shield, title: "Counter Arguments", desc: "Generate defense strategy with structured legal reasoning." },
  { icon: Gavel, title: "Verdict Prediction", desc: "Estimate probable outcomes from facts and precedent patterns." },
  { icon: FileText, title: "AI Drafting", desc: "Draft petitions, notices, affidavits, and replies rapidly." },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-8 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-border-subtle bg-bg-secondary p-5 md:p-8">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-saffron text-bg-primary">
              <Scale size={17} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-text-primary">LexAI</p>
              <p className="text-[11px] text-text-muted">Indian Legal Workspace</p>
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
            <h1 className="text-[30px] font-bold leading-tight text-text-primary md:text-[38px]">
              Premium legal AI workflow for
              <span className="bg-gradient-to-r from-gold-300 to-emerald-300 bg-clip-text text-transparent"> Indian litigation teams</span>
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
              Persistent workspaces, structured chats, legal references, verdict analysis, and drafting tools in a
              single production-ready interface.
            </p>
          </motion.div>

          <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-border-subtle bg-bg-elevated p-3">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/10">
                  <feature.icon size={13} className="text-gold-300" />
                </div>
                <p className="text-[12px] font-semibold text-text-primary">{feature.title}</p>
                <p className="mt-1 text-[11px] text-text-secondary">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1.5">
            {[
              "Persistent workspace and chat history",
              "Supabase session restoration and secure auth",
              "Streaming legal responses with citation panel",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[11px] text-text-secondary">
                <CheckCircle2 size={12} className="text-emerald-300" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center rounded-3xl border border-border-subtle bg-bg-secondary p-5 md:p-8"
        >
          <div className="w-full max-w-md">
            <h2 className="text-[24px] font-semibold text-text-primary">Welcome back</h2>
            <p className="mt-1 text-[12px] text-text-secondary">
              Continue with your secure legal workspace or create a new account.
            </p>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => navigate("/signup")}
                className="btn-gold inline-flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-[12px]"
              >
                Get Started
                <ArrowRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="btn-ghost w-full px-3 py-2.5 text-[12px]"
              >
                Login
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

