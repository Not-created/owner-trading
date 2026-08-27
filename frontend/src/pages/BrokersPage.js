import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Network, Info, Plus, Zap, Trash2, Radio, ShieldCheck, Server, Globe } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const CATEGORY_META = {
  indian: { label: "INDIAN", icon: ShieldCheck, className: "text-term-success" },
  forex: { label: "FOREX", icon: Globe, className: "text-term-info" },
};

export default function BrokersPage() {
  const [plugins, setPlugins] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [modal, setModal] = useState(null);
  const [infoAccount, setInfoAccount] = useState(null);
  const [infoData, setInfoData] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);

  const load = async () => {
    const [p, a] = await Promise.all([api.get("/brokers/plugins"), api.get("/brokers/accounts")]);
    setPlugins(p.data.plugins);
    setAccounts(a.data.accounts);
  };
  useEffect(() => { load(); }, []);

  const doTest = async (a) => {
    try {
      const { data } = await api.post(`/brokers/accounts/${a.account_id}/test`);
      if (data.ok) toast.success(`OK · ${data.latency_ms}ms`);
      else toast.error(data.detail);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const doInfo = async (a) => {
    setInfoAccount(a);
    setInfoData(null);
    setInfoLoading(true);
    try {
      const { data } = await api.get(`/brokers/accounts/${a.account_id}/info`);
      setInfoData(data);
    } catch (e) {
      toast.error(formatApiError(e));
      setInfoAccount(null);
    } finally {
      setInfoLoading(false);
    }
  };

  const indian = plugins.filter((p) => p.category === "indian");
  const forex = plugins.filter((p) => p.category === "forex");

  return (
    <div data-testid={TEST_IDS.brokers.root} className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// broker.core</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Broker Manager</h1>
        <p className="text-term-secondary text-[13px] mt-1">
          Connect real broker accounts. Credentials are encrypted server-side and never exposed.
        </p>
      </div>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Brokers</div>
          <span className="font-mono text-[10px] text-term-muted">{plugins.length} registered</span>
        </header>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {plugins.map((p) => {
            const cat = CATEGORY_META[p.category] || CATEGORY_META.indian;
            const CatIcon = cat.icon;
            return (
              <div key={p.plugin_id} className="border border-term-border bg-term-panel p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-display text-[13px] font-bold">{p.display_name}</div>
                  <span className={`font-mono text-[10px] uppercase ${cat.className}`}>
                    <CatIcon size={12} className="inline -mt-[2px] mr-1" />{cat.label}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-term-muted mb-3">{p.plugin_id} · v{p.version}</div>
                <button
                  data-testid={TEST_IDS.brokers.addBtn(p.plugin_id)}
                  onClick={() => setModal(p)}
                  className="w-full h-8 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center justify-center gap-2"
                >
                  <Plus size={12} /> add account
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Connected accounts</div>
          <span className="font-mono text-[10px] text-term-muted">{accounts.length}</span>
        </header>
        {accounts.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            0 accounts. Add one via a broker above.
          </div>
        ) : (
          <div data-testid={TEST_IDS.brokers.accountsList} className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-term-border">
                <tr className="font-mono text-[10px] text-term-muted uppercase">
                  <th className="px-4 h-9">Label</th>
                  <th className="px-4 h-9">Broker</th>
                  <th className="px-4 h-9">Status</th>
                  <th className="px-4 h-9">Last Health</th>
                  <th className="px-4 h-9">Primary</th>
                  <th className="px-4 h-9 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.account_id} className="border-b border-term-border/50">
                    <td className="px-4 h-10 text-[12px]">{a.label}</td>
                    <td className="px-4 h-10 font-mono text-[11px] text-term-secondary">{a.plugin_id}</td>
                    <td className="px-4 h-10 font-mono text-[11px]">
                      <span className={a.status === "connected" ? "text-term-success" : a.status === "error" ? "text-term-danger" : "text-term-muted"}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 h-10 font-mono text-[11px] text-term-muted max-w-[260px] truncate" title={a.last_health?.detail}>
                      {a.last_health?.detail || "—"}
                    </td>
                    <td className="px-4 h-10 font-mono text-[11px]">
                      {a.is_primary ? <span className="text-term-success">YES</span> :
                        <button data-testid={TEST_IDS.brokers.primary(a.account_id)} onClick={() => api.post(`/brokers/accounts/${a.account_id}/primary`).then(load).catch(()=>{}).then(()=>toast.success("Marked primary"))}
                          className="text-term-muted hover:text-term-text underline">make primary</button>}
                    </td>
                    <td className="px-4 h-10 text-right">
                      <div className="inline-flex gap-1 flex-wrap justify-end">
                        {a.status !== "connected" ? (
                          <button data-testid={TEST_IDS.brokers.connect(a.account_id)} onClick={() => api.post(`/brokers/accounts/${a.account_id}/connect`).then(load).catch(()=>{}).then(()=>toast.success("Connected"))}
                            disabled={busyMap[a.account_id]} className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-success hover:text-term-success flex items-center gap-1">
                            <Zap size={10} /> connect
                          </button>
                        ) : (
                          <button data-testid={TEST_IDS.brokers.disconnect(a.account_id)} onClick={() => api.post(`/brokers/accounts/${a.account_id}/disconnect`).then(load).catch(()=>{}).then(()=>toast.success("Disconnected"))}
                            className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-warning hover:text-term-warning flex items-center gap-1">
                            <Radio size={10} /> disconnect
                          </button>
                        )}
                        <button onClick={() => doTest(a)} className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-info hover:text-term-info flex items-center gap-1">
                          <Server size={10} /> test
                        </button>
                        <button onClick={() => doInfo(a)} className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1">
                          <Info size={10} /> info
                        </button>
                        <button data-testid={TEST_IDS.brokers.remove(a.account_id)} onClick={() => { if (window.confirm(`Delete account "${a.label}"?`)) api.delete(`/brokers/accounts/${a.account_id}`).then(load).catch(()=>{}).then(()=>toast.success("Removed")); }}
                          className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-danger hover:text-term-danger flex items-center gap-1">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {infoAccount && (
        <section className="border border-term-border bg-term-surface">
          <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
            <div className="font-display text-[13px] font-bold">Account info — {infoAccount.label} ({infoAccount.plugin_id})</div>
            <button onClick={() => setInfoAccount(null)} className="text-term-muted hover:text-term-text font-mono text-[11px] uppercase">close</button>
          </header>
          <div className="p-4">
            {infoLoading ? (
              <div className="font-mono text-[11px] text-term-muted">Loading...</div>
            ) : infoData ? (
              <pre className="font-mono text-[11px] text-term-secondary whitespace-pre-wrap break-all bg-term-panel p-3 border border-term-border max-h-[300px] overflow-auto">
                {JSON.stringify(infoData, null, 2)}
              </pre>
            ) : (
              <div className="font-mono text-[11px] text-term-muted">No data</div>
            )}
          </div>
        </section>
      )}

      {modal && <AddAccountModal plugin={modal} onClose={() => setModal(null)} onSaved={load} />}
    </div>
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
              placeholder="e.g. Paper Kotak" className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none" />
          </div>
          {plugin.required_credentials.map((k) => (
            <div key={k}>
              <label className="font-mono text-[10px] text-term-muted uppercase block mb-1">{plugin.credential_labels?.[k] || k}</label>
              <input
                data-testid={TEST_IDS.brokers.modalCred(k)}
                value={creds[k] || ""} onChange={(e) => setCreds({ ...creds, [k]: e.target.value })}
                placeholder={`Enter ${plugin.credential_labels?.[k] || k}`}
                type={k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") || k.toLowerCase().includes("mpin") || k.toLowerCase().includes("totp") ? "password" : "text"}
                className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px] focus:border-term-accent focus:outline-none"
              />
            </div>
          ))}
          <div className="border border-term-warning/30 bg-term-warning/5 p-2 font-mono text-[10px] text-term-warning">
            Credentials are encrypted with Fernet before storage and never exposed.
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

