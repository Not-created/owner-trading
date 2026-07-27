import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Command, GitBranch, ShieldAlert, Cpu, Database, ListChecks, Send, FileCode } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const TABS = [
  { id: "overview",  label: "Overview",     icon: Command,     tid: TEST_IDS.ownerControl.tabOverview },
  { id: "modules",   label: "Modules",      icon: Cpu,         tid: TEST_IDS.ownerControl.tabModules },
  { id: "schema",    label: "DB Schema",    icon: Database,    tid: TEST_IDS.ownerControl.tabSchema },
  { id: "dev",       label: "AI Developer", icon: FileCode,    tid: TEST_IDS.ownerControl.tabDev },
  { id: "approvals", label: "Approvals",    icon: ListChecks,  tid: TEST_IDS.ownerControl.tabApprovals },
];

export default function OwnerControlPage() {
  const [tab, setTab] = useState("overview");
  return (
    <div data-testid={TEST_IDS.ownerControl.root} className="p-6 space-y-6 max-w-[1500px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// owner.control</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Owner Control</h1>
        <p className="text-term-secondary text-[13px] mt-1">
          Central control center for the platform. The AI Developer lives here — read-only inspection
          today, gated by explicit approvals for any critical action.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-3">
          <div className="border border-term-border bg-term-surface">
            {TABS.map((t) => (
              <button
                key={t.id}
                data-testid={t.tid}
                onClick={() => setTab(t.id)}
                className={`w-full text-left h-10 px-4 font-mono text-[11px] uppercase border-l-2 flex items-center gap-2 ${
                  tab === t.id
                    ? "bg-term-hover border-term-accent text-term-text"
                    : "border-transparent text-term-secondary hover:text-term-text"
                }`}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="col-span-12 lg:col-span-9">
          {tab === "overview" && <Overview />}
          {tab === "modules" && <ModulesTab />}
          {tab === "schema" && <SchemaTab />}
          {tab === "dev" && <DevTab />}
          {tab === "approvals" && <ApprovalsTab />}
        </section>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children, right }) {
  return (
    <section className="border border-term-border bg-term-surface">
      <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">{subtitle}</div>
          <div className="font-display text-[13px] font-bold tracking-tight -mt-0.5">{title}</div>
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Overview() {
  const [health, setHealth] = useState(null);
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    Promise.all([api.get("/dev/health"), api.get("/dev/capabilities")]).then(([h, c]) => {
      setHealth(h.data);
      setCaps(c.data);
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <Panel title="Project health" subtitle="dev.health">
        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 font-mono text-[12px]">
            {Object.entries(health).map(([k, v]) => (
              <div key={k} className="border border-term-border/60 p-3">
                <div className="text-[10px] uppercase text-term-muted">{k.replace(/_/g, " ")}</div>
                <div className="text-2xl leading-none mt-1">{v}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-term-muted font-mono text-[11px]">loading…</div>}
      </Panel>

      <Panel title="AI Developer capabilities" subtitle="dev.capabilities">
        {caps ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CapBlock label="READ" items={caps.read} tone="text-term-success" icon={<GitBranch size={11} />} />
            <CapBlock label="REASON" items={caps.reason} tone="text-term-accent" icon={<Cpu size={11} />} />
            <CapBlock label="GATED (needs approval)" items={caps.gated_by_approval} tone="text-term-warning" icon={<ShieldAlert size={11} />} />
          </div>
        ) : <div className="text-term-muted font-mono text-[11px]">loading…</div>}
        {caps && (
          <div className="mt-4 border border-term-danger/40 bg-term-danger/5 p-3">
            <div className="font-mono text-[10px] uppercase text-term-danger mb-1">Never automatic</div>
            <div className="font-mono text-[11px] text-term-text">{caps.never_automatic.join(" · ")}</div>
            <div className="font-mono text-[10px] text-term-muted mt-2">{caps.note}</div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CapBlock({ label, items, tone, icon }) {
  return (
    <div className="border border-term-border p-3">
      <div className={`font-mono text-[10px] uppercase mb-2 flex items-center gap-1 ${tone}`}>
        {icon} {label}
      </div>
      <ul className="space-y-0.5 font-mono text-[11px] text-term-secondary">
        {items.map((x) => <li key={x}>· {x}</li>)}
      </ul>
    </div>
  );
}

function ModulesTab() {
  const [mods, setMods] = useState([]);
  useEffect(() => { api.get("/dev/modules").then(({ data }) => setMods(data.modules)).catch(() => {}); }, []);
  return (
    <Panel title="Backend modules" subtitle="dev.modules">
      <table className="w-full text-left">
        <thead className="border-b border-term-border">
          <tr className="font-mono text-[10px] text-term-muted uppercase">
            <th className="h-9 px-3">Module</th>
            <th className="h-9 px-3">Files</th>
            <th className="h-9 px-3">Endpoints</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[11px]">
          {mods.map((m) => (
            <tr key={m.module_id} className="border-b border-term-border/40 align-top">
              <td className="px-3 py-2 text-term-text">{m.module_id}</td>
              <td className="px-3 py-2 text-term-secondary">{m.files.length}</td>
              <td className="px-3 py-2 text-term-secondary">
                {m.endpoints.length === 0 ? "—" : m.endpoints.map((e) => <div key={e}>{e}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function SchemaTab() {
  const [cols, setCols] = useState([]);
  useEffect(() => { api.get("/dev/db-schema").then(({ data }) => setCols(data.collections)).catch(() => {}); }, []);
  return (
    <Panel title="MongoDB collections" subtitle="dev.db_schema">
      <table className="w-full text-left">
        <thead className="border-b border-term-border">
          <tr className="font-mono text-[10px] text-term-muted uppercase">
            <th className="h-9 px-3">Collection</th>
            <th className="h-9 px-3">Documents</th>
            <th className="h-9 px-3">Sample keys</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[11px]">
          {cols.map((c) => (
            <tr key={c.collection} className="border-b border-term-border/40 align-top">
              <td className="px-3 py-2">{c.collection}</td>
              <td className="px-3 py-2 text-term-secondary">{c.count}</td>
              <td className="px-3 py-2 text-term-secondary">{c.sample_keys.join(", ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function DevTab() {
  const [q, setQ] = useState("Give me a 5-line health summary of this project.");
  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true); setOutput(null);
    try {
      const { data } = await api.post("/dev/ask", { question: q });
      setOutput(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Panel
      title="AI Developer console"
      subtitle="dev.ask"
      right={<span className="font-mono text-[10px] text-term-muted">read-only · proposals only</span>}
    >
      <div className="space-y-3">
        <div className="border border-term-border/60 bg-term-panel p-3 font-mono text-[11px] text-term-secondary">
          The AI Developer receives a compact snapshot of your modules, endpoints, DB collections,
          dependencies and recent issues. It returns proposals only — code changes are diffs, and any
          destructive action (write, delete, deploy, push) requires an explicit Approval.
        </div>
        <textarea
          data-testid={TEST_IDS.ownerControl.devInput}
          value={q} onChange={(e) => setQ(e.target.value)} rows={3}
          className="w-full bg-term-panel border border-term-border p-3 font-mono text-[12px] focus:border-term-accent focus:outline-none resize-none"
        />
        <div className="flex justify-end">
          <button
            data-testid={TEST_IDS.ownerControl.devSend}
            onClick={send} disabled={busy || !q}
            className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase disabled:opacity-40 flex items-center gap-2"
          >
            <Send size={12} /> {busy ? "thinking..." : "ask ai developer"}
          </button>
        </div>
        {output && (
          <div data-testid={TEST_IDS.ownerControl.devOutput} className="border border-term-border p-3 bg-term-panel">
            <div className="font-mono text-[10px] text-term-muted uppercase mb-2">
              {output.provider}/{output.model} · {output.latency_ms}ms
            </div>
            <pre className="font-mono text-[12px] whitespace-pre-wrap break-words text-term-text">{output.text}</pre>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ApprovalsTab() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ action_type: "write_file", title: "", reason: "" });

  const load = () => api.get("/dev/approvals").then(({ data }) => setItems(data.approvals || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/dev/approvals", { ...form, payload: {} });
      setForm({ action_type: "write_file", title: "", reason: "" });
      toast.success("Approval created");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const decide = async (id, decision) => {
    try { await api.post(`/dev/approvals/${id}/decide`, { decision }); toast.success(`Marked ${decision}`); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Create approval request" subtitle="dev.approvals.new">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={form.action_type}
            onChange={(e) => setForm({ ...form, action_type: e.target.value })}
            className="h-9 px-2 bg-term-panel border border-term-border font-mono text-[11px]"
          >
            {["write_file","delete_file","run_migration","install_dependency","git_commit","git_push","deploy","replace_module","run_command"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <input
            placeholder="Title (what will change)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px]"
          />
          <input
            placeholder="Reason / rollback plan" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className="h-9 px-3 bg-term-panel border border-term-border font-mono text-[12px]"
          />
        </div>
        <div className="mt-3">
          <button
            data-testid={TEST_IDS.ownerControl.approvalNew}
            onClick={create} disabled={busy || !form.title}
            className="h-9 px-4 border border-term-border font-mono text-[11px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40"
          >
            Queue approval
          </button>
        </div>
      </Panel>

      <Panel title="Pending & recent approvals" subtitle="dev.approvals">
        {items.length === 0 ? (
          <div className="text-term-muted font-mono text-[11px]">No approval records yet.</div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.approval_id} className="border border-term-border/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px]">{a.title}</div>
                    <div className="font-mono text-[10px] text-term-muted uppercase">
                      {a.action_type} · {a.dangerous ? <span className="text-term-danger">DANGEROUS</span> : "standard"} · {a.created_at?.slice(0,19).replace("T"," ")}
                    </div>
                    {a.reason && <div className="text-term-secondary text-[12px] mt-1">{a.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] uppercase ${
                      a.status === "approved" ? "text-term-success" :
                      a.status === "rejected" ? "text-term-danger" : "text-term-warning"
                    }`}>{a.status}</span>
                    {a.status === "pending" && (
                      <>
                        <button onClick={() => decide(a.approval_id, "approved")}
                          className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-success hover:text-term-success">Approve</button>
                        <button onClick={() => decide(a.approval_id, "rejected")}
                          className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-danger hover:text-term-danger">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
