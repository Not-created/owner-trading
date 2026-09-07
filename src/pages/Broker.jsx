import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConnectionStatus,
  EmptyState,
  ErrorState,
  Field,
  Grid,
  Input,
  Loading,
  Modal,
  PageHeader,
  Panel,
  PasswordInput,
  PnlValue,
  SearchInput,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Toggle,
} from "../components/UI.jsx";
import { useBrokerState } from "../context.jsx";
import { brokerApi } from "../api.jsx";
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  getApiArray,
  getApiData,
  getErrorMessage,
  normalizeBrokerStatus,
  normalizeOrderSide,
  normalizeOrderStatus,
  normalizeSymbol,
  safeNumber,
} from "../utils.js";

const BROKER_NAME = "Kotak Neo";

const TABS = [
  { id: "connection", label: "Connection" },
  { id: "account", label: "Account" },
  { id: "funds", label: "Funds" },
  { id: "holdings", label: "Holdings" },
  { id: "positions", label: "Positions" },
  { id: "orders", label: "Orders" },
  { id: "trades", label: "Trade History" },
  { id: "market", label: "Market Data" },
];

const emptyConnectionForm = {
  name: "Kotak Neo",
  consumerKey: "",
  mobileNumber: "",
  ucc: "",
  totp: "",
  mpin: "",
};

function pickValue(source, keys, fallback = null) {
  if (!source || typeof source !== "object") return fallback;

  for (const key of keys) {
    if (
      source[key] !== undefined &&
      source[key] !== null &&
      source[key] !== ""
    ) {
      return source[key];
    }
  }

  return fallback;
}

function getRecordId(record) {
  return pickValue(record, [
    "id",
    "account_id",
    "accountId",
    "broker_account_id",
    "brokerAccountId",
  ]);
}

function getSymbol(record) {
  return normalizeSymbol(
    pickValue(record, [
      "symbol",
      "tradingsymbol",
      "trading_symbol",
      "instrument_name",
      "instrumentName",
    ])
  );
}

function getQuantity(record) {
  return safeNumber(
    pickValue(record, [
      "quantity",
      "qty",
      "net_quantity",
      "netQuantity",
      "filled_quantity",
      "filledQuantity",
    ]),
    0
  );
}

function getPrice(record) {
  return safeNumber(
    pickValue(record, [
      "price",
      "ltp",
      "last_price",
      "lastPrice",
      "average_price",
      "averagePrice",
      "avg_price",
    ]),
    0
  );
}

function getPnl(record) {
  return safeNumber(
    pickValue(record, [
      "pnl",
      "p_and_l",
      "profit_loss",
      "profitLoss",
      "unrealized_pnl",
      "realized_pnl",
    ]),
    0
  );
}

function getTimestamp(record) {
  return pickValue(record, [
    "timestamp",
    "updated_at",
    "updatedAt",
    "created_at",
    "createdAt",
    "order_timestamp",
    "orderTimestamp",
  ]);
}

function getStatus(record) {
  return normalizeOrderStatus(
    pickValue(record, [
      "status",
      "order_status",
      "orderStatus",
      "state",
    ])
  );
}

function TableEmpty({ message = "No data available." }) {
  return (
    <EmptyState
      title="No records"
      message={message}
    />
  );
}

function DataTable({ columns, rows, loading, error, emptyMessage }) {
  if (loading) {
    return <Loading label="Loading broker data..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!rows.length) {
    return <TableEmpty message={emptyMessage} />;
  }

  return <Table columns={columns} data={rows} />;
}

function ValueCard({ label, value, subtext, loading }) {
  return (
    <Card className="metric-card">
      <div className="metric-card__label">{label}</div>

      {loading ? (
        <div className="skeleton metric-card__value" />
      ) : (
        <div className="metric-card__value">{value}</div>
      )}

      {subtext ? (
        <div className="metric-card__subtext">{subtext}</div>
      ) : null}
    </Card>
  );
}

export default function Broker() {
  const {
    accounts,
    connected,
    primaryAccount,
    setBrokerState,
  } = useBrokerState();

  const [activeTab, setActiveTab] = useState("connection");
  const [selectedAccountId, setSelectedAccountId] = useState(
    primaryAccount?.id || primaryAccount?.account_id || ""
  );

  const [connectionForm, setConnectionForm] = useState(
    emptyConnectionForm
  );

  const [showSecrets, setShowSecrets] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [accountInfo, setAccountInfo] = useState(null);
  const [funds, setFunds] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [quotes, setQuotes] = useState([]);

  const [dataErrors, setDataErrors] = useState({});

  const [quoteSearch, setQuoteSearch] = useState("");
  const [quoteSymbols, setQuoteSymbols] = useState("");

  const selectedAccount = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];

    if (selectedAccountId) {
      const exact = list.find(
        (account) =>
          String(getRecordId(account)) === String(selectedAccountId)
      );

      if (exact) return exact;
    }

    return primaryAccount || list[0] || null;
  }, [accounts, primaryAccount, selectedAccountId]);

  const effectiveAccountId = useMemo(
    () => getRecordId(selectedAccount),
    [selectedAccount]
  );

  const brokerStatus = useMemo(
    () =>
      normalizeBrokerStatus(
        selectedAccount?.status ||
          selectedAccount?.connection_status ||
          selectedAccount?.connectionStatus ||
          (connected ? "connected" : "disconnected")
      ),
    [selectedAccount, connected]
  );

  const isConnected =
    connected ||
    brokerStatus === "connected" ||
    brokerStatus === "active" ||
    brokerStatus === "online";

  const updateForm = useCallback((field, value) => {
    setConnectionForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const loadBrokerData = useCallback(
    async ({ silent = false } = {}) => {
      setPageError("");

      if (!silent) {
        setLoading(true);
      }

      const errors = {};

      try {
        const accountId = effectiveAccountId;

        const requests = await Promise.allSettled([
          brokerApi.getAccounts(),
          accountId
            ? brokerApi.getAccountInfo(accountId)
            : Promise.resolve(null),
          accountId
            ? brokerApi.getFunds(accountId)
            : Promise.resolve(null),
          accountId
            ? brokerApi.getHoldings(accountId)
            : Promise.resolve([]),
          accountId
            ? brokerApi.getPositions(accountId)
            : Promise.resolve([]),
          accountId
            ? brokerApi.getOrders(accountId)
            : Promise.resolve([]),
          accountId
            ? brokerApi.getTradeHistory(accountId)
            : Promise.resolve([]),
          quoteSymbols.trim()
            ? brokerApi.getQuotes({
                accountId,
                symbols: quoteSymbols
                  .split(",")
                  .map((symbol) => symbol.trim())
                  .filter(Boolean),
              })
            : Promise.resolve([]),
        ]);

        const [
          accountsResult,
          accountResult,
          fundsResult,
          holdingsResult,
          positionsResult,
          ordersResult,
          tradesResult,
          quotesResult,
        ] = requests;

        if (accountsResult.status === "fulfilled") {
          const nextAccounts = getApiArray(accountsResult.value);

          setBrokerState({
            accounts: nextAccounts,
          });

          if (!selectedAccountId && nextAccounts.length) {
            const firstId = getRecordId(nextAccounts[0]);

            if (firstId !== null && firstId !== undefined) {
              setSelectedAccountId(String(firstId));
            }
          }
        } else {
          errors.accounts = getErrorMessage(accountsResult.reason);
        }

        if (accountResult.status === "fulfilled") {
          setAccountInfo(getApiData(accountResult.value));
        } else if (accountResult.reason) {
          errors.account = getErrorMessage(accountResult.reason);
        }

        if (fundsResult.status === "fulfilled") {
          setFunds(getApiData(fundsResult.value));
        } else if (fundsResult.reason) {
          errors.funds = getErrorMessage(fundsResult.reason);
        }

        if (holdingsResult.status === "fulfilled") {
          setHoldings(getApiArray(holdingsResult.value));
        } else if (holdingsResult.reason) {
          errors.holdings = getErrorMessage(holdingsResult.reason);
        }

        if (positionsResult.status === "fulfilled") {
          setPositions(getApiArray(positionsResult.value));
        } else if (positionsResult.reason) {
          errors.positions = getErrorMessage(positionsResult.reason);
        }

        if (ordersResult.status === "fulfilled") {
          setOrders(getApiArray(ordersResult.value));
        } else if (ordersResult.reason) {
          errors.orders = getErrorMessage(ordersResult.reason);
        }

        if (tradesResult.status === "fulfilled") {
          setTradeHistory(getApiArray(tradesResult.value));
        } else if (tradesResult.reason) {
          errors.trades = getErrorMessage(tradesResult.reason);
        }

        if (quotesResult.status === "fulfilled") {
          setQuotes(getApiArray(quotesResult.value));
        } else if (quotesResult.reason) {
          errors.quotes = getErrorMessage(quotesResult.reason);
        }

        setDataErrors(errors);

        if (
          Object.keys(errors).length &&
          !accountResult?.value &&
          !fundsResult?.value &&
          !holdingsResult?.value &&
          !positionsResult?.value &&
          !ordersResult?.value
        ) {
          setPageError(
            "Broker data could not be loaded. Check the broker connection and backend status."
          );
        }
      } catch (error) {
        setPageError(getErrorMessage(error));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [
      effectiveAccountId,
      quoteSymbols,
      selectedAccountId,
      setBrokerState,
    ]
  );

  useEffect(() => {
    loadBrokerData();
  }, [loadBrokerData]);

  const handleConnect = async () => {
    setActionMessage("");
    setPageError("");
    setConnecting(true);

    try {
      const payload = {
        broker: "kotak_neo",
        name: connectionForm.name || BROKER_NAME,
        consumer_key: connectionForm.consumerKey.trim(),
        mobile_number: connectionForm.mobileNumber.trim(),
        ucc: connectionForm.ucc.trim(),
        totp: connectionForm.totp.trim(),
        mpin: connectionForm.mpin,
      };

      if (
        !payload.consumer_key ||
        !payload.mobile_number ||
        !payload.ucc ||
        !payload.totp ||
        !payload.mpin
      ) {
        throw new Error(
          "Consumer Key, Mobile Number, UCC, TOTP and MPIN are required."
        );
      }

      const response = await brokerApi.createAccount(payload);
      const createdAccount = getApiData(response);

      if (createdAccount) {
        setBrokerState({
          primaryAccount: createdAccount,
          connected: true,
        });

        const id = getRecordId(createdAccount);

        if (id !== null && id !== undefined) {
          setSelectedAccountId(String(id));
        }
      }

      setActionMessage(
        "Kotak Neo connection request completed successfully."
      );

      setConnectionForm((current) => ({
        ...current,
        totp: "",
        mpin: "",
      }));

      setShowConnectionModal(false);

      await loadBrokerData({ silent: true });
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!effectiveAccountId) {
      setPageError("No broker account is selected.");
      return;
    }

    setActionMessage("");
    setPageError("");
    setDisconnecting(true);

    try {
      await brokerApi.disconnect(effectiveAccountId);

      setBrokerState({
        connected: false,
      });

      setActionMessage("Kotak Neo broker session disconnected.");

      await loadBrokerData({ silent: true });
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    if (!effectiveAccountId) {
      setPageError("Connect a Kotak Neo account before testing it.");
      return;
    }

    setActionMessage("");
    setPageError("");
    setTesting(true);

    try {
      const response = await brokerApi.testConnection(effectiveAccountId);

      const result = getApiData(response);

      if (result?.connected === false || result?.success === false) {
        throw new Error(
          result?.message || "Broker connection test failed."
        );
      }

      setActionMessage("Kotak Neo connection test completed.");
      await loadBrokerData({ silent: true });
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const handleRefresh = async () => {
    await loadBrokerData();
  };

  const handleQuoteSearch = async () => {
    const symbols = quoteSearch
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    if (!symbols.length) {
      setPageError("Enter at least one symbol.");
      return;
    }

    setPageError("");

    try {
      const response = await brokerApi.getQuotes({
        accountId: effectiveAccountId,
        symbols,
      });

      setQuotes(getApiArray(response));
      setQuoteSymbols(symbols.join(", "));
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  const fundValues = useMemo(() => {
    const source = funds || {};

    return {
      available: safeNumber(
        pickValue(source, [
          "available",
          "available_balance",
          "availableBalance",
          "cash",
          "cash_balance",
          "cashBalance",
        ]),
        0
      ),
      utilized: safeNumber(
        pickValue(source, [
          "utilized",
          "utilised",
          "used",
          "used_margin",
          "usedMargin",
        ]),
        0
      ),
      total: safeNumber(
        pickValue(source, [
          "total",
          "total_balance",
          "totalBalance",
          "net_balance",
          "netBalance",
        ]),
        0
      ),
      margin: safeNumber(
        pickValue(source, [
          "margin",
          "available_margin",
          "availableMargin",
        ]),
        0
      ),
    };
  }, [funds]);

  const portfolioPnl = useMemo(
    () =>
      positions.reduce(
        (total, position) => total + getPnl(position),
        0
      ),
    [positions]
  );

  const holdingsValue = useMemo(
    () =>
      holdings.reduce(
        (total, holding) =>
          total + getQuantity(holding) * getPrice(holding),
        0
      ),
    [holdings]
  );

  const orderColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (row) => (
          <strong>{getSymbol(row) || "—"}</strong>
        ),
      },
      {
        key: "side",
        label: "Side",
        render: (row) => {
          const side = normalizeOrderSide(
            pickValue(row, ["side", "transaction_type", "transactionType"])
          );

          return <Badge>{side || "—"}</Badge>;
        },
      },
      {
        key: "quantity",
        label: "Qty",
        render: (row) => formatNumber(getQuantity(row)),
      },
      {
        key: "price",
        label: "Price",
        render: (row) => formatCurrency(getPrice(row)),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => (
          <StatusBadge status={getStatus(row) || "unknown"} />
        ),
      },
      {
        key: "timestamp",
        label: "Time",
        render: (row) => formatDateTime(getTimestamp(row)),
      },
    ],
    []
  );

  const positionColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (row) => (
          <strong>{getSymbol(row) || "—"}</strong>
        ),
      },
      {
        key: "quantity",
        label: "Qty",
        render: (row) => formatNumber(getQuantity(row)),
      },
      {
        key: "average",
        label: "Avg. Price",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, [
                "average_price",
                "averagePrice",
                "avg_price",
                "buy_average",
                "buyAverage",
              ]),
              0
            )
          ),
      },
      {
        key: "ltp",
        label: "LTP",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, [
                "ltp",
                "last_price",
                "lastPrice",
              ]),
              0
            )
          ),
      },
      {
        key: "pnl",
        label: "P&L",
        render: (row) => <PnlValue value={getPnl(row)} />,
      },
    ],
    []
  );

  const holdingColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (row) => (
          <strong>{getSymbol(row) || "—"}</strong>
        ),
      },
      {
        key: "quantity",
        label: "Qty",
        render: (row) => formatNumber(getQuantity(row)),
      },
      {
        key: "average",
        label: "Avg. Price",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, [
                "average_price",
                "averagePrice",
                "avg_price",
              ]),
              0
            )
          ),
      },
      {
        key: "ltp",
        label: "LTP",
        render: (row) => formatCurrency(getPrice(row)),
      },
      {
        key: "pnl",
        label: "P&L",
        render: (row) => <PnlValue value={getPnl(row)} />,
      },
    ],
    []
  );

  const tradeColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (row) => (
          <strong>{getSymbol(row) || "—"}</strong>
        ),
      },
      {
        key: "side",
        label: "Side",
        render: (row) => (
          <Badge>
            {normalizeOrderSide(
              pickValue(row, [
                "side",
                "transaction_type",
                "transactionType",
              ])
            ) || "—"}
          </Badge>
        ),
      },
      {
        key: "quantity",
        label: "Qty",
        render: (row) => formatNumber(getQuantity(row)),
      },
      {
        key: "price",
        label: "Price",
        render: (row) => formatCurrency(getPrice(row)),
      },
      {
        key: "tradeId",
        label: "Trade ID",
        render: (row) =>
          pickValue(row, [
            "trade_id",
            "tradeId",
            "execution_id",
            "executionId",
          ]) || "—",
      },
      {
        key: "time",
        label: "Time",
        render: (row) => formatDateTime(getTimestamp(row)),
      },
    ],
    []
  );

  const quoteColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (row) => (
          <strong>{getSymbol(row) || "—"}</strong>
        ),
      },
      {
        key: "ltp",
        label: "LTP",
        render: (row) => formatCurrency(getPrice(row)),
      },
      {
        key: "open",
        label: "Open",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, ["open", "open_price", "openPrice"]),
              0
            )
          ),
      },
      {
        key: "high",
        label: "High",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, ["high", "high_price", "highPrice"]),
              0
            )
          ),
      },
      {
        key: "low",
        label: "Low",
        render: (row) =>
          formatCurrency(
            safeNumber(
              pickValue(row, ["low", "low_price", "lowPrice"]),
              0
            )
          ),
      },
      {
        key: "volume",
        label: "Volume",
        render: (row) =>
          formatNumber(
            safeNumber(
              pickValue(row, ["volume", "vol"]),
              0
            )
          ),
      },
    ],
    []
  );

  const accountDetails = accountInfo || selectedAccount || {};

  return (
    <div className="page broker-page">
      <PageHeader
        title="Broker"
        subtitle="Kotak Neo connection, account and live broker data"
        actions={
          <div className="row gap-sm">
            <ConnectionStatus
              status={isConnected ? "connected" : "disconnected"}
            />

            <Button
              variant="secondary"
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {pageError ? (
        <Alert
          variant="danger"
          title="Broker error"
          message={pageError}
        />
      ) : null}

      {actionMessage ? (
        <Alert
          variant="success"
          title="Broker"
          message={actionMessage}
        />
      ) : null}

      <Grid columns={4} className="metrics-grid">
        <ValueCard
          label="Connection"
          value={isConnected ? "Connected" : "Disconnected"}
          subtext={BROKER_NAME}
          loading={loading && !selectedAccount}
        />

        <ValueCard
          label="Available Funds"
          value={formatCurrency(fundValues.available)}
          subtext="Broker-reported"
          loading={loading && !funds}
        />

        <ValueCard
          label="Positions P&L"
          value={<PnlValue value={portfolioPnl} />}
          subtext={`${positions.length} position(s)`}
          loading={loading && !positions.length}
        />

        <ValueCard
          label="Holdings Value"
          value={formatCurrency(holdingsValue)}
          subtext={`${holdings.length} holding(s)`}
          loading={loading && !holdings.length}
        />
      </Grid>

      <Panel className="broker-panel">
        <Tabs
          items={TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "connection" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Broker Connection</h2>
                <p className="muted">
                  Only Kotak Neo is active in the current broker scope.
                </p>
              </div>

              <StatusBadge
                status={isConnected ? "connected" : "disconnected"}
              />
            </div>

            <Card>
              <div className="broker-connection-summary">
                <div>
                  <div className="muted">Active Broker</div>
                  <strong>{BROKER_NAME}</strong>
                </div>

                <div>
                  <div className="muted">Account</div>
                  <strong>
                    {selectedAccount
                      ? pickValue(selectedAccount, [
                          "name",
                          "account_name",
                          "accountName",
                          "ucc",
                        ]) || "Connected account"
                      : "No account selected"}
                  </strong>
                </div>

                <div>
                  <div className="muted">Status</div>
                  <ConnectionStatus
                    status={
                      isConnected ? "connected" : "disconnected"
                    }
                  />
                </div>
              </div>
            </Card>

            <Card>
              <div className="section-header">
                <div>
                  <h3>Account Selection</h3>
                  <p className="muted">
                    Select the Kotak Neo account whose broker data you want
                    to inspect.
                  </p>
                </div>

                <Button
                  variant="primary"
                  onClick={() => setShowConnectionModal(true)}
                >
                  {accounts.length ? "Add / Connect Kotak Neo" : "Connect Kotak Neo"}
                </Button>
              </div>

              <Field label="Connected Account">
                <Select
                  value={selectedAccountId}
                  onChange={(event) =>
                    setSelectedAccountId(event.target.value)
                  }
                  options={[
                    {
                      value: "",
                      label: accounts.length
                        ? "Select account"
                        : "No connected accounts",
                    },
                    ...accounts.map((account, index) => {
                      const id = getRecordId(account);
                      const label =
                        pickValue(account, [
                          "name",
                          "account_name",
                          "accountName",
                          "ucc",
                          "mobile_number",
                          "mobileNumber",
                        ]) || `Kotak Neo Account ${index + 1}`;

                      return {
                        value:
                          id !== null && id !== undefined
                            ? String(id)
                            : "",
                        label,
                      };
                    }),
                  ]}
                />
              </Field>

              <div className="row gap-sm">
                <Button
                  variant="secondary"
                  onClick={handleTestConnection}
                  loading={testing}
                  disabled={!effectiveAccountId}
                >
                  Test Connection
                </Button>

                <Button
                  variant="danger"
                  onClick={handleDisconnect}
                  loading={disconnecting}
                  disabled={!effectiveAccountId || !isConnected}
                >
                  Disconnect
                </Button>
              </div>
            </Card>

            <Card>
              <div className="section-header">
                <div>
                  <h3>Live Data Session</h3>
                  <p className="muted">
                    Live market and broker data must come from the connected
                    backend/broker session. This screen does not fabricate
                    prices or connection state.
                  </p>
                </div>

                <Badge>
                  {isConnected ? "Broker session active" : "Unavailable"}
                </Badge>
              </div>
            </Card>
          </div>
        ) : null}

        {activeTab === "account" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Account Information</h2>
                <p className="muted">
                  Information returned by the connected Kotak Neo account.
                </p>
              </div>
            </div>

            {!selectedAccount && !accountInfo ? (
              <EmptyState
                title="No broker account"
                message="Connect Kotak Neo to load account information."
                action={
                  <Button
                    onClick={() => setShowConnectionModal(true)}
                  >
                    Connect Kotak Neo
                  </Button>
                }
              />
            ) : dataErrors.account ? (
              <ErrorState message={dataErrors.account} />
            ) : (
              <Grid columns={3}>
                <Card>
                  <div className="muted">Broker</div>
                  <strong>{BROKER_NAME}</strong>
                </Card>

                <Card>
                  <div className="muted">Account / UCC</div>
                  <strong>
                    {pickValue(accountDetails, [
                      "ucc",
                      "account_id",
                      "accountId",
                      "client_id",
                      "clientId",
                    ]) || "—"}
                  </strong>
                </Card>

                <Card>
                  <div className="muted">Mobile</div>
                  <strong>
                    {pickValue(accountDetails, [
                      "mobile_number",
                      "mobileNumber",
                      "mobile",
                    ]) || "—"}
                  </strong>
                </Card>

                <Card>
                  <div className="muted">Name</div>
                  <strong>
                    {pickValue(accountDetails, [
                      "name",
                      "full_name",
                      "fullName",
                      "account_name",
                      "accountName",
                    ]) || "—"}
                  </strong>
                </Card>

                <Card>
                  <div className="muted">Connection Status</div>
                  <StatusBadge
                    status={
                      isConnected ? "connected" : "disconnected"
                    }
                  />
                </Card>

                <Card>
                  <div className="muted">Account ID</div>
                  <strong>{effectiveAccountId || "—"}</strong>
                </Card>
              </Grid>
            )}
          </div>
        ) : null}

        {activeTab === "funds" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Funds & Margin</h2>
                <p className="muted">
                  Broker-reported funds only.
                </p>
              </div>
            </div>

            {dataErrors.funds ? (
              <ErrorState message={dataErrors.funds} />
            ) : (
              <Grid columns={4}>
                <ValueCard
                  label="Available"
                  value={formatCurrency(fundValues.available)}
                  loading={loading && !funds}
                />

                <ValueCard
                  label="Utilized"
                  value={formatCurrency(fundValues.utilized)}
                  loading={loading && !funds}
                />

                <ValueCard
                  label="Total"
                  value={formatCurrency(fundValues.total)}
                  loading={loading && !funds}
                />

                <ValueCard
                  label="Available Margin"
                  value={formatCurrency(fundValues.margin)}
                  loading={loading && !funds}
                />
              </Grid>
            )}

            {!funds && !loading && !dataErrors.funds ? (
              <EmptyState
                title="Funds unavailable"
                message="The connected broker has not returned funds data."
              />
            ) : null}
          </div>
        ) : null}

        {activeTab === "holdings" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Holdings</h2>
                <p className="muted">
                  Current holdings returned by Kotak Neo.
                </p>
              </div>

              <Badge>{holdings.length} records</Badge>
            </div>

            <DataTable
              columns={holdingColumns}
              rows={holdings}
              loading={loading && !holdings.length}
              error={dataErrors.holdings}
              emptyMessage="No holdings were returned by the broker."
            />
          </div>
        ) : null}

        {activeTab === "positions" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Positions</h2>
                <p className="muted">
                  Current broker positions and broker-reported P&L.
                </p>
              </div>

              <PnlValue value={portfolioPnl} />
            </div>

            <DataTable
              columns={positionColumns}
              rows={positions}
              loading={loading && !positions.length}
              error={dataErrors.positions}
              emptyMessage="No open positions were returned by the broker."
            />
          </div>
        ) : null}

        {activeTab === "orders" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Orders</h2>
                <p className="muted">
                  Broker order state as returned by Kotak Neo.
                </p>
              </div>

              <Badge>{orders.length} records</Badge>
            </div>

            <DataTable
              columns={orderColumns}
              rows={orders}
              loading={loading && !orders.length}
              error={dataErrors.orders}
              emptyMessage="No broker orders were returned."
            />
          </div>
        ) : null}

        {activeTab === "trades" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Trade History</h2>
                <p className="muted">
                  Executed trade history returned by the broker.
                </p>
              </div>

              <Badge>{tradeHistory.length} records</Badge>
            </div>

            <DataTable
              columns={tradeColumns}
              rows={tradeHistory}
              loading={loading && !tradeHistory.length}
              error={dataErrors.trades}
              emptyMessage="No trade history was returned."
            />
          </div>
        ) : null}

        {activeTab === "market" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Market Data</h2>
                <p className="muted">
                  Quotes are requested from the connected backend/broker.
                </p>
              </div>
            </div>

            <Card>
              <div className="row gap-sm responsive-row">
                <SearchInput
                  value={quoteSearch}
                  onChange={(event) =>
                    setQuoteSearch(event.target.value)
                  }
                  placeholder="Enter symbols, e.g. RELIANCE, INFY"
                />

                <Button
                  variant="primary"
                  onClick={handleQuoteSearch}
                  disabled={!effectiveAccountId}
                >
                  Get Quotes
                </Button>
              </div>

              <p className="muted helper-text">
                Separate multiple symbols with commas.
              </p>
            </Card>

            {dataErrors.quotes ? (
              <ErrorState message={dataErrors.quotes} />
            ) : null}

            <DataTable
              columns={quoteColumns}
              rows={quotes}
              loading={false}
              error={null}
              emptyMessage={
                quoteSymbols
                  ? "No quote data was returned."
                  : "Enter symbols above to request market data."
              }
            />
          </div>
        ) : null}
      </Panel>

      <Modal
        open={showConnectionModal}
        onClose={() => {
          if (!connecting) {
            setShowConnectionModal(false);
          }
        }}
        title="Connect Kotak Neo"
        size="medium"
      >
        <div className="stack gap-md">
          <Alert
            variant="info"
            title="Secure broker credentials"
            message="Credentials are sent to the backend for broker authentication. They are not stored in browser localStorage by this page."
          />

          <Field label="Broker">
            <Input
              value={BROKER_NAME}
              disabled
            />
          </Field>

          <Field
            label="Account Name"
            hint="Optional internal name for this broker connection."
          >
            <Input
              value={connectionForm.name}
              onChange={(event) =>
                updateForm("name", event.target.value)
              }
              placeholder="Kotak Neo"
              disabled={connecting}
            />
          </Field>

          <Field label="Consumer Key" required>
            <PasswordInput
              value={connectionForm.consumerKey}
              onChange={(event) =>
                updateForm("consumerKey", event.target.value)
              }
              placeholder="Enter Kotak Neo consumer key"
              disabled={connecting}
              reveal={showSecrets}
            />
          </Field>

          <Field label="Mobile Number" required>
            <Input
              value={connectionForm.mobileNumber}
              onChange={(event) =>
                updateForm("mobileNumber", event.target.value)
              }
              placeholder="Registered mobile number"
              inputMode="tel"
              autoComplete="tel"
              disabled={connecting}
            />
          </Field>

          <Field label="UCC / Client Code" required>
            <Input
              value={connectionForm.ucc}
              onChange={(event) =>
                updateForm("ucc", event.target.value)
              }
              placeholder="Enter Kotak Neo UCC"
              disabled={connecting}
            />
          </Field>

          <Field
            label="TOTP"
            required
            hint="Use the current one-time password generated for the broker login."
          >
            <Input
              value={connectionForm.totp}
              onChange={(event) =>
                updateForm("totp", event.target.value)
              }
              placeholder="Enter current TOTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              disabled={connecting}
              type={showSecrets ? "text" : "password"}
            />
          </Field>

          <Field label="MPIN" required>
            <PasswordInput
              value={connectionForm.mpin}
              onChange={(event) =>
                updateForm("mpin", event.target.value)
              }
              placeholder="Enter Kotak Neo MPIN"
              disabled={connecting}
              reveal={showSecrets}
            />
          </Field>

          <Toggle
            label="Show credential fields"
            checked={showSecrets}
            onChange={setShowSecrets}
            disabled={connecting}
          />

          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => setShowConnectionModal(false)}
              disabled={connecting}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              onClick={handleConnect}
              loading={connecting}
            >
              Connect Kotak Neo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
