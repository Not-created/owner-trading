import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Grid,
  Loading,
  NumberInput,
  PageHeader,
  Panel,
  Section,
  Select,
  StatusBadge,
  Switch,
  Table,
  Toggle,
} from "../components/UI.jsx";
import { riskApi } from "../api.jsx";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getApiData,
  getErrorMessage,
  safeNumber,
} from "../utils.js";
import {
  useBrokerState,
  useEmergencyState,
} from "../context.jsx";

/* ============================================================
   RISK MANAGEMENT MODULE
   ------------------------------------------------------------
   Central risk-control UI:
   - account risk limits
   - daily loss
   - position limits
   - strategy exposure
   - order quantity
   - duplicate-order protection
   - funds / broker checks
   - SL / target / trailing settings
   - risk status and validation
   ------------------------------------------------------------
   IMPORTANT:
   Frontend yahan sirf configuration/status manage karta hai.
   Actual order blocking backend risk engine mein hona chahiye.
   ============================================================ */

const DEFAULT_FORM = {
  enabled: true,
  maxOrderQuantity: "",
  maxPositionQuantity: "",
  maxDailyLoss: "",
  maxDailyLossPercent: "",
  maxStrategyExposure: "",
  maxOpenPositions: "",
  maxTradesPerDay: "",
  stopLossPercent: "",
  targetPercent: "",
  trailingStopPercent: "",
  requireFundsCheck: true,
  requireBrokerConnection: true,
  preventDuplicateOrders: true,
  rejectInvalidQuantity: true,
  rejectInvalidPrice: true,
};

const RISK_TABS = [
  {
    id: "controls",
    label: "Risk Controls",
  },
  {
    id: "status",
    label: "Risk Status",
  },
  {
    id: "validation",
    label: "Validation",
  },
];

/* ============================================================
   GENERIC DATA HELPERS
   ------------------------------------------------------------
   Backend ke different naming conventions ko safely handle
   karne ke liye centralized helpers.
   ============================================================ */

function readValue(
  object,
  keys,
  fallback = null
) {
  if (
    !object ||
    typeof object !== "object"
  ) {
    return fallback;
  }

  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

function toBoolean(
  value,
  fallback = false
) {
  if (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === false ||
    value === "false" ||
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  return fallback;
}

function riskStatusValue(data) {
  return String(
    readValue(data, [
      "status",
      "risk_status",
      "riskStatus",
      "state",
    ]) || "UNKNOWN"
  ).toUpperCase();
}

function limitValue(
  data,
  keys
) {
  return readValue(data, keys);
}

/* ============================================================
   RISK CONFIG NORMALIZATION
   ------------------------------------------------------------
   Backend configuration ko UI form ke compatible structure mein
   convert karta hai.
   ============================================================ */

function normalizeRiskConfig(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return {
      ...DEFAULT_FORM,
    };
  }

  return {
    enabled: toBoolean(
      readValue(data, [
        "enabled",
        "risk_enabled",
        "riskEnabled",
      ]),
      true
    ),

    maxOrderQuantity:
      readValue(data, [
        "max_order_quantity",
        "maxOrderQuantity",
      ]) ?? "",

    maxPositionQuantity:
      readValue(data, [
        "max_position_quantity",
        "maxPositionQuantity",
        "max_position_size",
        "maxPositionSize",
      ]) ?? "",

    maxDailyLoss:
      readValue(data, [
        "max_daily_loss",
        "maxDailyLoss",
      ]) ?? "",

    maxDailyLossPercent:
      readValue(data, [
        "max_daily_loss_percent",
        "maxDailyLossPercent",
      ]) ?? "",

    maxStrategyExposure:
      readValue(data, [
        "max_strategy_exposure",
        "maxStrategyExposure",
      ]) ?? "",

    maxOpenPositions:
      readValue(data, [
        "max_open_positions",
        "maxOpenPositions",
      ]) ?? "",

    maxTradesPerDay:
      readValue(data, [
        "max_trades_per_day",
        "maxTradesPerDay",
      ]) ?? "",

    stopLossPercent:
      readValue(data, [
        "stop_loss_percent",
        "stopLossPercent",
      ]) ?? "",

    targetPercent:
      readValue(data, [
        "target_percent",
        "targetPercent",
      ]) ?? "",

    trailingStopPercent:
      readValue(data, [
        "trailing_stop_percent",
        "trailingStopPercent",
      ]) ?? "",

    requireFundsCheck: toBoolean(
      readValue(data, [
        "require_funds_check",
        "requireFundsCheck",
      ]),
      true
    ),

    requireBrokerConnection:
      toBoolean(
        readValue(data, [
          "require_broker_connection",
          "requireBrokerConnection",
        ]),
        true
      ),

    preventDuplicateOrders:
      toBoolean(
        readValue(data, [
          "prevent_duplicate_orders",
          "preventDuplicateOrders",
        ]),
        true
      ),

    rejectInvalidQuantity:
      toBoolean(
        readValue(data, [
          "reject_invalid_quantity",
          "rejectInvalidQuantity",
        ]),
        true
      ),

    rejectInvalidPrice:
      toBoolean(
        readValue(data, [
          "reject_invalid_price",
          "rejectInvalidPrice",
        ]),
        true
      ),
  };
}

/* ============================================================
   FORM VALIDATION
   ------------------------------------------------------------
   Invalid / negative risk values ko save karne se pehle reject
   karta hai.
   ============================================================ */

function validateRiskForm(form) {
  const numericFields = [
    [
      "maxOrderQuantity",
      "Maximum order quantity",
    ],
    [
      "maxPositionQuantity",
      "Maximum position quantity",
    ],
    [
      "maxDailyLoss",
      "Maximum daily loss",
    ],
    [
      "maxDailyLossPercent",
      "Maximum daily loss percentage",
    ],
    [
      "maxStrategyExposure",
      "Maximum strategy exposure",
    ],
    [
      "maxOpenPositions",
      "Maximum open positions",
    ],
    [
      "maxTradesPerDay",
      "Maximum trades per day",
    ],
    [
      "stopLossPercent",
      "Stop-loss percentage",
    ],
    [
      "targetPercent",
      "Target percentage",
    ],
    [
      "trailingStopPercent",
      "Trailing-stop percentage",
    ],
  ];

  for (const [field, label] of numericFields) {
    if (
      form[field] !== "" &&
      safeNumber(form[field], -1) < 0
    ) {
      return `${label} cannot be negative.`;
    }
  }

  if (
    form.maxDailyLossPercent !== "" &&
    safeNumber(
      form.maxDailyLossPercent,
      0
    ) > 100
  ) {
    return "Maximum daily loss percentage cannot exceed 100%.";
  }

  if (
    form.stopLossPercent !== "" &&
    safeNumber(
      form.stopLossPercent,
      0
    ) > 100
  ) {
    return "Stop-loss percentage cannot exceed 100%.";
  }

  if (
    form.targetPercent !== "" &&
    safeNumber(
      form.targetPercent,
      0
    ) > 100
  ) {
    return "Target percentage cannot exceed 100%.";
  }

  if (
    form.trailingStopPercent !== "" &&
    safeNumber(
      form.trailingStopPercent,
      0
    ) > 100
  ) {
    return "Trailing-stop percentage cannot exceed 100%.";
  }

  return "";
}

/* ============================================================
   RISK CHECK DISPLAY
   ------------------------------------------------------------
   Backend se returned individual risk checks ko consistent UI
   format mein convert karta hai.
   ============================================================ */

function normalizeChecks(data) {
  const raw = readValue(data, [
    "checks",
    "risk_checks",
    "riskChecks",
    "validations",
    "rules",
  ]);

  if (Array.isArray(raw)) {
    return raw;
  }

  if (
    raw &&
    typeof raw === "object"
  ) {
    return Object.entries(raw).map(
      ([name, result]) => ({
        name,
        ...(typeof result ===
        "object"
          ? result
          : {
              status: result,
            }),
      })
    );
  }

  return [];
}

/* ============================================================
   RISK STATUS CARD
   ------------------------------------------------------------
   Current backend risk engine state ka summary.
   ============================================================ */

function RiskStatusCard({
  status,
  loading,
}) {
  if (loading) {
    return (
      <Card>
        <Loading label="Loading risk status..." />
      </Card>
    );
  }

  const statusText =
    riskStatusValue(status);

  const enabled = toBoolean(
    readValue(status, [
      "enabled",
      "risk_enabled",
      "riskEnabled",
    ]),
    false
  );

  const blocked = toBoolean(
    readValue(status, [
      "blocked",
      "trading_blocked",
      "tradingBlocked",
    ]),
    false
  );

  const reason = readValue(
    status,
    [
      "reason",
      "block_reason",
      "blockReason",
      "message",
    ]
  );

  return (
    <Card>
      <div className="section-header">
        <div>
          <h3>
            Risk Engine Status
          </h3>

          <p className="muted">
            Current backend risk state.
          </p>
        </div>

        <StatusBadge
          status={
            blocked
              ? "BLOCKED"
              : statusText
          }
        />
      </div>

      <Grid columns={3}>
        <div>
          <div className="muted">
            Risk Engine
          </div>

          <strong>
            {enabled
              ? "Enabled"
              : "Disabled"}
          </strong>
        </div>

        <div>
          <div className="muted">
            Trading
          </div>

          <strong>
            {blocked
              ? "Blocked"
              : "Allowed"}
          </strong>
        </div>

        <div>
          <div className="muted">
            Reason
          </div>

          <strong>
            {reason ||
              "No blocking reason returned"}
          </strong>
        </div>
      </Grid>
    </Card>
  );
}

/* ============================================================
   MAIN RISK PAGE
   ============================================================ */

export default function Risk() {
  const {
    accounts,
    primaryAccount,
  } = useBrokerState();

  const {
    emergencyState,
  } = useEmergencyState();

  const [activeTab, setActiveTab] =
    useState("controls");

  const [selectedAccountId, setSelectedAccountId] =
    useState(
      primaryAccount?.id ||
        primaryAccount?.account_id ||
        ""
    );

  const [form, setForm] =
    useState({
      ...DEFAULT_FORM,
    });

  const [originalConfig, setOriginalConfig] =
    useState(null);

  const [riskStatus, setRiskStatus] =
    useState(null);

  const [validationResult, setValidationResult] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [loadingStatus, setLoadingStatus] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [validating, setValidating] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  /* ==========================================================
     EFFECTIVE ACCOUNT
     ----------------------------------------------------------
     Risk settings account-scoped hain. Primary account fallback
     sirf selection ke liye use hota hai.
     ========================================================== */

  const selectedAccount =
    useMemo(() => {
      const list = Array.isArray(
        accounts
      )
        ? accounts
        : [];

      if (
        selectedAccountId
      ) {
        const found =
          list.find(
            (account) =>
              String(
                readValue(
                  account,
                  [
                    "id",
                    "account_id",
                    "accountId",
                  ]
                )
              ) ===
              String(
                selectedAccountId
              )
          );

        if (found) {
          return found;
        }
      }

      return (
        primaryAccount ||
        list[0] ||
        null
      );
    }, [
      accounts,
      primaryAccount,
      selectedAccountId,
    ]);

  const effectiveAccountId =
    useMemo(
      () =>
        readValue(
          selectedAccount,
          [
            "id",
            "account_id",
            "accountId",
            "broker_account_id",
          ]
        ),
      [selectedAccount]
    );

  /* ==========================================================
     FORM UPDATE
     ========================================================== */

  const updateField = useCallback(
    (field, value) => {
      setForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    []
  );

  /* ==========================================================
     LOAD RISK CONFIG
     ----------------------------------------------------------
     Existing backend risk configuration ko load karta hai.
     ========================================================== */

  const loadConfig =
    useCallback(
      async () => {
        if (!effectiveAccountId) {
          setOriginalConfig(
            null
          );
          return;
        }

        setLoading(true);
        setError("");

        try {
          const method =
            typeof riskApi.get ===
            "function"
              ? riskApi.get.bind(
                  riskApi
                )
              : typeof riskApi.config ===
                "function"
              ? riskApi.config.bind(
                  riskApi
                )
              : typeof riskApi.getConfig ===
                "function"
              ? riskApi.getConfig.bind(
                  riskApi
                )
              : null;

          if (!method) {
            throw new Error(
              'Risk backend operation "get configuration" is not available in the API contract.'
            );
          }

          const response =
            await method(
              effectiveAccountId
            );

          const data =
            getApiData(
              response
            );

          const normalized =
            normalizeRiskConfig(
              data
            );

          setForm(
            normalized
          );

          setOriginalConfig(
            normalized
          );
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setLoading(false);
        }
      },
      [effectiveAccountId]
    );

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /* ==========================================================
     LOAD RISK STATUS
     ----------------------------------------------------------
     Current real risk-engine status ko backend se read karta hai.
     ========================================================== */

  const loadStatus =
    useCallback(
      async () => {
        if (!effectiveAccountId) {
          setRiskStatus(
            null
          );
          return;
        }

        setLoadingStatus(
          true
        );

        try {
          const method =
            typeof riskApi.status ===
            "function"
              ? riskApi.status.bind(
                  riskApi
                )
              : typeof riskApi.getStatus ===
                "function"
              ? riskApi.getStatus.bind(
                  riskApi
                )
              : null;

          if (!method) {
            throw new Error(
              'Risk backend operation "get status" is not available in the API contract.'
            );
          }

          const response =
            await method(
              effectiveAccountId
            );

          setRiskStatus(
            getApiData(
              response
            )
          );
        } catch (requestError) {
          setRiskStatus(
            {
              status:
                "ERROR",
              message:
                getErrorMessage(
                  requestError
                ),
            }
          );
        } finally {
          setLoadingStatus(
            false
          );
        }
      },
      [effectiveAccountId]
    );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /* ==========================================================
     SAVE RISK CONFIGURATION
     ----------------------------------------------------------
     Actual risk rules backend ko save karta hai.
     ========================================================== */

  const handleSave =
    async () => {
      setError("");
      setMessage("");

      const validationError =
        validateRiskForm(
          form
        );

      if (validationError) {
        setError(
          validationError
        );
        return;
      }

      if (!effectiveAccountId) {
        setError(
          "Select a broker account before saving risk controls."
        );
        return;
      }

      setSaving(true);

      try {
        const method =
          typeof riskApi.update ===
          "function"
            ? riskApi.update.bind(
                riskApi
              )
            : typeof riskApi.save ===
              "function"
            ? riskApi.save.bind(
                riskApi
              )
            : typeof riskApi.configure ===
              "function"
            ? riskApi.configure.bind(
                riskApi
              )
            : null;

        if (!method) {
          throw new Error(
            'Risk backend operation "save configuration" is not available in the API contract.'
          );
        }

        const payload = {
          accountId:
            effectiveAccountId,
          enabled:
            Boolean(
              form.enabled
            ),
          maxOrderQuantity:
            form.maxOrderQuantity ===
            ""
              ? null
              : safeNumber(
                  form.maxOrderQuantity,
                  0
                ),
          maxPositionQuantity:
            form.maxPositionQuantity ===
            ""
              ? null
              : safeNumber(
                  form.maxPositionQuantity,
                  0
                ),
          maxDailyLoss:
            form.maxDailyLoss ===
            ""
              ? null
              : safeNumber(
                  form.maxDailyLoss,
                  0
                ),
          maxDailyLossPercent:
            form.maxDailyLossPercent ===
            ""
              ? null
              : safeNumber(
                  form.maxDailyLossPercent,
                  0
                ),
          maxStrategyExposure:
            form.maxStrategyExposure ===
            ""
              ? null
              : safeNumber(
                  form.maxStrategyExposure,
                  0
                ),
          maxOpenPositions:
            form.maxOpenPositions ===
            ""
              ? null
              : safeNumber(
                  form.maxOpenPositions,
                  0
                ),
          maxTradesPerDay:
            form.maxTradesPerDay ===
            ""
              ? null
              : safeNumber(
                  form.maxTradesPerDay,
                  0
                ),
          stopLossPercent:
            form.stopLossPercent ===
            ""
              ? null
              : safeNumber(
                  form.stopLossPercent,
                  0
                ),
          targetPercent:
            form.targetPercent ===
            ""
              ? null
              : safeNumber(
                  form.targetPercent,
                  0
                ),
          trailingStopPercent:
            form.trailingStopPercent ===
            ""
              ? null
              : safeNumber(
                  form.trailingStopPercent,
                  0
                ),
          requireFundsCheck:
            Boolean(
              form.requireFundsCheck
            ),
          requireBrokerConnection:
            Boolean(
              form.requireBrokerConnection
            ),
          preventDuplicateOrders:
            Boolean(
              form.preventDuplicateOrders
            ),
          rejectInvalidQuantity:
            Boolean(
              form.rejectInvalidQuantity
            ),
          rejectInvalidPrice:
            Boolean(
              form.rejectInvalidPrice
            ),
        };

        const response =
          await method(
            effectiveAccountId,
            payload
          );

        const saved =
          getApiData(
            response
          );

        const normalized =
          normalizeRiskConfig(
            saved || payload
          );

        setForm(
          normalized
        );

        setOriginalConfig(
          normalized
        );

        setMessage(
          "Risk configuration saved successfully."
        );

        await loadStatus();
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setSaving(false);
      }
    };

  /* ==========================================================
     RISK VALIDATION TEST
     ----------------------------------------------------------
     Backend risk engine se validation request karta hai.
     Ye UI fake pass/fail create nahi karta.
     ========================================================== */

  const handleValidate =
    async () => {
      setError("");
      setMessage("");

      if (!effectiveAccountId) {
        setError(
          "Select a broker account before running risk validation."
        );
        return;
      }

      setValidating(
        true
      );

      try {
        const method =
          typeof riskApi.validate ===
          "function"
            ? riskApi.validate.bind(
                riskApi
              )
            : typeof riskApi.check ===
              "function"
            ? riskApi.check.bind(
                riskApi
              )
            : typeof riskApi.validateOrder ===
              "function"
            ? riskApi.validateOrder.bind(
                riskApi
              )
            : null;

        if (!method) {
          throw new Error(
            'Risk backend operation "validate" is not available in the API contract.'
          );
        }

        const response =
          await method(
            effectiveAccountId,
            {
              configuration:
                form,
            }
          );

        const result =
          getApiData(
            response
          );

        setValidationResult(
          result
        );

        setActiveTab(
          "validation"
        );
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setValidating(
          false
        );
      }
    };

  /* ==========================================================
     RESET UNSAVED CHANGES
     ========================================================== */

  const handleReset =
    () => {
      if (
        originalConfig
      ) {
        setForm({
          ...originalConfig,
        });
      } else {
        setForm({
          ...DEFAULT_FORM,
        });
      }

      setError("");
      setMessage("");
    };

  /* ==========================================================
     VALIDATION CHECKS
     ----------------------------------------------------------
     Backend ke actual check results ko table mein display karta hai.
     ========================================================== */

  const validationChecks =
    useMemo(
      () =>
        normalizeChecks(
          validationResult
        ),
      [validationResult]
    );

  const validationPassed =
    validationResult
      ? toBoolean(
          readValue(
            validationResult,
            [
              "valid",
              "passed",
              "allowed",
              "is_valid",
              "isValid",
            ]
          ),
          false
        )
      : null;

  /* ==========================================================
     STATUS METRICS
     ---------------------------------------------------------- */

  const statusMetrics =
    useMemo(() => {
      const data =
        riskStatus || {};

      return {
        dailyLoss:
          readValue(
            data,
            [
              "daily_loss",
              "dailyLoss",
              "current_daily_loss",
            ]
          ),

        dailyLossPercent:
          readValue(
            data,
            [
              "daily_loss_percent",
              "dailyLossPercent",
            ]
          ),

        openPositions:
          readValue(
            data,
            [
              "open_positions",
              "openPositions",
            ]
          ),

        tradesToday:
          readValue(
            data,
            [
              "trades_today",
              "tradesToday",
            ]
          ),

        exposure:
          readValue(
            data,
            [
              "strategy_exposure",
              "strategyExposure",
              "exposure",
            ]
          ),
      };
    }, [riskStatus]);

  return (
    <div className="page risk-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Risk Management"
        subtitle="Centralized controls that must be enforced before order submission"
        actions={
          <div className="row gap-sm">
            <Badge>
              RISK ENGINE
            </Badge>

            <Button
              variant="secondary"
              onClick={() => {
                loadConfig();
                loadStatus();
              }}
              loading={
                loading ||
                loadingStatus
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ======================================================
          ACCOUNT SELECTOR
          ====================================================== */}

      <Card>
        <Grid columns={3}>
          <Field
            label="Broker Account"
            required
          >
            <Select
              value={
                selectedAccountId
              }
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
                      : "No broker account available",
                },
                ...accounts.map(
                  (
                    account,
                    index
                  ) => {
                    const id =
                      readValue(
                        account,
                        [
                          "id",
                          "account_id",
                          "accountId",
                        ]
                      );

                    return {
                      value:
                        id !==
                          null &&
                        id !==
                          undefined
                          ? String(
                              id
                            )
                          : "",
                      label:
                        readValue(
                          account,
                          [
                            "name",
                            "account_name",
                            "accountName",
                            "ucc",
                          ]
                        ) ||
                        `Account ${
                          index +
                          1
                        }`,
                    };
                  }
                ),
              ]}
            />
          </Field>

          <div>
            <div className="muted">
              Selected Account
            </div>

            <strong>
              {readValue(
                selectedAccount,
                [
                  "name",
                  "account_name",
                  "accountName",
                  "ucc",
                ]
              ) ||
                "Not selected"}
            </strong>
          </div>

          <div>
            <div className="muted">
              Emergency State
            </div>

            <StatusBadge
              status={
                readValue(
                  emergencyState,
                  [
                    "active",
                    "enabled",
                    "status",
                  ]
                )
                  ? "ACTIVE"
                  : "NORMAL"
              }
            />
          </div>
        </Grid>
      </Card>

      {/* ======================================================
          GLOBAL ERROR / SUCCESS
          ====================================================== */}

      {error ? (
        <Alert
          variant="danger"
          title="Risk management error"
          message={error}
        />
      ) : null}

      {message ? (
        <Alert
          variant="success"
          title="Risk management"
          message={message}
        />
      ) : null}

      {/* ======================================================
          TOP RISK STATUS
          ====================================================== */}

      <RiskStatusCard
        status={
          riskStatus
        }
        loading={
          loadingStatus
        }
      />

      <Panel>
        {/* ====================================================
            RISK TABS
            ==================================================== */}

        <Tabs
          items={
            RISK_TABS
          }
          activeTab={
            activeTab
          }
          onChange={
            setActiveTab
          }
        />

        {/* ====================================================
            RISK CONTROLS
            ----------------------------------------------------
            Main risk configuration.
            ==================================================== */}

        {activeTab ===
        "controls" ? (
          <div className="stack gap-lg">
            {loading ? (
              <Loading
                label="Loading risk configuration..."
              />
            ) : (
              <>
                {/* ==================================================
                    MASTER RISK CONTROL
                    ================================================== */}

                <Card>
                  <Section
                    title="Master Risk Control"
                    description="Controls whether the account's configured risk engine is active."
                  >
                    <div className="row justify-between">
                      <div>
                        <strong>
                          Risk Engine
                        </strong>

                        <div className="muted">
                          When enabled, configured risk checks must be evaluated before order submission.
                        </div>
                      </div>

                      <Toggle
                        checked={
                          form.enabled
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "enabled",
                            value
                          )
                        }
                        label={
                          form.enabled
                            ? "Enabled"
                            : "Disabled"
                        }
                      />
                    </div>
                  </Section>
                </Card>

                {/* ==================================================
                    ORDER & POSITION LIMITS
                    ================================================== */}

                <Card>
                  <Section
                    title="Order & Position Limits"
                    description="Limits that protect against excessive order size and position size."
                  >
                    <Grid columns={3}>
                      <Field label="Max Order Quantity">
                        <NumberInput
                          value={
                            form.maxOrderQuantity
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxOrderQuantity",
                              event.target.value
                            )
                          }
                          min="0"
                          step="1"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Max Position Quantity">
                        <NumberInput
                          value={
                            form.maxPositionQuantity
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxPositionQuantity",
                              event.target.value
                            )
                          }
                          min="0"
                          step="1"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Max Open Positions">
                        <NumberInput
                          value={
                            form.maxOpenPositions
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxOpenPositions",
                              event.target.value
                            )
                          }
                          min="0"
                          step="1"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Max Trades Per Day">
                        <NumberInput
                          value={
                            form.maxTradesPerDay
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxTradesPerDay",
                              event.target.value
                            )
                          }
                          min="0"
                          step="1"
                          placeholder="Optional"
                        />
                      </Field>
                    </Grid>
                  </Section>
                </Card>

                {/* ==================================================
                    DAILY LOSS & EXPOSURE
                    ================================================== */}

                <Card>
                  <Section
                    title="Loss & Exposure Limits"
                    description="Account-level protection against excessive daily loss and strategy exposure."
                  >
                    <Grid columns={3}>
                      <Field label="Max Daily Loss">
                        <NumberInput
                          value={
                            form.maxDailyLoss
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxDailyLoss",
                              event.target.value
                            )
                          }
                          min="0"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Max Daily Loss %">
                        <NumberInput
                          value={
                            form.maxDailyLossPercent
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxDailyLossPercent",
                              event.target.value
                            )
                          }
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Max Strategy Exposure">
                        <NumberInput
                          value={
                            form.maxStrategyExposure
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "maxStrategyExposure",
                              event.target.value
                            )
                          }
                          min="0"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>
                    </Grid>
                  </Section>
                </Card>

                {/* ==================================================
                    SL / TARGET / TRAILING
                    ================================================== */}

                <Card>
                  <Section
                    title="Trade Protection"
                    description="Optional stop-loss, target and trailing-stop controls used by the risk/execution architecture."
                  >
                    <Grid columns={3}>
                      <Field label="Stop Loss %">
                        <NumberInput
                          value={
                            form.stopLossPercent
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "stopLossPercent",
                              event.target.value
                            )
                          }
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Target %">
                        <NumberInput
                          value={
                            form.targetPercent
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "targetPercent",
                              event.target.value
                            )
                          }
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>

                      <Field label="Trailing Stop %">
                        <NumberInput
                          value={
                            form.trailingStopPercent
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "trailingStopPercent",
                              event.target.value
                            )
                          }
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="Optional"
                        />
                      </Field>
                    </Grid>
                  </Section>
                </Card>

                {/* ==================================================
                    SAFETY CHECKS
                    ================================================== */}

                <Card>
                  <Section
                    title="Pre-Order Safety Checks"
                    description="These checks should be enforced by the backend before an order reaches the canonical Kotak order engine."
                  >
                    <div className="stack gap-md">
                      <Switch
                        checked={
                          form.requireFundsCheck
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "requireFundsCheck",
                            value
                          )
                        }
                        label="Require sufficient funds check"
                      />

                      <Switch
                        checked={
                          form.requireBrokerConnection
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "requireBrokerConnection",
                            value
                          )
                        }
                        label="Require broker connection check"
                      />

                      <Switch
                        checked={
                          form.preventDuplicateOrders
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "preventDuplicateOrders",
                            value
                          )
                        }
                        label="Prevent duplicate orders"
                      />

                      <Switch
                        checked={
                          form.rejectInvalidQuantity
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "rejectInvalidQuantity",
                            value
                          )
                        }
                        label="Reject invalid quantity"
                      />

                      <Switch
                        checked={
                          form.rejectInvalidPrice
                        }
                        onChange={(
                          value
                        ) =>
                          updateField(
                            "rejectInvalidPrice",
                            value
                          )
                        }
                        label="Reject invalid price"
                      />
                    </div>
                  </Section>
                </Card>

                {/* ==================================================
                    SAVE ACTIONS
                    ================================================== */}

                <div className="form-actions">
                  <Button
                    variant="secondary"
                    onClick={
                      handleReset
                    }
                    disabled={
                      saving
                    }
                  >
                    Reset Changes
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={
                      handleValidate
                    }
                    loading={
                      validating
                    }
                    disabled={
                      !effectiveAccountId
                    }
                  >
                    Validate Risk Configuration
                  </Button>

                  <Button
                    variant="primary"
                    onClick={
                      handleSave
                    }
                    loading={
                      saving
                    }
                    disabled={
                      !effectiveAccountId
                    }
                  >
                    Save Risk Controls
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* ====================================================
            CURRENT RISK STATUS
            ==================================================== */}

        {activeTab ===
        "status" ? (
          <div className="stack gap-lg">
            <RiskStatusCard
              status={
                riskStatus
              }
              loading={
                loadingStatus
              }
            />

            <Grid columns={5}>
              <Card>
                <div className="muted">
                  Daily Loss
                </div>

                <strong>
                  {statusMetrics.dailyLoss ===
                  null
                    ? "Unavailable"
                    : formatCurrency(
                        statusMetrics.dailyLoss
                      )}
                </strong>
              </Card>

              <Card>
                <div className="muted">
                  Daily Loss %
                </div>

                <strong>
                  {statusMetrics.dailyLossPercent ===
                  null
                    ? "Unavailable"
                    : formatPercent(
                        statusMetrics.dailyLossPercent
                      )}
                </strong>
              </Card>

              <Card>
                <div className="muted">
                  Open Positions
                </div>

                <strong>
                  {statusMetrics.openPositions ===
                  null
                    ? "Unavailable"
                    : formatNumber(
                        statusMetrics.openPositions
                      )}
                </strong>
              </Card>

              <Card>
                <div className="muted">
                  Trades Today
                </div>

                <strong>
                  {statusMetrics.tradesToday ===
                  null
                    ? "Unavailable"
                    : formatNumber(
                        statusMetrics.tradesToday
                      )}
                </strong>
              </Card>

              <Card>
                <div className="muted">
                  Exposure
                </div>

                <strong>
                  {statusMetrics.exposure ===
                  null
                    ? "Unavailable"
                    : formatCurrency(
                        statusMetrics.exposure
                      )}
                </strong>
              </Card>
            </Grid>

            <Alert
              variant="info"
              title="Risk enforcement"
              message="A risk rule is only protective if the backend enforces it before order submission. The frontend configuration screen must never be treated as the security boundary."
            />
          </div>
        ) : null}

        {/* ====================================================
            VALIDATION RESULT
            ==================================================== */}

        {activeTab ===
        "validation" ? (
          <div className="stack gap-lg">
            {!validationResult ? (
              <EmptyState
                title="No validation result"
                message="Run the backend risk validation to see the actual result."
              />
            ) : (
              <>
                <Card>
                  <div className="section-header">
                    <div>
                      <h2>
                        Risk Validation Result
                      </h2>

                      <p className="muted">
                        Result returned by the backend risk engine.
                      </p>
                    </div>

                    <StatusBadge
                      status={
                        validationPassed
                          ? "PASSED"
                          : "REJECTED"
                      }
                    />
                  </div>

                  <Grid columns={3}>
                    <div>
                      <div className="muted">
                        Result
                      </div>

                      <strong>
                        {validationPassed
                          ? "Allowed"
                          : "Rejected"}
                      </strong>
                    </div>

                    <div>
                      <div className="muted">
                        Reason
                      </div>

                      <strong>
                        {readValue(
                          validationResult,
                          [
                            "reason",
                            "message",
                            "rejection_reason",
                            "rejectionReason",
                          ]
                        ) ||
                          "No reason returned"}
                      </strong>
                    </div>

                    <div>
                      <div className="muted">
                        Checked At
                      </div>

                      <strong>
                        {readValue(
                          validationResult,
                          [
                            "checked_at",
                            "checkedAt",
                            "timestamp",
                          ]
                        ) ||
                          "Unavailable"}
                      </strong>
                    </div>
                  </Grid>
                </Card>

                <Card>
                  <div className="section-header">
                    <div>
                      <h3>
                        Individual Risk Checks
                      </h3>
                    </div>

                    <Badge>
                      {validationChecks.length} checks
                    </Badge>
                  </div>

                  {!validationChecks.length ? (
                    <EmptyState
                      title="Check details unavailable"
                      message="The backend did not return individual risk-check details."
                    />
                  ) : (
                    <Table
                      columns={[
                        {
                          key: "name",
                          label: "Check",
                          render: (
                            item
                          ) =>
                            readValue(
                              item,
                              [
                                "name",
                                "rule",
                                "check",
                                "type",
                              ]
                            ) ||
                            "Unnamed check",
                        },
                        {
                          key: "status",
                          label: "Status",
                          render: (
                            item
                          ) => {
                            const status =
                              String(
                                readValue(
                                  item,
                                  [
                                    "status",
                                    "state",
                                    "result",
                                  ]
                                ) ||
                                  "UNKNOWN"
                              ).toUpperCase();

                            return (
                              <StatusBadge
                                status={
                                  status
                                }
                              />
                            );
                          },
                        },
                        {
                          key: "message",
                          label: "Message",
                          render: (
                            item
                          ) =>
                            readValue(
                              item,
                              [
                                "message",
                                "reason",
                                "detail",
                                "details",
                              ]
                            ) ||
                            "—",
                        },
                      ]}
                      data={
                        validationChecks
                      }
                    />
                  )}
                </Card>
              </>
            )}
          </div>
        ) : null}
      </Panel>

      {/* ======================================================
          ARCHITECTURE SAFETY NOTICE
          ====================================================== */}

      <Alert
        variant="warning"
        title="Live trading safety boundary"
        message="Strategy Signal → Risk Validation → User Permission / Deployment State → Broker Account → Canonical Kotak Order Engine. Creating or backtesting a strategy must never place a live order automatically."
      />
    </div>
  );
}
