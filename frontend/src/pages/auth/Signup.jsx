import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Scale } from "lucide-react";
import toast from "react-hot-toast";

import { supabase } from "../../lib/supabase";
import { useAppStore } from "../../store";

export default function Signup() {
  const navigate = useNavigate();
  const { setSession, setAuthReady } = useAppStore((state) => ({
    setSession: state.setSession,
    setAuthReady: state.setAuthReady,
  }));

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!fullName.trim()) {
      toast.error("Full name is required.");
      return false;
    }
    if (!username.trim() || username.trim().length < 3) {
      toast.error("Username must be at least 3 characters.");
      return false;
    }
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

  const handleSignup = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            username: username.trim(),
          },
        },
      });

      if (error) {
        toast.error(error.message || "Signup failed.");
        return;
      }

      if (data?.session) {
        setSession(data.session);
        setAuthReady(true);
        toast.success("Account created.");
        navigate("/workspace/dashboard", { replace: true });
        return;
      }

      toast.success("Account created. Verify your email and then login.");
      navigate("/login", { replace: true });
    } catch (signupError) {
      toast.error("Signup failed. Please retry.");
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
              <h1 className="text-[18px] font-semibold text-text-primary">Create LexAI Account</h1>
              <p className="text-[11px] text-text-muted">Start your persistent legal workspace.</p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full Name"
              className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2.5 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
            />
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              className="w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-2.5 text-[12px] text-text-primary outline-none focus:border-gold-500/40"
            />
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
                if (event.key === "Enter") handleSignup();
              }}
            />

            <button type="button" onClick={handleSignup} disabled={loading} className="btn-gold w-full px-3 py-2.5 text-[12px]">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </div>

          <p className="mt-5 text-center text-[11px] text-text-muted">
            Already have an account?{" "}
            <Link to="/login" className="text-gold-300 hover:text-gold-200">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

