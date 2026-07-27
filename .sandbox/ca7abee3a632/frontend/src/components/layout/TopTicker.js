import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const REFRESH_MS = 20000;

function fmtPrice(p) {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (p >= 10) return p.toFixed(2);
  return p.toFixed(4);
}

export default function TopTicker() {
  const [quotes, setQuotes] = useState([]);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/market/quotes");
      setQuotes(data.quotes || []);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  if (error) {
    return (
      <div data-testid={TEST_IDS.shell.ticker} className="h-8 border-b border-term-border bg-term-panel px-4 flex items-center font-mono text-[10px] text-term-muted">
        market feed unavailable
      </div>
    );
  }
  if (quotes.length === 0) {
    return (
      <div data-testid={TEST_IDS.shell.ticker} className="h-8 border-b border-term-border bg-term-panel px-4 flex items-center font-mono text-[10px] text-term-muted">
        loading ticker…
      </div>
    );
  }

  // duplicate for continuous marquee
  const list = [...quotes, ...quotes];

  return (
    <div data-testid={TEST_IDS.shell.ticker} className="h-8 border-b border-term-border bg-term-panel overflow-hidden relative">
      <div className="absolute inset-y-0 left-0 flex items-center animate-[ticker_60s_linear_infinite] whitespace-nowrap font-mono text-[11px]">
        {list.map((q, i) => {
          const up = q.change >= 0;
          return (
            <span key={i} className="px-4 flex items-center gap-2">
              <span className="text-term-muted">{q.symbol}</span>
              <span className="text-term-text">{fmtPrice(q.price)}</span>
              <span className={up ? "text-term-success" : "text-term-danger"}>
                {up ? "▲" : "▼"} {q.change_percent >= 0 ? "+" : ""}
                {q.change_percent.toFixed(2)}%
              </span>
              <span className="text-term-border">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
