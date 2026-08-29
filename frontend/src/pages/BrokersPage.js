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
 * Owner Trading — Broker Manager
 *
 * Stable frontend contract for the broker-core backend.
 * The backend registry is the source of truth: only adapters registered
 * by backend/modules/broker_plugins/bootstrap.py are displayed.
 *
 * Current deployment: Kotak Neo only.
 * Future broker adapters can be enabled in backend bootstrap without
 * changing this page, provided they implement BrokerPluginBase and
 * expose safe plugin metadata.
 *
 * Credential policy:
 * - Credentials are sent only to the backend.
 * - Credentials are never written to localStorage/sessionStorage.
 * - Credential values are never rendered after submission.
 * - Account information is defensively redacted before display.
 */

const BROKER_TEST_IDS = {
  root: "brokers-page",
  refresh: "brokers-refresh",
  plugins: "brokers-plugins",
  accounts: "brokers-accounts",
  addButton: (pluginId) => `broker-add-${pluginId}`,
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

const CAPABILITY_LABELS = [
  ["account_info", "account"],
  ["funds", "funds"],
  ["market_data", "market"],
  ["order_place", "place"],
  ["order_modify", "modify"],
  ["order_cancel", "cancel"],
  ["order_status", "status"],
  ["positions", "positions"],
  ["holdings", "holdings"],
  ["trade_history", "history"],
];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
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

function displayCredentialLabel(key, labels) {
  return (
    labels?.[key] ||
    String(key || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function credentialInputType(key) {
  const normalized = String(key || "").toLowerCase();

  return normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("mpin") ||
    normalized.includes("totp")
    ? "password"
    : "text";
}

function credentialInputMode(key) {
  const normalized = String(key || "").toLowerCase();

  return normalized.includes("mobile") ||
    normalized.includes("phone") ||
    normalized.includes("totp") ||
    normalized.includes("mpin") ||
    normalized.includes("pin")
    ? "numeric"
    : "text";
}

function redactSensitiveInfo(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveInfo);
  }

  if (value !== null && typeof value === "object") {
    const output = {};

    Object.entries(value).forEach(([key, item]) => {
      const normalized = String(key).toLowerCase();

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
        output[key] = redactSensitiveInfo(item);
      }
    });

    return output;
  }

  return value;
}

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
    setBusyMap((current) => ({
      ...current,
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
      const [pluginResponse, accountResponse] =
        await Promise.all([
          api.get("/brokers/plugins"),
          api.get("/brokers/accounts"),
        ]);

      setPlugins(
        safeArray(pluginResponse?.data?.plugins)
      );

      setAccounts(
        safeArray(accountResponse?.data?.accounts)
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

  const doConnect = useCallback(
    async (account) => {
      const key =
        `connect:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } =
          await api.post(
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
            data?.detail ||
              "Broker connection failed"
          );
        }

        await load(true);
      } catch (error) {
        toast.error(
          formatApiError(error)
        );
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doDisconnect = useCallback(
    async (account) => {
      const key =
        `disconnect:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } =
          await api.post(
            `/brokers/accounts/${account.account_id}/disconnect`
          );

        if (data?.ok !== false) {
          toast.success(
            "Broker disconnected"
          );

          await load(true);
        } else {
          toast.error(
            data?.detail ||
              "Disconnect failed"
          );
        }
      } catch (error) {
        toast.error(
          formatApiError(error)
        );
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doTest = useCallback(
    async (account) => {
      const key =
        `test:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } =
          await api.post(
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
            data?.detail ||
              "Connection test failed"
          );
        }

        await load(true);
      } catch (error) {
        toast.error(
          formatApiError(error)
        );
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doPrimary = useCallback(
    async (account) => {
      const key =
        `primary:${account.account_id}`;

      if (
        busyMap[key] ||
        account.is_primary
      ) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } =
          await api.post(
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
        toast.error(
          formatApiError(error)
        );
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, load, setBusy]
  );

  const doRemove = useCallback(
    async (account) => {
      const key =
        `remove:${account.account_id}`;

      if (busyMap[key]) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete broker account "${account.label}"?\n\nThis removes the saved encrypted credentials and account record.`
        );

      if (!confirmed) {
        return;
      }

      setBusy(key, true);

      try {
        const { data } =
          await api.delete(
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
        toast.error(
          formatApiError(error)
        );
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
        const { data } =
          await api.get(
            `/brokers/accounts/${account.account_id}/info`
          );

        setInfoData(data);
      } catch (error) {
        toast.error(
          formatApiError(error)
        );

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

  const primaryAccount = useMemo(
    () =>
      accounts.find(
        (account) =>
          account.is_primary
      ),
    [accounts]
  );

  const connectedCount = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status ===
          "connected"
      ).length,
    [accounts]
  );

  const groupedPlugins = useMemo(() => {
    const indian =
      plugins.filter(
        (plugin) =>
          plugin.category ===
          "indian"
      );

    const forex =
      plugins.filter(
        (plugin) =>
          plugin.category ===
          "forex"
      );

    const other =
      plugins.filter(
        (plugin) =>
          plugin.category !==
            "indian" &&
          plugin.category !==
            "forex"
      );

    return {
      indian,
      forex,
      other,
    };
  }, [plugins]);

  return (
    <div
      data-testid={
        BROKER_TEST_IDS.root
      }
      className="p-4 md:p-6 space-y-6 max-w-[1500px]"
    >
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            // broker.core
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Broker Manager
          </h1>

          <p className="text-term-secondary text-[13px] mt-1 max-w-3xl">
            Manage registered broker adapters and authenticated trading
            accounts. Only backend-registered adapters are shown.
            Credentials are encrypted server-side and never returned
            to this UI.
          </p>
        </div>

        <button
          data-testid={
            BROKER_TEST_IDS.refresh
          }
          onClick={() =>
            load(true)
          }
          disabled={
            refreshing ||
            loading
          }
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCell
          label="Registered Brokers"
          value={
            plugins.length
          }
          detail="active runtime registry entries"
        />

        <SummaryCell
          label="Connected Accounts"
          value={
            connectedCount
          }
          detail={`of ${accounts.length} configured`}
          valueClassName={
            connectedCount
              ? "text-term-success"
              : ""
          }
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

      <section
        data-testid={
          BROKER_TEST_IDS.plugins
        }
        className="border border-term-border bg-term-surface"
      >
        <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border gap-3">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker.registry
            </div>

            <div className="font-display text-[13px] font-bold">
              Registered adapters
            </div>
          </div>

          <span className="font-mono text-[9px] text-term-muted uppercase">
            backend source of truth
          </span>
        </header>

        {loading ? (
          <div className="p-6 flex items-center gap-2 font-mono text-[11px] text-term-muted">
            <Loader2
              size={13}
              className="animate-spin"
            />
            loading broker registry...
          </div>
        ) : plugins.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            No broker adapter is currently registered.
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <BrokerGroup
              title="Indian brokers"
              plugins={
                groupedPlugins.indian
              }
              onAdd={
                setModalPlugin
              }
            />

            <BrokerGroup
              title="Forex brokers"
              plugins={
                groupedPlugins.forex
              }
              onAdd={
                setModalPlugin
              }
            />

            <BrokerGroup
              title="Other registered brokers"
              plugins={
                groupedPlugins.other
              }
              onAdd={
                setModalPlugin
              }
            />
          </div>
        )}
      </section>

      <section
        data-testid={
          BROKER_TEST_IDS.accounts
        }
        className="border border-term-border bg-term-surface"
      >
        <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker.accounts
            </div>

            <div className="font-display text-[13px] font-bold">
              Configured Accounts
            </div>
          </div>

          <span className="font-mono text-[10px] text-term-muted">
            {accounts.length} account
            {accounts.length ===
            1
              ? ""
              : "s"}
          </span>
        </header>
        {accounts.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            No accounts configured. Add an account from a registered
            broker above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[950px]">
              <thead className="border-b border-term-border bg-term-panel">
                <tr className="font-mono text-[10px] text-term-muted uppercase">
                  <th className="px-4 h-9">Label</th>
                  <th className="px-4 h-9">Broker</th>
                  <th className="px-4 h-9">Status</th>
                  <th className="px-4 h-9">Last Health</th>
                  <th className="px-4 h-9">Primary</th>
                  <th className="px-4 h-9 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {accounts.map((account) => {
                  const status = statusMeta(account.status);

                  const connecting =
                    busyMap[`connect:${account.account_id}`];

                  const disconnecting =
                    busyMap[`disconnect:${account.account_id}`];

                  const testing =
                    busyMap[`test:${account.account_id}`];

                  const makingPrimary =
                    busyMap[`primary:${account.account_id}`];

                  const removing =
                    busyMap[`remove:${account.account_id}`];

                  const health = account.last_health;

                  return (
                    <tr
                      key={account.account_id}
                      className="border-b border-term-border/50 hover:bg-term-hover/40"
                    >
                      <td className="px-4 h-12">
                        <div className="text-[12px] font-medium">
                          {account.label || "Unnamed account"}
                        </div>

                        {account.created_at && (
                          <div className="font-mono text-[9px] text-term-muted mt-0.5">
                            {account.created_at}
                          </div>
                        )}
                      </td>

                      <td className="px-4 h-12 font-mono text-[11px] text-term-secondary">
                        {account.plugin_id || "—"}
                      </td>

                      <td className="px-4 h-12">
                        <span
                          className={`font-mono text-[10px] uppercase ${status.className}`}
                        >
                          <span
                            className={`inline-block w-1.5 h-1.5 mr-1.5 ${status.dotClass}`}
                          />
                          {status.label}
                        </span>
                      </td>

                      <td className="px-4 h-12">
                        {health ? (
                          <div className="font-mono text-[10px]">
                            <div
                              className={
                                health.ok
                                  ? "text-term-success"
                                  : "text-term-danger"
                              }
                            >
                              {health.ok ? "OK" : "FAILED"}

                              {health.latency_ms !== undefined
                                ? ` · ${health.latency_ms}ms`
                                : ""}
                            </div>

                            {health.detail && (
                              <div className="text-term-secondary max-w-[260px] truncate">
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

                      <td className="px-4 h-12">
                        {account.is_primary ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase text-term-success">
                            <Check size={9} />
                            primary
                          </span>
                        ) : (
                          <button
                            data-testid={BROKER_TEST_IDS.primary(
                              account.account_id
                            )}
                            onClick={() => doPrimary(account)}
                            disabled={Boolean(makingPrimary)}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase text-term-secondary hover:border-term-accent hover:text-term-accent disabled:opacity-40"
                          >
                            {makingPrimary
                              ? "setting..."
                              : "set primary"}
                          </button>
                        )}
                      </td>

                      <td className="px-4 h-12">
                        <div className="flex items-center justify-end gap-1.5">
                          {account.status === "connected" ? (
                            <button
                              data-testid={BROKER_TEST_IDS.disconnect(
                                account.account_id
                              )}
                              onClick={() => doDisconnect(account)}
                              disabled={Boolean(disconnecting)}
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-warning hover:text-term-warning disabled:opacity-40 flex items-center gap-1"
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
                              disabled={Boolean(connecting)}
                              className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-success hover:text-term-success disabled:opacity-40 flex items-center gap-1"
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
                            disabled={Boolean(testing)}
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1"
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
                          >
                            <Info size={10} />
                            info
                          </button>

                          <button
                            data-testid={BROKER_TEST_IDS.remove(
                              account.account_id
                            )}
                            onClick={() => doRemove(account)}
                            disabled={Boolean(removing)}
                            className="h-7 w-7 border border-term-border font-mono text-[9px] hover:border-term-danger hover:text-term-danger disabled:opacity-40 flex items-center justify-center"
                            title="Remove account"
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
      </section>

      {infoAccount && (
        <AccountInfoModal
          account={infoAccount}
          data={infoData}
          loading={infoLoading}
          onClose={closeInfo}
        />
      )}

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
        title={String(value ?? "")}
      >
        {value}
      </div>

      <div className="font-mono text-[9px] text-term-secondary mt-1 truncate">
        {detail}
      </div>
    </div>
  );
}

function BrokerGroup({
  title,
  plugins,
  onAdd,
}) {
  if (!plugins.length) {
    return null;
  }

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

function BrokerCard({
  plugin,
  onAdd,
}) {
  const category =
    CATEGORY_META[plugin.category] ||
    DEFAULT_CATEGORY;

  const CategoryIcon = category.icon;

  const credentials =
    safeArray(plugin.required_credentials);

  const capabilities =
    safeObject(plugin.capabilities);

  const implementedCapabilities =
    CAPABILITY_LABELS.filter(
      ([key]) => capabilities[key] === true
    );

  return (
    <div className="border border-term-border bg-term-panel p-4 hover:border-term-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CategoryIcon
              size={13}
              className={category.className}
            />

            <div className="font-display text-[14px] font-bold truncate">
              {plugin.display_name ||
                plugin.plugin_id}
            </div>
          </div>

          <div className="font-mono text-[9px] text-term-muted mt-1 truncate">
            {plugin.plugin_id}
            {" · "}
            v{plugin.version || "—"}
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
            credentials
          </div>

          <div className="font-mono text-[10px] text-term-text mt-0.5">
            {credentials.length}
          </div>
        </div>

        <div className="border border-term-border/60 px-2 py-2">
          <div className="font-mono text-[8px] text-term-muted uppercase">
            capabilities
          </div>

          <div className="font-mono text-[10px] text-term-text mt-0.5">
            {implementedCapabilities.length}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="font-mono text-[8px] text-term-muted uppercase mb-1">
          implemented capabilities
        </div>

        {implementedCapabilities.length ? (
          <div className="flex flex-wrap gap-1">
            {implementedCapabilities.map(
              ([key, label]) => (
                <span
                  key={key}
                  className="border border-term-success/30 text-term-success px-1.5 py-0.5 font-mono text-[8px] uppercase"
                >
                  {label}
                </span>
              )
            )}
          </div>
        ) : (
          <span className="font-mono text-[9px] text-term-muted">
            connection/account lifecycle only
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="font-mono text-[8px] text-term-muted uppercase mb-1">
          required fields
        </div>

        {credentials.length ? (
          <div className="flex flex-wrap gap-1">
            {credentials.map((key) => (
              <span
                key={key}
                className="border border-term-border/60 px-1.5 py-0.5 font-mono text-[8px] text-term-secondary"
              >
                {displayCredentialLabel(
                  key,
                  plugin.credential_labels
                )}
              </span>
            ))}
          </div>
        ) : (
          <span className="font-mono text-[9px] text-term-muted">
            none
          </span>
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
function AddAccountModal({
  plugin,
  onClose,
  onCreated,
}) {
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState({});
  const [visible, setVisible] = useState({});
  const [busy, setBusy] = useState(false);

  const requiredCredentials = safeArray(
    plugin?.required_credentials
  );

  const credentialLabels = safeObject(
    plugin?.credential_labels
  );

  useEffect(() => {
    const initial = {};

    requiredCredentials.forEach((key) => {
      initial[key] = "";
    });

    setLabel("");
    setCredentials(initial);
    setVisible({});
  }, [plugin]);

  if (!plugin) {
    return null;
  }

  const updateCredential = (key, value) => {
    setCredentials((current) => ({
      ...current,
      [key]: value,
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

    if (missing.length) {
      toast.error(
        `Missing: ${missing
          .map((key) =>
            displayCredentialLabel(
              key,
              credentialLabels
            )
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
      toast.error(
        formatApiError(error)
      );
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
        onClick={() =>
          !busy && onClose?.()
        }
      />

      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto border border-term-border bg-term-surface shadow-2xl">
        <header className="min-h-12 px-4 py-3 border-b border-term-border flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker.accounts.new
            </div>

            <h2
              id="broker-add-modal-title"
              className="font-display text-[16px] font-bold mt-0.5"
            >
              Add{" "}
              {plugin.display_name ||
                plugin.plugin_id}
            </h2>

            <div className="font-mono text-[9px] text-term-muted mt-1">
              {plugin.plugin_id}
              {" · v"}
              {plugin.version || "—"}
            </div>
          </div>

          <button
            type="button"
            data-testid={
              BROKER_TEST_IDS.modalClose
            }
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="h-7 w-7 border border-term-border flex items-center justify-center hover:border-term-danger hover:text-term-danger disabled:opacity-40"
          >
            <X size={12} />
          </button>
        </header>

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
              Credentials are sent to the authenticated backend and
              encrypted server-side. They are never persisted in browser
              storage or returned to this UI.
            </div>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="p-4 space-y-4"
        >
          <div>
            <label
              htmlFor="broker-account-label"
              className="block font-mono text-[9px] text-term-muted uppercase mb-1.5"
            >
              Account Label
            </label>

            <input
              id="broker-account-label"
              data-testid={
                BROKER_TEST_IDS.modalLabel
              }
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

          <div className="space-y-3">
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker credentials
            </div>

            {requiredCredentials.length === 0 ? (
              <div className="border border-term-border/60 p-3 font-mono text-[10px] text-term-muted">
                This broker does not require additional credentials.
              </div>
            ) : (
              requiredCredentials.map((key) => {
                const secret =
                  credentialInputType(key) ===
                  "password";

                const isVisible =
                  Boolean(visible[key]);

                const labelText =
                  displayCredentialLabel(
                    key,
                    credentialLabels
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
                        data-testid={
                          BROKER_TEST_IDS.modalCredential(
                            key
                          )
                        }
                        type={
                          secret && !isVisible
                            ? "password"
                            : "text"
                        }
                        inputMode={credentialInputMode(
                          key
                        )}
                        autoComplete="off"
                        value={
                          credentials[key] ||
                          ""
                        }
                        onChange={(event) =>
                          updateCredential(
                            key,
                            event.target.value
                          )
                        }
                        disabled={busy}
                        placeholder={labelText}
                        className={`w-full h-9 ${
                          secret ? "pr-10" : ""
                        } px-3 bg-term-panel border border-term-border font-mono text-[11px] text-term-text focus:border-term-accent focus:outline-none disabled:opacity-50`}
                      />

                      {secret && (
                        <button
                          type="button"
                          onClick={() =>
                            setVisible(
                              (current) => ({
                                ...current,
                                [key]:
                                  !current[key],
                              })
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
                            <EyeOff size={12} />
                          ) : (
                            <Eye size={12} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {plugin.plugin_id === "kotak_neo" && (
            <div className="border border-term-accent/30 bg-term-accent/5 p-3">
              <div className="flex items-start gap-2">
                <Info
                  size={12}
                  className="text-term-accent shrink-0 mt-0.5"
                />

                <div className="font-mono text-[10px] text-term-secondary leading-relaxed">
                  Kotak Neo currently uses Consumer Key + Mobile Number +
                  UCC + TOTP + MPIN. Authentication is performed by the
                  backend Kotak adapter.
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-3 border-t border-term-border">
            <div className="font-mono text-[9px] text-term-muted">
              {requiredCredentials.length} credential
              {requiredCredentials.length === 1
                ? ""
                : "s"}{" "}
              required
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
                        credentials[key] ?? ""
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
function AccountInfoModal({
  account,
  data,
  loading,
  onClose,
}) {
  return (
    <div
      data-testid={BROKER_TEST_IDS.infoPanel}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="broker-info-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-term-border bg-term-surface shadow-2xl">
        <header className="min-h-12 px-4 py-3 border-b border-term-border flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              broker.account_info
            </div>

            <h2
              id="broker-info-modal-title"
              className="font-display text-[15px] font-bold mt-0.5"
            >
              {account?.label ||
                "Account information"}
            </h2>

            <div className="font-mono text-[9px] text-term-muted mt-1">
              {account?.plugin_id ||
                "—"}
            </div>
          </div>

          <button
            data-testid={
              BROKER_TEST_IDS.infoClose
            }
            onClick={onClose}
            className="h-7 w-7 border border-term-border flex items-center justify-center hover:border-term-accent hover:text-term-accent"
            aria-label="Close"
          >
            <X size={12} />
          </button>
        </header>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center gap-2 font-mono text-[10px] text-term-muted">
              <Loader2
                size={12}
                className="animate-spin"
              />
              loading account information...
            </div>
          ) : data ? (
            <div className="space-y-3">
              <pre className="border border-term-border/60 bg-term-panel p-4 overflow-x-auto font-mono text-[10px] leading-5 text-term-secondary whitespace-pre-wrap break-words">
                {JSON.stringify(
                  redactSensitiveInfo(data),
                  null,
                  2
                )}
              </pre>

              <div className="font-mono text-[9px] text-term-muted flex items-center gap-1">
                <ShieldCheck size={10} />
                Sensitive credential material is redacted.
              </div>
            </div>
          ) : (
            <div className="font-mono text-[10px] text-term-muted">
              No account information returned.
            </div>
          )}
        </div>
      </div>
    </div>
  );
        }
