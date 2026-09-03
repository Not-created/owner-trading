import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";

export default function MarketDataPage() {
  const [symbol, setSymbol] = useState("");
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadQuote(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setQuotes(null);
    try {
      const { data: accountsData } = await api.get("/brokers/accounts");
      const account = (accountsData.accounts || []).find((item) => item.is_primary && item.status === "connected") ||
        (accountsData.accounts || []).find((item) => item.status === "connected");
      if (!account) throw new Error("Connect a Kotak Neo account to request live quotes");
      const { data } = await api.get("/brokers/quotes", {
        params: { account_id: account.account_id, symbols: symbol.trim().toUpperCase(), exchange: "NSE" },
      });
      setQuotes(data.quotes || []);
    } catch (requestError) {
      setError(formatApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => () => setQuotes(null), []);

  return (
    <div className="p-6 space-y-4 max-w-[1200px]">
      <h1 className="font-display text-2xl font-bold">Market Data</h1>
      <form onSubmit={loadQuote} className="flex gap-2 max-w-xl">
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          placeholder="NSE symbol"
          required
          className="flex-1 h-9 border border-term-border bg-term-panel px-3 font-mono text-sm"
        />
        <button type="submit" disabled={loading} className="h-9 px-4 border border-term-accent font-mono text-sm">
          {loading ? "LOADING" : "GET LIVE QUOTE"}
        </button>
      </form>
      {error && <div className="text-term-danger font-mono">{error}</div>}
      {!error && quotes === null && <div className="text-term-muted font-mono">Enter a symbol to request a live Kotak quote.</div>}
      {!error && quotes && quotes.length === 0 && <div className="text-term-muted font-mono">Kotak returned no quote data.</div>}
      {quotes && quotes.length > 0 && <pre className="overflow-auto bg-term-panel p-3 border border-term-border text-[12px] font-mono">{JSON.stringify(quotes, null, 2)}</pre>}
    </div>
  );
}
