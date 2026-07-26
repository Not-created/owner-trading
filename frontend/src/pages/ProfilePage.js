import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, KeyRound } from "lucide-react";
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
  const [twofa, setTwofa] = useState(null);
  const [setup, setSetup] = useState(null); // { qr_png_b64, secret, otpauth_uri }
  const [totp, setTotp] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [trusted, setTrusted] = useState([]);

  const load = async () => {
    try {
      const [{ data: s }, { data: h }, { data: t }, { data: td }] = await Promise.all([
        api.get("/auth/sessions"),
        api.get("/auth/login-history"),
        api.get("/auth/2fa/status"),
        api.get("/auth/2fa/trusted-devices"),
      ]);
      setSessions(s.sessions);
      setHistory(h.history);
      setTwofa(t);
      setTrusted(td.devices || []);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    try {
      await api.patch("/users/me/profile", { display_name: display, recovery_email: recovery, timezone: tz });
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
    try { await api.post("/auth/logout-all"); toast.success("All sessions revoked"); window.location.href = "/login"; }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const beginSetup = async () => {
    try {
      const { data } = await api.post("/auth/2fa/setup");
      setSetup(data);
      setBackupCodes(null);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const verifySetup = async () => {
    try {
      const { data } = await api.post("/auth/2fa/verify", { code: totp });
      setBackupCodes(data.backup_codes);
      setSetup(null);
      setTotp("");
      toast.success("2FA enabled");
      load();
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const disable = async () => {
    try {
      await api.post("/auth/2fa/disable", { code: totp });
      setTotp(""); setBackupCodes(null);
      toast.success("2FA disabled");
      load();
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const revokeTrusted = async (id) => {
    try { await api.delete(`/auth/2fa/trusted-devices/${id}`); toast.success("Trusted device revoked"); load(); }
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ReadOnly label="Username" value={user?.username} />
          <ReadOnly label="Email" value={user?.email} />
          <Input label="Display name" value={display} onChange={setDisplay} testid={TEST_IDS.profile.displayName} />
          <Input label="Recovery email" value={recovery} onChange={setRecovery} />
          <Input label="Timezone" value={tz} onChange={setTz} />
        </div>
        <button data-testid={TEST_IDS.profile.save} onClick={saveProfile}
          className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase">Save profile</button>
      </section>

      <section className="border border-term-border bg-term-surface p-6 space-y-4">
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

      {/* 2FA */}
      <section data-testid={TEST_IDS.profile.twoFA} className="border border-term-border bg-term-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-[13px] font-bold flex items-center gap-2">
              <ShieldCheck size={14} className={twofa?.enabled ? "text-term-success" : "text-term-muted"} />
              Two-factor authentication (TOTP)
            </div>
            <div className="font-mono text-[10px] text-term-muted mt-0.5">
              {twofa?.enabled ? `enabled · ${twofa.backup_codes_remaining} backup codes left` : "disabled"}
            </div>
          </div>
          {!twofa?.enabled && !setup && (
            <button data-testid={TEST_IDS.profile.twoFAEnable} onClick={beginSetup}
              className="h-9 px-4 border border-term-border font-mono text-[11px] uppercase hover:border-term-accent hover:text-term-accent">
              Enable 2FA
            </button>
          )}
        </div>

        {/* Setup flow */}
        {setup && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border border-term-border p-4">
            <div>
              <div className="font-mono text-[10px] uppercase text-term-muted mb-2">Scan with an authenticator</div>
              <img alt="QR" src={`data:image/png;base64,${setup.qr_png_b64}`} className="w-44 h-44 bg-white p-2" />
              <div className="font-mono text-[10px] text-term-muted mt-2">or paste secret:</div>
              <div className="font-mono text-[11px] text-term-text break-all">{setup.secret}</div>
            </div>
            <div className="space-y-3">
              <div className="font-mono text-[10px] uppercase text-term-muted">Enter the 6-digit code</div>
              <input value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} maxLength={6}
                placeholder="000000"
                className="w-40 h-11 px-3 bg-term-panel border border-term-border font-mono text-[16px] tracking-widest focus:border-term-accent focus:outline-none" />
              <button data-testid={TEST_IDS.profile.twoFAVerify} onClick={verifySetup} disabled={totp.length !== 6}
                className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase disabled:opacity-40">
                Confirm & enable
              </button>
              <button onClick={() => { setSetup(null); setTotp(""); }} className="ml-2 font-mono text-[10px] uppercase text-term-muted hover:text-term-text">cancel</button>
            </div>
          </div>
        )}

        {backupCodes && (
          <div className="border border-term-warning/40 bg-term-warning/5 p-3">
            <div className="font-mono text-[10px] uppercase text-term-warning mb-2 flex items-center gap-1">
              <KeyRound size={11} /> Save these backup codes now — shown once
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1 font-mono text-[12px]">
              {backupCodes.map((c) => <div key={c} className="p-1 border border-term-border">{c}</div>)}
            </div>
          </div>
        )}

        {twofa?.enabled && !setup && (
          <div className="border border-term-border p-4 space-y-2">
            <div className="font-mono text-[10px] uppercase text-term-muted">Disable 2FA (requires current TOTP)</div>
            <div className="flex items-center gap-2">
              <input data-testid={TEST_IDS.profile.twoFACode} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} maxLength={8}
                placeholder="TOTP or backup code"
                className="w-56 h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px]" />
              <button data-testid={TEST_IDS.profile.twoFADisable} onClick={disable}
                className="h-9 px-4 border border-term-border font-mono text-[11px] uppercase hover:border-term-danger hover:text-term-danger flex items-center gap-1">
                <ShieldOff size={12} /> Disable
              </button>
            </div>
          </div>
        )}

        {twofa?.enabled && (
          <div data-testid={TEST_IDS.profile.trustedDevices} className="border border-term-border">
            <div className="h-9 px-4 border-b border-term-border font-mono text-[10px] uppercase text-term-muted flex items-center justify-between">
              <span>Trusted devices ({trusted.length})</span>
            </div>
            {trusted.length === 0 ? (
              <div className="p-3 font-mono text-[11px] text-term-muted">No trusted devices yet.</div>
            ) : trusted.map((d) => (
              <div key={d.device_id} className="px-4 py-2 border-b border-term-border/40 last:border-0 flex items-center justify-between">
                <div className="font-mono text-[11px]">
                  <div>{d.label}</div>
                  <div className="text-term-muted">trusted {d.trusted_at?.slice(0,19).replace("T"," ")}</div>
                </div>
                <button onClick={() => revokeTrusted(d.device_id)} className="font-mono text-[10px] uppercase text-term-danger hover:underline">revoke</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Active sessions</div>
          <button data-testid={TEST_IDS.profile.logoutAll} onClick={logoutAll} className="font-mono text-[10px] uppercase text-term-danger hover:underline">Logout everywhere</button>
        </header>
        <div data-testid={TEST_IDS.profile.sessions}>
          {sessions.length === 0 && <div className="p-4 text-term-muted font-mono text-[11px]">No active sessions</div>}
          {sessions.map((s) => (
            <div key={s.id} className="p-3 border-b border-term-border/50 flex items-center justify-between last:border-0">
              <div className="font-mono text-[11px]">
                <div>{s.device?.user_agent?.slice(0, 80) || "unknown"}</div>
                <div className="text-term-muted">ip {s.device?.ip} · created {s.created_at?.slice(0, 19).replace("T", " ")}</div>
              </div>
              <div className="flex items-center gap-3">
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
        <div className="font-mono text-[11px]">
          {history.length === 0 && <div className="p-4 text-term-muted">No history</div>}
          {history.map((h, i) => (
            <div key={i} className="px-4 h-8 flex items-center gap-4 border-b border-term-border/40 last:border-0">
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

function ReadOnly({ label, value }) {
  return (
    <div>
      <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">{label}</label>
      <div className="h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] flex items-center text-term-secondary">{value}</div>
    </div>
  );
}
function Input({ label, value, onChange, testid }) {
  return (
    <div>
      <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">{label}</label>
      <input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
    </div>
  );
}
