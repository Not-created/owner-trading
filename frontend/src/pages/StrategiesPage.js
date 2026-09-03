import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function StrategiesPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const initial = {
    name: "",
    description: "",
    symbol: "",
    exchange: "NSE",
    timeframe: "1d",
    indicators: [{ type: "SMA", period: 20 }],
    entry_conditions: [{ left: "PRICE", operator: "GREATER_THAN", right: "SMA_20" }],
    exit_conditions: [{ left: "PRICE", operator: "LESS_THAN", right: "SMA_20" }],
    quantity: 1,
    max_positions: 1,
  };
  const [form, setForm] = useState(initial);
  const [backtest, setBacktest] = useState({ start: "", end: "", initial_capital: 100000 });
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data } = await api.get("/strategies");
      setItems(data.strategies || []);
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/strategies", { ...form, quantity: Number(form.quantity), max_positions: Number(form.max_positions) });
      setItems((current) => [data, ...current]);
      setSelected(data);
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function runBacktest(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post(`/strategies/${selected.strategy_id}/backtest`, { ...backtest, initial_capital: Number(backtest.initial_capital) });
      setResult(data);
      await load();
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid={TEST_IDS.strategies.root} className="p-6 space-y-4 max-w-[1200px]">
      <h1 className="font-display text-2xl font-bold">Strategy Builder</h1>
      {error && <div className="text-term-danger font-mono">{error}</div>}
      <form onSubmit={save} className="grid gap-3 border border-term-border bg-term-surface p-4 md:grid-cols-2">
        {[["name", "Name"], ["symbol", "Symbol"], ["description", "Description"]].map(([key, label]) => (
          <label key={key} className="grid gap-1 font-mono text-xs">{label}<input value={form[key]} onChange={(event) => update(key, event.target.value)} required={key !== "description"} className="h-9 border border-term-border bg-term-panel px-2" /></label>
        ))}
        <label className="grid gap-1 font-mono text-xs">Timeframe<select value={form.timeframe} onChange={(event) => update("timeframe", event.target.value)} className="h-9 border border-term-border bg-term-panel px-2"><option>1d</option><option>1h</option><option>15m</option></select></label>
        <label className="grid gap-1 font-mono text-xs">Quantity<input type="number" min="1" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} className="h-9 border border-term-border bg-term-panel px-2" /></label>
        <button disabled={busy} className="h-9 border border-term-accent font-mono text-xs md:col-span-2">{busy ? "SAVING" : "SAVE STRATEGY"}</button>
      </form>
      <section className="border border-term-border bg-term-surface p-4 space-y-3">
        <h2 className="font-display font-bold">Saved Strategies</h2>
        {loading && <div className="text-term-muted font-mono text-sm">Loading...</div>}
        {!loading && items.length === 0 && <div className="text-term-muted font-mono text-sm">No strategies saved.</div>}
        {items.map((strategy) => <button key={strategy.strategy_id} onClick={() => setSelected(strategy)} className={`block w-full text-left border p-3 font-mono text-sm ${selected?.strategy_id === strategy.strategy_id ? "border-term-accent" : "border-term-border"}`}>{strategy.name} · {strategy.symbol} · {strategy.status} · v{strategy.version}</button>)}
      </section>
      {selected && <form onSubmit={runBacktest} className="border border-term-border bg-term-surface p-4 space-y-3"><h2 className="font-display font-bold">Backtest {selected.name}</h2><div className="grid md:grid-cols-3 gap-3"><input type="datetime-local" required value={backtest.start} onChange={(event) => setBacktest({ ...backtest, start: event.target.value })} className="h-9 border border-term-border bg-term-panel px-2 font-mono text-xs" /><input type="datetime-local" required value={backtest.end} onChange={(event) => setBacktest({ ...backtest, end: event.target.value })} className="h-9 border border-term-border bg-term-panel px-2 font-mono text-xs" /><input type="number" min="1" required value={backtest.initial_capital} onChange={(event) => setBacktest({ ...backtest, initial_capital: event.target.value })} className="h-9 border border-term-border bg-term-panel px-2 font-mono text-xs" /></div><button disabled={busy} className="h-9 border border-term-accent px-3 font-mono text-xs">{busy ? "RUNNING" : "RUN BACKTEST"}</button></form>}
      {result && <section className="border border-term-border bg-term-surface p-4"><h2 className="font-display font-bold">Backtest Result</h2><pre className="mt-3 overflow-auto font-mono text-xs">{JSON.stringify(result, null, 2)}</pre></section>}
    </div>
  );
}
