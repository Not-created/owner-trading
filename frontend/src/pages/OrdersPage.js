import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function OrdersPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get("/brokers/orders").then((r) => { if (alive) setItems(r.data.orders || r.data || []); }).catch((e) => { if (alive) setError(formatApiError(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <div data-testid={TEST_IDS.orders.root} className="p-6 space-y-4 max-w-[1200px]">
      <h1 className="font-display text-2xl font-bold">Orders</h1>
      {error && <div className="text-term-danger font-mono">{error}</div>}
      <pre className="overflow-auto bg-term-panel p-3 border border-term-border text-[12px] font-mono">
        {JSON.stringify(items, null, 2)}
      </pre>
    </div>
  );
}
