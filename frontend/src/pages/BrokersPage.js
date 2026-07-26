import { useEffect, useState } from "react";
import { Network, Info } from "lucide-react";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function BrokersPage() {
  const [plugins, setPlugins] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const load = async () => {
    const [p, a] = await Promise.all([
      api.get("/brokers/plugins"),
      api.get("/brokers/accounts"),
    ]);
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
          Plugin framework only. Broker-specific plugins ship in Part 2 (no dummy plugins by policy).
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
            <div>
              <div className="font-display text-[14px] font-bold mb-1">No broker plugins installed</div>
              <div className="text-term-secondary text-[12px] max-w-2xl leading-relaxed">
                The broker framework is live: <span className="font-mono text-term-text">connect</span>,{" "}
                <span className="font-mono text-term-text">disconnect</span>,{" "}
                <span className="font-mono text-term-text">health_check</span>, encrypted credentials,
                primary account selection, and multi-account support are all operational. A broker plugin
                implements <span className="font-mono text-term-text">BrokerPluginBase</span> and registers itself — the core code
                does not need to change.
              </div>
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
                <div className="font-mono text-[11px] text-term-muted">
                  requires: {p.required_credentials.join(", ") || "—"}
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
            0 accounts. Install a broker plugin first, then link an account.
          </div>
        ) : (
          <table data-testid={TEST_IDS.brokers.accountsList} className="w-full text-left">
            <thead className="border-b border-term-border">
              <tr className="font-mono text-[10px] text-term-muted uppercase">
                <th className="px-4 h-9">Label</th>
                <th className="px-4 h-9">Plugin</th>
                <th className="px-4 h-9">Status</th>
                <th className="px-4 h-9">Primary</th>
                <th className="px-4 h-9">Created</th>
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
                  <td className="px-4 h-10 font-mono text-[11px]">{a.is_primary ? "YES" : "—"}</td>
                  <td className="px-4 h-10 font-mono text-[11px] text-term-muted">{a.created_at?.slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
