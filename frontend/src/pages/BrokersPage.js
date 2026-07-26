import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Network, Info, Plus, Zap, Trash2, Radio } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function BrokersPage() {
  const [plugins, setPlugins] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(null); // plugin object or null

  const load = async () => {
    const [p, a] = await Promise.all([api.get("/brokers/plugins"), api.get("/brokers/accounts")]);
    setPlugins(p.data.plugins);
    setAccounts(a.data.accounts);
  };
  useEffect(() => { load(); }, []);

  return (
    <div data-testid={TEST_IDS.brokers.root} className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// broker.core</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Universal Broker Engine</h1>
        <p className="text-term-secondary text-[13px] mt-1">
          Broker plugins register with the core; add accounts, encrypt credentials, and mark one primary.
        </p>
      </div>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Installed broker plugins</div>
          <span className="font-mono text-[10px] text-term-muted">{plugins.length} registered</span>
        </header>
        {plugins.length === 0 ? (
          <div data-testid={TEST_IDS.brokers.emptyPlugins} className="p-8 flex items-start gap-3">
            <Info size={16} className="text-term-accent shrink-0 mt-0.5" />
            <div className="text-term-secondary text-[12px] max-w-2xl leading-relaxed">
              No broker plugins currently installed.
            </div>
          </div>
        ) : (
          <div data-testid={TEST_IDS.brokers.pluginsList} className="divide-y divide-term-border">
            {plugins.map((p) => (
              <div key={p.plugin_id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 border border-term-border grid place-items-center">
                    <Network size={14} className="text-term-accent" />
                  </div>
                  <div>
                    <div className="font-display text-[14px] font-bold">{p.display_name}</div>
                    <div className="font-mono text-[10px] text-term-muted">{p.plugin_id} · v{p.version}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-[11px] text-term-muted hidden md:block">
                    needs: {p.required_credentials.join(", ")}
                  </div>
                  <button data-testid={TEST_IDS.brokers.addBtn(p.plugin_id)} onClick={() => setModal(p)}
                    className="h-8 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-2">
                    <Plus size={12} /> add account
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Connected accounts</div>
          <span className="font-mono text-[10px] text-term-muted">{accounts.length}</span>
        </header>
        {accounts.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            0 accounts. Add one via a plugin above.
          </div>
        ) : (
          <table data-testid={TEST_IDS.brokers.accountsList} className="w-full text-left">
            <thead className="border-b border-term-border">
              <tr className="font-mono text-[10px] text-term-muted uppercase">
                <th className="px-4 h-9">Label</th>
                <th className="px-4 h-9">Plugin</th>
                <th className="px-4 h-9">Status</th>
                <th className="px-4 h-9">Primary</th>
                <th className="px-4 h-9 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AccountRow key={a.account_id} a={a} onChange={load} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modal && <AddAccountModal plugin={modal} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
}

function AccountRow({ a, onChange }) {
  const [busy, setBusy] = useState(false);
  const doConnect = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/brokers/accounts/${a.account_id}/connect`);
      if (data.ok) toast.success(`Connected · ${data.latency_ms}ms`);
      else toast.error(`Failed: ${data.detail}`);
      onChange();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };
  const doDisconnect = async () => {
    try { await api.post(`/brokers/accounts/${a.account_id}/disconnect`); toast.success("Disconnected"); onChange(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const doPrimary = async () => {
    try { await api.post(`/brokers/accounts/${a.account_id}/primary`); toast.success("Marked primary"); onChange(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const doRemove = async () => {
    if (!window.confirm(`Delete account "${a.label}"?`)) return;
    try { await api.delete(`/brokers/accounts/${a.account_id}`); toast.success("Removed"); onChange(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <tr className="border-b border-term-border/50">
      <td className="px-4 h-10 text-[12px]">{a.label}</td>
      <td className="px-4 h-10 font-mono text-[11px] text-term-secondary">{a.plugin_id}</td>
      <td className="px-4 h-10 font-mono text-[11px]">
        <span className={a.status === "connected" ? "text-term-success" : a.status === "error" ? "text-term-danger" : "text-term-muted"}>
          {a.status}
        </span>
        {a.last_health?.detail && (
          <div className="text-[10px] text-term-muted truncate max-w-[220px]" title={a.last_health.detail}>
            {a.last_health.detail}
          </div>
        )}
      </td>
      <td className="px-4 h-10 font-mono text-[11px]">
        {a.is_primary ? <span className="text-term-success">YES</span> :
          <button data-testid={TEST_IDS.brokers.primary(a.account_id)} onClick={doPrimary}
            className="text-term-muted hover:text-term-text underline">make primary</button>}
      </td>
      <td className="px-4 h-10 text-right">
        <div className="inline-flex gap-1">
          {a.status !== "connected" ? (
            <button data-testid={TEST_IDS.brokers.connect(a.account_id)} onClick={doConnect} disabled={busy}
              className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-success hover:text-term-success flex items-center gap-1">
              <Zap size={10} /> connect
            </button>
          ) : (
            <button data-testid={TEST_IDS.brokers.disconnect(a.account_id)} onClick={doDisconnect}
              className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-warning hover:text-term-warning flex items-center gap-1">
              <Radio size={10} /> disconnect
            </button>
          )}
          <button data-testid={TEST_IDS.brokers.remove(a.account_id)} onClick={doRemove}
            className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-danger hover:text-term-danger">
            <Trash2 size={10} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddAccountModal({ plugin, onClose, onSaved }) {
  const [label, setLabel] = useState("");
  const [creds, setCreds] = useState(() => Object.fromEntries(plugin.required_credentials.map((k) => [k, ""])));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/brokers/accounts", { plugin_id: plugin.plugin_id, label, credentials: creds });
      toast.success(`Account "${label}" added`);
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const fillDefault = (k) => k === "environment" ? "paper" : "";

  return (
    <div data-testid={TEST_IDS.brokers.modal} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md border border-term-border bg-term-surface">
        <header className="h-11 px-4 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[10px] text-term-muted uppercase">brokers.add</div>
            <div data-testid={TEST_IDS.brokers.modalPlugin} className="font-display text-[13px] font-bold">Add {plugin.display_name} account</div>
          </div>
          <button onClick={onClose} className="text-term-muted hover:text-term-text font-mono text-[11px] uppercase">close</button>
        </header>
        <div className="p-4 space-y-3">
          <div>
            <label className="font-mono text-[10px] text-term-muted uppercase block mb-1">Label</label>
            <input data-testid={TEST_IDS.brokers.modalLabel} value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Paper Alpaca" className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          </div>
          {plugin.required_credentials.map((k) => (
            <div key={k}>
              <label className="font-mono text-[10px] text-term-muted uppercase block mb-1">{k}</label>
              <input
                data-testid={TEST_IDS.brokers.modalCred(k)}
                value={creds[k] || ""} onChange={(e) => setCreds({ ...creds, [k]: e.target.value })}
                placeholder={fillDefault(k) || `Enter ${k}`}
                type={k.toLowerCase().includes("secret") ? "password" : "text"}
                className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none"
              />
            </div>
          ))}
          <div className="border border-term-warning/30 bg-term-warning/5 p-2 font-mono text-[10px] text-term-warning">
            Credentials are encrypted with Fernet before storage.
          </div>
          <button data-testid={TEST_IDS.brokers.modalSubmit} onClick={submit}
            disabled={busy || !label || plugin.required_credentials.some((k) => !creds[k])}
            className="w-full h-9 bg-term-accent text-white font-mono text-[11px] uppercase disabled:opacity-40">
            {busy ? "saving..." : "add account"}
          </button>
        </div>
      </div>
    </div>
  );
}
