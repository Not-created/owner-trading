import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { TEST_IDS } from "@/constants/testIds";

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [display, setDisplay] = useState(user?.profile?.display_name || "");
  const [recovery, setRecovery] = useState(user?.profile?.recovery_email || "");
  const [tz, setTz] = useState(user?.profile?.timezone || "UTC");
  const [sessions, setSessions] = useState([]);
  const [history, setHistory] = useState([]);
  const [pwCur, setPwCur] = useState("");
  const [pwNew, setPwNew] = useState("");

  const load = async () => {
    try {
      const [{ data: s }, { data: h }] = await Promise.all([
        api.get("/auth/sessions"),
        api.get("/auth/login-history"),
      ]);
      setSessions(s.sessions);
      setHistory(h.history);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    try {
      await api.patch("/users/me/profile", {
        display_name: display,
        recovery_email: recovery,
        timezone: tz,
      });
      toast.success("Profile updated");
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const changePw = async () => {
    try {
      await api.post("/auth/change-password", { current_password: pwCur, new_password: pwNew });
      setPwCur(""); setPwNew("");
      toast.success("Password changed");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const revokeSession = async (id) => {
    try { await api.delete(`/auth/sessions/${id}`); load(); toast.success("Session revoked"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const logoutAll = async () => {
    try { await api.post("/auth/logout-all"); toast.success("All sessions revoked. Please sign in again."); window.location.href = "/login"; }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div data-testid={TEST_IDS.profile.root} className="p-6 space-y-6 max-w-5xl">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// user.profile</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Owner Profile</h1>
      </div>

      <section className="border border-term-border bg-term-surface p-6 space-y-4">
        <div className="font-display text-[13px] font-bold">Identity</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">Username</label>
            <div className="h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] flex items-center text-term-secondary">{user?.username}</div>
          </div>
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">Email</label>
            <div className="h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] flex items-center text-term-secondary">{user?.email}</div>
          </div>
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">Display name</label>
            <input data-testid={TEST_IDS.profile.displayName} value={display} onChange={(e) => setDisplay(e.target.value)}
              className="w-full h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          </div>
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">Recovery email</label>
            <input value={recovery} onChange={(e) => setRecovery(e.target.value)}
              className="w-full h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          </div>
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">Timezone</label>
            <input value={tz} onChange={(e) => setTz(e.target.value)}
              className="w-full h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          </div>
        </div>
        <button data-testid={TEST_IDS.profile.save} onClick={saveProfile} className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase">Save profile</button>
      </section>

      <section className="border border-term-border bg-term-surface p-4 sm:p-6 space-y-4">
        <div className="font-display text-[13px] font-bold">Change password</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <input data-testid={TEST_IDS.profile.changePwCurrent} type="password" placeholder="Current password" value={pwCur} onChange={(e) => setPwCur(e.target.value)}
            className="h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          <input data-testid={TEST_IDS.profile.changePwNew} type="password" placeholder="New password (min 8)" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
            className="h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
        </div>
        <button data-testid={TEST_IDS.profile.changePwSubmit} onClick={changePw} disabled={!pwCur || pwNew.length < 8}
          className="h-9 px-4 border border-term-border font-mono text-[11px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40">
          Update password
        </button>
      </section>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Active sessions</div>
          <button data-testid={TEST_IDS.profile.logoutAll} onClick={logoutAll} className="font-mono text-[10px] uppercase text-term-danger hover:underline">Logout everywhere</button>
        </header>
        <div data-testid={TEST_IDS.profile.sessions}>
          {sessions.length === 0 && <div className="p-4 text-term-muted font-mono text-[11px]">No active sessions</div>}
          {sessions.map((s) => (
            <div key={s.id} className="p-3 border-b border-term-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 last:border-0">
              <div className="font-mono text-[11px] min-w-0">
                <div className="break-all">{s.device?.user_agent?.slice(0, 80) || "unknown"}</div>
                <div className="text-term-muted break-all">ip {s.device?.ip} · created {s.created_at?.slice(0, 19).replace("T", " ")}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {s.is_current && <span className="font-mono text-[10px] text-term-success">CURRENT</span>}
                {!s.is_current && (
                  <button onClick={() => revokeSession(s.id)} className="font-mono text-[10px] text-term-danger uppercase hover:underline">Revoke</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Recent login history</div>
        </header>
        <div className="font-mono text-[11px] overflow-x-auto">
          {history.length === 0 && <div className="p-4 text-term-muted">No history</div>}
          {history.map((h, i) => (
            <div key={i} className="px-4 h-8 flex items-center gap-4 border-b border-term-border/40 last:border-0 min-w-[520px]">
              <span className="w-40 text-term-muted">{h.created_at?.slice(0, 19).replace("T", " ")}</span>
              <span className={h.success ? "text-term-success" : "text-term-danger"}>{h.success ? "SUCCESS" : "FAILED"}</span>
              <span className="text-term-muted">{h.identifier}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
