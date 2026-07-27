import { useEffect, useState } from "react";
import { Puzzle, Info } from "lucide-react";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function PluginsPage() {
  const [plugins, setPlugins] = useState([]);
  useEffect(() => {
    api.get("/plugins").then(({ data }) => setPlugins(data.plugins)).catch(() => {});
  }, []);
  return (
    <div data-testid={TEST_IDS.plugins.root} className="p-4 sm:p-6 space-y-6 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// plugin.registry</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Plugins</h1>
        <p className="text-term-secondary text-[13px] mt-1">Install, enable, disable, and version-manage extensions.</p>
      </div>

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">Installed extensions</div>
          <span className="font-mono text-[10px] text-term-muted">{plugins.length}</span>
        </header>
        {plugins.length === 0 ? (
          <div data-testid={TEST_IDS.plugins.empty} className="p-8 flex items-start gap-3">
            <Info size={16} className="text-term-accent mt-0.5" />
            <div>
              <div className="font-display text-[14px] font-bold mb-1">No plugins installed</div>
              <div className="text-term-secondary text-[12px] max-w-2xl leading-relaxed">
                The plugin registry is live. Endpoints are available at{" "}
                <span className="font-mono">POST /api/plugins</span>,{" "}
                <span className="font-mono">POST /api/plugins/&#123;id&#125;/enable</span>,{" "}
                <span className="font-mono">POST /api/plugins/&#123;id&#125;/disable</span>,{" "}
                <span className="font-mono">DELETE /api/plugins/&#123;id&#125;</span>. Ship real plugins in Part 2.
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[520px]">
            <thead className="border-b border-term-border">
              <tr className="font-mono text-[10px] text-term-muted uppercase">
                <th className="px-4 h-9">Name</th>
                <th className="px-4 h-9">Kind</th>
                <th className="px-4 h-9">Version</th>
                <th className="px-4 h-9">Status</th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p) => (
                <tr key={p.plugin_id} className="border-b border-term-border/50">
                  <td className="px-4 h-10">
                    <div className="flex items-center gap-2">
                      <Puzzle size={12} className="text-term-accent" />
                      <span className="text-[12px]">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 h-10 font-mono text-[11px] text-term-secondary">{p.kind}</td>
                  <td className="px-4 h-10 font-mono text-[11px]">{p.version}</td>
                  <td className="px-4 h-10 font-mono text-[11px]">
                    <span className={p.enabled ? "text-term-success" : "text-term-muted"}>
                      {p.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
