import { useEffect, useState } from "react";
import {
  Command, CheckCircle2, Cpu, Network, Puzzle, Settings, User,
  Terminal, ShieldCheck, KeyRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const ICONS = {
  auth: KeyRound,
  users: User,
  ai_core: Cpu,
  broker_core: Network,
  plugins: Puzzle,
  settings: Settings,
  logs: Terminal,
  owner_control: Command,
};

const LINKS = {
  auth: "/profile",
  users: "/profile",
  ai_core: "/ai",
  broker_core: "/brokers",
  plugins: "/plugins",
  settings: "/settings",
  logs: "/logs",
  owner_control: "/owner-control",
};

export default function OwnerControlPage() {
  const [overview, setOverview] = useState(null);
  const [modules, setModules] = useState([]);
  const [caps, setCaps] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/owner-control/overview"),
      api.get("/owner-control/modules"),
      api.get("/owner-control/capabilities"),
    ]).then(([o, m, c]) => {
      setOverview(o.data);
      setModules(m.data.modules || []);
      setCaps(c.data);
    }).catch(() => {});
  }, []);

  return (
    <div data-testid={TEST_IDS.ownerControl.root} className="p-4 sm:p-6 space-y-6 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// owner.control</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Owner Control</h1>
        <p className="text-term-secondary text-[13px] mt-1 max-w-3xl">
          Central control center. Every module registers itself here. The sole operator has full
          authority over configuration, credentials, and runtime state.
        </p>
      </div>

      {/* Owner identity */}
      {overview?.owner && (
        <section data-testid={TEST_IDS.ownerControl.overview} className="border border-term-border bg-term-surface">
          <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
            <div className="font-display text-[13px] font-bold">Owner</div>
            <span className="font-mono text-[10px] text-term-success flex items-center gap-1">
              <ShieldCheck size={11} /> AUTHENTICATED
            </span>
          </header>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Identity" value={overview.owner.username} />
            <Metric label="Role" value={overview.owner.role} />
            <Metric label="Modules" value={modules.length} />
            <Metric label="Audit lines" value={overview.counts?.audit_logs ?? 0} />
          </div>
        </section>
      )}

      {/* Live counts */}
      {overview?.counts && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Metric label="Sessions" value={overview.counts.sessions} />
          <Metric label="Broker accts" value={overview.counts.broker_accounts} />
          <Metric label="Plugins" value={overview.counts.plugins} />
          <Metric label="AI calls" value={overview.counts.ai_usage} />
          <Metric label="Settings" value={overview.counts.settings_keys} />
          <Metric label="Audit" value={overview.counts.audit_logs} />
        </div>
      )}

      {/* Module graph */}
      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[10px] text-term-muted uppercase">// modules.registered</div>
            <div className="font-display text-[13px] font-bold">Live module graph</div>
          </div>
          <span className="font-mono text-[10px] text-term-muted">{modules.length} modules</span>
        </header>
        <div data-testid={TEST_IDS.ownerControl.modulesList} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-term-border">
          {modules.map((m) => {
            const Icon = ICONS[m.module_id] || Puzzle;
            const link = LINKS[m.module_id];
            const inner = (
              <div className="p-4 h-full flex flex-col gap-3 hover:bg-term-hover transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 border border-term-border grid place-items-center shrink-0">
                      <Icon size={14} className="text-term-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-[14px] font-bold truncate">{m.display_name}</div>
                      <div className="font-mono text-[10px] text-term-muted truncate">{m.module_id} · v{m.version}</div>
                    </div>
                  </div>
                  <span className={`font-mono text-[10px] flex items-center gap-1 shrink-0 ${m.enabled ? "text-term-success" : "text-term-muted"}`}>
                    <CheckCircle2 size={10} /> {m.enabled ? "LIVE" : "OFF"}
                  </span>
                </div>
                <div className="text-[12px] text-term-secondary leading-relaxed">{m.description}</div>
                <div>
                  <div className="font-mono text-[10px] text-term-muted uppercase mb-1">Endpoints ({m.endpoints.length})</div>
                  <div className="font-mono text-[10px] text-term-secondary space-y-0.5 max-h-24 overflow-y-auto">
                    {m.endpoints.slice(0, 6).map((e, i) => (
                      <div key={i} className="truncate">
                        <span className="text-term-muted">{m.api_prefix}</span>
                        <span> {e}</span>
                      </div>
                    ))}
                    {m.endpoints.length > 6 && (
                      <div className="text-term-muted">+ {m.endpoints.length - 6} more</div>
                    )}
                  </div>
                </div>
                {link && (
                  <div className="mt-auto pt-2 border-t border-term-border/40">
                    <span className="font-mono text-[10px] text-term-accent uppercase">open →</span>
                  </div>
                )}
              </div>
            );
            return link ? (
              <Link key={m.module_id} to={link} className="block h-full">{inner}</Link>
            ) : (
              <div key={m.module_id}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Capabilities */}
      {caps && (
        <section className="border border-term-border bg-term-surface">
          <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
            <div className="font-display text-[13px] font-bold">Owner capabilities</div>
            <span className="font-mono text-[10px] text-term-muted">grants: {caps.grants.join(" · ")}</span>
          </header>
          <div data-testid={TEST_IDS.ownerControl.capabilities} className="p-4 flex flex-wrap gap-2">
            {caps.capabilities.map((c) => (
              <span key={c} className="font-mono text-[11px] px-2 py-1 border border-term-border bg-term-panel">
                {c}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-term-border/60 p-3 min-w-0">
      <div className="font-mono text-[10px] uppercase text-term-muted mb-1 truncate">{label}</div>
      <div className="font-mono text-xl leading-none text-term-text truncate">{value}</div>
    </div>
  );
}
