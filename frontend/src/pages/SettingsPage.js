import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const TABS = [
  { id: "system", label: "System", tid: TEST_IDS.settings.tabSystem },
  { id: "security", label: "Security", tid: TEST_IDS.settings.tabSecurity },
  { id: "appearance", label: "Appearance", tid: TEST_IDS.settings.tabAppearance },
  { id: "notifications", label: "Notifications", tid: TEST_IDS.settings.tabNotifications },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("system");
  const [store, setStore] = useState({});
  const load = () => api.get("/settings").then(({ data }) => setStore(data.settings || {}));
  useEffect(() => { load(); }, []);

  const save = async (key, value) => {
    try {
      await api.put(`/settings/${key}`, value);
      toast.success(`Saved: ${key}`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const current = store[tab] || {};

  return (
    <div data-testid={TEST_IDS.settings.root} className="p-6 max-w-[1400px]">
      <div className="mb-6">
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// settings</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">System Settings</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3">
          <div className="border border-term-border bg-term-surface">
            {TABS.map((t) => (
              <button
                key={t.id}
                data-testid={t.tid}
                onClick={() => setTab(t.id)}
                className={`w-full text-left h-10 px-4 font-mono text-[11px] uppercase border-l-2 ${
                  tab === t.id
                    ? "bg-term-hover border-term-accent text-term-text"
                    : "border-transparent text-term-secondary hover:text-term-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="col-span-9 border border-term-border bg-term-surface p-6">
          {tab === "system" && (
            <SysForm current={current} onSave={(v) => save("system", v)} />
          )}
          {tab === "security" && (
            <SecForm current={current} onSave={(v) => save("security", v)} />
          )}
          {tab === "appearance" && (
            <AppForm current={current} onSave={(v) => save("appearance", v)} />
          )}
          {tab === "notifications" && (
            <NotifForm current={current} onSave={(v) => save("notifications", v)} />
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="font-mono text-[10px] text-term-muted uppercase block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full h-10 bg-term-panel border border-term-border px-3 font-mono text-[12px] focus:border-term-accent focus:outline-none";

function SaveBtn({ onClick }) {
  return (
    <button data-testid={TEST_IDS.settings.save} onClick={onClick} className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase">
      Save changes
    </button>
  );
}

function SysForm({ current, onSave }) {
  const [platformName, setPlatformName] = useState(current.platform_name || "Terminal Pro");
  const [tz, setTz] = useState(current.timezone || "UTC");
  return (
    <div className="space-y-5 max-w-xl">
      <Field label="Platform name"><input value={platformName} onChange={(e) => setPlatformName(e.target.value)} className={inputCls} /></Field>
      <Field label="Default timezone"><input value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls} /></Field>
      <SaveBtn onClick={() => onSave({ platform_name: platformName, timezone: tz })} />
    </div>
  );
}
function SecForm({ current, onSave }) {
  const [maxAttempts, setMaxAttempts] = useState(current.max_attempts ?? 5);
  const [lockout, setLockout] = useState(current.lockout_minutes ?? 15);
  return (
    <div className="space-y-5 max-w-xl">
      <Field label="Max failed login attempts"><input type="number" value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} className={inputCls} /></Field>
      <Field label="Lockout minutes"><input type="number" value={lockout} onChange={(e) => setLockout(Number(e.target.value))} className={inputCls} /></Field>
      <SaveBtn onClick={() => onSave({ max_attempts: maxAttempts, lockout_minutes: lockout })} />
    </div>
  );
}
function AppForm({ current, onSave }) {
  const [theme, setTheme] = useState(current.theme || "dark");
  const [accent, setAccent] = useState(current.accent || "#007AFF");
  return (
    <div className="space-y-5 max-w-xl">
      <Field label="Theme">
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className={inputCls}>
          <option value="dark">Dark (Terminal)</option>
          <option value="light">Light</option>
          <option value="auto">Auto</option>
        </select>
      </Field>
      <Field label="Accent color">
        <input value={accent} onChange={(e) => setAccent(e.target.value)} className={inputCls} />
      </Field>
      <SaveBtn onClick={() => onSave({ theme, accent })} />
    </div>
  );
}
function NotifForm({ current, onSave }) {
  const [email, setEmail] = useState(current.email_alerts ?? true);
  const [audit, setAudit] = useState(current.audit_alerts ?? true);
  return (
    <div className="space-y-5 max-w-xl">
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 accent-term-accent" />
        <span className="text-[12px]">Email alerts on critical events</span>
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={audit} onChange={(e) => setAudit(e.target.checked)} className="h-4 w-4 accent-term-accent" />
        <span className="text-[12px]">Real-time audit notifications</span>
      </label>
      <SaveBtn onClick={() => onSave({ email_alerts: email, audit_alerts: audit })} />
    </div>
  );
}
