import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Grid,
  Loading,
  PageHeader,
  Panel,
  Section,
  Select,
  StatusBadge,
  Switch,
  Table,
  Tabs,
} from "../components/UI.jsx";
import { ownerControlApi } from "../api.jsx";
import {
  formatDateTime,
  formatNumber,
  getApiArray,
  getApiData,
  getErrorMessage,
} from "../utils.js";
import {
  useBrokerState,
  useEmergencyState,
} from "../context.jsx";

/* ============================================================
   OWNER CONTROL MODULE
   ------------------------------------------------------------
   Central owner-level trading controls:
   - master kill switch
   - trading enable/disable
   - strategy enable/disable
   - order enable/disable
   - cancel all orders
   - square-off all positions
   - emergency exit
   - current control status
   - action history
   ------------------------------------------------------------
   IMPORTANT:
   Destructive actions are backend operations. The frontend never
   pretends an action succeeded without a backend response.
   ============================================================ */

const TABS = [
  {
    id: "controls",
    label: "Controls",
  },
  {
    id: "status",
    label: "System Status",
  },
  {
    id: "history",
    label: "Action History",
  },
];

const CONTROL_KEYS = {
  MASTER: "masterTrading",
  STRATEGY: "strategyTrading",
  ORDERS: "orderTrading",
};

/* ============================================================
   GENERIC DATA HELPERS
   ------------------------------------------------------------
   Backend response ke possible field names ko centrally handle
   karta hai.
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

function controlId(item) {
  return readValue(item, [
    "id",
    "action_id",
    "actionId",
    "event_id",
    "eventId",
  ]);
}

function controlTimestamp(item) {
  return readValue(item, [
    "created_at",
    "createdAt",
    "timestamp",
    "executed_at",
    "executedAt",
  ]);
}

/* ============================================================
   CONTROL STATE NORMALIZATION
   ------------------------------------------------------------
   Backend ke master/system control state ko predictable UI
   structure mein convert karta hai.
   ============================================================ */

function normalizeControlState(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return {
      masterTrading: false,
      strategyTrading: false,
      orderTrading: false,
      killSwitch: false,
      emergency: false,
      status: "UNKNOWN",
      reason: null,
      updatedAt: null,
    };
  }

  return {
    masterTrading: toBoolean(
      readValue(data, [
        "trading_enabled",
        "tradingEnabled",
        "master_trading_enabled",
        "masterTradingEnabled",
        "enabled",
      ]),
      false
    ),

    strategyTrading: toBoolean(
      readValue(data, [
        "strategy_enabled",
        "strategyEnabled",
        "strategy_trading_enabled",
        "strategyTradingEnabled",
      ]),
      false
    ),

    orderTrading: toBoolean(
      readValue(data, [
        "orders_enabled",
        "ordersEnabled",
        "order_trading_enabled",
        "orderTradingEnabled",
      ]),
      false
    ),

    killSwitch: toBoolean(
      readValue(data, [
        "kill_switch",
        "killSwitch",
        "kill_switch_active",
        "killSwitchActive",
      ]),
      false
    ),

    emergency: toBoolean(
      readValue(data, [
        "emergency",
        "emergency_active",
        "emergencyActive",
      ]),
      false
    ),

    status: String(
      readValue(data, [
        "status",
        "state",
      ]) || "UNKNOWN"
    ).toUpperCase(),

    reason: readValue(data, [
      "reason",
      "message",
      "block_reason",
      "blockReason",
    ]),

    updatedAt: readValue(data, [
      "updated_at",
      "updatedAt",
      "timestamp",
    ]),
  };
}

/* ============================================================
   API OPERATION RESOLUTION
   ------------------------------------------------------------
   Existing centralized ownerControlApi ko use karta hai.
   Required backend operation available na ho to fake action
   perform nahi hota.
   ============================================================ */

function getApiMethod(
  names,
  operation
) {
  for (const name of names) {
    if (
      typeof ownerControlApi?.[
        name
      ] === "function"
    ) {
      return ownerControlApi[
        name
      ].bind(ownerControlApi);
    }
  }

  throw new Error(
    `Owner control operation "${operation}" is not available in the API contract.`
  );
}

/* ============================================================
   CONFIRMATION COPY
   ------------------------------------------------------------
   Destructive operation ke liye clear warning.
   ============================================================ */

const ACTION_META = {
  killSwitch: {
    title:
      "Activate Master Kill Switch?",
    message:
      "This can block further trading at the backend level. Use this only when you intentionally want trading disabled.",
    confirm:
      "Activate Kill Switch",
  },

  enableTrading: {
    title:
      "Enable Trading?",
    message:
      "This changes the owner-level trading permission. It does not itself place an order.",
    confirm:
      "Enable Trading",
  },

  disableTrading: {
    title:
      "Disable Trading?",
    message:
      "This disables owner-level trading permission and should prevent new live trading actions.",
    confirm:
      "Disable Trading",
  },

  enableStrategies: {
    title:
      "Enable Strategy Trading?",
    message:
      "This permits strategy execution only if all other backend deployment and risk conditions also allow it.",
    confirm:
      "Enable Strategies",
  },

  disableStrategies: {
    title:
      "Disable Strategy Trading?",
    message:
      "This disables strategy execution at the owner-control level.",
    confirm:
      "Disable Strategies",
  },

  enableOrders: {
    title:
      "Enable Order Submission?",
    message:
      "This permits order submission only after backend authentication and risk validation.",
    confirm:
      "Enable Orders",
  },

  disableOrders: {
    title:
      "Disable Order Submission?",
    message:
      "This disables new order submission at the owner-control level.",
    confirm:
      "Disable Orders",
  },

  cancelAll: {
    title:
      "Cancel All Open Orders?",
    message:
      "This is a live broker action. Every cancellable open order for the selected account may be sent to the broker cancellation flow.",
    confirm:
      "Cancel All Orders",
  },

  squareOffAll: {
    title:
      "Square Off All Positions?",
    message:
      "This is a live trading action. It may submit exit orders for open positions. Review the account carefully before proceeding.",
    confirm:
      "Square Off All",
  },

  emergencyExit: {
    title:
      "Execute Emergency Exit?",
    message:
      "This is the strongest emergency action. It may disable trading and initiate cancellation/square-off according to the backend emergency procedure.",
    confirm:
      "Execute Emergency Exit",
  },
};

/* ============================================================
   MAIN OWNER CONTROL PAGE
   ============================================================ */

export default function OwnerControl() {
  const {
    accounts,
    primaryAccount,
  } = useBrokerState();

  const {
    emergencyState,
    setEmergencyState,
  } = useEmergencyState();

  const [activeTab, setActiveTab] =
    useState("controls");

  const [selectedAccountId, setSelectedAccountId] =
    useState(
      primaryAccount?.id ||
        primaryAccount?.account_id ||
        ""
    );

  const [controlState, setControlState] =
    useState(null);

  const [history, setHistory] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [loadingHistory, setLoadingHistory] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState("");

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [pendingAction, setPendingAction] =
    useState(null);

  /* ==========================================================
     ACCOUNT SELECTION
     ----------------------------------------------------------
     Owner actions ko selected broker account ke context mein
     execute karta hai.
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
     LOAD OWNER CONTROL STATE
     ----------------------------------------------------------
     Current backend control state.
     ========================================================== */

  const loadStatus =
    useCallback(
      async () => {
        if (!effectiveAccountId) {
          setControlState(
            null
          );
          return;
        }

        setLoading(true);
        setError("");

        try {
          const method =
            getApiMethod(
              [
                "status",
                "getStatus",
                "get",
              ],
              "get control status"
            );

          const response =
            await method(
              effectiveAccountId
            );

          const data =
            getApiData(
              response
            );

          const normalized =
            normalizeControlState(
              data
            );

          setControlState(
            normalized
          );

          /*
           * Global emergency state ko backend state ke saath sync
           * rakha jaata hai. No frontend-only emergency claim.
           */
          setEmergencyState(
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
      [
        effectiveAccountId,
        setEmergencyState,
      ]
    );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /* ==========================================================
     LOAD ACTION HISTORY
     ----------------------------------------------------------
     Owner-control actions ke actual backend audit records.
     ========================================================== */

  const loadHistory =
    useCallback(
      async () => {
        if (!effectiveAccountId) {
          setHistory([]);
          return;
        }

        setLoadingHistory(
          true
        );

        try {
          const method =
            getApiMethod(
              [
                "history",
                "listHistory",
                "actions",
              ],
              "get action history"
            );

          const response =
            await method(
              effectiveAccountId
            );

          setHistory(
            getApiArray(
              response
            )
          );
        } catch (requestError) {
          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setLoadingHistory(
            false
          );
        }
      },
      [effectiveAccountId]
    );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* ==========================================================
     OPEN CONFIRMATION
     ----------------------------------------------------------
     Destructive action ko directly execute nahi karta.
     ========================================================== */

  const requestAction =
    (action) => {
      setError("");
      setMessage("");

      if (
        !effectiveAccountId
      ) {
        setError(
          "Select a broker account before using owner controls."
        );
        return;
      }

      setPendingAction(
        action
      );
    };

  /* ==========================================================
     EXECUTE OWNER ACTION
     ----------------------------------------------------------
     Confirmed action ko actual centralized backend API par bhejta hai.
     ========================================================== */

  const executeAction =
    async () => {
      const action =
        pendingAction;

      if (!action) {
        return;
      }

      setPendingAction(
        null
      );

      setActionLoading(
        action
      );

      setError("");
      setMessage("");

      try {
        let method;
        let response;

        switch (action) {
          /* --------------------------------------------------
             MASTER KILL SWITCH
             -------------------------------------------------- */

          case "killSwitch":
            method =
              getApiMethod(
                [
                  "killSwitch",
                  "activateKillSwitch",
                  "emergencyStop",
                ],
                "activate kill switch"
              );

            response =
              await method(
                effectiveAccountId
              );
            break;

          /* --------------------------------------------------
             TRADING ENABLE / DISABLE
             -------------------------------------------------- */

          case "enableTrading":
            method =
              getApiMethod(
                [
                  "enableTrading",
                  "setTradingEnabled",
                  "trading",
                ],
                "enable trading"
              );

            response =
              await method(
                effectiveAccountId,
                true
              );
            break;

          case "disableTrading":
            method =
              getApiMethod(
                [
                  "disableTrading",
                  "setTradingEnabled",
                  "trading",
                ],
                "disable trading"
              );

            response =
              await method(
                effectiveAccountId,
                false
              );
            break;

          /* --------------------------------------------------
             STRATEGY EXECUTION
             -------------------------------------------------- */

          case "enableStrategies":
            method =
              getApiMethod(
                [
                  "enableStrategies",
                  "setStrategyEnabled",
                  "strategies",
                ],
                "enable strategies"
              );

            response =
              await method(
                effectiveAccountId,
                true
              );
            break;

          case "disableStrategies":
            method =
              getApiMethod(
                [
                  "disableStrategies",
                  "setStrategyEnabled",
                  "strategies",
                ],
                "disable strategies"
              );

            response =
              await method(
                effectiveAccountId,
                false
              );
            break;

          /* --------------------------------------------------
             ORDER SUBMISSION
             -------------------------------------------------- */

          case "enableOrders":
            method =
              getApiMethod(
                [
                  "enableOrders",
                  "setOrdersEnabled",
                  "orders",
                ],
                "enable orders"
              );

            response =
              await method(
                effectiveAccountId,
                true
              );
            break;

          case "disableOrders":
            method =
              getApiMethod(
                [
                  "disableOrders",
                  "setOrdersEnabled",
                  "orders",
                ],
                "disable orders"
              );

            response =
              await method(
                effectiveAccountId,
                false
              );
            break;

          /* --------------------------------------------------
             CANCEL ALL
             -------------------------------------------------- */

          case "cancelAll":
            method =
              getApiMethod(
                [
                  "cancelAllOrders",
                  "cancelAll",
                ],
                "cancel all orders"
              );

            response =
              await method(
                effectiveAccountId
              );
            break;

          /* --------------------------------------------------
             SQUARE OFF ALL
             -------------------------------------------------- */

          case "squareOffAll":
            method =
              getApiMethod(
                [
                  "squareOffAll",
                  "closeAllPositions",
                  "exitAllPositions",
                ],
                "square off all positions"
              );

            response =
              await method(
                effectiveAccountId
              );
            break;

          /* --------------------------------------------------
             EMERGENCY EXIT
             -------------------------------------------------- */

          case "emergencyExit":
            method =
              getApiMethod(
                [
                  "emergencyExit",
                  "executeEmergencyExit",
                  "emergencyStop",
                ],
                "emergency exit"
              );

            response =
              await method(
                effectiveAccountId
              );
            break;

          default:
            throw new Error(
              "Unknown owner control action."
            );
        }

        const result =
          getApiData(
            response
          );

        /*
         * Backend response receive hua hai, isliye status reload
         * kiya jaata hai instead of inventing the resulting state.
         */
        await loadStatus();
        await loadHistory();

        setMessage(
          readValue(
            result,
            [
              "message",
              "detail",
              "status_message",
            ]
          ) ||
            "Owner control action completed."
        );
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setActionLoading(
          ""
        );
      }
    };

  /* ==========================================================
     CONTROL ACTION CARD
     ----------------------------------------------------------
     Reusable UI for each owner-level toggle/action.
     ========================================================== */

  const renderActionButton =
    (
      action,
      label,
      variant = "secondary",
      disabled = false
    ) => (
      <Button
        variant={variant}
        onClick={() =>
          requestAction(
            action
          )
        }
        loading={
          actionLoading ===
          action
        }
        disabled={
          disabled ||
          !effectiveAccountId
        }
      >
        {label}
      </Button>
    );

  /* ==========================================================
     HISTORY TABLE
     ----------------------------------------------------------
     Actual owner action records.
     ========================================================== */

  const historyColumns =
    useMemo(
      () => [
        {
          key: "action",
          label: "Action",
          render: (item) =>
            readValue(
              item,
              [
                "action",
                "action_type",
                "actionType",
                "event",
              ]
            ) || "—",
        },
        {
          key: "status",
          label: "Status",
          render: (item) => (
            <StatusBadge
              status={String(
                readValue(
                  item,
                  [
                    "status",
                    "state",
                    "result",
                  ]
                ) || "UNKNOWN"
              ).toUpperCase()}
            />
          ),
        },
        {
          key: "message",
          label: "Details",
          render: (item) =>
            readValue(
              item,
              [
                "message",
                "reason",
                "details",
                "detail",
              ]
            ) || "—",
        },
        {
          key: "actor",
          label: "Actor",
          render: (item) =>
            readValue(
              item,
              [
                "actor",
                "user",
                "username",
                "owner",
              ]
            ) || "—",
        },
        {
          key: "time",
          label: "Time",
          render: (item) =>
            formatDateTime(
              controlTimestamp(
                item
              )
            ),
        },
        {
          key: "id",
          label: "ID",
          render: (item) =>
            controlId(
              item
            ) || "—",
        },
      ],
      []
    );

  const current =
    controlState ||
    normalizeControlState(
      null
    );

  return (
    <div className="page owner-control-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Owner Control"
        subtitle="Central owner-level controls for live trading safety"
        actions={
          <div className="row gap-sm">
            <Badge>
              OWNER CONTROL
            </Badge>

            <Button
              variant="secondary"
              onClick={() => {
                loadStatus();
                loadHistory();
              }}
              loading={
                loading ||
                loadingHistory
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
          <div>
            <label className="field-label">
              Broker Account
            </label>

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
          </div>

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
              Current Control State
            </div>

            <StatusBadge
              status={
                current.status
              }
            />
          </div>
        </Grid>
      </Card>

      {/* ======================================================
          GLOBAL MESSAGES
          ====================================================== */}

      {error ? (
        <Alert
          variant="danger"
          title="Owner control error"
          message={error}
        />
      ) : null}

      {message ? (
        <Alert
          variant="success"
          title="Owner control"
          message={message}
        />
      ) : null}

      <Panel>
        {/* ====================================================
            TABS
            ==================================================== */}

        <Tabs
          items={TABS}
          activeTab={
            activeTab
          }
          onChange={
            setActiveTab
          }
        />

        {/* ====================================================
            CONTROL TAB
            ==================================================== */}

        {activeTab ===
        "controls" ? (
          <div className="stack gap-lg">
            {loading ? (
              <Loading
                label="Loading owner controls..."
              />
            ) : (
              <>
                {/* ==================================================
                    MASTER CONTROL
                    ================================================== */}

                <Card className="emergency-surface">
                  <Section
                    title="Master Trading Control"
                    description="The highest-level trading permission for the selected account."
                  >
                    <div className="row justify-between">
                      <div>
                        <div className="eyebrow">
                          MASTER TRADING
                        </div>

                        <h3>
                          {current.masterTrading
                            ? "Trading Enabled"
                            : "Trading Disabled"}
                        </h3>

                        <p className="muted">
                          This permission does not bypass risk validation, broker authentication or deployment state.
                        </p>
                      </div>

                      <div className="row gap-sm">
                        {current.masterTrading
                          ? renderActionButton(
                              "disableTrading",
                              "Disable Trading",
                              "danger"
                            )
                          : renderActionButton(
                              "enableTrading",
                              "Enable Trading",
                              "primary"
                            )}
                      </div>
                    </div>
                  </Section>
                </Card>

                {/* ==================================================
                    STRATEGY / ORDER PERMISSIONS
                    ================================================== */}

                <Grid columns={2}>
                  <Card>
                    <Section
                      title="Strategy Execution"
                      description="Owner-level permission for strategy execution."
                    >
                      <div className="row justify-between">
                        <div>
                          <strong>
                            Strategy Trading
                          </strong>

                          <div className="muted">
                            {current.strategyTrading
                              ? "Enabled"
                              : "Disabled"}
                          </div>
                        </div>

                        {current.strategyTrading
                          ? renderActionButton(
                              "disableStrategies",
                              "Disable",
                              "danger"
                            )
                          : renderActionButton(
                              "enableStrategies",
                              "Enable",
                              "primary"
                            )}
                      </div>
                    </Section>
                  </Card>

                  <Card>
                    <Section
                      title="Order Submission"
                      description="Owner-level permission for new order submission."
                    >
                      <div className="row justify-between">
                        <div>
                          <strong>
                            Orders
                          </strong>

                          <div className="muted">
                            {current.orderTrading
                              ? "Enabled"
                              : "Disabled"}
                          </div>
                        </div>

                        {current.orderTrading
                          ? renderActionButton(
                              "disableOrders",
                              "Disable",
                              "danger"
                            )
                          : renderActionButton(
                              "enableOrders",
                              "Enable",
                              "primary"
                            )}
                      </div>
                    </Section>
                  </Card>
                </Grid>

                {/* ==================================================
                    ORDER EMERGENCY ACTIONS
                    ================================================== */}

                <Card>
                  <Section
                    title="Live Order Controls"
                    description="These actions can affect real broker orders. Use them only when intentionally required."
                  >
                    <div className="grid grid-cols-2 gap-md">
                      <Card>
                        <div className="eyebrow">
                          OPEN ORDERS
                        </div>

                        <h3>
                          Cancel All
                        </h3>

                        <p className="muted">
                          Request cancellation of all cancellable open orders for this account.
                        </p>

                        {renderActionButton(
                          "cancelAll",
                          "Cancel All Orders",
                          "danger"
                        )}
                      </Card>

                      <Card>
                        <div className="eyebrow">
                          OPEN POSITIONS
                        </div>

                        <h3>
                          Square Off All
                        </h3>

                        <p className="muted">
                          Request exit of all open positions through the canonical broker order flow.
                        </p>

                        {renderActionButton(
                          "squareOffAll",
                          "Square Off All",
                          "danger"
                        )}
                      </Card>
                    </div>
                  </Section>
                </Card>

                {/* ==================================================
                    MASTER KILL SWITCH
                    ================================================== */}

                <Card className="emergency-surface">
                  <Section
                    title="Master Kill Switch"
                    description="Emergency trading disable control. Backend must enforce this before any new live order is accepted."
                  >
                    <div className="row justify-between">
                      <div>
                        <div className="eyebrow">
                          KILL SWITCH
                        </div>

                        <h3>
                          {current.killSwitch
                            ? "ACTIVE"
                            : "INACTIVE"}
                        </h3>

                        <p className="muted">
                          {current.killSwitch
                            ? "Trading is currently under kill-switch protection."
                            : "Kill switch is not currently active according to the backend."}
                        </p>
                      </div>

                      {!current.killSwitch
                        ? renderActionButton(
                            "killSwitch",
                            "Activate Kill Switch",
                            "danger"
                          )
                        : (
                          <Badge>
                            ACTIVE
                          </Badge>
                        )}
                    </div>
                  </Section>
                </Card>

                {/* ==================================================
                    FULL EMERGENCY EXIT
                    ================================================== */}

                <Card className="emergency-surface">
                  <Section
                    title="Emergency Exit"
                    description="Use only for an actual emergency. The backend determines the exact emergency procedure."
                  >
                    <Alert
                      variant="danger"
                      title="High-risk live action"
                      message="Emergency Exit may disable trading and initiate cancellation/square-off operations. Never use this as a routine workflow."
                    />

                    <div className="form-actions">
                      {renderActionButton(
                        "emergencyExit",
                        "Execute Emergency Exit",
                        "danger"
                      )}
                    </div>
                  </Section>
                </Card>
              </>
            )}
          </div>
        ) : null}

        {/* ====================================================
            STATUS TAB
            ==================================================== */}

        {activeTab ===
        "status" ? (
          <div className="stack gap-lg">
            <Card>
              <div className="section-header">
                <div>
                  <h2>
                    Current Owner Control State
                  </h2>

                  <p className="muted">
                    Backend-reported state for the selected account.
                  </p>
                </div>

                <StatusBadge
                  status={
                    current.status
                  }
                />
              </div>

              <Grid columns={5}>
                <Card>
                  <div className="muted">
                    Master Trading
                  </div>

                  <StatusBadge
                    status={
                      current.masterTrading
                        ? "ENABLED"
                        : "DISABLED"
                    }
                  />
                </Card>

                <Card>
                  <div className="muted">
                    Strategies
                  </div>

                  <StatusBadge
                    status={
                      current.strategyTrading
                        ? "ENABLED"
                        : "DISABLED"
                    }
                  />
                </Card>

                <Card>
                  <div className="muted">
                    Orders
                  </div>

                  <StatusBadge
                    status={
                      current.orderTrading
                        ? "ENABLED"
                        : "DISABLED"
                    }
                  />
                </Card>

                <Card>
                  <div className="muted">
                    Kill Switch
                  </div>

                  <StatusBadge
                    status={
                      current.killSwitch
                        ? "ACTIVE"
                        : "INACTIVE"
                    }
                  />
                </Card>

                <Card>
                  <div className="muted">
                    Emergency
                  </div>

                  <StatusBadge
                    status={
                      current.emergency
                        ? "ACTIVE"
                        : "NORMAL"
                    }
                  />
                </Card>
              </Grid>
            </Card>

            <Card>
              <Section
                title="State Details"
                description="Only values returned by the backend are displayed."
              >
                <Grid columns={2}>
                  <div>
                    <div className="muted">
                      Reason
                    </div>

                    <strong>
                      {current.reason ||
                        "No reason returned"}
                    </strong>
                  </div>

                  <div>
                    <div className="muted">
                      Last Updated
                    </div>

                    <strong>
                      {formatDateTime(
                        current.updatedAt
                      )}
                    </strong>
                  </div>
                </Grid>
              </Section>
            </Card>

            <Alert
              variant="info"
              title="Execution boundary"
              message="Owner Control permissions are not a substitute for risk validation. Live order flow must still pass authentication, ownership, risk and broker checks."
            />
          </div>
        ) : null}

        {/* ====================================================
            HISTORY TAB
            ==================================================== */}

        {activeTab ===
        "history" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>
                  Owner Action History
                </h2>

                <p className="muted">
                  Backend-recorded owner-control actions for this account.
                </p>
              </div>

              <Button
                variant="secondary"
                onClick={
                  loadHistory
                }
                loading={
                  loadingHistory
                }
              >
                Refresh History
              </Button>
            </div>

            {loadingHistory ? (
              <Loading
                label="Loading owner action history..."
              />
            ) : !history.length ? (
              <EmptyState
                title="No owner actions"
                message="No owner-control history was returned by the backend."
              />
            ) : (
              <Table
                columns={
                  historyColumns
                }
                data={
                  history
                }
              />
            )}
          </div>
        ) : null}
      </Panel>

      {/* ======================================================
          FINAL SAFETY NOTICE
          ====================================================== */}

      <Alert
        variant="warning"
        title="Live trading safety"
        message="Strategy creation or backtesting never activates live trading automatically. Live execution must remain behind explicit deployment permission, risk validation and the canonical Kotak order engine."
      />

      {/* ======================================================
          DESTRUCTIVE ACTION CONFIRMATION
          ====================================================== */}

      {pendingAction ? (
        <ConfirmDialog
          open={
            Boolean(
              pendingAction
            )
          }
          title={
            ACTION_META[
              pendingAction
            ]?.title ||
            "Confirm Owner Action"
          }
          message={
            ACTION_META[
              pendingAction
            ]?.message ||
            "Confirm this owner-control action."
          }
          confirmLabel={
            ACTION_META[
              pendingAction
            ]?.confirm ||
            "Confirm"
          }
          cancelLabel="Cancel"
          onConfirm={
            executeAction
          }
          onCancel={() =>
            setPendingAction(
              null
            )
          }
          loading={
            Boolean(
              actionLoading
            )
          }
          danger={
            [
              "killSwitch",
              "disableTrading",
              "disableStrategies",
              "disableOrders",
              "cancelAll",
              "squareOffAll",
              "emergencyExit",
            ].includes(
              pendingAction
            )
          }
        />
      ) : null}
    </div>
  );
}
