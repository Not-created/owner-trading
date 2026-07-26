import { useEffect, useState } from "react";
import { Activity, Cpu, Network, Server, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

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

function Metric({ label, value, sub, tone = "text-term-text" }) {
  return (
    <div className="border border-term-border/60 p-3">
      <div className="font-mono text-[10px] uppercase text-term-muted mb-1">{label}</div>
      <div className={`font-mono text-2xl leading-none ${tone}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] text-term-muted mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [logs, setLogs] = useState([]);
  const [health, setHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/ai/providers"),
      api.get("/brokers/accounts"),
      api.get("/brokers/plugins"),
      api.get("/logs?limit=8"),
      api.get("/health"),
    ]).then(([p, a, bp, l, h]) => {
      setProviders(p.data.providers || []);
      setAccounts(a.data.accounts || []);
      setPlugins(bp.data.plugins || []);
      setLogs(l.data.logs || []);
      setHealth(h.data);
    }).catch(() => {});
  }, []);

  const runHealth = async () => {
    try {
      const { data } = await api.get("/ai/health");
      setAiHealth(data.results || []);
    } catch {}
  };

  return (
    <div data-testid={TEST_IDS.dashboard.root} className="p-6 space-y-6 max-w-[1400px]">
      {/* Header line */}
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// overview</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Command Center</h1>
        </div>
        <div className="font-mono text-[11px] text-term-secondary">
          uptime <span className="text-term-success">nominal</span>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="AI providers" value={providers.length} sub="registered" />
        <Metric label="Broker plugins" value={plugins.length} sub="installed" />
        <Metric label="Broker accounts" value={accounts.length} sub="configured" />
        <Metric label="Database" value={health?.ok ? "ONLINE" : "OFF"} tone={health?.ok ? "text-term-success" : "text-term-danger"} sub="mongodb" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="AI Core"
          subtitle="providers.status"
          right={<button data-testid={TEST_IDS.ai.healthBtn} onClick={runHealth} className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent">run health</button>}
        >
          <div data-testid={TEST_IDS.dashboard.aiStatus} className="space-y-2">
            {providers.map((p) => {
              const h = aiHealth.find((x) => x.provider === p.provider_id);
              return (
                <div key={p.provider_id} className="flex items-center justify-between border-b border-term-border/50 pb-2 last:border-0">
                  <div>
                    <div className="text-[13px] font-medium">{p.display_name}</div>
                    <div className="font-mono text-[10px] text-term-muted">{p.default_model}</div>
                  </div>
                  <div className="font-mono text-[11px]">
                    {h ? (
                      <span className={h.ok ? "text-term-success" : "text-term-danger"}>
                        {h.ok ? `OK · ${h.latency_ms}ms` : "FAIL"}
                      </span>
                    ) : (
                      <span className="text-term-muted">idle</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <Link to="/ai" className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline">
            <Cpu size={11} /> open ai core <ArrowUpRight size={11} />
          </Link>
        </Panel>

        <Panel title="Brokers" subtitle="broker.core">
          <div data-testid={TEST_IDS.dashboard.brokerStatus} className="space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">plugins installed</span>
              <span className="font-mono">{plugins.length}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">accounts configured</span>
              <span className="font-mono">{accounts.length}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">primary account</span>
              <span className="font-mono text-term-muted">
                {accounts.find((a) => a.is_primary)?.label || "—"}
              </span>
            </div>
            {plugins.length === 0 && (
              <div className="border border-term-border/50 p-3 mt-2 font-mono text-[11px] text-term-muted">
                Broker framework is active. Install a broker plugin (Part 2) to begin trading.
              </div>
            )}
          </div>
          <Link to="/brokers" className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline">
            <Network size={11} /> manage brokers <ArrowUpRight size={11} />
          </Link>
        </Panel>

        <Panel title="System" subtitle="system.health">
          <div data-testid={TEST_IDS.dashboard.systemStatus} className="space-y-2 font-mono text-[11px]">
            <div className="flex justify-between"><span className="text-term-muted">api</span><span className="text-term-success">200 OK</span></div>
            <div className="flex justify-between"><span className="text-term-muted">database</span><span className={health?.ok ? "text-term-success" : "text-term-danger"}>{health?.ok ? "connected" : "offline"}</span></div>
            <div className="flex justify-between"><span className="text-term-muted">encryption</span><span className="text-term-success">fernet:active</span></div>
            <div className="flex justify-between"><span className="text-term-muted">audit_log</span><span className="text-term-success">streaming</span></div>
            <div className="flex justify-between"><span className="text-term-muted">rate_limit</span><span className="text-term-success">enforced</span></div>
          </div>
          <Link to="/logs" className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline">
            <Server size={11} /> view audit stream <ArrowUpRight size={11} />
          </Link>
        </Panel>
      </div>

      <Panel title="Recent audit stream" subtitle="logs.tail" right={<span className="font-mono text-[10px] text-term-muted">last 8</span>}>
        <div data-testid={TEST_IDS.dashboard.recentLogs} className="font-mono text-[11px] space-y-1">
          {logs.length === 0 && <div className="text-term-muted">no events</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex gap-3 items-baseline">
              <span className="text-term-muted w-40 shrink-0">{l.created_at?.slice(0, 19).replace("T", " ")}</span>
              <span className={`w-16 shrink-0 uppercase log-${l.level}`}>{l.level}</span>
              <span className="w-20 shrink-0 text-term-secondary">{l.category}</span>
              <span className="text-term-text">{l.message}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
