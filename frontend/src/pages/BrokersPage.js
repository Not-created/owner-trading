import { useEffect, useMemo, useState } from "react";
import {
  Network,
  Info,
  Plus,
  Zap,
  Trash2,
  Radio,
  ShieldCheck,
  Server,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";


const CATEGORY_META = {
  indian: {
    label: "INDIAN",
    icon: ShieldCheck,
    className: "text-term-success",
  },
  forex: {
    label: "FOREX",
    icon: Globe,
    className: "text-term-info",
  },
};


const SENSITIVE_FIELD_PATTERNS = [
  "secret",
  "password",
  "mpin",
  "totp",
  "token",
  "key",
];


function isSensitiveField(name) {
  const value = String(name || "").toLowerCase();

  return SENSITIVE_FIELD_PATTERNS.some(
    (pattern) => value.includes(pattern)
  );
}


export default function BrokersPage() {
  const [plugins, setPlugins] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busyMap, setBusyMap] = useState({});

  const [modal, setModal] = useState(null);

  const [infoAccount, setInfoAccount] = useState(null);
  const [infoData, setInfoData] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);


  const setBusy = (accountId, busy) => {
    setBusyMap((current) => {
      const next = { ...current };

      if (busy) {
        next[accountId] = true;
      } else {
        delete next[accountId];
      }

      return next;
    });
  };


  const load = async () => {
    try {
      setLoading(true);

      const [pluginsResponse, accountsResponse] =
        await Promise.all([
          api.get("/brokers/plugins"),
          api.get("/brokers/accounts"),
        ]);

      setPlugins(
        Array.isArray(pluginsResponse?.data?.plugins)
          ? pluginsResponse.data.plugins
          : []
      );

      setAccounts(
        Array.isArray(accountsResponse?.data?.accounts)
          ? accountsResponse.data.accounts
          : []
      );
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    void load();
  }, []);


  const doConnect = async (account) => {
    if (busyMap[account.account_id]) {
      return;
    }

    setBusy(account.account_id, true);

    try {
      const { data } = await api.post(
        `/brokers/accounts/${account.account_id}/connect`
      );

      if (data?.ok) {
        toast.success(
          data.detail
            ? `Connected · ${data.detail}`
            : "Broker connected"
        );
      } else {
        toast.error(
          data?.detail || "Broker connection failed"
        );
      }

      await load();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(account.account_id, false);
    }
  };


  const doDisconnect = async (account) => {
    if (busyMap[account.account_id]) {
      return;
    }

    setBusy(account.account_id, true);

    try {
      const { data } = await api.post(
        `/brokers/accounts/${account.account_id}/disconnect`
      );

      if (data?.ok === false) {
        toast.error(
          data?.detail || "Broker disconnect failed"
        );
      } else {
        toast.success("Broker disconnected");
      }

      await load();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(account.account_id, false);
    }
  };


  const doTest = async (account) => {
    if (busyMap[account.account_id]) {
      return;
    }

    setBusy(account.account_id, true);

    try {
      const { data } = await api.post(
        `/brokers/accounts/${account.account_id}/test`
      );

      if (data?.ok) {
        toast.success(
          data.detail
            ? `OK · ${data.detail}`
            : `OK · ${data.latency_ms ?? 0}ms`
        );
      } else {
        toast.error(
          data?.detail ||
            data?.error ||
            "Connection test failed"
        );
      }
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(account.account_id, false);
    }
  };


  const doPrimary = async (account) => {
    if (busyMap[account.account_id]) {
      return;
    }

    setBusy(account.account_id, true);

    try {
      const { data } = await api.post(
        `/brokers/accounts/${account.account_id}/primary`
      );

      if (data?.ok === false) {
        toast.error(
          data?.detail || "Unable to make account primary"
        );
        return;
      }

      toast.success("Marked as primary");
      await load();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(account.account_id, false);
    }
  };


  const doRemove = async (account) => {
    if (busyMap[account.account_id]) {
      return;
    }

    const confirmed = window.confirm(
      `Delete account "${account.label}"?`
    );

    if (!confirmed) {
      return;
    }

    setBusy(account.account_id, true);

    try {
      await api.delete(
        `/brokers/accounts/${account.account_id}`
      );

      toast.success("Account removed");

      if (
        infoAccount?.account_id ===
        account.account_id
      ) {
        setInfoAccount(null);
        setInfoData(null);
      }

      await load();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(account.account_id, false);
    }
  };


  const doInfo = async (account) => {
    setInfoAccount(account);
    setInfoData(null);
    setInfoLoading(true);

    try {
      const { data } = await api.get(
        `/brokers/accounts/${account.account_id}/info`
      );

      setInfoData(data);
    } catch (error) {
      toast.error(formatApiError(error));
      setInfoAccount(null);
    } finally {
      setInfoLoading(false);
    }
  };


  const indian = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.category === "indian"
      ),
    [plugins]
  );

  const forex = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.category === "forex"
      ),
    [plugins]
  );


  return (
    <div
      data-testid={TEST_IDS.brokers.root}
      className="p-6 space-y-6 max-w-[1400px]"
    >
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
          // broker.core
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight">
          Broker Manager
        </h1>

        <p className="text-term-secondary text-[13px] mt-1">
          Connect real broker accounts. Credentials are
          encrypted server-side and never exposed.
        </p>
      </div>


      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">
            Brokers
          </div>

          <span className="font-mono text-[10px] text-term-muted">
            {plugins.length} registered
          </span>
        </header>


        {loading ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            Loading broker registry...
          </div>
        ) : plugins.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            No broker adapters are currently enabled.
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {indian.length > 0 && (
              <BrokerGroup
                title="Indian Brokers"
                brokers={indian}
                onAdd={setModal}
              />
            )}

            {forex.length > 0 && (
              <BrokerGroup
                title="Forex Brokers"
                brokers={forex}
                onAdd={setModal}
              />
            )}
          </div>
        )}
      </section>


      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">
            Connected accounts
          </div>

          <span className="font-mono text-[10px] text-term-muted">
            {accounts.length}
          </span>
        </header>


        {accounts.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            0 accounts. Add one via a broker above.
          </div>
        ) : (
          <div
            data-testid={TEST_IDS.brokers.accountsList}
            className="overflow-x-auto"
          >
            <table className="w-full text-left">
              <thead className="border-b border-term-border">
                <tr className="font-mono text-[10px] text-term-muted uppercase">
                  <th className="px-4 h-9">
                    Label
                  </th>

                  <th className="px-4 h-9">
                    Broker
                  </th>

                  <th className="px-4 h-9">
                    Status
                  </th>

                  <th className="px-4 h-9">
                    Last Health
                  </th>

                  <th className="px-4 h-9">
                    Primary
                  </th>

                  <th className="px-4 h-9 text-right">
                    Actions
                  </th>
                </tr>
              </thead>


              <tbody>
                {accounts.map((account) => {
                  const busy =
                    !!busyMap[
                      account.account_id
                    ];

                  return (
                    <tr
                      key={account.account_id}
                      className="border-b border-term-border/50"
                    >
                      <td className="px-4 h-10 text-[12px]">
                        {account.label}
                      </td>


                      <td className="px-4 h-10 font-mono text-[11px] text-term-secondary">
                        {account.plugin_id}
                      </td>


                      <td className="px-4 h-10 font-mono text-[11px]">
                        <span
                          className={
                            account.status ===
                            "connected"
                              ? "text-term-success"
                              : account.status ===
                                  "error"
                                ? "text-term-danger"
                                : "text-term-muted"
                          }
                        >
                          {account.status}
                        </span>
                      </td>


                      <td
                        className="px-4 h-10 font-mono text-[11px] text-term-muted max-w-[260px] truncate"
                        title={
                          account.last_health
                            ?.detail
                        }
                      >
                        {account.last_health
                          ?.detail || "—"}
                      </td>


                      <td className="px-4 h-10 font-mono text-[11px]">
                        {account.is_primary ? (
                          <span className="text-term-success">
                            YES
                          </span>
                        ) : (
                          <button
                            data-testid={TEST_IDS.brokers.primary(
                              account.account_id
                            )}
                            disabled={busy}
                            onClick={() =>
                              doPrimary(account)
                            }
                            className="text-term-muted hover:text-term-text underline disabled:opacity-40"
                          >
                            make primary
                          </button>
                        )}
                      </td>


                      <td className="px-4 h-10 text-right">
                        <div className="inline-flex gap-1 flex-wrap justify-end">
                          {account.status !==
                          "connected" ? (
                            <button
                              data-testid={TEST_IDS.brokers.connect(
                                account.account_id
                              )}
                              onClick={() =>
                                doConnect(account)
                              }
                              disabled={busy}
                              className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-success hover:text-term-success flex items-center gap-1 disabled:opacity-40"
                            >
                              <Zap size={10} />
                              {busy
                                ? "working..."
                                : "connect"}
                            </button>
                          ) : (
                            <button
                              data-testid={TEST_IDS.brokers.disconnect(
                                account.account_id
                              )}
                              onClick={() =>
                                doDisconnect(
                                  account
                                )
                              }
                              disabled={busy}
                              className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-warning hover:text-term-warning flex items-center gap-1 disabled:opacity-40"
                            >
                              <Radio size={10} />
                              {busy
                                ? "working..."
                                : "disconnect"}
                            </button>
                          )}


                          <button
                            onClick={() =>
                              doTest(account)
                            }
                            disabled={busy}
                            className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-info hover:text-term-info flex items-center gap-1 disabled:opacity-40"
                          >
                            <Server size={10} />
                            test
                          </button>


                          <button
                            onClick={() =>
                              doInfo(account)
                            }
                            disabled={busy}
                            className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1 disabled:opacity-40"
                          >
                            <Info size={10} />
                            info
                          </button>


                          <button
                            data-testid={TEST_IDS.brokers.remove(
                              account.account_id
                            )}
                            onClick={() =>
                              doRemove(account)
                            }
                            disabled={busy}
                            className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-danger hover:text-term-danger flex items-center gap-1 disabled:opacity-40"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>


      {infoAccount && (
        <section className="border border-term-border bg-term-surface">
          <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
            <div className="font-display text-[13px] font-bold">
              Account info —{" "}
              {infoAccount.label} (
              {infoAccount.plugin_id})
            </div>

            <button
              onClick={() => {
                setInfoAccount(null);
                setInfoData(null);
              }}
              className="text-term-muted hover:text-term-text font-mono text-[11px] uppercase"
            >
              close
            </button>
          </header>


          <div className="p-4">
            {infoLoading ? (
              <div className="font-mono text-[11px] text-term-muted">
                Loading...
              </div>
            ) : infoData ? (
              <pre className="font-mono text-[11px] text-term-secondary whitespace-pre-wrap break-all bg-term-panel p-3 border border-term-border max-h-[300px] overflow-auto">
                {JSON.stringify(
                  infoData,
                  null,
                  2
                )}
              </pre>
            ) : (
              <div className="font-mono text-[11px] text-term-muted">
                No data
              </div>
            )}
          </div>
        </section>
      )}


      {modal && (
        <AddAccountModal
          plugin={modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Broker registry card                                               */
/* ------------------------------------------------------------------ */


function BrokerGroup({
  title,
  brokers,
  onAdd,
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
        {title}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {brokers.map((plugin) => (
          <BrokerCard
            key={plugin.plugin_id}
            plugin={plugin}
            onAdd={onAdd}
          />
        ))}
      </div>
    </div>
  );
}


function BrokerCard({
  plugin,
  onAdd,
}) {
  const cat =
    CATEGORY_META[plugin.category] ||
    CATEGORY_META.indian;

  const CatIcon = cat.icon;

  return (
    <div className="border border-term-border bg-term-panel p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-display text-[13px] font-bold">
          {plugin.display_name}
        </div>

        <span
          className={`font-mono text-[10px] uppercase ${cat.className}`}
        >
          <CatIcon
            size={12}
            className="inline -mt-[2px] mr-1"
          />
          {cat.label}
        </span>
      </div>


      <div className="font-mono text-[10px] text-term-muted mb-3">
        {plugin.plugin_id} · v
        {plugin.version}
      </div>


      <button
        data-testid={TEST_IDS.brokers.addBtn(
          plugin.plugin_id
        )}
        onClick={() => onAdd(plugin)}
        className="w-full h-8 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center justify-center gap-2"
      >
        <Plus size={12} />
        add account
      </button>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Add broker account modal                                           */
/* ------------------------------------------------------------------ */


function AddAccountModal({
  plugin,
  onClose,
  onSaved,
}) {
  const [label, setLabel] = useState("");

  const [creds, setCreds] = useState(() =>
    Object.fromEntries(
