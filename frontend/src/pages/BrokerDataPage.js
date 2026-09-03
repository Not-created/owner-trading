import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";

function selectAccount(accounts) {
  return accounts.find((account) => account.is_primary && account.status === "connected") ||
    accounts.find((account) => account.status === "connected") || null;
}

export default function BrokerDataPage({ title, endpoint, dataKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const accountsResponse = await api.get("/brokers/accounts");
        const account = selectAccount(accountsResponse.data?.accounts || []);
        if (!account) throw new Error("Connect a Kotak Neo account to view live broker data");
        const accountEndpoint = endpoint === "/brokers/funds"
          ? `${endpoint}/${encodeURIComponent(account.account_id)}`
          : `${endpoint}?account_id=${encodeURIComponent(account.account_id)}`;
        const response = await api.get(accountEndpoint);
        if (alive) setData(response.data?.[dataKey] ?? response.data);
      } catch (loadError) {
        if (alive) setError(formatApiError(loadError));
      }
    }
    load();
    return () => { alive = false; };
  }, [dataKey, endpoint]);

  return (
    <div className="p-6 space-y-4 max-w-[1200px]">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {error && <div className="text-term-danger font-mono">{error}</div>}
      {!error && data === null && <div className="text-term-muted font-mono">Loading live broker data...</div>}
      {!error && data !== null && Array.isArray(data) && data.length === 0 && <div className="text-term-muted font-mono">No broker data returned.</div>}
      {!error && data !== null && <pre className="overflow-auto bg-term-panel p-3 border border-term-border text-[12px] font-mono">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
