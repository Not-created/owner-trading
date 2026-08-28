import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Globe,
  Info,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api, formatApiError } from "@/lib/api";

/*
 * Broker Manager UI
 *
 * FINAL FRONTEND CONTRACT
 * -----------------------
 * This page depends only on the universal broker API:
 *
 * GET    /brokers/plugins
 * GET    /brokers/accounts
 * POST   /brokers/accounts
 * DELETE /brokers/accounts/:account_id
 * POST   /brokers/accounts/:account_id/primary
 * POST   /brokers/accounts/:account_id/connect
 * POST   /brokers/accounts/:account_id/disconnect
 * POST   /brokers/accounts/:account_id/test
 * GET    /brokers/accounts/:account_id/info
 *
 * Broker-specific credentials are obtained from the registry response.
 * No broker is hard-coded into the form.
 *
 * Therefore adding another broker later does not require changing this
 * page as long as its adapter implements BrokerPluginBase and exposes
 * required_credentials + credential_labels through BrokerRegistry.
 *
 * SECURITY:
 * - Credentials are submitted only to the backend.
 * - Credentials are never rendered after submission.
 * - Account info returned by the backend is treated as safe/displayable
 *   data only.
 * - No credential value is stored in localStorage/sessionStorage.
 *
 * RESPONSIVE:
 * - Desktop/tablet/mobile layouts are supported.
 * - Terminal-style visual language is preserved.
 */

/* ------------------------------------------------------------------ */
/* Stable test IDs                                                    */
/* ------------------------------------------------------------------ */

const BROKER_TEST_IDS = {
  root: "brokers-page",
  refresh: "brokers-refresh",
  plugins: "brokers-plugins",
  addButton: (pluginId) => `broker-add-${pluginId}`,
  accounts: "brokers-accounts",
  connect: (accountId) => `broker-connect-${accountId}`,
  disconnect: (accountId) => `broker-disconnect-${accountId}`,
  test: (accountId) => `broker-test-${accountId}`,
  info: (accountId) => `broker-info-${accountId}`,
  primary: (accountId) => `broker-primary-${accountId}`,
  remove: (accountId) => `broker-remove-${accountId}`,
  modal: "broker-add-modal",
  modalClose: "broker-add-modal-close",
  modalLabel: "broker-add-label",
  modalCredential: (key) => `broker-add-credential-${key}`,
  modalSubmit: "broker-add-submit",
  infoPanel: "broker-info-panel",
  infoClose: "broker-info-close",
};

/* ------------------------------------------------------------------ */
/* Category metadata                                                  */
/* ------------------------------------------------------------------ */

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

const DEFAULT_CATEGORY = {
  label: "OTHER",
  icon: Server,
  className: "text-term-muted",
};

/* ------------------------------------------------------------------ */
/* Credential helpers                                                 */
/* ------------------------------------------------------------------ */

function credentialInputType(key) {
  const normalized = String(key || "").toLowerCase();

  if (
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("mpin") ||
    normalized.includes("totp") ||
    normalized.includes("token")
  ) {
    return "password";
  }

  return "text";
}

function credentialInputMode(key) {
  const normalized = String(key || "").toLowerCase();

  if (
    normalized.includes("mobile") ||
    normalized.includes("phone") ||
    normalized.includes("totp") ||
    normalized.includes("mpin") ||
    normalized.includes("pin")
  ) {
    return "numeric";
  }

  return "text";
}

function statusMeta(status) {
  switch (String(status || "").toLowerCase()) {
    case "connected":
      return {
        label: "connected",
        className: "text-term-success",
        dotClass: "bg-term-success",
      };

    case "error":
      return {
        label: "error",
        className: "text-term-danger",
        dotClass: "bg-term-danger",
      };

    case "connecting":
      return {
        label: "connecting",
        className: "text-term-warning",
        dotClass: "bg-term-warning",
      };

    default:
      return {
        label: "disconnected",
        className: "text-term-muted",
        dotClass: "bg-term-muted",
      };
  }
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export default function BrokersPage() {
  const [plugins, setPlugins] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalPlugin, setModalPlugin] = useState(null);

  const [infoAccount, setInfoAccount] = useState(null);
  const [infoData, setInfoData] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);

  const [busyMap, setBusyMap] = useState({});

  const setBusy = useCallback((key, value) => {
    setBusyMap((previous) => ({
      ...previous,
      [key]: value,
    }));
  }, []);

  const load = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [pluginResponse, accountResponse] = await Promise.all([
        api.get("/brokers/plugins"),
        api.get("/brokers/accounts"),
      ]);

      setPlugins(
        Array.isArray(pluginResponse?.data?.plugins)
          ? pluginResponse.data.plugins
          : []
      );

      setAccounts(
        Array.isArray(accountResponse?.data?.accounts)
          ? accountResponse.data.accounts
          : []
      );
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  /* ---------------------------------------------------------------- */
  /* Account actions                                                  */
  /* ---------------------------------------------------------------- */

  const doConnect = useCallback(
    async (account) => {
      const key = `connect:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } = await api.post(
          `/brokers/accounts/${account.account_id}/connect`
        );

        if (data?.ok) {
          toast.success(
            data.detail
              ? `Connected · ${data.detail}`
              : `Connected · ${data.latency_ms ?? 0}ms`
          );
        } else {
          toast.error(
            data?.detail || "Broker connection failed"
          );
        }

        await load(true);
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doDisconnect = useCallback(
    async (account) => {
      const key = `disconnect:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } = await api.post(
          `/brokers/accounts/${account.account_id}/disconnect`
        );

        if (data?.ok !== false) {
          toast.success("Broker disconnected");
          await load(true);
        } else {
          toast.error(
            data?.detail || "Disconnect failed"
          );
        }
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doTest = useCallback(
    async (account) => {
      const key = `test:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } = await api.post(
          `/brokers/accounts/${account.account_id}/test`
        );

        if (data?.ok) {
          toast.success(
            data.detail
              ? `${data.detail} · ${data.latency_ms ?? 0}ms`
              : `Connection OK · ${data.latency_ms ?? 0}ms`
          );
        } else {
          toast.error(
            data?.detail || "Connection test failed"
          );
        }

        await load(true);
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doPrimary = useCallback(
    async (account) => {
      const key = `primary:${account.account_id}`;

      if (busyMap[key] || account.is_primary) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } = await api.post(
          `/brokers/accounts/${account.account_id}/primary`
        );

        if (data?.ok !== false) {
          toast.success(
            `Primary broker set to "${account.label}"`
          );
          await load(true);
        } else {
          toast.error(
            data?.detail ||
              "Unable to set primary broker"
          );
        }
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doRemove = useCallback(
    async (account) => {
      const key = `remove:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      const confirmed = window.confirm(
        `Delete broker account "${account.label}"?\n\nThis removes the saved encrypted credentials and account record.`
      );

      if (!confirmed) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } = await api.delete(
          `/brokers/accounts/${account.account_id}`
        );

        if (data?.ok !== false) {
          toast.success(
            `Removed "${account.label}"`
          );

          await load(true);

          if (
            infoAccount?.account_id ===
            account.account_id
          ) {
            setInfoAccount(null);
            setInfoData(null);
          }
        } else {
          toast.error(
            data?.detail ||
              "Unable to remove account"
          );
        }
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [
      busyMap,
      infoAccount,
      load,
      setBusy,
    ]
  );

  const doInfo = useCallback(
    async (account) => {
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
        setInfoData(null);
      } finally {
        setInfoLoading(false);
      }
    },
    []
  );

  const closeInfo = useCallback(() => {
    setInfoAccount(null);
    setInfoData(null);
    setInfoLoading(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Derived broker groups                                            */
  /* ---------------------------------------------------------------- */

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

  const other = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.category !== "indian" &&
          plugin.category !== "forex"
      ),
    [plugins]
  );

  const primaryAccount = useMemo(
    () =>
      accounts.find(
        (account) => account.is_primary
      ),
    [accounts]
  );

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */

  return (
    <div
      data-testid={BROKER_TEST_IDS.root}
      className="p-4 md:p-6 space-y-6 max-w-[1500px]"
    >
      {/* ------------------------------------------------------------ */}
      {/* Header                                                       */}
      {/* ------------------------------------------------------------ */}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            // broker.core
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Broker Manager
          </h1>

          <p className="text-term-secondary text-[13px] mt-1 max-w-2xl">
            Connect real broker accounts.
            Credentials are encrypted server-side
            and never exposed to the frontend after
            submission.
          </p>
        </div>

        <button
          data-testid={BROKER_TEST_IDS.refresh}
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="h-8 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center justify-center gap-2 self-start md:self-auto"
        >
          {refreshing ? (
            <Loader2
              size={12}
              className="animate-spin"
            />
          ) : (
            <RefreshCw size={12} />
          )}

          {refreshing
            ? "refreshing..."
            : "refresh"}
        </button>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Primary broker summary                                       */}
      {/* ------------------------------------------------------------ */}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCell
          label="Registered Brokers"
          value={plugins.length}
          detail="active registry entries"
        />

        <SummaryCell
          label="Connected Accounts"
          value={
            accounts.filter(
              (account) =>
                account.status ===
                "connected"
            ).length
          }
          detail={`of ${accounts.length} configured`}
        />

        <SummaryCell
          label="Primary Broker"
          value={
            primaryAccount?.label ||
            "NONE"
          }
          detail={
            primaryAccount?.plugin_id ||
            "select an account below"
          }
          valueClassName={
            primaryAccount
              ? "text-term-success"
              : ""
          }
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Broker registry                                               */}
      {/* ------------------------------------------------------------ */}

            {/* ------------------------------------------------------------ */}
      {/* Accounts                                                     */}
      {/* ------------------------------------------------------------ */}

      <section
        data-testid={BROKER_TEST_IDS.accounts}
        className="border border-term-border bg-term-surface"
      >
        <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">
            Connected Accounts
          </div>

          <span className="font-mono text-[10px] text-term-muted">
            {accounts.length} account
            {accounts.length === 1 ? "" : "s"}
          </span>
        </header>

        {loading ? (
          <div className="p-6 flex items-center gap-2 font-mono text-[11px] text-term-muted">
            <Loader2 size={13} className="animate-spin" />
            loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            0 accounts. Add an account from a registered broker above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="border-b border-term-border bg-term-panel">
                <tr className="font-mono text-[10px] text-term-muted uppercase">
                  <th className="px-4 h-9">Label</th>
                  <th className="px-4 h-9">Broker</th>
                  <th className="px-4 h-9">Status</th>
                  <th className="px-4 h-9">Last Health</th>
                  <th className="px-4 h-9">Primary</th>
                  <th className="px-4 h-9 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => {
                  const status = statusMeta(
                    account.status
                  );

                  const connecting =
                    busyMap[
                      `connect:${account.account_id}`
                    ];

                  const disconnecting =
                    busyMap[
                      `disconnect:${account.account_id}`
                    ];

                  const testing =
                    busyMap[
                      `test:${account.account_id}`
                    ];

                  const makingPrimary =
                    busyMap[
                      `primary:${account.account_id}`
                    ];

                  const removing =
                    busyMap[
                      `remove:${account.account_id}`
                    ];

                  const health =
                    account.last_health;

                  return (
                    <tr
                      key={account.account_id}
                      className="border-b border-term-border/50 hover:bg-term-surface_hover/40"
                    >
                      <td className="px-4 h-11">
                        <div className="text-[12px] font-medium">
                          {account.label ||
                            "Unnamed account"}
                        </div>

                        {account.created_at && (
                          <div className="font-mono text-[9px] text-term-muted mt-0.5">
                            {account.created_at}
                          </div>
                        )}
                      </td>

                      <td className="px-4 h-11 font-mono text-[11px] text-term-secondary">
                        {account.plugin_id}
                      </td>

                      <td className="px-4 h-11">
                        <span
                          className={`font-mono text-[10px] uppercase ${status.className}`}
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 mr-1.5 ${status.dotClass}`}
                          />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 h-11">
                        {health ? (
                          <div className="font-mono text-[10px]">
                            <div
                              className={
                                health.ok
                                  ? "text-term-success"
                                  : "text-term-danger"
                              }
                            >
                              {health.ok
                                ? "OK"
                                : "FAILED"}
                            </div>

                            {health.latency_ms !==
                              undefined && (
                              <div className="text-term-muted">
                                {health.latency_ms}ms
                              </div>
                            )}

                            {health.detail && (
                              <div className="text-term-secondary max-w-[240px] truncate">
                                {health.detail}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-term-muted">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-4 h-11">
                        {account.is_primary ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase text-term-success">
                            <Zap size={10} />
                            primary
                          </span>
                        ) : (
                          <button
                            data-testid={
                              BROKER_TEST_IDS.primary(
                                account.account_id
                              )
                            }
                            onClick={() =>
                              doPrimary(account)
                            }
                            disabled={
                              makingPrimary ||
                              Boolean(
                                account.is_primary
                              )
                            }
                            className="font-mono text-[9px] uppercase text-term-muted hover:text-term-accent disabled:opacity-40"
                          >
                            {makingPrimary
                              ? "setting..."
                              : "set primary"}
                          </button>
                        )}
                      </td>

                      <td className="px-4 h-11">
                        <div className="flex items-center justify-end gap-1.5">
                          {account.status ===
                          "connected" ? (
                            <button
                              data-testid={
                                BROKER_TEST_IDS.disconnect(
                                  account.account_id
                                )
                              }
                              onClick={() =>
                                doDisconnect(
                                  account
                                )
                              }
                              disabled={
                                disconnecting
                              }
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-warning hover:text-term-warning disabled:opacity-40 flex items-center gap-1"
                            >
                              {disconnecting ? (
                                <Loader2
                                  size={10}
                                  className="animate-spin"
                                />
                              ) : (
                                <Wifi
                                  size={10}
                                />
                              )}
                              disconnect
                            </button>
                          ) : (
                            <button
                              data-testid={
                                BROKER_TEST_IDS.connect(
                                  account.account_id
                                )
                              }
                              onClick={() =>
                                doConnect(
                                  account
                                )
                              }
                              disabled={
                                connecting
                              }
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-success hover:text-term-success disabled:opacity-40 flex items-center gap-1"
                            >
                              {connecting ? (
                                <Loader2
                                  size={10}
                                  className="animate-spin"
                                />
                              ) : (
                                <Radio
                                  size={10}
                                />
                              )}
                              connect
                            </button>
                          )}

                          <button
                            data-testid={
                              BROKER_TEST_IDS.test(
                                account.account_id
                              )
                            }
                            onClick={() =>
                              doTest(account)
                            }
                            disabled={testing}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1"
                          >
                            {testing ? (
                              <Loader2
                                size={10}
                                className="animate-spin"
                              />
                            ) : (
                              <RefreshCw
                                size={10}
                              />
                            )}
                            test
                          </button>

                          <button
                            data-testid={
                              BROKER_TEST_IDS.info(
                                account.account_id
                              )
                            }
                            onClick={() =>
                              doInfo(account)
                            }
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-info hover:text-term-info disabled:opacity-40 flex items-center gap-1"
                          >
                            <Info size={10} />
                            info
                          </button>

                          <button
                            data-testid={
                              BROKER_TEST_IDS.remove(
                                account.account_id
                              )
                            }
                            onClick={() =>
                              doRemove(account)
                            }
                            disabled={removing}
                            className="h-7 w-7 border border-term-border font-mono text-[9px] hover:border-term-danger hover:text-term-danger disabled:opacity-40 flex items-center justify-center"
                            title="Remove account"
                          >
                            {removing ? (
                              <Loader2
                                size={10}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2
                                size={10}
                              />
                            )}
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

      {/* ------------------------------------------------------------ */}
      {/* Add account modal                                             */}
      {/* ------------------------------------------------------------ */}

      {modalPlugin && (
        <AddBrokerModal
          plugin={modalPlugin}
          onClose={() =>
            setModalPlugin(null)
          }
          onCreated={async () => {
            setModalPlugin(null);
            await load(true);
          }}
        />
      )}

      {/* ------------------------------------------------------------ */}
      {/* Account information modal                                     */}
      {/* ------------------------------------------------------------ */}

      {infoAccount && (
        <AccountInfoModal
          account={infoAccount}
          data={infoData}
          loading={infoLoading}
          onClose={closeInfo}
        />
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Summary cell                                                       */
/* ------------------------------------------------------------------ */

function SummaryCell({
  label,
  value,
  detail,
  valueClassName = "",
}) {
  return (
    <div className="border border-term-border bg-term-surface p-4">
      <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
        {label}
      </div>

      <div
        className={`font-display text-xl font-bold mt-1 truncate ${valueClassName}`}
      >
        {value}
      </div>

      <div className="font-mono text-[9px] text-term-secondary mt-1 truncate">
        {detail}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Broker group                                                       */
/* ------------------------------------------------------------------ */

function BrokerGroup({
  title,
  plugins,
  onAdd,
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
          {title}
        </div>

        <div className="h-px bg-term-border flex-1" />

        <div className="font-mono text-[9px] text-term-muted">
          {plugins.length}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {plugins.map((plugin) => (
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


/* ------------------------------------------------------------------ */
/* Broker card                                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Broker card                                                         */
/* ------------------------------------------------------------------ */

function BrokerGroup({
  title,
  plugins,
  onAdd,
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
          {title}
        </div>

        <div className="h-px bg-term-border flex-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {plugins.map((plugin) => (
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
  const category =
    CATEGORY_META[plugin.category] ||
    DEFAULT_CATEGORY;

  const CategoryIcon = category.icon;

  const credentialCount = Array.isArray(
    plugin.required_credentials
  )
    ? plugin.required_credentials.length
    : 0;

  return (
    <div className="border border-term-border bg-term-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CategoryIcon
              size={13}
              className={category.className}
            />

            <div className="font-display text-[13px] font-bold truncate">
              {plugin.display_name ||
                plugin.plugin_id}
            </div>
          </div>

          <div className="font-mono text-[9px] text-term-muted mt-1 truncate">
            {plugin.plugin_id}
          </div>
        </div>

        <span
          className={`font-mono text-[9px] uppercase shrink-0 ${category.className}`}
        >
          {category.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <div className="border border-term-border/60 px-2 py-2">
          <div className="font-mono text-[8px] text-term-muted uppercase">
            version
          </div>

          <div className="font-mono text-[10px] text-term-text mt-0.5">
            {plugin.version || "—"}
          </div>
        </div>

        <div className="border border-term-border/60 px-2 py-2">
          <div className="font-mono text-[8px] text-term-muted uppercase">
            credentials
          </div>

          <div className="font-mono text-[10px] text-term-text mt-0.5">
            {credentialCount}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="font-mono text-[8px] text-term-muted uppercase mb-1">
          required fields
        </div>

        {credentialCount === 0 ? (
          <div className="font-mono text-[9px] text-term-muted">
            No credentials required
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {plugin.required_credentials.map(
              (key) => (
                <span
                  key={key}
                  className="border border-term-border/60 px-1.5 py-0.5 font-mono text-[8px] text-term-secondary"
                >
                  {plugin.credential_labels?.[
                    key
                  ] || key}
                </span>
              )
            )}
          </div>
        )}
      </div>

      <button
        data-testid={BROKER_TEST_IDS.addButton(
          plugin.plugin_id
        )}
        onClick={() => onAdd(plugin)}
        className="mt-4 w-full h-8 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center justify-center gap-2"
      >
        <Plus size={11} />
        add account
      </button>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Summary cell                                                        */
/* ------------------------------------------------------------------ */

function SummaryCell({
  label,
  value,
  detail,
  valueClassName = "",
}) {
  return (
    <div className="border border-term-border bg-term-surface p-4">
      <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
        {label}
      </div>

      <div
        className={`font-display text-xl font-bold mt-1 truncate ${valueClassName}`}
      >
        {value}
      </div>

      <div className="font-mono text-[9px] text-term-secondary mt-1 truncate">
        {detail}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Add account modal                                                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Add account modal                                                   */
/* ------------------------------------------------------------------ */

function AddAccountModal({
  plugin,
  onClose,
  onCreated,
}) {
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState({});
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState(false);

  const requiredCredentials = Array.isArray(
    plugin?.required_credentials
  )
    ? plugin.required_credentials
    : [];

  const credentialLabels =
    plugin?.credential_labels &&
    typeof plugin.credential_labels === "object"
      ? plugin.credential_labels
      : {};

  useEffect(() => {
    if (!plugin) {
      setLabel("");
      setCredentials({});
      setVisible({});
      return;
    }

    const initial = {};

    requiredCredentials.forEach((key) => {
      initial[key] = "";
    });

    setLabel("");
    setCredentials(initial);
    setVisible({});
  }, [plugin, requiredCredentials]);

  if (!plugin) {
    return null;
  }

  const updateCredential = (key, value) => {
    setCredentials((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const toggleVisibility = (key) => {
    setVisible((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    const cleanLabel = label.trim();

    if (!cleanLabel) {
      toast.error("Account label is required");
      return;
    }

    const missing = requiredCredentials.filter(
      (key) =>
        !String(credentials[key] ?? "").trim()
    );

    if (missing.length > 0) {
      toast.error(
        `Missing: ${missing
          .map(
            (key) =>
              credentialLabels[key] || key
          )
          .join(", ")}`
      );
      return;
    }

    setBusy(true);

    try {
      const { data } = await api.post(
        "/brokers/accounts",
        {
          plugin_id: plugin.plugin_id,
          label: cleanLabel,
          credentials,
        }
      );

      toast.success(
        data?.account_id
          ? "Broker account added"
          : "Broker account created"
      );

      onCreated?.(data);
      onClose?.();
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={BROKER_TEST_IDS.modal}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="broker-add-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (!busy) {
            onClose?.();
          }
        }}
      />

      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto border border-term-border bg-term-surface shadow-2xl">

        {/* Modal header */}
        <header className="min-h-12 px-4 py-3 border-b border-term-border flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker.accounts.new
            </div>

            <h2
              id="broker-add-modal-title"
              className="font-display text-[16px] font-bold mt-0.5"
            >
              Add {plugin.display_name}
            </h2>

            <div className="font-mono text-[9px] text-term-muted mt-1">
              {plugin.plugin_id}
              {plugin.version
                ? ` · v${plugin.version}`
                : ""}
            </div>
          </div>

          <button
            type="button"
            data-testid={BROKER_TEST_IDS.modalClose}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="h-7 w-7 border border-term-border flex items-center justify-center hover:border-term-danger hover:text-term-danger disabled:opacity-40"
          >
            <X size={12} />
          </button>
        </header>


        {/* Security notice */}
        <div className="mx-4 mt-4 border border-term-success/30 bg-term-success/5 p-3 flex gap-2">
          <ShieldCheck
            size={13}
            className="text-term-success shrink-0 mt-0.5"
          />

          <div>
            <div className="font-mono text-[9px] text-term-success uppercase">
              encrypted credential storage
            </div>

            <div className="font-mono text-[10px] text-term-secondary mt-1 leading-relaxed">
              Credentials are transmitted to the backend over the
              authenticated API and encrypted server-side. They are
              never returned to this UI after submission.
            </div>
          </div>
        </div>


        <form
          onSubmit={submit}
          className="p-4 space-y-4"
        >

          {/* Account label */}
          <div>
            <label
              htmlFor="broker-account-label"
              className="block font-mono text-[9px] text-term-muted uppercase mb-1.5"
            >
              Account Label
            </label>

            <input
              id="broker-account-label"
              data-testid={BROKER_TEST_IDS.modalLabel}
              value={label}
              onChange={(event) =>
                setLabel(event.target.value)
              }
              maxLength={64}
              disabled={busy}
              autoFocus
              placeholder="e.g. Kotak Main Account"
              className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[11px] text-term-text focus:border-term-accent focus:outline-none disabled:opacity-50"
            />
          </div>


          {/* Dynamic credentials */}
          {requiredCredentials.length === 0 ? (
            <div className="border border-term-border/60 p-3 font-mono text-[10px] text-term-muted">
              This broker does not require additional credentials.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
                broker credentials
              </div>

              {requiredCredentials.map(
                (key) => {
                  const secret =
                    credentialInputType(
                      key
                    ) === "password";

                  const isVisible =
                    Boolean(
                      visible[key]
                    );

                  const labelText =
                    credentialLabels[key] ||
                    key
                      .replace(
                        /_/g,
                        " "
                      )
                      .replace(
                        /\b\w/g,
                        (char) =>
                          char.toUpperCase()
                      );

                  return (
                    <div key={key}>
                      <label
                        htmlFor={`broker-credential-${key}`}
                        className="block font-mono text-[9px] text-term-muted uppercase mb-1.5"
                      >
                        {labelText}
                      </label>

                      <div className="relative">
                        <input
                          id={`broker-credential-${key}`}
                          data-testid={BROKER_TEST_IDS.modalCredential(
                            key
                          )}
                          type={
                            secret &&
                            !isVisible
                              ? "password"
                              : "text"
                          }
                          inputMode={credentialInputMode(
                            key
                          )}
                          autoComplete="off"
                          value={
                            credentials[
                              key
                            ] || ""
                          }
                          onChange={(
                            event
                          ) =>
                            updateCredential(
                              key,
                              event.target
                                .value
                            )
                          }
                          disabled={busy}
                          placeholder={
                            labelText
                          }
                          className={`w-full h-9 ${
                            secret
                              ? "pr-10"
                              : ""
                          } px-3 bg-term-panel border border-term-border font-mono text-[11px] text-term-text focus:border-term-accent focus:outline-none disabled:opacity-50`}
                        />

                        {secret && (
                          <button
                            type="button"
                            onClick={() =>
                              toggleVisibility(
                                key
                              )
                            }
                            disabled={busy}
                            aria-label={
                              isVisible
                                ? `Hide ${labelText}`
                                : `Show ${labelText}`
                            }
                            className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-term-muted hover:text-term-text disabled:opacity-40"
                          >
                            {isVisible ? (
                              <EyeOff
                                size={
                                  12
                                }
                              />
                            ) : (
                              <Eye
                                size={
                                  12
                                }
                              />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}


          {/* Credential-specific information */}
          {plugin.plugin_id ===
            "kotak_neo" && (
            <div className="border border-term-accent/30 bg-term-accent/5 p-3">
              <div className="flex items-start gap-2">
                <Info
                  size={12}
                  className="text-term-accent shrink-0 mt-0.5"
                />

                <div className="font-mono text-[10px] text-term-secondary leading-relaxed">
                  Kotak Neo uses the current
                  Consumer Key + Mobile Number +
                  UCC + TOTP + MPIN authentication
                  flow.
                </div>
              </div>
            </div>
          )}


          {/* Actions */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-term-border">
            <div className="font-mono text-[9px] text-term-muted">
              {requiredCredentials.length} credential
              {requiredCredentials.length === 1
                ? ""
                : "s"} required
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-9 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-danger hover:text-term-danger disabled:opacity-40"
              >
                cancel
              </button>

              <button
                type="submit"
                data-testid={
                  BROKER_TEST_IDS.modalSubmit
                }
                disabled={
                  busy ||
                  !label.trim() ||
                  requiredCredentials.some(
                    (key) =>
                      !String(
                        credentials[key] ??
                          ""
                      ).trim()
                  )
                }
                className="h-9 px-4 bg-term-accent text-white font-mono text-[10px] uppercase disabled:opacity-40 flex items-center gap-2"
              >
                {busy ? (
                  <Loader2
                    size={12}
                    className="animate-spin"
                  />
                ) : (
                  <Plus size={12} />
                )}

                {busy
                  ? "saving..."
                  : "add account"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
                }

                      <td className="px-4 h-11">
                        {account.last_health ? (
                          <div>
                            <div
                              className={`font-mono text-[10px] ${
                                account.last_health.ok
                                  ? "text-term-success"
                                  : "text-term-danger"
                              }`}
                            >
                              {account.last_health.ok
                                ? "OK"
                                : "ERROR"}
                              {" · "}
                              {account.last_health.latency_ms ?? 0}ms
                            </div>

                            {account.last_health.detail && (
                              <div className="font-mono text-[9px] text-term-muted mt-0.5 max-w-[220px] truncate">
                                {account.last_health.detail}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-term-muted">
                            —
                          </span>
                        )}
                      </td>

                      <td className="px-4 h-11">
                        {account.is_primary ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 border border-term-success/40 text-term-success font-mono text-[9px] uppercase">
                            <Check size={9} />
                            YES
                          </span>
                        ) : (
                          <button
                            data-testid={BROKER_TEST_IDS.primary(
                              account.account_id
                            )}
                            onClick={() => doPrimary(account)}
                            disabled={makingPrimary}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase text-term-secondary hover:border-term-accent hover:text-term-accent disabled:opacity-40"
                          >
                            {makingPrimary ? (
                              <Loader2
                                size={10}
                                className="animate-spin"
                              />
                            ) : (
                              "set primary"
                            )}
                          </button>
                        )}
                      </td>

                      <td className="px-4 h-11">
                        <div className="flex items-center justify-end gap-1.5">
                          {account.status === "connected" ? (
                            <button
                              data-testid={BROKER_TEST_IDS.disconnect(
                                account.account_id
                              )}
                              onClick={() => doDisconnect(account)}
                              disabled={disconnecting}
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-warning hover:text-term-warning disabled:opacity-40 flex items-center gap-1"
                              title="Disconnect broker"
                            >
                              {disconnecting ? (
                                <Loader2
                                  size={10}
                                  className="animate-spin"
                                />
                              ) : (
                                <Radio size={10} />
                              )}
                              disconnect
                            </button>
                          ) : (
                            <button
                              data-testid={BROKER_TEST_IDS.connect(
                                account.account_id
                              )}
                              onClick={() => doConnect(account)}
                              disabled={connecting}
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-success hover:text-term-success disabled:opacity-40 flex items-center gap-1"
                              title="Connect broker"
                            >
                              {connecting ? (
                                <Loader2
                                  size={10}
                                  className="animate-spin"
                                />
                              ) : (
                                <Wifi size={10} />
                              )}
                              connect
                            </button>
                          )}

                          <button
                            data-testid={BROKER_TEST_IDS.test(
                              account.account_id
                            )}
                            onClick={() => doTest(account)}
                            disabled={testing}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1"
                            title="Test broker connection"
                          >
                            {testing ? (
                              <Loader2
                                size={10}
                                className="animate-spin"
                              />
                            ) : (
                              <Zap size={10} />
                            )}
                            test
                          </button>

                          <button
                            data-testid={BROKER_TEST_IDS.info(
                              account.account_id
                            )}
                            onClick={() => doInfo(account)}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1"
                            title="Account information"
                          >
                            <Info size={10} />
                            info
                          </button>

                          <button
                            data-testid={BROKER_TEST_IDS.remove(
                              account.account_id
                            )}
                            onClick={() => doRemove(account)}
                            disabled={removing}
                            className="h-7 w-7 border border-term-border font-mono text-[9px] hover:border-term-danger hover:text-term-danger disabled:opacity-40 flex items-center justify-center"
                            title="Remove broker account"
                          >
                            {removing ? (
                              <Loader2
                                size={10}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2 size={10} />
                            )}
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

        {accounts.length > 0 && (
          <div className="px-4 py-3 border-t border-term-border flex flex-wrap items-center gap-4">
            <span className="font-mono text-[9px] text-term-muted uppercase">
              status legend
            </span>

            <span className="font-mono text-[9px] text-term-success flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-term-success inline-block" />
              connected
            </span>

            <span className="font-mono text-[9px] text-term-muted flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-term-muted inline-block" />
              disconnected
            </span>

            <span className="font-mono text-[9px] text-term-danger flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-term-danger inline-block" />
              error
            </span>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Account information                                         */}
      {/* ------------------------------------------------------------ */}

      {infoAccount && (
        <section
          data-testid={BROKER_TEST_IDS.infoPanel}
          className="border border-term-border bg-term-surface"
        >
          <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border">
            <div>
              <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
                broker.account_info
              </div>

              <div className="font-display text-[13px] font-bold">
                Account Info — {infoAccount.label || "Unnamed account"}
              </div>

              <div className="font-mono text-[9px] text-term-muted mt-0.5">
                {infoAccount.plugin_id}
              </div>
            </div>

            <button
              data-testid={BROKER_TEST_IDS.infoClose}
              onClick={closeInfo}
              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1"
            >
              <X size={10} />
              close
            </button>
          </header>

          <div className="p-4">
            {infoLoading ? (
              <div className="flex items-center gap-2 font-mono text-[10px] text-term-muted">
                <Loader2
                  size={12}
                  className="animate-spin"
                />
                loading account information...
              </div>
            ) : infoData ? (
              <div className="space-y-3">
                <pre className="border border-term-border/60 bg-term-panel p-4 overflow-x-auto font-mono text-[10px] leading-5 text-term-secondary whitespace-pre-wrap break-words">
                  {JSON.stringify(
                    redactSensitiveInfo(infoData),
                    null,
                    2
                  )}
                </pre>

                <div className="font-mono text-[9px] text-term-muted flex items-center gap-1">
                  <ShieldCheck size={10} />
                  Credentials are encrypted and are never displayed here.
                </div>
              </div>
            ) : (
              <div className="font-mono text-[10px] text-term-muted">
                No account information returned.
              </div>
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Add account modal                                            */}
      {/* ------------------------------------------------------------ */}

      {modalPlugin && (
        <AddAccountModal
          plugin={modalPlugin}
          onClose={() => setModalPlugin(null)}
          onCreated={async () => {
            setModalPlugin(null);
            await load(true);
          }}
        />
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Summary cell                                                       */
/* ------------------------------------------------------------------ */

function SummaryCell({
  label,
  value,
  detail,
  valueClassName = "",
}) {
  return (
    <div className="border border-term-border bg-term-surface p-4">
      <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
        {label}
      </div>

      <div
        className={`font-display text-xl font-bold mt-1 truncate ${valueClassName}`}
      >
        {value}
      </div>

      <div className="font-mono text-[9px] text-term-muted mt-1 truncate">
        {detail}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Broker group                                                       */
/* ------------------------------------------------------------------ */

function BrokerGroup({
  title,
  plugins,
  onAdd,
}) {
  return (
    <div>
      <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider mb-2">
        {title}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {plugins.map((plugin) => (
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


/* ------------------------------------------------------------------ */
/* Broker card                                                        */
/* ------------------------------------------------------------------ */

function BrokerCard({
  plugin,
  onAdd,
}) {
  const meta =
    CATEGORY_META[plugin.category] ||
    DEFAULT_CATEGORY;

  const CategoryIcon = meta.icon;

  const credentials =
    Array.isArray(
      plugin.required_credentials
    )
      ? plugin.required_credentials
      : [];

  return (
    <div className="border border-term-border/60 bg-term-panel p-4 hover:border-term-border transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold truncate">
            {plugin.display_name ||
              plugin.plugin_id}
          </div>

          <div className="font-mono text-[9px] text-term-muted mt-1 truncate">
            {plugin.plugin_id}
            {" · "}
            v{plugin.version || "—"}
          </div>
        </div>

        <span
          className={`shrink-0 font-mono text-[8px] uppercase flex items-center gap-1 ${meta.className}`}
        >
          <CategoryIcon size={10} />
          {meta.label}
        </span>
      </div>

      <div className="mt-4 pt-3 border-t border-term-border/50 flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] text-term-muted">
          {credentials.length} credential
          {credentials.length === 1 ? "" : "s"}
        </span>

        <button
          data-testid={BROKER_TEST_IDS.addButton(
            plugin.plugin_id
          )}
          onClick={() => onAdd(plugin)}
          className="h-8 px-3 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1.5"
        >
          <Plus size={10} />
          add account
        </button>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Sensitive info redaction                                           */
/* ------------------------------------------------------------------ */

function redactSensitiveInfo(value) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      redactSensitiveInfo(item)
    );
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const output = {};

    Object.entries(value).forEach(
      ([key, item]) => {
        const normalized =
          String(key).toLowerCase();

        if (
          normalized.includes("password") ||
          normalized.includes("secret") ||
          normalized.includes("token") ||
          normalized.includes("api_key") ||
          normalized.includes("apikey") ||
          normalized.includes("mpin") ||
          normalized.includes("totp") ||
          normalized.includes("authorization") ||
          normalized.includes("credential")
        ) {
          output[key] = "[REDACTED]";
        } else {
          output[key] =
            redactSensitiveInfo(item);
        }
      }
    );

    return output;
  }

  return value;
                  }
  
