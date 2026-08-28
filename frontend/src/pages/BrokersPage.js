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
          await load(true);
        } else {
          toast.error(data?.detail || "Broker connection failed");
          await load(true);
        }
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
          toast.error(data?.detail || "Disconnect failed");
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
          toast.error(data?.detail || "Connection test failed");
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
          toast.success(`Primary broker set to "${account.label}"`);
          await load(true);
        } else {
          toast.error(data?.detail || "Unable to set primary broker");
        }
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [account, busyMap, load, setBusy]
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
          toast.success(`Removed "${account.label}"`);
          await load(true);

          if (infoAccount?.account_id === account.account_id) {
            setInfoAccount(null);
            setInfoData(null);
          }
        } else {
          toast.error(data?.detail || "Unable to remove account");
        }
      } catch (error) {
        toast.error(formatApiError(error));
      } finally {
        setBusy(key, false);
      }
    },
    [busyMap, infoAccount, load, setBusy]
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
    () => plugins.filter((plugin) => plugin.category === "indian"),
    [plugins]
  );

  const forex = useMemo(
    () => plugins.filter((plugin) => plugin.category === "forex"),
    [plugins]
  );

  const other = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.category !== "indian" && plugin.category !== "forex"
      ),
    [plugins]
  );

  const primaryAccount = useMemo(
    () => accounts.find((account) => account.is_primary),
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
            Connect real broker accounts. Credentials are encrypted
            server-side and never exposed to the frontend after submission.
          </p>
        </div>

        <button
          data-testid={BROKER_TEST_IDS.refresh}
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="h-8 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center justify-center gap-2 self-start md:self-auto"
        >
          {refreshing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {refreshing ? "refreshing..." : "refresh"}
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
          value={accounts.filter(
            (account) => account.status === "connected"
          ).length}
          detail={`of ${accounts.length} configured`}
        />

        <SummaryCell
          label="Primary Broker"
          value={primaryAccount?.label || "NONE"}
          detail={
            primaryAccount?.plugin_id
              ? primaryAccount.plugin_id
              : "select an account below"
          }
          valueClassName={primaryAccount ? "text-term-success" : ""}
        />
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Broker registry                                               */}
      {/* ------------------------------------------------------------ */}

      <section
        data-testid={BROKER_TEST_IDS.plugins}
        className="border border-term-border bg-term-surface"
      >
        <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border">
          <div className="font-display text-[13px] font-bold">
            Brokers
          </div>

          <span className="font-mono text-[10px] text-term-muted">
            {plugins.length} registered
          </span>
        </header>

        {loading ? (
          <div className="p-6 flex items-center gap-2 font-mono text-[11px] text-term-muted">
            <Loader2 size={13} className="animate-spin" />
            loading broker registry...
          </div>
        ) : plugins.length === 0 ? (
          <div className="p-6 font-mono text-[11px] text-term-muted">
            No broker plugins are currently registered.
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {indian.length > 0 && (
              <BrokerGroup
                title="Indian Brokers"
                plugins={indian}
                onAdd={setModalPlugin}
              />
            )}

            {forex.length > 0 && (
              <BrokerGroup
                title="Forex Brokers"
                plugins={forex}
                onAdd={setModalPlugin}
              />
            )}

            {other.length > 0 && (
              <BrokerGroup
                title="Other Brokers"
                plugins={other}
                onAdd={setModalPlugin}
              />
            )}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Accounts                                                      */}
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
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
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

                  return (
                    <tr
                      key={account.account_id}
                      className="border-b border-term-border/50 hover:bg-term-surface_hover/40"
                    >
                      <td className="px-4 h-11">
                        <div className="text-[12px] font-medium">
                          {account.label || "Unnamed account"}
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

<td className="px-4

h-11 max-w-[280px]">

{account.last_health ? (

<div

className="font-mono text [10px]">

<div

className={

account.last_health.ok

"text-term-success"

"text-term-danger"

}

>

?

{account.last_health.ok? "OK" : "FAILED"}

{typeof

account.last_health.latency_ms ===

"number"

?$

{account.last_health.latency_ms}ms`

: ""}

</div>

{account.last_health.detail && (

<div

className="text-term-muted truncate"

title={account.last_health.detail}

>

{account.last_health.detail}

</div>

)}

</div>):(

<span

className="font-mono text-[10px]

text-term-muted">

</span>

)}

</td>

<td className="px-4

h-11">

{account.is_primary? (

<span

className="inline-flex items-center gap-1

font-mono text [10px] text-term-success

uppercase">

<Check

size={11} />

yes

</span>

):(

<button

data-testid={BROKER_TEST_IDS.primary(

account.account_id

)}

onClick={() =>

doPrimary(account)}

disabled={makingPrimary}

className="font-mono text [10px]

text-term-muted hover: text-term-accent

underline disabled: opacity-40"

{makingPrimary

?

"setting..."
: "make

primary"}

LTE

34

</button>

)}

</td>

<td className="px-4

h-11 text-right">

<div

className="inline-flex gap-1 flex-wrap

justify-end">

{account.status

=== "connected" ? (

<ActionButton

testId={BROKER_TEST_IDS.disconnect(

account.account_id

)}

onClick={()

=> doDisconnect (account)}

disabled={disconnecting}

icon={

disconnecting ? (

<Loader2

/>

size={10}

className="animate-spin"

):(

<Radio

size={10} />

)

}

label={

disconnecting
 
