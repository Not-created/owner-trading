import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Grid,
  Input,
  Loading,
  Modal,
  NumberInput,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Textarea,
  Toggle,
} from "../components/UI.jsx";
import { useBrokerState } from "../context.jsx";
import { strategyApi } from "../api.jsx";
import {
  formatDateTime,
  formatNumber,
  getApiArray,
  getApiData,
  getErrorMessage,
  safeNumber,
} from "../utils.js";

/* ============================================================
   STRATEGY MODULE
   ------------------------------------------------------------
   Is page mein strategy creation, configuration, lifecycle,
   deployment aur execution monitoring ka complete frontend
   module rakha gaya hai.
   ============================================================ */

const STRATEGY_TABS = [
  { id: "strategies", label: "Strategies" },
  { id: "create", label: "Create Strategy" },
];

const INITIAL_STRATEGY = {
  name: "",
  description: "",
  symbol: "",
  exchange: "NSE",
  timeframe: "5m",
  product: "MIS",
  strategyType: "technical",
  entryCondition: "",
  exitCondition: "",
  stopLoss: "",
  target: "",
  trailingStop: "",
  maxTradesPerDay: "",
  maxPositionQuantity: "",
  capitalAllocation: "",
  enabled: true,
};

const TIMEFRAME_OPTIONS = [
  { value: "1m", label: "1 Minute" },
  { value: "3m", label: "3 Minutes" },
  { value: "5m", label: "5 Minutes" },
  { value: "10m", label: "10 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "30m", label: "30 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "1d", label: "1 Day" },
];

const STRATEGY_TYPE_OPTIONS = [
  { value: "technical", label: "Technical" },
  { value: "indicator", label: "Indicator Based" },
  { value: "price_action", label: "Price Action" },
  { value: "custom", label: "Custom" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "STOPPED", label: "Stopped" },
  { value: "RUNNING", label: "Running" },
  { value: "DEPLOYED", label: "Deployed" },
  { value: "ERROR", label: "Error" },
];

/* ============================================================
   COMMON DATA HELPERS
   ------------------------------------------------------------
   Backend response ke different naming conventions ko ek
   consistent frontend format mein read karne ke helpers.
   ============================================================ */

function value(record, keys, fallback = null) {
  if (!record || typeof record !== "object") {
    return fallback;
  }

  for (const key of keys) {
    if (
      record[key] !== undefined &&
      record[key] !== null &&
      record[key] !== ""
    ) {
      return record[key];
    }
  }

  return fallback;
}

function strategyId(strategy) {
  return value(strategy, [
    "id",
    "strategy_id",
    "strategyId",
  ]);
}

function strategyName(strategy) {
  return (
    value(strategy, [
      "name",
      "strategy_name",
      "strategyName",
      "title",
    ]) || "Unnamed Strategy"
  );
}

function strategyStatus(strategy) {
  return String(
    value(strategy, [
      "status",
      "state",
      "strategy_status",
      "strategyStatus",
    ]) || "unknown"
  ).toUpperCase();
}

function strategySymbol(strategy) {
  return (
    value(strategy, [
      "symbol",
      "tradingsymbol",
      "trading_symbol",
      "instrument",
    ]) || "—"
  );
}

function strategyTimeframe(strategy) {
  return (
    value(strategy, [
      "timeframe",
      "interval",
      "time_frame",
    ]) || "—"
  );
}

function strategyType(strategy) {
  return (
    value(strategy, [
      "strategy_type",
      "strategyType",
      "type",
    ]) || "—"
  );
}

function strategyUpdatedAt(strategy) {
  return value(strategy, [
    "updated_at",
    "updatedAt",
    "modified_at",
    "modifiedAt",
    "created_at",
    "createdAt",
  ]);
}

function isRunning(strategy) {
  return [
    "RUNNING",
    "ACTIVE",
    "LIVE",
  ].includes(strategyStatus(strategy));
}

function isDeployed(strategy) {
  return [
    "DEPLOYED",
    "RUNNING",
    "ACTIVE",
    "LIVE",
  ].includes(strategyStatus(strategy));
}

/* ============================================================
   STRATEGY FORM HELPERS
   ------------------------------------------------------------
   Create/Edit form ko backend payload mein convert karne
   ke liye centralized logic.
   ============================================================ */

function buildStrategyPayload(form, accountId) {
  const payload = {
    accountId,
    name: form.name.trim(),
    description: form.description.trim(),
    symbol: form.symbol.trim().toUpperCase(),
    exchange: form.exchange,
    timeframe: form.timeframe,
    product: form.product,
    strategyType: form.strategyType,
    entryCondition: form.entryCondition.trim(),
    exitCondition: form.exitCondition.trim(),
    enabled: Boolean(form.enabled),
  };

  if (form.stopLoss !== "") {
    payload.stopLoss = safeNumber(
      form.stopLoss,
      0
    );
  }

  if (form.target !== "") {
    payload.target = safeNumber(
      form.target,
      0
    );
  }

  if (form.trailingStop !== "") {
    payload.trailingStop = safeNumber(
      form.trailingStop,
      0
    );
  }

  if (form.maxTradesPerDay !== "") {
    payload.maxTradesPerDay = safeNumber(
      form.maxTradesPerDay,
      0
    );
  }

  if (form.maxPositionQuantity !== "") {
    payload.maxPositionQuantity = safeNumber(
      form.maxPositionQuantity,
      0
    );
  }

  if (form.capitalAllocation !== "") {
    payload.capitalAllocation = safeNumber(
      form.capitalAllocation,
      0
    );
  }

  return payload;
}

function validateStrategyForm(form, accountId) {
  if (!accountId) {
    return "Select a broker account before creating a strategy.";
  }

  if (!form.name.trim()) {
    return "Strategy name is required.";
  }

  if (!form.symbol.trim()) {
    return "Trading symbol is required.";
  }

  if (!form.entryCondition.trim()) {
    return "Entry condition is required.";
  }

  if (!form.exitCondition.trim()) {
    return "Exit condition is required.";
  }

  if (
    form.stopLoss !== "" &&
    safeNumber(form.stopLoss, 0) < 0
  ) {
    return "Stop-loss value cannot be negative.";
  }

  if (
    form.target !== "" &&
    safeNumber(form.target, 0) < 0
  ) {
    return "Target value cannot be negative.";
  }

  if (
    form.trailingStop !== "" &&
    safeNumber(form.trailingStop, 0) < 0
  ) {
    return "Trailing-stop value cannot be negative.";
  }

  if (
    form.maxTradesPerDay !== "" &&
    safeNumber(form.maxTradesPerDay, 0) <= 0
  ) {
    return "Maximum trades per day must be greater than zero.";
  }

  if (
    form.maxPositionQuantity !== "" &&
    safeNumber(form.maxPositionQuantity, 0) <= 0
  ) {
    return "Maximum position quantity must be greater than zero.";
  }

  if (
    form.capitalAllocation !== "" &&
    safeNumber(form.capitalAllocation, 0) <= 0
  ) {
    return "Capital allocation must be greater than zero.";
  }

  return "";
}

/* ============================================================
   EMPTY / TABLE COMPONENTS
   ------------------------------------------------------------
   Strategy list ke loading, error aur empty states.
   ============================================================ */

function StrategyTable({
  columns,
  rows,
  loading,
  error,
}) {
  if (loading) {
    return (
      <Loading label="Loading strategies..." />
    );
  }

  if (error) {
    return (
      <ErrorState message={error} />
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No strategies"
        message="No strategies were returned by the backend."
      />
    );
  }

  return (
    <Table
      columns={columns}
      data={rows}
    />
  );
}

/* ============================================================
   STRATEGY EDITOR
   ------------------------------------------------------------
   Strategy ki complete configuration yahin maintain hoti hai.
   ============================================================ */

function StrategyEditor({
  form,
  onChange,
  onSubmit,
  onReset,
  loading,
  submitLabel,
}) {
  return (
    <div className="stack gap-lg">
      <Card>
        <div className="section-header">
          <div>
            <h3>Basic Strategy Configuration</h3>
            <p className="muted">
              Strategy identity aur market instrument define karein.
            </p>
          </div>
        </div>

        <Grid columns={3}>
          <Field
            label="Strategy Name"
            required
          >
            <Input
              value={form.name}
              onChange={(event) =>
                onChange(
                  "name",
                  event.target.value
                )
              }
              placeholder="My Trading Strategy"
              disabled={loading}
            />
          </Field>

          <Field
            label="Trading Symbol"
            required
          >
            <Input
              value={form.symbol}
              onChange={(event) =>
                onChange(
                  "symbol",
                  event.target.value.toUpperCase()
                )
              }
              placeholder="RELIANCE"
              disabled={loading}
            />
          </Field>

          <Field label="Exchange">
            <Select
              value={form.exchange}
              onChange={(event) =>
                onChange(
                  "exchange",
                  event.target.value
                )
              }
              disabled={loading}
              options={[
                {
                  value: "NSE",
                  label: "NSE",
                },
                {
                  value: "BSE",
                  label: "BSE",
                },
              ]}
            />
          </Field>

          <Field label="Timeframe">
            <Select
              value={form.timeframe}
              onChange={(event) =>
                onChange(
                  "timeframe",
                  event.target.value
                )
              }
              disabled={loading}
              options={TIMEFRAME_OPTIONS}
            />
          </Field>

          <Field label="Strategy Type">
            <Select
              value={form.strategyType}
              onChange={(event) =>
                onChange(
                  "strategyType",
                  event.target.value
                )
              }
              disabled={loading}
              options={STRATEGY_TYPE_OPTIONS}
            />
          </Field>

          <Field label="Product">
            <Select
              value={form.product}
              onChange={(event) =>
                onChange(
                  "product",
                  event.target.value
                )
              }
              disabled={loading}
              options={[
                {
                  value: "MIS",
                  label: "MIS",
                },
                {
                  value: "CNC",
                  label: "CNC",
                },
                {
                  value: "NRML",
                  label: "NRML",
                },
              ]}
            />
          </Field>
        </Grid>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(event) =>
              onChange(
                "description",
                event.target.value
              )
            }
            placeholder="Describe the purpose and trading logic of this strategy."
            rows={4}
            disabled={loading}
          />
        </Field>
      </Card>

      <Card>
        <div className="section-header">
          <div>
            <h3>Entry & Exit Conditions</h3>
            <p className="muted">
              Backend strategy engine ke expected condition format ka use karein.
            </p>
          </div>
        </div>

        <div className="stack gap-md">
          <Field
            label="Entry Condition"
            required
          >
            <Textarea
              value={form.entryCondition}
              onChange={(event) =>
                onChange(
                  "entryCondition",
                  event.target.value
                )
              }
              placeholder="Example: RSI crosses above 30 AND price > EMA20"
              rows={5}
              disabled={loading}
            />
          </Field>

          <Field
            label="Exit Condition"
            required
          >
            <Textarea
              value={form.exitCondition}
              onChange={(event) =>
                onChange(
                  "exitCondition",
                  event.target.value
                )
              }
              placeholder="Example: RSI crosses below 70 OR price < EMA20"
              rows={5}
              disabled={loading}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="section-header">
          <div>
            <h3>Risk & Execution Parameters</h3>
            <p className="muted">
              Strategy-level limits. Global risk controls remain authoritative.
            </p>
          </div>
        </div>

        <Grid columns={3}>
          <Field
            label="Stop Loss"
            hint="Optional strategy-level value."
          >
            <NumberInput
              value={form.stopLoss}
              onChange={(event) =>
                onChange(
                  "stopLoss",
                  event.target.value
                )
              }
              min="0"
              step="0.01"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>

          <Field
            label="Target"
            hint="Optional strategy-level value."
          >
            <NumberInput
              value={form.target}
              onChange={(event) =>
                onChange(
                  "target",
                  event.target.value
                )
              }
              min="0"
              step="0.01"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>

          <Field
            label="Trailing Stop"
            hint="Optional."
          >
            <NumberInput
              value={form.trailingStop}
              onChange={(event) =>
                onChange(
                  "trailingStop",
                  event.target.value
                )
              }
              min="0"
              step="0.01"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>

          <Field
            label="Max Trades / Day"
            hint="Optional strategy limit."
          >
            <NumberInput
              value={form.maxTradesPerDay}
              onChange={(event) =>
                onChange(
                  "maxTradesPerDay",
                  event.target.value
                )
              }
              min="1"
              step="1"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>

          <Field
            label="Max Position Quantity"
            hint="Optional strategy limit."
          >
            <NumberInput
              value={form.maxPositionQuantity}
              onChange={(event) =>
                onChange(
                  "maxPositionQuantity",
                  event.target.value
                )
              }
              min="1"
              step="1"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>

          <Field
            label="Capital Allocation"
            hint="Optional monetary limit."
          >
            <NumberInput
              value={form.capitalAllocation}
              onChange={(event) =>
                onChange(
                  "capitalAllocation",
                  event.target.value
                )
              }
              min="0"
              step="0.01"
              placeholder="Optional"
              disabled={loading}
            />
          </Field>
        </Grid>

        <Toggle
          label="Strategy enabled"
          checked={Boolean(form.enabled)}
          onChange={(checked) =>
            onChange(
              "enabled",
              checked
            )
          }
          disabled={loading}
        />
      </Card>

      <div className="form-actions">
        <Button
          variant="secondary"
          onClick={onReset}
          disabled={loading}
        >
          Reset
        </Button>

        <Button
          variant="primary"
          onClick={onSubmit}
          loading={loading}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN STRATEGIES PAGE
   ------------------------------------------------------------
   Strategy lifecycle aur backend integration ka central page.
   ============================================================ */

export default function Strategies() {
  const {
    accounts,
    primaryAccount,
  } = useBrokerState();

  const [activeTab, setActiveTab] =
    useState("strategies");

  const [strategies, setStrategies] =
    useState([]);

  const [selectedStrategy, setSelectedStrategy] =
    useState(null);

  const [form, setForm] =
    useState(INITIAL_STRATEGY);

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [lifecycleAction, setLifecycleAction] =
    useState("");

  const [pageError, setPageError] =
    useState("");

  const [dataError, setDataError] =
    useState("");

  const [actionMessage, setActionMessage] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [showDeleteDialog, setShowDeleteDialog] =
    useState(false);

  const [showEditModal, setShowEditModal] =
    useState(false);

  const [selectedAccountId, setSelectedAccountId] =
    useState(
      primaryAccount?.id ||
        primaryAccount?.account_id ||
        ""
    );

  /* ==========================================================
     ACCOUNT SELECTION
     ----------------------------------------------------------
     Strategy execution ko selected broker account se connect
     rakha gaya hai.
     ========================================================== */

  const selectedAccount = useMemo(() => {
    const list = Array.isArray(accounts)
      ? accounts
      : [];

    if (selectedAccountId) {
      const found = list.find(
        (account) =>
          String(
            value(account, [
              "id",
              "account_id",
              "accountId",
            ])
          ) === String(selectedAccountId)
      );

      if (found) {
        return found;
      }
    }

    return primaryAccount || list[0] || null;
  }, [
    accounts,
    primaryAccount,
    selectedAccountId,
  ]);

  const effectiveAccountId = useMemo(
    () =>
      value(selectedAccount, [
        "id",
        "account_id",
        "accountId",
        "broker_account_id",
        "brokerAccountId",
      ]),
    [selectedAccount]
  );

  /* ==========================================================
     FORM STATE
     ----------------------------------------------------------
     Strategy editor ke fields ko centrally update karta hai.
     ========================================================== */

  const updateForm = useCallback(
    (field, nextValue) => {
      setForm((current) => ({
        ...current,
        [field]: nextValue,
      }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setForm(INITIAL_STRATEGY);
    setSelectedStrategy(null);
  }, []);

  /* ==========================================================
     LOAD STRATEGIES
     ----------------------------------------------------------
     Strategy list backend se load hoti hai. Frontend khud
     strategy status ya trading result generate nahi karta.
     ========================================================== */

  const loadStrategies = useCallback(
    async () => {
      setLoading(true);
      setDataError("");
      setPageError("");

      try {
        const response =
          await strategyApi.list({
            accountId:
              effectiveAccountId || undefined,
          });

        setStrategies(
          getApiArray(response)
        );
      } catch (error) {
        setDataError(
          getErrorMessage(error)
        );
      } finally {
        setLoading(false);
      }
    },
    [effectiveAccountId]
  );

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  /* ==========================================================
     FILTERED STRATEGIES
     ----------------------------------------------------------
     Search aur lifecycle status ke frontend filters.
     ========================================================== */

  const filteredStrategies = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return strategies.filter(
      (strategy) => {
        const name =
          strategyName(strategy)
            .toLowerCase();

        const symbol =
          strategySymbol(strategy)
            .toLowerCase();

        const status =
          strategyStatus(strategy);

        const matchesSearch =
          !query ||
          name.includes(query) ||
          symbol.includes(query);

        const matchesStatus =
          statusFilter === "ALL" ||
          status === statusFilter;

        return (
          matchesSearch &&
          matchesStatus
        );
      }
    );
  }, [
    strategies,
    search,
    statusFilter,
  ]);

  /* ==========================================================
     STRATEGY COUNTERS
     ----------------------------------------------------------
     Backend se received lifecycle state ka summary.
     ========================================================== */

  const strategyCounts = useMemo(
    () => ({
      total: strategies.length,
      running: strategies.filter(
        isRunning
      ).length,
      deployed: strategies.filter(
        isDeployed
      ).length,
      stopped: strategies.filter(
        (strategy) =>
          [
            "STOPPED",
            "DRAFT",
          ].includes(
            strategyStatus(strategy)
          )
      ).length,
    }),
    [strategies]
  );

  /* ==========================================================
     CREATE STRATEGY
     ----------------------------------------------------------
     New strategy backend mein create karta hai.
     ========================================================== */

  const handleCreate = async () => {
    setPageError("");
    setActionMessage("");

    const validationError =
      validateStrategyForm(
        form,
        effectiveAccountId
      );

    if (validationError) {
      setPageError(validationError);
      return;
    }

    setSaving(true);

    try {
      const payload =
        buildStrategyPayload(
          form,
          effectiveAccountId
        );

      const response =
        await strategyApi.create(
          payload
        );

      const created =
        getApiData(response);

      setActionMessage(
        `Strategy "${form.name.trim()}" created successfully.`
      );

      if (created) {
        setStrategies((current) => [
          created,
          ...current,
        ]);
      }

      resetForm();
      setActiveTab("strategies");

      await loadStrategies();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  };

  /* ==========================================================
     EDIT STRATEGY
     ----------------------------------------------------------
     Existing strategy configuration ko backend ke through
     update karta hai.
     ========================================================== */

  const openEdit = (strategy) => {
    setSelectedStrategy(strategy);

    setForm({
      name:
        value(strategy, [
          "name",
          "strategy_name",
          "strategyName",
        ]) || "",
      description:
        value(strategy, [
          "description",
        ]) || "",
      symbol:
        value(strategy, [
          "symbol",
          "tradingsymbol",
          "trading_symbol",
        ]) || "",
      exchange:
        value(strategy, [
          "exchange",
          "exchange_segment",
        ]) || "NSE",
      timeframe:
        value(strategy, [
          "timeframe",
          "interval",
        ]) || "5m",
      product:
        value(strategy, [
          "product",
          "product_type",
        ]) || "MIS",
      strategyType:
        value(strategy, [
          "strategy_type",
          "strategyType",
          "type",
        ]) || "technical",
      entryCondition:
        value(strategy, [
          "entry_condition",
          "entryCondition",
        ]) || "",
      exitCondition:
        value(strategy, [
          "exit_condition",
          "exitCondition",
        ]) || "",
      stopLoss:
        value(strategy, [
          "stop_loss",
          "stopLoss",
        ]) ?? "",
      target:
        value(strategy, [
          "target",
        ]) ?? "",
      trailingStop:
        value(strategy, [
          "trailing_stop",
          "trailingStop",
        ]) ?? "",
      maxTradesPerDay:
        value(strategy, [
          "max_trades_per_day",
          "maxTradesPerDay",
        ]) ?? "",
      maxPositionQuantity:
        value(strategy, [
          "max_position_quantity",
          "maxPositionQuantity",
        ]) ?? "",
      capitalAllocation:
        value(strategy, [
          "capital_allocation",
          "capitalAllocation",
        ]) ?? "",
      enabled:
        value(strategy, [
          "enabled",
          "is_enabled",
          "isEnabled",
        ], true) !== false,
    });

    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!selectedStrategy) {
      return;
    }

    const id = strategyId(
      selectedStrategy
    );

    if (!id) {
      setPageError(
        "Selected strategy has no valid strategy ID."
      );
      return;
    }

    const validationError =
      validateStrategyForm(
        form,
        effectiveAccountId
      );

    if (validationError) {
      setPageError(validationError);
      return;
    }

    setSaving(true);
    setPageError("");
    setActionMessage("");

    try {
      const payload =
        buildStrategyPayload(
          form,
          effectiveAccountId
        );

      const response =
        await strategyApi.update(
          id,
          payload
        );

      const updated =
        getApiData(response);

      if (updated) {
        setStrategies((current) =>
          current.map(
            (strategy) =>
              String(
                strategyId(strategy)
              ) === String(id)
                ? {
                    ...strategy,
                    ...updated,
                  }
                : strategy
          )
        );
      }

      setActionMessage(
        `Strategy "${form.name.trim()}" updated successfully.`
      );

      setShowEditModal(false);
      resetForm();

      await loadStrategies();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setSaving(false);
    }
  };

  /* ==========================================================
     DELETE STRATEGY
     ----------------------------------------------------------
     Strategy ko permanently remove karne se pehle explicit
     confirmation li jaati hai.
     ========================================================== */

  const handleDelete = async () => {
    if (!selectedStrategy) {
      return;
    }

    const id = strategyId(
      selectedStrategy
    );

    if (!id) {
      setPageError(
        "Selected strategy has no valid strategy ID."
      );
      setShowDeleteDialog(false);
      return;
    }

    setLifecycleAction("delete");
    setPageError("");
    setActionMessage("");

    try {
      await strategyApi.remove(id);

      setStrategies((current) =>
        current.filter(
          (strategy) =>
            String(
              strategyId(strategy)
            ) !== String(id)
        )
      );

      setActionMessage(
        `Strategy "${strategyName(
          selectedStrategy
        )}" deleted.`
      );

      setShowDeleteDialog(false);
      setSelectedStrategy(null);

      await loadStrategies();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setLifecycleAction("");
    }
  };

  /* ==========================================================
     STRATEGY LIFECYCLE
     ----------------------------------------------------------
     Start / Stop / Deploy actions backend strategy runtime ko
     control karte hain. Frontend fake running state nahi banata.
     ========================================================== */

  const runLifecycleAction = async (
    strategy,
    action
  ) => {
    const id = strategyId(strategy);

    if (!id) {
      setPageError(
        "Selected strategy has no valid strategy ID."
      );
      return;
    }

    if (!effectiveAccountId) {
      setPageError(
        "Select a broker account before controlling strategy execution."
      );
      return;
    }

    setLifecycleAction(
      `${action}:${id}`
    );

    setPageError("");
    setActionMessage("");

    try {
      let response;

      if (action === "deploy") {
        response =
          await strategyApi.deploy(
            id,
            {
              accountId:
                effectiveAccountId,
            }
          );
      } else if (action === "run") {
        response =
          await strategyApi.run(
            id,
            {
              accountId:
                effectiveAccountId,
            }
          );
      } else if (action === "stop") {
        response =
          await strategyApi.stop(
            id,
            {
              accountId:
                effectiveAccountId,
            }
          );
      } else {
        throw new Error(
          "Unsupported strategy lifecycle action."
        );
      }

      const result =
        getApiData(response);

      if (result) {
        setStrategies((current) =>
          current.map(
            (currentStrategy) =>
              String(
                strategyId(
                  currentStrategy
                )
              ) === String(id)
                ? {
                    ...currentStrategy,
                    ...result,
                  }
                : currentStrategy
          )
        );
      }

      const actionText =
        action === "deploy"
          ? "deployment"
          : action === "run"
          ? "start"
          : "stop";

      setActionMessage(
        `Strategy "${strategyName(
          strategy
        )}" ${actionText} request submitted.`
      );

      await loadStrategies();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setLifecycleAction("");
    }
  };

  /* ==========================================================
     STRATEGY TABLE
     ----------------------------------------------------------
     Strategy lifecycle controls aur status yahin display hote hain.
     ========================================================== */

  const columns = useMemo(
    () => [
      {
        key: "name",
        label: "Strategy",
        render: (strategy) => (
          <div>
            <strong>
              {strategyName(strategy)}
            </strong>

            <div className="muted text-xs">
              {strategyType(strategy)}
            </div>
          </div>
        ),
      },

      {
        key: "symbol",
        label: "Instrument",
        render: (strategy) => (
          <div>
            <strong>
              {strategySymbol(strategy)}
            </strong>

            <div className="muted text-xs">
              {value(strategy, [
                "exchange",
                "exchange_segment",
              ]) || "—"}
              {" · "}
              {strategyTimeframe(
                strategy
              )}
            </div>
          </div>
        ),
      },

      {
        key: "status",
        label: "Status",
        render: (strategy) => (
          <StatusBadge
            status={strategyStatus(
              strategy
            )}
          />
        ),
      },

      {
        key: "updated",
        label: "Updated",
        render: (strategy) =>
          formatDateTime(
            strategyUpdatedAt(
              strategy
            )
          ),
      },

      {
        key: "actions",
        label: "Actions",
        render: (strategy) => {
          const id =
            strategyId(strategy);

          const running =
            isRunning(strategy);

          const deployed =
            isDeployed(strategy);

          const actionBusy =
            lifecycleAction.endsWith(
              `:${id}`
            );

          return (
            <div className="row gap-xs">
              {!deployed ? (
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() =>
                    runLifecycleAction(
                      strategy,
                      "deploy"
                    )
                  }
                  loading={
                    lifecycleAction ===
                    `deploy:${id}`
                  }
                >
                  Deploy
                </Button>
              ) : null}

              {running ? (
                <Button
                  size="small"
                  variant="danger"
                  onClick={() =>
                    runLifecycleAction(
                      strategy,
                      "stop"
                    )
                  }
                  loading={
                    lifecycleAction ===
                    `stop:${id}`
                  }
                >
                  Stop
                </Button>
              ) : (
                <Button
                  size="small"
                  variant="success"
                  onClick={() =>
                    runLifecycleAction(
                      strategy,
                      "run"
                    )
                  }
                  loading={
                    lifecycleAction ===
                    `run:${id}`
                  }
                >
                  Run
                </Button>
              )}

              <Button
                size="small"
                variant="ghost"
                onClick={() =>
                  openEdit(strategy)
                }
                disabled={actionBusy}
              >
                Edit
              </Button>

              <Button
                size="small"
                variant="danger"
                onClick={() => {
                  setSelectedStrategy(
                    strategy
                  );
                  setShowDeleteDialog(
                    true
                  );
                }}
                disabled={
                  actionBusy ||
                  running
                }
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [lifecycleAction]
  );

  return (
    <div className="page strategies-page">
      {/* ======================================================
          PAGE HEADER
          ------------------------------------------------------
          Strategy module ka main title aur refresh/create controls.
          ====================================================== */}

      <PageHeader
        title="Strategies"
        subtitle="Create, configure, deploy and control automated strategies"
        actions={
          <div className="row gap-sm">
            <Badge>
              {strategyCounts.running} running
            </Badge>

            <Badge>
              {strategyCounts.deployed} deployed
            </Badge>

            <Button
              variant="secondary"
              onClick={loadStrategies}
              loading={loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ======================================================
          GLOBAL MESSAGES
          ------------------------------------------------------
          Backend/API actions ke success aur error messages.
          ====================================================== */}

      {pageError ? (
        <Alert
          variant="danger"
          title="Strategy operation failed"
          message={pageError}
        />
      ) : null}

      {actionMessage ? (
        <Alert
          variant="success"
          title="Strategy"
          message={actionMessage}
        />
      ) : null}

      {/* ======================================================
          STRATEGY SUMMARY
          ------------------------------------------------------
          Backend se available strategy lifecycle ka summary.
          ====================================================== */}

      <Grid
        columns={4}
        className="metrics-grid"
      >
        <Card className="metric-card">
          <div className="metric-card__label">
            Total Strategies
          </div>

          <div className="metric-card__value">
            {formatNumber(
              strategyCounts.total
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Running
          </div>

          <div className="metric-card__value">
            {formatNumber(
              strategyCounts.running
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Deployed
          </div>

          <div className="metric-card__value">
            {formatNumber(
              strategyCounts.deployed
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Stopped / Draft
          </div>

          <div className="metric-card__value">
            {formatNumber(
              strategyCounts.stopped
            )}
          </div>
        </Card>
      </Grid>

      {/* ======================================================
          MAIN STRATEGY TABS
          ------------------------------------------------------
          Strategy list aur creation workflow ko ek module mein
          maintain kiya gaya hai.
          ====================================================== */}

      <Panel>
        <Tabs
          items={STRATEGY_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* ====================================================
            STRATEGY LIST
            ----------------------------------------------------
            Existing strategies aur lifecycle controls.
            ==================================================== */}

        {activeTab === "strategies" ? (
          <div className="stack gap-lg">
            <Card>
              <Grid columns={3}>
                <Field label="Search">
                  <Input
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Strategy name or symbol"
                  />
                </Field>

                <Field label="Status">
                  <Select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value
                      )
                    }
                    options={
                      STATUS_OPTIONS
                    }
                  />
                </Field>

                <Field label="Broker Account">
                  <Select
                    value={selectedAccountId}
                    onChange={(event) =>
                      setSelectedAccountId(
                        event.target.value
                      )
                    }
                    options={[
                      {
                        value: "",
                        label:
                          accounts.length
                            ? "Select account"
                            : "No account",
                      },
                      ...accounts.map(
                        (
                          account,
                          index
                        ) => {
                          const id =
                            value(
                              account,
                              [
                                "id",
                                "account_id",
                                "accountId",
                              ]
                            );

                          return {
                            value:
                              id !== null &&
                              id !==
                                undefined
                                ? String(
                                    id
                                  )
                                : "",
                            label:
                              value(
                                account,
                                [
                                  "name",
                                  "account_name",
                                  "accountName",
                                  "ucc",
                                ]
                              ) ||
                              `Account ${
                                index + 1
                              }`,
                          };
                        }
                      ),
                    ]}
                  />
                </Field>
              </Grid>
            </Card>

            <StrategyTable
              columns={columns}
              rows={
                filteredStrategies
              }
              loading={loading}
              error={dataError}
            />
          </div>
        ) : null}

        {/* ====================================================
            CREATE STRATEGY
            ----------------------------------------------------
            New strategy configuration.
            ==================================================== */}

        {activeTab === "create" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Create Strategy</h2>
                <p className="muted">
                  Configure the strategy once, then send it to the
                  backend strategy engine.
                </p>
              </div>

              <Badge>
                {effectiveAccountId
                  ? "Account selected"
                  : "Account required"}
              </Badge>
            </div>

            {!effectiveAccountId ? (
              <Alert
                variant="warning"
                title="Broker account required"
                message="Select a Kotak Neo account before creating a strategy."
              />
            ) : null}

            <StrategyEditor
              form={form}
              onChange={updateForm}
              onSubmit={handleCreate}
              onReset={resetForm}
              loading={saving}
              submitLabel="Create Strategy"
            />
          </div>
        ) : null}
      </Panel>

      {/* ======================================================
          EDIT STRATEGY MODAL
          ------------------------------------------------------
          Existing strategy ko modify karne ka centralized UI.
          ====================================================== */}

      <Modal
        open={showEditModal}
        onClose={() => {
          if (!saving) {
            setShowEditModal(false);
            setSelectedStrategy(null);
          }
        }}
        title="Edit Strategy"
        size="large"
      >
        <StrategyEditor
          form={form}
          onChange={updateForm}
          onSubmit={handleEdit}
          onReset={() => {
            setShowEditModal(false);
            resetForm();
          }}
          loading={saving}
          submitLabel="Save Strategy"
        />
      </Modal>

      {/* ======================================================
          DELETE CONFIRMATION
          ------------------------------------------------------
          Running strategy ko accidentally delete hone se rokne
          ke liye lifecycle safety check.
          ====================================================== */}

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete Strategy"
        message={
          selectedStrategy
            ? `Delete "${strategyName(
                selectedStrategy
              )}" permanently? This action cannot be undone.`
            : "Delete this strategy?"
        }
        confirmLabel="Delete Strategy"
        cancelLabel="Keep Strategy"
        variant="danger"
        loading={
          lifecycleAction === "delete"
        }
        onConfirm={handleDelete}
        onCancel={() => {
          if (
            lifecycleAction !==
            "delete"
          ) {
            setShowDeleteDialog(
              false
            );
            setSelectedStrategy(
              null
            );
          }
        }}
      />
    </div>
  );
}
