import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Scale } from "lucide-react";
import toast from "react-hot-toast";

import { supabase } from "../../lib/supabase";
import { useAppStore } from "../../store";

export default function Login() {
  const navigate = useNavigate();
  const { setSession, setAuthReady } = useAppStore((state) => ({
    setSession: state.setSession,
    setAuthReady: state.setAuthReady,
  }));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error("Enter a valid email address.");
      return false;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return false;
    }
    return true;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error(error.message || "Login failed.");
        return;
      }
      if (!data?.session) {
        toast.error("Unable to establish a valid session.");
        return;
      }
      setSession(data.session);
      setAuthReady(true);
      toast.success("Welcome back.");
      navigate("/workspace/dashboard", { replace: true });
    } catch (loginError) {
      toast.error("Login failed. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-4xl items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-border-default bg-bg-elevated p-6 shadow-2xl">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold-500 to-saffron text-bg-primary">
              <Scale size={16} />
            </div>
            <div>
              <h1 className="text-[18px] font-semibold text-text-primary">Login to LexAI</h1>
              <p className="text-[11px] text-text-muted">Continue your legal workspace session.</p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2.5 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2.5 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
              onKeyDown={(event) => {
                if (event.key === "Enter") handleLogin();
              }}
            />
            <button type="button" onClick={handleLogin} disabled={loading} className="btn-gold w-full px-3 py-2.5 text-[12px]">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  Logging in...
                </span>
              ) : (
                "Login"
              )}
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between text-[11px] text-text-muted">
            <span>Secure Supabase session</span>
            <Link to="/signup" className="text-gold-300 hover:text-gold-200">
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

