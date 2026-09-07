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
  Input,
  Loading,
  NumberInput,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  Table,
  Tabs,
} from "../components/UI.jsx";
import { useBrokerState } from "../context.jsx";
import { backtestApi, strategyApi } from "../api.jsx";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  getApiArray,
  getApiData,
  getErrorMessage,
  safeNumber,
} from "../utils.js";

/* ============================================================
   BACKTEST MODULE
   ------------------------------------------------------------
   Is page mein historical strategy backtesting ka complete
   frontend workflow rakha gaya hai:
   strategy selection -> parameters -> real backend run ->
   real result -> metrics -> equity curve -> trades.
   ============================================================ */

const TABS = [
  { id: "run", label: "Run Backtest" },
  { id: "results", label: "Results" },
  { id: "history", label: "Backtest History" },
];

const INITIAL_FORM = {
  strategyId: "",
  symbol: "",
  exchange: "NSE",
  timeframe: "5m",
  startDate: "",
  endDate: "",
  initialCapital: "",
  quantity: "",
  positionSizing: "FIXED",
  brokerage: "",
  slippage: "",
};

/* ============================================================
   GENERIC DATA HELPERS
   ------------------------------------------------------------
   Backend ke different field names ko safely read karne ke
   liye common helpers.
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

function resultId(result) {
  return value(result, [
    "id",
    "backtest_id",
    "backtestId",
    "result_id",
    "resultId",
  ]);
}

function resultStrategyId(result) {
  return value(result, [
    "strategy_id",
    "strategyId",
  ]);
}

function resultStrategyName(result) {
  return value(result, [
    "strategy_name",
    "strategyName",
    "name",
  ]);
}

function resultSymbol(result) {
  return value(result, [
    "symbol",
    "tradingsymbol",
    "trading_symbol",
    "instrument",
  ]);
}

function resultTimeframe(result) {
  return value(result, [
    "timeframe",
    "interval",
    "time_frame",
  ]);
}

function resultStatus(result) {
  return String(
    value(result, [
      "status",
      "state",
      "backtest_status",
      "backtestStatus",
    ]) || "UNKNOWN"
  ).toUpperCase();
}

function initialCapitalOf(result) {
  return safeNumber(
    value(result, [
      "initial_capital",
      "initialCapital",
      "starting_capital",
      "startingCapital",
    ]),
    0
  );
}

function finalCapitalOf(result) {
  return safeNumber(
    value(result, [
      "final_capital",
      "finalCapital",
      "ending_capital",
      "endingCapital",
    ]),
    0
  );
}

function pnlOf(result) {
  return safeNumber(
    value(result, [
      "total_pnl",
      "totalPnl",
      "pnl",
      "profit_loss",
      "profitLoss",
    ]),
    0
  );
}

function returnOf(result) {
  return safeNumber(
    value(result, [
      "return_percentage",
      "returnPercentage",
      "return_pct",
      "returnPct",
      "return",
    ]),
    0
  );
}

function drawdownOf(result) {
  return safeNumber(
    value(result, [
      "maximum_drawdown",
      "maximumDrawdown",
      "max_drawdown",
      "maxDrawdown",
      "drawdown",
    ]),
    0
  );
}

function tradeCountOf(result) {
  return safeNumber(
    value(result, [
      "number_of_trades",
      "numberOfTrades",
      "trade_count",
      "tradeCount",
      "total_trades",
      "totalTrades",
    ]),
    0
  );
}

function winningTradesOf(result) {
  return safeNumber(
    value(result, [
      "winning_trades",
      "winningTrades",
      "wins",
      "winning",
    ]),
    0
  );
}

function losingTradesOf(result) {
  return safeNumber(
    value(result, [
      "losing_trades",
      "losingTrades",
      "losses",
      "losing",
    ]),
    0
  );
}

function winRateOf(result) {
  return safeNumber(
    value(result, [
      "win_rate",
      "winRate",
      "winning_percentage",
      "winningPercentage",
    ]),
    0
  );
}

function profitFactorOf(result) {
  const raw = value(result, [
    "profit_factor",
    "profitFactor",
  ]);

  if (
    raw === null ||
    raw === undefined ||
    raw === ""
  ) {
    return null;
  }

  const number = Number(raw);

  return Number.isFinite(number)
    ? number
    : null;
}

function averageWinOf(result) {
  return safeNumber(
    value(result, [
      "average_win",
      "averageWin",
      "avg_win",
      "avgWin",
    ]),
    0
  );
}

function averageLossOf(result) {
  return safeNumber(
    value(result, [
      "average_loss",
      "averageLoss",
      "avg_loss",
      "avgLoss",
    ]),
    0
  );
}

function createdAtOf(result) {
  return value(result, [
    "created_at",
    "createdAt",
    "timestamp",
    "completed_at",
    "completedAt",
  ]);
}

/* ============================================================
   RESULT DATA EXTRACTION
   ------------------------------------------------------------
   Equity curve aur trade list backend result ke actual fields
   se nikale jaate hain. Missing data ko fake zero se replace
   nahi kiya jaata.
   ============================================================ */

function getEquityCurve(result) {
  const curve = value(result, [
    "equity_curve",
    "equityCurve",
    "equity",
    "curve",
  ]);

  if (Array.isArray(curve)) {
    return curve;
  }

  return [];
}

function getTrades(result) {
  const trades = value(result, [
    "trades",
    "trade_results",
    "tradeResults",
    "trade_list",
    "tradeList",
    "executions",
  ]);

  return Array.isArray(trades)
    ? trades
    : [];
}

function getAssumptions(result) {
  const assumptions = value(result, [
    "execution_assumptions",
    "executionAssumptions",
    "assumptions",
  ]);

  return assumptions &&
    typeof assumptions === "object"
    ? assumptions
    : null;
}

function getDataSource(result) {
  return value(result, [
    "data_source",
    "dataSource",
    "historical_data_source",
    "historicalDataSource",
  ]);
}

function getDateRange(result) {
  const start = value(result, [
    "start_date",
    "startDate",
    "period_start",
    "periodStart",
  ]);

  const end = value(result, [
    "end_date",
    "endDate",
    "period_end",
    "periodEnd",
  ]);

  return {
    start,
    end,
  };
}

/* ============================================================
   API METHOD RESOLUTION
   ------------------------------------------------------------
   Centralized backtestApi contract ko use karta hai. Agar
   backend contract mein required operation expose nahi hua,
   frontend fake result banane ke bajay clear error deta hai.
   ============================================================ */

function requireApiMethod(api, methodNames, operationName) {
  for (const methodName of methodNames) {
    if (
      api &&
      typeof api[methodName] === "function"
    ) {
      return api[methodName].bind(api);
    }
  }

  throw new Error(
    `Backtest backend operation "${operationName}" is not available in the API contract.`
  );
}

/* ============================================================
   FORM VALIDATION
   ------------------------------------------------------------
   Backtest request backend ko bhejne se pehle basic input
   validation yahin hoti hai.
   ============================================================ */

function validateForm(form) {
  if (!form.strategyId) {
    return "Select a strategy before running a backtest.";
  }

  if (!form.symbol.trim()) {
    return "Trading symbol is required.";
  }

  if (!form.startDate) {
    return "Start date is required.";
  }

  if (!form.endDate) {
    return "End date is required.";
  }

  if (
    new Date(form.startDate) >
    new Date(form.endDate)
  ) {
    return "Start date cannot be after end date.";
  }

  const initialCapital = safeNumber(
    form.initialCapital,
    0
  );

  if (initialCapital <= 0) {
    return "Initial capital must be greater than zero.";
  }

  if (
    form.quantity !== "" &&
    safeNumber(form.quantity, 0) <= 0
  ) {
    return "Quantity must be greater than zero when provided.";
  }

  if (
    form.brokerage !== "" &&
    safeNumber(form.brokerage, -1) < 0
  ) {
    return "Brokerage cannot be negative.";
  }

  if (
    form.slippage !== "" &&
    safeNumber(form.slippage, -1) < 0
  ) {
    return "Slippage cannot be negative.";
  }

  return "";
}

/* ============================================================
   EQUITY CURVE
   ------------------------------------------------------------
   External chart library ke bina backend ki actual equity
   points ko simple SVG chart mein display karta hai.
   ============================================================ */

function EquityCurve({ data }) {
  if (!Array.isArray(data) || data.length < 2) {
    return (
      <EmptyState
        title="Equity curve unavailable"
        message="The backtest result did not return enough equity-curve data."
      />
    );
  }

  const points = data
    .map((item, index) => {
      if (
        typeof item === "number" &&
        Number.isFinite(item)
      ) {
        return {
          x: index,
          y: item,
        };
      }

      const y = Number(
        value(item, [
          "equity",
          "value",
          "capital",
          "portfolio_value",
          "portfolioValue",
          "close",
        ])
      );

      const xValue = value(item, [
        "timestamp",
        "time",
        "date",
        "index",
      ]);

      return {
        x:
          Number.isFinite(Number(xValue))
            ? Number(xValue)
            : index,
        y,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.y)
    );

  if (points.length < 2) {
    return (
      <EmptyState
        title="Equity curve unavailable"
        message="The returned equity data is not valid enough to render."
      />
    );
  }

  const width = 900;
  const height = 280;
  const padding = 28;

  const values = points.map(
    (point) => point.y
  );

  const minY = Math.min(...values);
  const maxY = Math.max(...values);

  const range =
    maxY - minY === 0
      ? 1
      : maxY - minY;

  const plotted = points.map(
    (point, index) => {
      const x =
        padding +
        (index /
          Math.max(points.length - 1, 1)) *
          (width - padding * 2);

      const y =
        height -
        padding -
        ((point.y - minY) / range) *
          (height - padding * 2);

      return `${x},${y}`;
    }
  );

  return (
    <div className="chart-container">
      <div className="chart-container__header">
        <div>
          <strong>Equity Curve</strong>
          <div className="muted text-xs">
            Backend-calculated backtest equity
          </div>
        </div>

        <div className="row gap-md text-xs">
          <span>
            Low: {formatCurrency(minY)}
          </span>
          <span>
            High: {formatCurrency(maxY)}
          </span>
        </div>
      </div>

      <div className="chart-surface">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height="280"
          role="img"
          aria-label="Backtest equity curve"
          preserveAspectRatio="none"
        >
          <line
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            opacity="0.15"
          />

          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="currentColor"
            opacity="0.15"
          />

          <polyline
            points={plotted.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  );
}

/* ============================================================
   TRADE RESULT TABLE
   ------------------------------------------------------------
   Individual backtest trades ko backend response se display
   karta hai.
   ============================================================ */

function TradeTable({ trades }) {
  if (!trades.length) {
    return (
      <EmptyState
        title="No trade records"
        message="The backtest result did not contain a trade-by-trade list."
      />
    );
  }

  const columns = [
    {
      key: "symbol",
      label: "Symbol",
      render: (trade) =>
        value(trade, [
          "symbol",
          "tradingsymbol",
          "trading_symbol",
        ]) || "—",
    },
    {
      key: "side",
      label: "Side",
      render: (trade) =>
        value(trade, [
          "side",
          "transaction_type",
          "transactionType",
        ]) || "—",
    },
    {
      key: "entry",
      label: "Entry",
      render: (trade) => {
        const price = Number(
          value(trade, [
            "entry_price",
            "entryPrice",
            "entry",
          ])
        );

        return Number.isFinite(price)
          ? formatCurrency(price)
          : "—";
      },
    },
    {
      key: "exit",
      label: "Exit",
      render: (trade) => {
        const price = Number(
          value(trade, [
            "exit_price",
            "exitPrice",
            "exit",
          ])
        );

        return Number.isFinite(price)
          ? formatCurrency(price)
          : "—";
      },
    },
    {
      key: "quantity",
      label: "Qty",
      render: (trade) =>
        formatNumber(
          safeNumber(
            value(trade, [
              "quantity",
              "qty",
            ]),
            0
          )
        ),
    },
    {
      key: "pnl",
      label: "P&L",
      render: (trade) => {
        const pnl = Number(
          value(trade, [
            "pnl",
            "profit_loss",
            "profitLoss",
            "net_pnl",
            "netPnl",
          ])
        );

        return Number.isFinite(pnl)
          ? formatCurrency(pnl)
          : "—";
      },
    },
    {
      key: "entryTime",
      label: "Entry Time",
      render: (trade) =>
        formatDateTime(
          value(trade, [
            "entry_time",
            "entryTime",
            "entry_timestamp",
            "entryTimestamp",
          ])
        ),
    },
    {
      key: "exitTime",
      label: "Exit Time",
      render: (trade) =>
        formatDateTime(
          value(trade, [
            "exit_time",
            "exitTime",
            "exit_timestamp",
            "exitTimestamp",
          ])
        ),
    },
  ];

  return (
    <Table
      columns={columns}
      data={trades}
    />
  );
}

/* ============================================================
   RESULT DETAIL PANEL
   ------------------------------------------------------------
   Selected backtest ke complete real result ko display karta hai.
   ============================================================ */

function ResultView({ result }) {
  if (!result) {
    return (
      <EmptyState
        title="No backtest result selected"
        message="Run a backtest or select a previous result."
      />
    );
  }

  const range = getDateRange(
    result
  );

  const assumptions =
    getAssumptions(result);

  const profitFactor =
    profitFactorOf(result);

  const equityCurve =
    getEquityCurve(result);

  const trades =
    getTrades(result);

  return (
    <div className="stack gap-lg">
      {/* ======================================================
          RESULT IDENTITY
          ====================================================== */}

      <Card>
        <div className="section-header">
          <div>
            <div className="eyebrow">
              BACKTEST RESULT
            </div>

            <h2>
              {resultStrategyName(
                result
              ) || "Backtest"}
            </h2>

            <p className="muted">
              {resultSymbol(result) ||
                "—"}{" "}
              ·{" "}
              {resultTimeframe(
                result
              ) || "—"}
            </p>
          </div>

          <StatusBadge
            status={
              resultStatus(result)
            }
          />
        </div>

        <Grid columns={4}>
          <Card>
            <div className="muted">
              Backtest ID
            </div>

            <strong>
              {resultId(result) ||
                "—"}
            </strong>
          </Card>

          <Card>
            <div className="muted">
              Strategy ID
            </div>

            <strong>
              {resultStrategyId(
                result
              ) || "—"}
            </strong>
          </Card>

          <Card>
            <div className="muted">
              Period
            </div>

            <strong>
              {range.start || "—"}
              {" → "}
              {range.end || "—"}
            </strong>
          </Card>

          <Card>
            <div className="muted">
              Data Source
            </div>

            <strong>
              {getDataSource(
                result
              ) || "Unavailable"}
            </strong>
          </Card>
        </Grid>
      </Card>

      {/* ======================================================
          PERFORMANCE METRICS
          ====================================================== */}

      <Grid columns={4}>
        <Card className="metric-card">
          <div className="metric-card__label">
            Total P&L
          </div>

          <div className="metric-card__value">
            {formatCurrency(
              pnlOf(result)
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Return
          </div>

          <div className="metric-card__value">
            {formatPercent(
              returnOf(result)
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Maximum Drawdown
          </div>

          <div className="metric-card__value">
            {formatCurrency(
              drawdownOf(result)
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Trades
          </div>

          <div className="metric-card__value">
            {formatNumber(
              tradeCountOf(result)
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Initial Capital
          </div>

          <div className="metric-card__value">
            {formatCurrency(
              initialCapitalOf(
                result
              )
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Final Capital
          </div>

          <div className="metric-card__value">
            {formatCurrency(
              finalCapitalOf(
                result
              )
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Win Rate
          </div>

          <div className="metric-card__value">
            {formatPercent(
              winRateOf(result)
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Profit Factor
          </div>

          <div className="metric-card__value">
            {profitFactor ===
            null
              ? "Unavailable"
              : profitFactor.toFixed(
                  2
                )}
          </div>
        </Card>
      </Grid>

      {/* ======================================================
          TRADE STATISTICS
          ====================================================== */}

      <Card>
        <div className="section-header">
          <div>
            <h3>
              Trade Statistics
            </h3>
          </div>
        </div>

        <Grid columns={4}>
          <div>
            <div className="muted">
              Winning Trades
            </div>

            <strong>
              {formatNumber(
                winningTradesOf(
                  result
                )
              )}
            </strong>
          </div>

          <div>
            <div className="muted">
              Losing Trades
            </div>

            <strong>
              {formatNumber(
                losingTradesOf(
                  result
                )
              )}
            </strong>
          </div>

          <div>
            <div className="muted">
              Average Win
            </div>

            <strong>
              {formatCurrency(
                averageWinOf(
                  result
                )
              )}
            </strong>
          </div>

          <div>
            <div className="muted">
              Average Loss
            </div>

            <strong>
              {formatCurrency(
                averageLossOf(
                  result
                )
              )}
            </strong>
          </div>
        </Grid>
      </Card>

      {/* ======================================================
          EQUITY CURVE
          ====================================================== */}

      <Card>
        <EquityCurve
          data={equityCurve}
        />
      </Card>

      {/* ======================================================
          TRADE-BY-TRADE RESULTS
          ====================================================== */}

      <Card>
        <div className="section-header">
          <div>
            <h3>
              Trade-by-Trade Results
            </h3>

            <p className="muted">
              Actual trades generated by
              the backtest engine.
            </p>
          </div>

          <Badge>
            {trades.length} trades
          </Badge>
        </div>

        <TradeTable
          trades={trades}
        />
      </Card>

      {/* ======================================================
          EXECUTION ASSUMPTIONS
          ====================================================== */}

      <Card>
        <div className="section-header">
          <div>
            <h3>
              Execution Assumptions
            </h3>

            <p className="muted">
              Assumptions returned by the
              backtest engine.
            </p>
          </div>
        </div>

        {assumptions ? (
          <div className="data-list">
            {Object.entries(
              assumptions
            ).map(
              ([key, item]) => (
                <div
                  className="data-list__row"
                  key={key}
                >
                  <span>
                    {key}
                  </span>

                  <strong>
                    {typeof item ===
                    "object"
                      ? JSON.stringify(
                          item
                        )
                      : String(item)}
                  </strong>
                </div>
              )
            )}
          </div>
        ) : (
          <EmptyState
            title="Assumptions unavailable"
            message="The backend result did not provide execution assumptions."
          />
        )}
      </Card>

      {/* ======================================================
          RESULT SOURCE / TIMESTAMP
          ====================================================== */}

      <Card>
        <div className="row justify-between">
          <div>
            <div className="muted">
              Result Created
            </div>

            <strong>
              {formatDateTime(
                createdAtOf(result)
              )}
            </strong>
          </div>

          <Badge>
            BACKTEST
          </Badge>
        </div>
      </Card>
    </div>
  );
}

/* ============================================================
   MAIN BACKTEST PAGE
   ------------------------------------------------------------
   Run, result aur historical backtest records ka central page.
   ============================================================ */

export default function Backtest() {
  const {
    accounts,
    primaryAccount,
  } = useBrokerState();

  const [activeTab, setActiveTab] =
    useState("run");

  const [strategies, setStrategies] =
    useState([]);

  const [history, setHistory] =
    useState([]);

  const [selectedResult, setSelectedResult] =
    useState(null);

  const [form, setForm] =
    useState(INITIAL_FORM);

  const [loadingStrategies, setLoadingStrategies] =
    useState(false);

  const [loadingHistory, setLoadingHistory] =
    useState(false);

  const [running, setRunning] =
    useState(false);

  const [loadingResult, setLoadingResult] =
    useState(false);

  const [pageError, setPageError] =
    useState("");

  const [historyError, setHistoryError] =
    useState("");

  const [actionMessage, setActionMessage] =
    useState("");

  const [selectedAccountId, setSelectedAccountId] =
    useState(
      primaryAccount?.id ||
        primaryAccount?.account_id ||
        ""
    );

  /* ==========================================================
     ACCOUNT SELECTION
     ----------------------------------------------------------
     Backtest ko selected trading account se associate karta hai.
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
          ) ===
          String(selectedAccountId)
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

  const effectiveAccountId = useMemo(
    () =>
      value(selectedAccount, [
        "id",
        "account_id",
        "accountId",
        "broker_account_id",
      ]),
    [selectedAccount]
  );

  /* ==========================================================
     FORM UPDATE
     ----------------------------------------------------------
     Backtest configuration ke centralized form state.
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

  /* ==========================================================
     LOAD STRATEGIES
     ----------------------------------------------------------
     Existing saved strategies backend se load hote hain.
     ========================================================== */

  const loadStrategies = useCallback(
    async () => {
      setLoadingStrategies(
        true
      );

      try {
        const response =
          await strategyApi.list({
            accountId:
              effectiveAccountId ||
              undefined,
          });

        const items =
          getApiArray(response);

        setStrategies(items);

        if (
          !form.strategyId &&
          items.length
        ) {
          const firstId =
            value(items[0], [
              "id",
              "strategy_id",
              "strategyId",
            ]);

          if (firstId) {
            setForm((current) => ({
              ...current,
              strategyId:
                String(firstId),
              symbol:
                value(items[0], [
                  "symbol",
                  "tradingsymbol",
                  "trading_symbol",
                ]) ||
                current.symbol,
              exchange:
                value(items[0], [
                  "exchange",
                  "exchange_segment",
                ]) ||
                current.exchange,
              timeframe:
                value(items[0], [
                  "timeframe",
                  "interval",
                ]) ||
                current.timeframe,
            }));
          }
        }
      } catch (error) {
        setPageError(
          getErrorMessage(error)
        );
      } finally {
        setLoadingStrategies(
          false
        );
      }
    },
    [
      effectiveAccountId,
      form.strategyId,
    ]
  );

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  /* ==========================================================
     LOAD BACKTEST HISTORY
     ----------------------------------------------------------
     Previous real backtest records backend se load hote hain.
     ========================================================== */

  const loadHistory = useCallback(
    async () => {
      setLoadingHistory(
        true
      );
      setHistoryError("");

      try {
        const method =
          requireApiMethod(
            backtestApi,
            [
              "list",
              "getHistory",
              "history",
            ],
            "list backtests"
          );

        const response =
          await method({
            accountId:
              effectiveAccountId ||
              undefined,
          });

        setHistory(
          getApiArray(response)
        );
      } catch (error) {
        setHistoryError(
          getErrorMessage(error)
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
     STRATEGY SELECTION
     ----------------------------------------------------------
     Strategy select karne par uski instrument configuration
     backtest form mein populate hoti hai.
     ========================================================== */

  const handleStrategyChange = (
    event
  ) => {
    const strategyId =
      event.target.value;

    const strategy =
      strategies.find(
        (item) =>
          String(
            value(item, [
              "id",
              "strategy_id",
              "strategyId",
            ])
          ) ===
          String(strategyId)
      );

    setForm((current) => ({
      ...current,
      strategyId,
      symbol:
        value(strategy, [
          "symbol",
          "tradingsymbol",
          "trading_symbol",
        ]) ||
        current.symbol,
      exchange:
        value(strategy, [
          "exchange",
          "exchange_segment",
        ]) ||
        current.exchange,
      timeframe:
        value(strategy, [
          "timeframe",
          "interval",
        ]) ||
        current.timeframe,
    }));
  };

  /* ==========================================================
     RUN BACKTEST
     ----------------------------------------------------------
     Actual backend deterministic backtest engine ko request
     bhejta hai. Frontend khud candles/results generate nahi karta.
     ========================================================== */

  const handleRun = async () => {
    setPageError("");
    setActionMessage("");

    const validationError =
      validateForm(form);

    if (validationError) {
      setPageError(
        validationError
      );
      return;
    }

    if (!effectiveAccountId) {
      setPageError(
        "Select a broker account before running the backtest."
      );
      return;
    }

    setRunning(true);

    try {
      const method =
        requireApiMethod(
          backtestApi,
          [
            "run",
            "create",
            "execute",
          ],
          "run backtest"
        );

      const payload = {
        accountId:
          effectiveAccountId,
        strategyId:
          form.strategyId,
        symbol:
          form.symbol
            .trim()
            .toUpperCase(),
        exchange:
          form.exchange,
        timeframe:
          form.timeframe,
        startDate:
          form.startDate,
        endDate:
          form.endDate,
        initialCapital:
          safeNumber(
            form.initialCapital,
            0
          ),
        positionSizing:
          form.positionSizing,
      };

      if (form.quantity !== "") {
        payload.quantity =
          safeNumber(
            form.quantity,
            0
          );
      }

      if (form.brokerage !== "") {
        payload.brokerage =
          safeNumber(
            form.brokerage,
            0
          );
      }

      if (form.slippage !== "") {
        payload.slippage =
          safeNumber(
            form.slippage,
            0
          );
      }

      const response =
        await method(payload);

      const result =
        getApiData(response);

      if (!result) {
        throw new Error(
          "The backtest engine did not return a result."
        );
      }

      setSelectedResult(
        result
      );

      setActionMessage(
        "Backtest completed and the backend result was received."
      );

      setActiveTab(
        "results"
      );

      await loadHistory();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setRunning(false);
    }
  };

  /* ==========================================================
     LOAD SINGLE RESULT
     ----------------------------------------------------------
     History se selected backtest ka complete result backend se
     fetch karta hai.
     ========================================================== */

  const handleOpenResult =
    async (historyItem) => {
      const id =
        resultId(historyItem);

      if (!id) {
        setPageError(
          "This backtest record has no valid result ID."
        );
        return;
      }

      setLoadingResult(true);
      setPageError("");

      try {
        const method =
          requireApiMethod(
            backtestApi,
            [
              "get",
              "getResult",
              "result",
              "details",
            ],
            "get backtest result"
          );

        const response =
          await method(id);

        const result =
          getApiData(response);

        if (!result) {
          throw new Error(
            "The backend did not return the selected backtest result."
          );
        }

        setSelectedResult(
          result
        );

        setActiveTab(
          "results"
        );
      } catch (error) {
        setPageError(
          getErrorMessage(error)
        );
      } finally {
        setLoadingResult(
          false
        );
      }
    };

  /* ==========================================================
     HISTORY TABLE
     ----------------------------------------------------------
     Previous backtest runs ko compact history view mein show
     karta hai.
     ========================================================== */

  const historyColumns =
    useMemo(
      () => [
        {
          key: "id",
          label: "Backtest ID",
          render: (item) =>
            resultId(item) ||
            "—",
        },
        {
          key: "strategy",
          label: "Strategy",
          render: (item) =>
            resultStrategyName(
              item
            ) ||
            resultStrategyId(
              item
            ) ||
            "—",
        },
        {
          key: "symbol",
          label: "Instrument",
          render: (item) =>
            resultSymbol(
              item
            ) || "—",
        },
        {
          key: "timeframe",
          label: "Timeframe",
          render: (item) =>
            resultTimeframe(
              item
            ) || "—",
        },
        {
          key: "pnl",
          label: "P&L",
          render: (item) =>
            formatCurrency(
              pnlOf(item)
            ),
        },
        {
          key: "return",
          label: "Return",
          render: (item) =>
            formatPercent(
              returnOf(item)
            ),
        },
        {
          key: "drawdown",
          label: "Max DD",
          render: (item) =>
            formatCurrency(
              drawdownOf(item)
            ),
        },
        {
          key: "trades",
          label: "Trades",
          render: (item) =>
            formatNumber(
              tradeCountOf(item)
            ),
        },
        {
          key: "status",
          label: "Status",
          render: (item) => (
            <StatusBadge
              status={resultStatus(
                item
              )}
            />
          ),
        },
        {
          key: "created",
          label: "Created",
          render: (item) =>
            formatDateTime(
              createdAtOf(item)
            ),
        },
        {
          key: "action",
          label: "Action",
          render: (item) => (
            <Button
              size="small"
              variant="secondary"
              onClick={() =>
                handleOpenResult(
                  item
                )
              }
              loading={
                loadingResult &&
                resultId(
                  item
                ) ===
                  resultId(
                    selectedResult
                  )
              }
            >
              View Result
            </Button>
          ),
        },
      ],
      [
        loadingResult,
        selectedResult,
      ]
    );

  return (
    <div className="page backtest-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Backtest"
        subtitle="Run deterministic strategy tests against real historical market data"
        actions={
          <div className="row gap-sm">
            <Badge>
              BACKTEST ONLY
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadHistory
              }
              loading={
                loadingHistory
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ======================================================
          GLOBAL MESSAGES
          ====================================================== */}

      {pageError ? (
        <Alert
          variant="danger"
          title="Backtest error"
          message={
            pageError
          }
        />
      ) : null}

      {actionMessage ? (
        <Alert
          variant="success"
          title="Backtest"
          message={
            actionMessage
          }
        />
      ) : null}

      {/* ======================================================
          BACKTEST SUMMARY
          ====================================================== */}

      <Grid
        columns={4}
        className="metrics-grid"
      >
        <Card className="metric-card">
          <div className="metric-card__label">
            Available Strategies
          </div>

          <div className="metric-card__value">
            {formatNumber(
              strategies.length
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Backtest Runs
          </div>

          <div className="metric-card__value">
            {formatNumber(
              history.length
            )}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Selected Result
          </div>

          <div className="metric-card__value">
            {selectedResult
              ? "Available"
              : "None"}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Data Mode
          </div>

          <div className="metric-card__value">
            Historical
          </div>
        </Card>
      </Grid>

      <Panel>
        {/* ====================================================
            MAIN TABS
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
            RUN BACKTEST
            ----------------------------------------------------
            Complete backtest request configuration.
            ==================================================== */}

        {activeTab === "run" ? (
          <div className="stack gap-lg">
            <Card>
              <div className="section-header">
                <div>
                  <h2>
                    Configure Backtest
                  </h2>

                  <p className="muted">
                    Select a saved strategy and define the historical
                    testing period and execution assumptions.
                  </p>
                </div>

                <Badge>
                  No live orders
                </Badge>
              </div>

              {loadingStrategies ? (
                <Loading
                  label="Loading strategies..."
                />
              ) : null}

              <Grid columns={3}>
                <Field
                  label="Strategy"
                  required
                >
                  <Select
                    value={
                      form.strategyId
                    }
                    onChange={
                      handleStrategyChange
                    }
                    disabled={
                      running
                    }
                    options={[
                      {
                        value: "",
                        label:
                          strategies.length
                            ? "Select strategy"
                            : "No strategies available",
                      },
                      ...strategies.map(
                        (
                          strategy
                        ) => ({
                          value:
                            String(
                              value(
                                strategy,
                                [
                                  "id",
                                  "strategy_id",
                                  "strategyId",
                                ]
                              )
                            ),
                          label:
                            value(
                              strategy,
                              [
                                "name",
                                "strategy_name",
                                "strategyName",
                              ]
                            ) ||
                            "Unnamed Strategy",
                        })
                      ),
                    ]}
                  />
                </Field>

                <Field
                  label="Symbol"
                  required
                >
                  <Input
                    value={
                      form.symbol
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "symbol",
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="RELIANCE"
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field label="Exchange">
                  <Select
                    value={
                      form.exchange
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "exchange",
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                    options={[
                      {
                        value:
                          "NSE",
                        label:
                          "NSE",
                      },
                      {
                        value:
                          "BSE",
                        label:
                          "BSE",
                      },
                    ]}
                  />
                </Field>

                <Field label="Timeframe">
                  <Select
                    value={
                      form.timeframe
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "timeframe",
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                    options={[
                      {
                        value:
                          "1m",
                        label:
                          "1 Minute",
                      },
                      {
                        value:
                          "3m",
                        label:
                          "3 Minutes",
                      },
                      {
                        value:
                          "5m",
                        label:
                          "5 Minutes",
                      },
                      {
                        value:
                          "15m",
                        label:
                          "15 Minutes",
                      },
                      {
                        value:
                          "30m",
                        label:
                          "30 Minutes",
                      },
                      {
                        value:
                          "1h",
                        label:
                          "1 Hour",
                      },
                      {
                        value:
                          "1d",
                        label:
                          "1 Day",
                      },
                    ]}
                  />
                </Field>

                <Field
                  label="Start Date"
                  required
                >
                  <Input
                    type="date"
                    value={
                      form.startDate
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "startDate",
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field
                  label="End Date"
                  required
                >
                  <Input
                    type="date"
                    value={
                      form.endDate
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "endDate",
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field
                  label="Initial Capital"
                  required
                >
                  <NumberInput
                    value={
                      form.initialCapital
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "initialCapital",
                        event.target.value
                      )
                    }
                    min="0"
                    step="0.01"
                    placeholder="100000"
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field label="Position Sizing">
                  <Select
                    value={
                      form.positionSizing
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "positionSizing",
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                    options={[
                      {
                        value:
                          "FIXED",
                        label:
                          "Fixed Quantity",
                      },
                      {
                        value:
                          "CAPITAL",
                        label:
                          "Capital Based",
                      },
                      {
                        value:
                          "STRATEGY",
                        label:
                          "Strategy Defined",
                      },
                    ]}
                  />
                </Field>

                <Field
                  label="Quantity"
                  hint="Optional if strategy controls sizing."
                >
                  <NumberInput
                    value={
                      form.quantity
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "quantity",
                        event.target.value
                      )
                    }
                    min="1"
                    step="1"
                    placeholder="Optional"
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field
                  label="Brokerage / Fees"
                  hint="Only if supported by the backend model."
                >
                  <NumberInput
                    value={
                      form.brokerage
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "brokerage",
                        event.target.value
                      )
                    }
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field
                  label="Slippage"
                  hint="Only if supported by the backend model."
                >
                  <NumberInput
                    value={
                      form.slippage
                    }
                    onChange={(
                      event
                    ) =>
                      updateForm(
                        "slippage",
                        event.target.value
                      )
                    }
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                    disabled={
                      running
                    }
                  />
                </Field>

                <Field label="Broker Account">
                  <Select
                    value={
                      selectedAccountId
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedAccountId(
                        event.target.value
                      )
                    }
                    disabled={
                      running
                    }
                    options={[
                      {
                        value:
                          "",
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
                              id !==
                                null &&
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
                                index +
                                1
                              }`,
                          };
                        }
                      ),
                    ]}
                  />
                </Field>
              </Grid>
            </Card>

            <Alert
              variant="info"
              title="Historical data requirement"
              message="The backtest engine must use real historical market data. If the requested symbol, timeframe or date range is unavailable, the backend should return an unavailable-data error rather than fabricated candles or zero-filled results."
            />

            <Alert
              variant="warning"
              title="Backtest is not live trading"
              message="Running a backtest does not place BUY/SELL orders and does not activate a live strategy."
            />

            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setForm(
                    INITIAL_FORM
                  )
                }
                disabled={
                  running
                }
              >
                Reset
              </Button>

              <Button
                variant="primary"
                onClick={
                  handleRun
                }
                loading={
                  running
                }
                disabled={
                  !effectiveAccountId
                }
              >
                Run Backtest
              </Button>
            </div>
          </div>
        ) : null}

        {/* ====================================================
            RESULT VIEW
            ----------------------------------------------------
            Selected backend result ko full detail mein show karta hai.
            ==================================================== */}

        {activeTab === "results" ? (
          <ResultView
            result={
              selectedResult
            }
          />
        ) : null}

        {/* ====================================================
            BACKTEST HISTORY
            ----------------------------------------------------
            Previous backend-generated backtest results.
            ==================================================== */}

        {activeTab === "history" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>
                  Backtest History
                </h2>

                <p className="muted">
                  Previously completed backtests returned by the backend.
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

            {historyError ? (
              <ErrorState
                message={
                  historyError
                }
              />
            ) : null}

            {loadingHistory ? (
              <Loading
                label="Loading backtest history..."
              />
            ) : !history.length ? (
              <EmptyState
                title="No backtests"
                message="No completed backtest results were returned by the backend."
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
    </div>
  );
}
