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
 * Broker Manager
 *
 * The page consumes only the universal Broker Core API.
 *
 * Only adapters actually registered by the backend bootstrap layer
 * are displayed.
 *
 * Current deployment:
 *   Kotak Neo only.
 *
 * Future broker adapters:
 *   They automatically appear here when their validated adapter is
 *   registered by backend/modules/broker_plugins/bootstrap.py.
 */

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

function displayCredentialLabel(key, labels) {
  return (
    labels?.[key] ||
    String(key || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
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

  const load = useCallback(
    async (showRefreshState = false) => {
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
          safeArray(
            pluginResponse?.data?.plugins
          )
        );

        setAccounts(
          safeArray(
            accountResponse?.data?.accounts
          )
        );
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

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
