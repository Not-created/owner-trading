import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  ChartContainer,
  ConnectionStatus,
  DataFreshness,
  EmptyState,
  ErrorState,
  Grid,
  Icon,
  IconButton,
  Loading,
  MarketTicker,
  MetricCard,
  PageHeader,
  PnlValue,
  PriceValue,
  Row,
  Section,
  StatusBadge,
  Table,
  Tabs,
} from "../components/UI.jsx";

import {
  brokerApi,
  orderApi,
  systemApi,
} from "../api.jsx";

import {
  formatDateTime,
  formatNumber,
  formatPercent,
  getApiArray,
  getApiData,
  getErrorMessage,
  getOrderId,
  getPnlClass,
  normalizeOrderSide,
  normalizeOrderStatus,
  normalizeSymbol,
} from "../utils.js";

/* =========================================================
   OWNER TRADING — DASHBOARD
   ========================================================= */

/*
 * Dashboard principle:
 *
 * 1. No fabricated market prices.
 * 2. No fabricated orders.
 * 3. No fabricated P&L.
 * 4. No fabricated broker status.
 * 5. Backend/API is the source of truth.
 * 6. If an API is unavailable, the UI says so.
 * 7. Dashboard does not place/cancel trades directly.
 * 8. Trading operations remain inside their dedicated modules.
 */

/* =========================================================
   SAFE DATA ACCESS
   ========================================================= */

function getFirstDefined(object, keys = []) {
  for (const key of keys) {
    if (
      object &&
      object[key] !== undefined &&
      object[key] !== null
    ) {
      return object[key];
    }
  }

  return undefined;
}

function getPnlValue(data) {
  if (!data) return null;

  return getFirstDefined(data, [
    "pnl",
    "p_and_l",
    "pnl_value",
    "profit_loss",
    "profitLoss",
    "unrealized_pnl",
    "unrealizedPnl",
    "total_pnl",
  ]);
}

function getDayPnl(data) {
  if (!data) return null;

  return getFirstDefined(data, [
    "day_pnl",
    "dayPnl",
    "daily_pnl",
    "dailyPnl",
    "today_pnl",
    "todayPnl",
  ]);
}

function getPortfolioValue(data) {
  if (!data) return null;

  return getFirstDefined(data, [
    "portfolio_value",
    "portfolioValue",
    "total_value",
    "totalValue",
    "market_value",
    "marketValue",
    "net_value",
    "netValue",
  ]);
}

function getAvailableFunds(data) {
  if (!data) return null;

  return getFirstDefined(data, [
    "available_funds",
    "availableFunds",
    "available_cash",
    "availableCash",
    "cash",
    "balance",
  ]);
}

/* =========================================================
   DASHBOARD
   ========================================================= */

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [brokerData, setBrokerData] = useState(null);
  const [accounts, setAccounts] = useState([]);

  const [funds, setFunds] = useState(null);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [systemData, setSystemData] = useState(null);

  const [lastUpdated, setLastUpdated] = useState(null);

  const [orderFilter, setOrderFilter] = useState("all");

  /* =======================================================
     LOAD DASHBOARD DATA
     ======================================================= */

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const results = await Promise.allSettled([
        brokerApi.getAccounts(),
        brokerApi.getInfo(),
        brokerApi.getFunds(),
        brokerApi.getPositions(),
        brokerApi.getOrders(),
        brokerApi.getQuotes(),
        systemApi.getStatus(),
      ]);

      const [
        accountsResult,
        brokerResult,
        fundsResult,
        positionsResult,
        ordersResult,
        quotesResult,
        systemResult,
      ] = results;

      let successful = 0;
      const failures = [];

      if (accountsResult.status === "fulfilled") {
        successful += 1;

        const data = getApiData(accountsResult.value, []);

        setAccounts(
          Array.isArray(data)
            ? data
            : Array.isArray(data?.accounts)
              ? data.accounts
              : []
        );
      } else {
        failures.push("accounts");
      }

      if (brokerResult.status === "fulfilled") {
        successful += 1;
        setBrokerData(getApiData(brokerResult.value, null));
      } else {
        failures.push("broker");
      }

      if (fundsResult.status === "fulfilled") {
        successful += 1;
        setFunds(getApiData(fundsResult.value, null));
      } else {
        failures.push("funds");
      }

      if (positionsResult.status === "fulfilled") {
        successful += 1;
        setPositions(getApiArray(positionsResult.value));
      } else {
        failures.push("positions");
      }

      if (ordersResult.status === "fulfilled") {
        successful += 1;
        setOrders(getApiArray(ordersResult.value));
      } else {
        failures.push("orders");
      }

      if (quotesResult.status === "fulfilled") {
        successful += 1;

        const quoteData = getApiData(
          quotesResult.value,
          []
        );

        setQuotes(
          Array.isArray(quoteData)
            ? quoteData
            : Array.isArray(quoteData?.quotes)
              ? quoteData.quotes
              : []
        );
      } else {
        failures.push("quotes");
      }

      if (systemResult.status === "fulfilled") {
        successful += 1;
        setSystemData(getApiData(systemResult.value, null));
      } else {
        failures.push("system");
      }

      setLastUpdated(new Date().toISOString());

      if (successful === 0) {
        setError(
          "Dashboard data could not be loaded from the backend."
        );
      } else if (failures.length > 0) {
        setError(
          `Some dashboard services are unavailable: ${failures.join(
            ", "
          )}.`
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    []
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /* =======================================================
     DERIVED DATA
     ======================================================= */

  const portfolio = useMemo(() => {
    const source =
      funds ||
      brokerData ||
      {};

    return {
      pnl: getPnlValue(source),
      dayPnl: getDayPnl(source),
      value: getPortfolioValue(source),
      funds: getAvailableFunds(source),
    };
  }, [funds, brokerData]);

  const openPositions = useMemo(
    () =>
      positions.filter((position) => {
        const quantity = Number(
          getFirstDefined(position, [
            "quantity",
            "qty",
            "net_quantity",
            "netQty",
          ])
        );

        return Number.isFinite(quantity)
          ? quantity !== 0
          : true;
      }),
    [positions]
  );

  const activeOrders = useMemo(
    () =>
      orders.filter((order) =>
        [
          "OPEN",
          "PENDING",
          "TRIGGER_PENDING",
          "PARTIALLY_FILLED",
        ].includes(
          normalizeOrderStatus(
            getFirstDefined(order, [
              "status",
              "order_status",
              "orderStatus",
            ])
          )
        )
      ),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") {
      return orders.slice(0, 10);
    }

    return orders
      .filter((order) => {
        const status = normalizeOrderStatus(
          getFirstDefined(order, [
            "status",
            "order_status",
            "orderStatus",
          ])
        );

        if (orderFilter === "open") {
          return [
            "OPEN",
            "PENDING",
            "TRIGGER_PENDING",
            "PARTIALLY_FILLED",
          ].includes(status);
        }

        if (orderFilter === "completed") {
          return status === "COMPLETED";
        }

        if (orderFilter === "rejected") {
          return status === "REJECTED";
        }

        return true;
      })
      .slice(0, 10);
  }, [orders, orderFilter]);

  const brokerConnection = useMemo(() => {
    const account =
      accounts.find(
        (item) =>
          item?.primary === true ||
          item?.is_primary === true
      ) || accounts[0];

    const source = account || brokerData;

    if (!source) {
      return {
        connected: false,
        connecting: false,
        label: "Unavailable",
      };
    }

    const rawStatus = String(
      getFirstDefined(source, [
        "status",
        "connection_status",
        "connectionStatus",
      ]) || ""
    ).toLowerCase();

    return {
      connected:
        source.connected === true ||
        ["connected", "online", "authenticated"].includes(
          rawStatus
        ),
      connecting: [
        "connecting",
        "reconnecting",
        "authenticating",
      ].includes(rawStatus),
      label:
        getFirstDefined(source, [
          "broker_name",
          "broker",
          "name",
        ]) || "Kotak Neo",
    };
  }, [accounts, brokerData]);

  /* =======================================================
     POSITION TABLE
     ======================================================= */

  const positionColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Instrument",
        accessor: (row) =>
          getFirstDefined(row, [
            "symbol",
            "trading_symbol",
            "tradingSymbol",
            "instrument_name",
          ]) || "—",
        render: (value, row) => (
          <div className="ot-table-primary">
            <strong>{normalizeSymbol(value)}</strong>
            <span>
              {getFirstDefined(row, [
                "exchange",
                "exchange_segment",
                "exchangeSegment",
              ]) || ""}
            </span>
          </div>
        ),
      },
      {
        key: "side",
        label: "Side",
        accessor: (row) =>
          getFirstDefined(row, [
            "side",
            "transaction_type",
            "transactionType",
          ]),
        render: (value) => (
          <Badge
            variant={
              normalizeOrderSide(value) === "BUY"
                ? "success"
                : "danger"
            }
          >
            {normalizeOrderSide(value)}
          </Badge>
        ),
      },
      {
        key: "quantity",
        label: "Qty",
        accessor: (row) =>
          getFirstDefined(row, [
            "quantity",
            "qty",
            "net_quantity",
            "netQty",
          ]),
        render: (value) =>
          Number.isFinite(Number(value))
            ? formatNumber(value, 0)
            : "—",
      },
      {
        key: "price",
        label: "LTP",
        accessor: (row) =>
          getFirstDefined(row, [
            "ltp",
            "last_price",
            "lastPrice",
            "current_price",
            "currentPrice",
          ]),
        render: (value) => (
          <PriceValue value={value} />
        ),
      },
      {
        key: "pnl",
        label: "P&L",
        accessor: (row) =>
          getPnlValue(row),
        render: (value) => (
          <PnlValue value={value} />
        ),
      },
    ],
    []
  );

  /* =======================================================
     ORDER TABLE
     ======================================================= */

  const orderColumns = useMemo(
    () => [
      {
        key: "id",
        label: "Order",
        accessor: (row) => getOrderId(row),
        render: (value) => (
          <span className="ot-mono">
            {value || "—"}
          </span>
        ),
      },
      {
        key: "symbol",
        label: "Instrument",
        accessor: (row) =>
          getFirstDefined(row, [
            "symbol",
            "trading_symbol",
            "tradingSymbol",
            "instrument_name",
          ]),
        render: (value) => (
          <strong>{normalizeSymbol(value) || "—"}</strong>
        ),
      },
      {
        key: "side",
        label: "Side",
        accessor: (row) =>
          getFirstDefined(row, [
            "side",
            "transaction_type",
            "transactionType",
          ]),
        render: (value) => (
          <Badge
            variant={
              normalizeOrderSide(value) === "BUY"
                ? "success"
                : "danger"
            }
          >
            {normalizeOrderSide(value)}
          </Badge>
        ),
      },
      {
        key: "quantity",
        label: "Qty",
        accessor: (row) =>
          getFirstDefined(row, [
            "quantity",
            "qty",
            "order_quantity",
            "orderQuantity",
          ]),
        render: (value) =>
          Number.isFinite(Number(value))
            ? formatNumber(value, 0)
            : "—",
      },
      {
        key: "price",
        label: "Price",
        accessor: (row) =>
          getFirstDefined(row, [
            "price",
            "order_price",
            "orderPrice",
            "average_price",
            "averagePrice",
          ]),
        render: (value) => (
          <PriceValue value={value} />
        ),
      },
      {
        key: "status",
        label: "Status",
        accessor: (row) =>
          getFirstDefined(row, [
            "status",
            "order_status",
            "orderStatus",
          ]),
        render: (value) => (
          <StatusBadge status={value} />
        ),
      },
      {
        key: "time",
        label: "Time",
        accessor: (row) =>
          getFirstDefined(row, [
            "timestamp",
            "created_at",
            "createdAt",
            "order_time",
            "orderTime",
          ]),
        render: (value) =>
          value ? formatDateTime(value) : "—",
      },
    ],
    []
  );

  /* =======================================================
     MARKET OVERVIEW
     ======================================================= */

  const marketItems = useMemo(
    () => quotes.slice(0, 6),
    [quotes]
  );

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="ot-page">
      <PageHeader
        title="Dashboard"
        subtitle="Real-time overview of your trading system."
        icon="dashboard"
        actions={
          <Row gap="sm">
            <DataFreshness timestamp={lastUpdated} />

            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              loading={refreshing}
              onClick={() =>
                loadDashboard({ silent: true })
              }
            >
              Refresh
            </Button>
          </Row>
        }
      />

      {error ? (
        <Alert
          variant="warning"
          title="Partial dashboard data"
        >
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Loading
          full
          label="Loading dashboard data..."
        />
      ) : (
        <>
          {/* =================================================
              TOP METRICS
              ================================================= */}

          <Grid columns={4}>
            <MetricCard
              label="Portfolio Value"
              value={
                portfolio.value !== null &&
                portfolio.value !== undefined
                  ? `₹${formatNumber(
                      portfolio.value,
                      2
                    )}`
                  : "—"
              }
              icon="wallet"
              variant="default"
            />

            <MetricCard
              label="Available Funds"
              value={
                portfolio.funds !== null &&
                portfolio.funds !== undefined
                  ? `₹${formatNumber(
                      portfolio.funds,
                      2
                    )}`
                  : "—"
              }
              icon="briefcase"
              variant="default"
            />

            <MetricCard
              label="Day P&L"
              value={
                portfolio.dayPnl !== null &&
                portfolio.dayPnl !== undefined
                  ? <PnlValue value={portfolio.dayPnl} />
                  : "—"
              }
              icon="trendingUp"
              variant={
                getPnlClass(portfolio.dayPnl) ===
                "profit"
                  ? "success"
                  : getPnlClass(portfolio.dayPnl) ===
                    "loss"
                    ? "danger"
                    : "default"
              }
            />

            <MetricCard
              label="Open Positions"
              value={formatNumber(
                openPositions.length,
                0
              )}
              subvalue={`${activeOrders.length} active orders`}
              icon="layers"
              variant="default"
            />
          </Grid>

          {/* =================================================
              BROKER + SYSTEM
              ================================================= */}

          <Grid columns={3}>
            <Card
              title="Broker Connection"
              subtitle="Primary trading connection"
              actions={
                <IconButton
                  icon="external"
                  label="Open broker"
                  onClick={() => {
                    window.location.hash = "#/broker";
                  }}
                />
              }
            >
              <div className="ot-dashboard-status-card">
                <ConnectionStatus
                  connected={
                    brokerConnection.connected
                  }
                  connecting={
                    brokerConnection.connecting
                  }
                  label={
                    brokerConnection.label
                  }
                />

                <div className="ot-dashboard-status-detail">
                  <span>Accounts</span>
                  <strong>
                    {accounts.length || "—"}
                  </strong>
                </div>

                <div className="ot-dashboard-status-detail">
                  <span>Trading access</span>
                  <StatusBadge
                    status={
                      brokerConnection.connected
                        ? "active"
                        : "inactive"
                    }
                  />
                </div>
              </div>
            </Card>

            <Card
              title="System Status"
              subtitle="Platform health"
            >
              <div className="ot-dashboard-system">
                <SystemStatusItem
                  label="API"
                  value={systemData?.api}
                />

                <SystemStatusItem
                  label="Execution"
                  value={systemData?.execution}
                />

                <SystemStatusItem
                  label="Market Feed"
                  value={
                    systemData?.market_feed ??
                    systemData?.marketFeed
                  }
                />

                <SystemStatusItem
                  label="Database"
                  value={systemData?.database}
                />
              </div>
            </Card>

            <Card
              title="Trading Snapshot"
              subtitle="Current account state"
            >
              <div className="ot-dashboard-snapshot">
                <SnapshotRow
                  label="Positions"
                  value={openPositions.length}
                />

                <SnapshotRow
                  label="Active Orders"
                  value={activeOrders.length}
                />

                <SnapshotRow
                  label="Total Orders"
                  value={orders.length}
                />

                <SnapshotRow
                  label="P&L"
                  value={
                    portfolio.pnl !== null &&
                    portfolio.pnl !== undefined
                      ? <PnlValue value={portfolio.pnl} />
                      : "—"
                  }
                />
              </div>
            </Card>
          </Grid>

          {/* =================================================
              MARKET OVERVIEW
              ================================================= */}

          <Section
            title="Market Overview"
            subtitle="Live market information received from the configured data source."
            actions={
              <Button
                variant="ghost"
                size="sm"
                icon="external"
                onClick={() => {
                  window.location.hash =
                    "#/broker";
                }}
              >
                Market data
              </Button>
            }
          >
            {marketItems.length > 0 ? (
              <div className="ot-market-grid">
                {marketItems.map((quote, index) => {
                  const symbol =
                    getFirstDefined(quote, [
                      "symbol",
                      "trading_symbol",
                      "tradingSymbol",
                    ]);

                  const price =
                    getFirstDefined(quote, [
                      "ltp",
                      "last_price",
                      "lastPrice",
                      "price",
                    ]);

                  const change =
                    getFirstDefined(quote, [
                      "change",
                      "price_change",
                      "priceChange",
                    ]);

                  const changePercent =
                    getFirstDefined(quote, [
                      "change_percent",
                      "changePercent",
                      "percent_change",
                    ]);

                  return (
                    <MarketTicker
                      key={
                        quote?.token ||
                        quote?.instrument_token ||
                        symbol ||
                        index
                      }
                      symbol={symbol}
                      exchange={getFirstDefined(
                        quote,
                        [
                          "exchange",
                          "exchange_segment",
                          "exchangeSegment",
                        ]
                      )}
                      value={
                        price !== undefined
                          ? formatNumber(
                              price,
                              2
                            )
                          : undefined
                      }
                      change={
                        change !== undefined
                          ? formatNumber(
                              change,
                              2
                            )
                          : undefined
                      }
                      changePercent={
                        changePercent !==
                        undefined
                          ? formatPercent(
                              changePercent,
                              2,
                              true
                            )
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon="chartLine"
                title="Market data unavailable"
                description="No live quote data was returned by the configured market-data source."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="refresh"
                    onClick={() =>
                      loadDashboard({
                        silent: true,
                      })
                    }
                  >
                    Retry
                  </Button>
                }
              />
            )}
          </Section>

          {/* =================================================
              POSITIONS
              ================================================= */}

          <Card
            title="Open Positions"
            subtitle="Current broker-reported positions"
            actions={
              <Button
                variant="ghost"
                size="sm"
                iconRight="arrowRight"
                onClick={() => {
                  window.location.hash =
                    "#/positions";
                }}
              >
                View all
              </Button>
            }
          >
            {openPositions.length > 0 ? (
              <Table
                columns={positionColumns}
                data={openPositions.slice(0, 8)}
                rowKey={(row, index) =>
                  row?.position_id ??
                  row?.id ??
                  row?.symbol ??
                  index
                }
              />
            ) : (
              <EmptyState
                compact
                icon="layers"
                title="No open positions"
                description="The broker has not reported any open positions."
              />
            )}
          </Card>

          {/* =================================================
              ORDERS
              ================================================= */}

          <Card
            title="Recent Orders"
            subtitle="Latest orders reported by the broker"
            actions={
              <Button
                variant="ghost"
                size="sm"
                iconRight="arrowRight"
                onClick={() => {
                  window.location.hash =
                    "#/orders";
                }}
              >
                View all
              </Button>
            }
          >
            <div className="ot-dashboard-tabs">
              <Tabs
                tabs={[
                  {
                    value: "all",
                    label: "All",
                    count: orders.length,
                  },
                  {
                    value: "open",
                    label: "Open",
                    count: activeOrders.length,
                  },
                  {
                    value: "completed",
                    label: "Completed",
                  },
                  {
                    value: "rejected",
                    label: "Rejected",
                  },
                ]}
                value={orderFilter}
                onChange={setOrderFilter}
              />
            </div>

            {filteredOrders.length > 0 ? (
              <Table
                columns={orderColumns}
                data={filteredOrders}
                rowKey={(row, index) =>
                  getOrderId(row) ||
                  row?.id ||
                  index
                }
              />
            ) : (
              <EmptyState
                compact
                icon="orders"
                title="No orders found"
                description="No broker-reported orders match the selected filter."
              />
            )}
          </Card>

          {/* =================================================
              QUICK ACCESS
              ================================================= */}

          <Section
            title="Quick Access"
            subtitle="Open the dedicated module for detailed control."
          >
            <Grid columns={4}>
              <QuickAccess
                icon="briefcase"
                title="Broker"
                description="Connection and account management"
                onClick={() => {
                  window.location.hash =
                    "#/broker";
                }}
              />

              <QuickAccess
                icon="orders"
                title="Orders"
                description="Review and manage orders"
                onClick={() => {
                  window.location.hash =
                    "#/orders";
                }}
              />

              <QuickAccess
                icon="layers"
                title="Positions"
                description="Positions, exposure and P&L"
                onClick={() => {
                  window.location.hash =
                    "#/positions";
                }}
              />

              <QuickAccess
                icon="chart"
                title="Strategies"
                description="Create and control strategies"
                onClick={() => {
                  window.location.hash =
                    "#/strategies";
                }}
              />
            </Grid>
          </Section>
        </>
      )}
    </div>
  );
}

/* =========================================================
   SYSTEM STATUS ITEM
   ========================================================= */

function SystemStatusItem({ label, value }) {
  const normalized = String(
    value ?? ""
  ).toLowerCase();

  const known =
    value !== undefined &&
    value !== null &&
    value !== "";

  let status = "unknown";

  if (
    ["healthy", "ok", "online", "connected", "active"].includes(
      normalized
    )
  ) {
    status = "success";
  } else if (
    ["warning", "degraded", "connecting"].includes(
      normalized
    )
  ) {
    status = "warning";
  } else if (
    ["error", "failed", "offline", "down"].includes(
      normalized
    )
  ) {
    status = "danger";
  }

  return (
    <div className="ot-system-status-item">
      <span>{label}</span>

      {known ? (
        <StatusBadge
          status={status}
          label={String(value)}
        />
      ) : (
        <Badge variant="neutral">
          Unavailable
        </Badge>
      )}
    </div>
  );
}

/* =========================================================
   SNAPSHOT ROW
   ========================================================= */

function SnapshotRow({ label, value }) {
  return (
    <div className="ot-snapshot-row">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

/* =========================================================
   QUICK ACCESS
   ========================================================= */

function QuickAccess({
  icon,
  title,
  description,
  onClick,
}) {
  return (
    <button
      type="button"
      className="ot-quick-access"
      onClick={onClick}
    >
      <span className="ot-quick-access-icon">
        <Icon name={icon} size={20} />
      </span>

      <span className="ot-quick-access-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>

      <Icon
        name="chevronRight"
        size={17}
        className="ot-quick-access-arrow"
      />
    </button>
  );
}
