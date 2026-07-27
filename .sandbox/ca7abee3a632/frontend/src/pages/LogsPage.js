import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [levels, setLevels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const params = {};
    if (level) params.level = level;
    if (category) params.category = category;
    if (q) params.q = q;
    const { data } = await api.get("/logs", { params });
    setLogs(data.logs);
  }, [level, category, q]);

  useEffect(() => {
    api.get("/logs/categories").then(({ data }) => { setLevels(data.levels); setCategories(data.categories); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid={TEST_IDS.logs.root} className="p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// audit.stream</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Audit & Activity Logs</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <input data-testid={TEST_IDS.logs.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="search messages..."
          className="h-9 px-3 bg-term-surface border border-term-border font-mono text-[12px] flex-1 min-w-[240px] focus:border-term-accent focus:outline-none" />
        <select data-testid={TEST_IDS.logs.filterLevel} value={level} onChange={(e) => setLevel(e.target.value)}
          className="h-9 px-3 bg-term-surface border border-term-border font-mono text-[11px] uppercase">
          <option value="">all levels</option>
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select data-testid={TEST_IDS.logs.filterCategory} value={category} onChange={(e) => setCategory(e.target.value)}
          className="h-9 px-3 bg-term-surface border border-term-border font-mono text-[11px] uppercase">
          <option value="">all categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <section className="border border-term-border bg-term-panel">
        <div className="h-8 px-3 border-b border-term-border flex items-center font-mono text-[10px] text-term-muted uppercase">
          &gt; tail -f audit.log · {logs.length} lines
        </div>
        <div className="p-3 font-mono text-[11px] leading-relaxed max-h-[70vh] overflow-auto">
          {logs.length === 0 && <div className="text-term-muted">no matching events</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex gap-3 items-baseline min-w-[720px]">
              <span className="text-term-muted w-40 shrink-0">{l.created_at?.slice(0, 19).replace("T", " ")}</span>
              <span className={`w-16 shrink-0 uppercase log-${l.level}`}>{l.level}</span>
              <span className="w-20 shrink-0 text-term-secondary">{l.category}</span>
              <span className="text-term-text break-all">{l.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
