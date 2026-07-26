import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Terminal } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user && user !== false) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(loginId, password, remember);
      toast.success("Session established");
      navigate("/dashboard");
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-term-bg text-term-text relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(0,122,255,0.05) 0%, transparent 55%)" }} />

      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* Left column — brand + system readout */}
        <div className="hidden lg:flex flex-col justify-between p-12 border-r border-term-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 border border-term-accent grid place-items-center">
              <Terminal size={16} className="text-term-accent" />
            </div>
            <div>
              <div className="font-display text-lg font-bold tracking-tight">TERMINAL/PRO</div>
              <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
                Enterprise AI Trading Platform
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="font-display text-5xl leading-[1.05] font-bold tracking-tight">
              Institutional-grade<br />
              <span className="text-term-accent">terminal</span> for private<br />capital.
            </h1>
            <p className="max-w-md text-term-secondary text-[13px] leading-relaxed">
              Universal broker abstraction. Multi-provider AI core. Zero-trust security.
              Single-operator access — no public registration.
            </p>
            <div className="border border-term-border p-4 max-w-md">
              <div className="font-mono text-[10px] text-term-muted uppercase mb-3">// system readout</div>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between"><span className="text-term-muted">core</span><span className="text-term-success">ONLINE</span></div>
                <div className="flex justify-between"><span className="text-term-muted">ai_providers</span><span className="text-term-text">3/3</span></div>
                <div className="flex justify-between"><span className="text-term-muted">brokers</span><span className="text-term-text">framework_ready</span></div>
                <div className="flex justify-between"><span className="text-term-muted">encryption</span><span className="text-term-success">FERNET/AES</span></div>
                <div className="flex justify-between"><span className="text-term-muted">session_ttl</span><span className="text-term-text">15m access · 7d refresh</span></div>
              </div>
            </div>
          </div>

          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            authorized personnel only · all activity is logged
          </div>
        </div>

        {/* Right column — login form */}
        <div className="flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <Terminal size={16} className="text-term-accent" />
              <span className="font-display text-base font-bold">TERMINAL/PRO</span>
            </div>

            <div className="mb-8">
              <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider mb-2">
                &gt; auth.request
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight mb-2">
                Owner sign-in
              </h2>
              <p className="text-term-secondary text-[13px]">
                Enter credentials to access the trading terminal.
              </p>
            </div>

            <form onSubmit={submit} data-testid={TEST_IDS.login.form} className="space-y-4">
              <div>
                <label className="font-mono text-[10px] text-term-muted uppercase tracking-wider block mb-1.5">
                  Username / Email
                </label>
                <input
                  data-testid={TEST_IDS.login.username}
                  autoFocus
                  autoComplete="username"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full h-10 px-3 bg-term-surface border border-term-border font-mono text-[13px] focus:border-term-accent focus:outline-none"
                  placeholder="NS4039"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] text-term-muted uppercase tracking-wider block mb-1.5">
                  Password
                </label>
                <input
                  data-testid={TEST_IDS.login.password}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 bg-term-surface border border-term-border font-mono text-[13px] focus:border-term-accent focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <label className="flex items-center gap-2 select-none cursor-pointer text-[12px] text-term-secondary">
                <input
                  data-testid={TEST_IDS.login.remember}
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-3.5 w-3.5 accent-term-accent"
                />
                <span>Remember this device (30d refresh)</span>
              </label>

              {err && (
                <div data-testid={TEST_IDS.login.error} className="border border-term-danger/50 bg-term-danger/5 px-3 py-2 font-mono text-[11px] text-term-danger">
                  ERR // {err}
                </div>
              )}

              <button
                data-testid={TEST_IDS.login.submit}
                disabled={busy || !loginId || !password}
                type="submit"
                className="w-full h-10 bg-term-accent hover:bg-[color:var(--accent-hover)] text-white disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[12px] uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Lock size={12} />
                {busy ? "authenticating..." : "sign in"}
              </button>

              <div className="pt-6 border-t border-term-border">
                <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
                  no registration · single-operator platform · brute-force protected
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
