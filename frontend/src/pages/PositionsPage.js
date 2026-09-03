import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function PositionsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/brokers/accounts").then(async ({ data }) => {
      const account = (data.accounts || []).find((item) => item.is_primary) || (data.accounts || []).find((item) => item.status === "connected");
      if (!account) throw new Error("Connect a Kotak Neo account to view positions");
      const response = await api.get(`/brokers/positions?account_id=${encodeURIComponent(account.account_id)}`);
      if (alive) setItems(response.data.positions || response.data || []);
    }).catch((e) => { if (alive) setError(formatApiError(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <div data-testid={TEST_IDS.positions.root} className="p-6 space-y-4 max-w-[1200px]">
      <h1 className="font-display text-2xl font-bold">Positions</h1>
      {error && <div className="text-term-danger font-mono">{error}</div>}
      <pre className="overflow-auto bg-term-panel p-3 border border-term-border text-[12px] font-mono">
        {JSON.stringify(items, null, 2)}
      </pre>
    </div>
  );
}
