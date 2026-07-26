import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cpu, Zap, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function AIProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [defaultCfg, setDefaultCfg] = useState({ provider: "", model: "" });
  const [health, setHealth] = useState({});
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("Summarize the current market structure in 2 sentences.");
  const [chatResp, setChatResp] = useState(null);
  const [usage, setUsage] = useState({ total_requests: 0, by_provider: {} });

  const load = async () => {
    const [{ data: pr }, { data: us }] = await Promise.all([
      api.get("/ai/providers"),
      api.get("/ai/usage"),
    ]);
    setProviders(pr.providers);
    setDefaultCfg(pr.default);
    setUsage(us);
  };

  useEffect(() => { load(); }, []);

  const runHealth = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/ai/health");
      const map = {};
      for (const r of data.results) map[r.provider] = r;
      setHealth(map);
      toast.success("Health check complete");
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (provider, model) => {
    try {
      await api.post("/ai/default", { provider, model });
      setDefaultCfg({ provider, model });
      toast.success(`Default set → ${provider}/${model}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const sendChat = async () => {
    setBusy(true);
    setChatResp(null);
    try {
      const { data } = await api.post("/ai/chat", { prompt });
      setChatResp(data);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div data-testid={TEST_IDS.ai.root} className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// ai.core</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Universal AI Providers</h1>
          <p className="text-term-secondary text-[13px] mt-1">Every provider is a plugin. Switch, test, and monitor from one place.</p>
        </div>
        <button data-testid={TEST_IDS.ai.healthBtn} onClick={runHealth} disabled={busy} className="h-9 px-4 border border-term-border font-mono text-[11px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-2">
          <Zap size={12} /> {busy ? "running..." : "run health check"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {providers.map((p) => {
          const h = health[p.provider_id];
          const u = usage.by_provider[p.provider_id];
          const isDefault = defaultCfg.provider === p.provider_id;
          return (
            <div key={p.provider_id} data-testid={TEST_IDS.ai.providerCard(p.provider_id)} className="border border-term-border bg-term-surface">
              <div className="p-4 border-b border-term-border flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 border border-term-border grid place-items-center">
                    <Cpu size={14} className="text-term-accent" />
                  </div>
                  <div>
                    <div className="font-display text-[15px] font-bold">{p.display_name}</div>
                    <div className="font-mono text-[10px] text-term-muted uppercase">plugin · {p.provider_id}</div>
                  </div>
                </div>
                {isDefault && (
                  <span className="font-mono text-[10px] text-term-success flex items-center gap-1">
                    <CheckCircle2 size={11} /> DEFAULT
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="font-mono text-[10px] text-term-muted uppercase block mb-1">model</label>
                  <select
                    value={isDefault ? defaultCfg.model : p.default_model}
                    onChange={(e) => setDefault(p.provider_id, e.target.value)}
                    className="w-full h-9 bg-term-panel border border-term-border font-mono text-[12px] px-2"
                  >
                    {p.available_models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-term-muted uppercase">health</span>
                  <span className={h ? (h.ok ? "text-term-success" : "text-term-danger") : "text-term-muted"}>
                    {h ? (h.ok ? `OK · ${h.latency_ms}ms` : "FAIL") : "idle"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-term-muted uppercase">requests</span>
                  <span>{u?.count || 0} <span className="text-term-danger">/ {u?.errors || 0} err</span></span>
                </div>
                {!isDefault && (
                  <button
                    data-testid={TEST_IDS.ai.setDefault(p.provider_id)}
                    onClick={() => setDefault(p.provider_id, p.default_model)}
                    className="w-full h-8 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent"
                  >
                    Set as default
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live test console */}
      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[10px] text-term-muted uppercase">ai.chat</div>
            <div className="font-display text-[13px] font-bold">Live test console</div>
          </div>
          <div className="font-mono text-[10px] text-term-muted">→ using default {defaultCfg.provider}/{defaultCfg.model}</div>
        </header>
        <div className="p-4 space-y-3">
          <textarea
            data-testid={TEST_IDS.ai.chatInput}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-term-panel border border-term-border p-3 font-mono text-[12px] focus:border-term-accent focus:outline-none resize-none"
          />
          <div className="flex justify-end">
            <button
              data-testid={TEST_IDS.ai.chatSend}
              onClick={sendChat}
              disabled={busy || !prompt}
              className="h-9 px-4 bg-term-accent text-white font-mono text-[11px] uppercase disabled:opacity-40"
            >
              {busy ? "sending..." : "send →"}
            </button>
          </div>
          {chatResp && (
            <div data-testid={TEST_IDS.ai.chatOutput} className="border border-term-border p-3 bg-term-panel font-mono text-[12px] whitespace-pre-wrap">
              <div className="text-term-muted text-[10px] uppercase mb-2">
                {chatResp.provider}/{chatResp.model} · {chatResp.latency_ms}ms
                {chatResp.failover_from && ` · failover from ${chatResp.failover_from}`}
              </div>
              <div className="text-term-text">{chatResp.text}</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
