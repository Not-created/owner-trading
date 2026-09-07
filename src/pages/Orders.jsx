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
  PnlValue,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  Table,
} from "../components/UI.jsx";
import { useBrokerState } from "../context.jsx";
import { brokerApi, orderApi } from "../api.jsx";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  getApiArray,
  getApiData,
  getErrorMessage,
  normalizeOrderSide,
  normalizeOrderStatus,
  safeNumber,
} from "../utils.js";

const ORDER_TABS = [
  { id: "orders", label: "Orders" },
  { id: "place", label: "Place Order" },
];

const INITIAL_ORDER = {
  symbol: "",
  exchange: "NSE",
  side: "BUY",
  orderType: "MARKET",
  quantity: "",
  price: "",
  triggerPrice: "",
  product: "CNC",
  validity: "DAY",
  disclosedQuantity: "",
};

const MODIFY_INITIAL = {
  quantity: "",
  price: "",
  triggerPrice: "",
  orderType: "",
  validity: "",
};

function value(record, keys, fallback = null) {
  if (!record || typeof record !== "object") return fallback;

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

function orderId(order) {
  return value(order, [
    "id",
    "order_id",
    "orderId",
    "broker_order_id",
    "brokerOrderId",
  ]);
}

function symbolOf(order) {
  return (
    value(order, [
      "symbol",
      "tradingsymbol",
      "trading_symbol",
      "instrument",
      "instrument_name",
    ]) || "—"
  );
}

function quantityOf(order) {
  return safeNumber(
    value(order, [
      "quantity",
      "qty",
      "order_quantity",
      "orderQuantity",
      "filled_quantity",
      "filledQuantity",
    ]),
    0
  );
}

function priceOf(order) {
  return safeNumber(
    value(order, [
      "price",
      "limit_price",
      "limitPrice",
      "average_price",
      "averagePrice",
      "avg_price",
    ]),
    0
  );
}

function sideOf(order) {
  return (
    normalizeOrderSide(
      value(order, [
        "side",
        "transaction_type",
        "transactionType",
      ])
    ) || "—"
  );
}

function statusOf(order) {
  return (
    normalizeOrderStatus(
      value(order, [
        "status",
        "order_status",
        "orderStatus",
        "state",
      ])
    ) || "unknown"
  );
}

function orderTypeOf(order) {
  return (
    value(order, [
      "order_type",
      "orderType",
      "ord_type",
      "type",
    ]) || "—"
  );
}

function productOf(order) {
  return (
    value(order, [
      "product",
      "product_type",
      "productType",
    ]) || "—"
  );
}

function timestampOf(order) {
  return value(order, [
    "timestamp",
    "created_at",
    "createdAt",
    "order_timestamp",
    "orderTimestamp",
    "updated_at",
    "updatedAt",
  ]);
}

function isPendingOrder(order) {
  const status = statusOf(order).toLowerCase();

  return [
    "pending",
    "open",
    "trigger pending",
    "trigger_pending",
    "validation pending",
    "open pending",
    "partially filled",
    "partial",
  ].includes(status);
}

function isCancellableOrder(order) {
  const status = statusOf(order).toLowerCase();

  return ![
    "cancelled",
    "canceled",
    "complete",
    "completed",
    "filled",
    "rejected",
    "expired",
    "unknown",
  ].includes(status);
}

function isModifiableOrder(order) {
  const status = statusOf(order).toLowerCase();

  return [
    "pending",
    "open",
    "trigger pending",
    "trigger_pending",
    "partially filled",
    "partial",
  ].includes(status);
}

function DataTable({ columns, rows, loading, error, emptyMessage }) {
  if (loading) {
    return <Loading label="Loading orders..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No orders"
        message={emptyMessage}
      />
    );
  }

  return <Table columns={columns} data={rows} />;
}

export default function Orders() {
  const { accounts, primaryAccount } = useBrokerState();

  const [activeTab, setActiveTab] = useState("orders");

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);

  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const [dataError, setDataError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sideFilter, setSideFilter] = useState("ALL");

  const [orderForm, setOrderForm] = useState(INITIAL_ORDER);

  const [modifyForm, setModifyForm] = useState(MODIFY_INITIAL);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const [selectedAccountId, setSelectedAccountId] = useState(
    primaryAccount?.id ||
      primaryAccount?.account_id ||
      ""
  );

  const selectedAccount = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];

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

      if (found) return found;
    }

    return primaryAccount || list[0] || null;
  }, [accounts, primaryAccount, selectedAccountId]);

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

  const updateOrderForm = useCallback((field, nextValue) => {
    setOrderForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  }, []);

  const updateModifyForm = useCallback((field, nextValue) => {
    setModifyForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setDataError("");
    setPageError("");

    try {
      if (!effectiveAccountId) {
        setOrders([]);
        return;
      }

      const response = await orderApi.list({
        accountId: effectiveAccountId,
      });

      setOrders(getApiArray(response));
    } catch (error) {
      setDataError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [effectiveAccountId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return orders.filter((order) => {
      const symbol = symbolOf(order).toLowerCase();
      const id = String(orderId(order) || "").toLowerCase();
      const status = statusOf(order).toLowerCase();
      const side = sideOf(order).toLowerCase();

      const matchesSearch =
        !query ||
        symbol.includes(query) ||
        id.includes(query);

      const matchesStatus =
        statusFilter === "ALL" ||
        status === statusFilter.toLowerCase();

      const matchesSide =
        sideFilter === "ALL" ||
        side === sideFilter.toLowerCase();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesSide
      );
    });
  }, [orders, search, statusFilter, sideFilter]);

  const pendingCount = useMemo(
    () => orders.filter(isPendingOrder).length,
    [orders]
  );

  const completedCount = useMemo(
    () =>
      orders.filter((order) => {
        const status = statusOf(order).toLowerCase();

        return [
          "complete",
          "completed",
          "filled",
        ].includes(status);
      }).length,
    [orders]
  );

  const rejectedCount = useMemo(
    () =>
      orders.filter(
        (order) => statusOf(order).toLowerCase() === "rejected"
      ).length,
    [orders]
  );

  const handlePlaceOrder = async () => {
    setPageError("");
    setActionMessage("");

    if (!effectiveAccountId) {
      setPageError(
        "Select or connect a Kotak Neo account before placing an order."
      );
      return;
    }

    const symbol = orderForm.symbol.trim();
    const quantity = safeNumber(orderForm.quantity, 0);

    if (!symbol) {
      setPageError("Trading symbol is required.");
      return;
    }

    if (!quantity || quantity <= 0) {
      setPageError("Quantity must be greater than zero.");
      return;
    }

    if (
      ["LIMIT", "SL", "SL-M"].includes(orderForm.orderType) &&
      safeNumber(orderForm.price, 0) <= 0 &&
      orderForm.orderType === "LIMIT"
    ) {
      setPageError("A valid limit price is required.");
      return;
    }

    if (
      ["SL", "SL-M"].includes(orderForm.orderType) &&
      safeNumber(orderForm.triggerPrice, 0) <= 0
    ) {
      setPageError("A valid trigger price is required.");
      return;
    }

    setPlacing(true);

    try {
      const payload = {
        accountId: effectiveAccountId,
        symbol,
        exchange: orderForm.exchange,
        side: orderForm.side,
        orderType: orderForm.orderType,
        quantity,
        product: orderForm.product,
        validity: orderForm.validity,
      };

      if (orderForm.orderType === "LIMIT") {
        payload.price = safeNumber(orderForm.price, 0);
      }

      if (
        orderForm.orderType === "SL" ||
        orderForm.orderType === "SL-M"
      ) {
        payload.triggerPrice = safeNumber(
          orderForm.triggerPrice,
          0
        );

        if (orderForm.orderType === "SL") {
          payload.price = safeNumber(orderForm.price, 0);
        }
      }

      if (orderForm.disclosedQuantity) {
        payload.disclosedQuantity = safeNumber(
          orderForm.disclosedQuantity,
          0
        );
      }

      const response = await orderApi.place(payload);
      const result = getApiData(response);

      setActionMessage(
        `Order request submitted for ${symbol}.`
      );

      setOrderForm(INITIAL_ORDER);

      if (result) {
        setOrders((current) => [
          result,
          ...current,
        ]);
      }

      setActiveTab("orders");
      await loadOrders();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setPlacing(false);
    }
  };

  const openModify = (order) => {
    setSelectedOrder(order);

    setModifyForm({
      quantity:
        quantityOf(order) > 0
          ? String(quantityOf(order))
          : "",
      price:
        priceOf(order) > 0
          ? String(priceOf(order))
          : "",
      triggerPrice:
        safeNumber(
          value(order, [
            "trigger_price",
            "triggerPrice",
            "trigger",
          ]),
          0
        ) > 0
          ? String(
              safeNumber(
                value(order, [
                  "trigger_price",
                  "triggerPrice",
                  "trigger",
                ]),
                0
              )
            )
          : "",
      orderType:
        value(order, [
          "order_type",
          "orderType",
          "ord_type",
        ]) || "",
      validity:
        value(order, [
          "validity",
          "validity_type",
        ]) || "",
    });

    setShowModifyModal(true);
  };

  const handleModifyOrder = async () => {
    if (!selectedOrder) return;

    const id = orderId(selectedOrder);

    if (!id) {
      setPageError("The selected order has no broker order ID.");
      return;
    }

    setModifying(true);
    setPageError("");
    setActionMessage("");

    try {
      const payload = {
        accountId: effectiveAccountId,
        orderId: id,
      };

      if (modifyForm.quantity) {
        const quantity = safeNumber(
          modifyForm.quantity,
          0
        );

        if (quantity <= 0) {
          throw new Error(
            "Modified quantity must be greater than zero."
          );
        }

        payload.quantity = quantity;
      }

      if (modifyForm.price) {
        const price = safeNumber(
          modifyForm.price,
          0
        );

        if (price <= 0) {
          throw new Error(
            "Modified price must be greater than zero."
          );
        }

        payload.price = price;
      }

      if (modifyForm.triggerPrice) {
        const triggerPrice = safeNumber(
          modifyForm.triggerPrice,
          0
        );

        if (triggerPrice <= 0) {
          throw new Error(
            "Modified trigger price must be greater than zero."
          );
        }

        payload.triggerPrice = triggerPrice;
      }

      if (modifyForm.orderType) {
        payload.orderType = modifyForm.orderType;
      }

      if (modifyForm.validity) {
        payload.validity = modifyForm.validity;
      }

      const response = await orderApi.modify(payload);
      const result = getApiData(response);

      setActionMessage(
        `Order ${id} modification request submitted.`
      );

      if (result) {
        setOrders((current) =>
          current.map((order) =>
            String(orderId(order)) === String(id)
              ? { ...order, ...result }
              : order
          )
        );
      }

      setShowModifyModal(false);
      setSelectedOrder(null);

      await loadOrders();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setModifying(false);
    }
  };

  const openCancel = (order) => {
    setSelectedOrder(order);
    setShowCancelDialog(true);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;

    const id = orderId(selectedOrder);

    if (!id) {
      setPageError("The selected order has no broker order ID.");
      setShowCancelDialog(false);
      return;
    }

    setCancelling(true);
    setPageError("");
    setActionMessage("");

    try {
      const response = await orderApi.cancel({
        accountId: effectiveAccountId,
        orderId: id,
      });

      const result = getApiData(response);

      setActionMessage(
        `Order ${id} cancellation request submitted.`
      );

      if (result) {
        setOrders((current) =>
          current.map((order) =>
            String(orderId(order)) === String(id)
              ? { ...order, ...result }
              : order
          )
        );
      }

      setShowCancelDialog(false);
      setSelectedOrder(null);

      await loadOrders();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  };

  const handleRefreshStatus = async (order) => {
    const id = orderId(order);

    if (!id) {
      setPageError("This order has no broker order ID.");
      return;
    }

    setRefreshingStatus(true);
    setPageError("");
    setActionMessage("");

    try {
      const response = await orderApi.status({
        accountId: effectiveAccountId,
        orderId: id,
      });

      const result = getApiData(response);

      if (result) {
        setOrders((current) =>
          current.map((currentOrder) =>
            String(orderId(currentOrder)) === String(id)
              ? { ...currentOrder, ...result }
              : currentOrder
          )
        );
      }

      setActionMessage(
        `Order ${id} status refreshed from the broker.`
      );
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setRefreshingStatus(false);
    }
  };

  const orderColumns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (order) => (
          <div>
            <strong>{symbolOf(order)}</strong>
            <div className="muted text-xs">
              {value(order, [
                "exchange",
                "exchange_segment",
              ]) || "—"}
            </div>
          </div>
        ),
      },
      {
        key: "side",
        label: "Side",
        render: (order) => (
          <Badge>{sideOf(order)}</Badge>
        ),
      },
      {
        key: "quantity",
        label: "Quantity",
        render: (order) =>
          formatNumber(quantityOf(order)),
      },
      {
        key: "type",
        label: "Type",
        render: (order) => orderTypeOf(order),
      },
      {
        key: "price",
        label: "Price",
        render: (order) =>
          priceOf(order) > 0
            ? formatCurrency(priceOf(order))
            : "Market",
      },
      {
        key: "product",
        label: "Product",
        render: (order) => productOf(order),
      },
      {
        key: "status",
        label: "Status",
        render: (order) => (
          <StatusBadge status={statusOf(order)} />
        ),
      },
      {
        key: "time",
        label: "Time",
        render: (order) =>
          formatDateTime(timestampOf(order)),
      },
      {
        key: "actions",
        label: "Actions",
        render: (order) => (
          <div className="row gap-xs">
            <Button
              size="small"
              variant="ghost"
              onClick={() =>
                handleRefreshStatus(order)
              }
              loading={
                refreshingStatus &&
                selectedOrder &&
                orderId(selectedOrder) === orderId(order)
              }
            >
              Refresh
            </Button>

            {isModifiableOrder(order) ? (
              <Button
                size="small"
                variant="secondary"
                onClick={() => openModify(order)}
              >
                Modify
              </Button>
            ) : null}

            {isCancellableOrder(order) ? (
              <Button
                size="small"
                variant="danger"
                onClick={() => openCancel(order)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [
      refreshingStatus,
      selectedOrder,
    ]
  );

  return (
    <div className="page orders-page">
      <PageHeader
        title="Orders"
        subtitle="Place, modify, cancel and monitor broker orders"
        actions={
          <div className="row gap-sm">
            <Badge>
              {pendingCount} pending
            </Badge>

            <Button
              variant="secondary"
              onClick={loadOrders}
              loading={loading}
            >
              Refresh Orders
            </Button>
          </div>
        }
      />

      {pageError ? (
        <Alert
          variant="danger"
          title="Order operation failed"
          message={pageError}
        />
      ) : null}

      {actionMessage ? (
        <Alert
          variant="success"
          title="Order"
          message={actionMessage}
        />
      ) : null}

      <Grid columns={4} className="metrics-grid">
        <Card className="metric-card">
          <div className="metric-card__label">
            Total Orders
          </div>
          <div className="metric-card__value">
            {formatNumber(orders.length)}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Pending
          </div>
          <div className="metric-card__value">
            {formatNumber(pendingCount)}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Completed
          </div>
          <div className="metric-card__value">
            {formatNumber(completedCount)}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Rejected
          </div>
          <div className="metric-card__value">
            {formatNumber(rejectedCount)}
          </div>
        </Card>
      </Grid>

      <Panel>
        <Tabs
          items={ORDER_TABS}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === "orders" ? (
          <div className="stack gap-lg">
            <Card>
              <Grid columns={4}>
                <Field label="Search">
                  <SearchInput
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Symbol or order ID"
                  />
                </Field>

                <Field label="Status">
                  <Select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value)
                    }
                    options={[
                      {
                        value: "ALL",
                        label: "All statuses",
                      },
                      {
                        value: "PENDING",
                        label: "Pending",
                      },
                      {
                        value: "OPEN",
                        label: "Open",
                      },
                      {
                        value: "COMPLETE",
                        label: "Complete",
                      },
                      {
                        value: "REJECTED",
                        label: "Rejected",
                      },
                      {
                        value: "CANCELLED",
                        label: "Cancelled",
                      },
                    ]}
                  />
                </Field>

                <Field label="Side">
                  <Select
                    value={sideFilter}
                    onChange={(event) =>
                      setSideFilter(event.target.value)
                    }
                    options={[
                      {
                        value: "ALL",
                        label: "Buy + Sell",
                      },
                      {
                        value: "BUY",
                        label: "Buy",
                      },
                      {
                        value: "SELL",
                        label: "Sell",
                      },
                    ]}
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
                        (account, index) => {
                          const id = value(account, [
                            "id",
                            "account_id",
                            "accountId",
                          ]);

                          return {
                            value:
                              id !== null &&
                              id !== undefined
                                ? String(id)
                                : "",
                            label:
                              value(account, [
                                "name",
                                "account_name",
                                "accountName",
                                "ucc",
                              ]) ||
                              `Account ${index + 1}`,
                          };
                        }
                      ),
                    ]}
                  />
                </Field>
              </Grid>
            </Card>

            <DataTable
              columns={orderColumns}
              rows={filteredOrders}
              loading={loading}
              error={dataError}
              emptyMessage={
                orders.length
                  ? "No orders match the selected filters."
                  : "No broker orders have been returned."
              }
            />
          </div>
        ) : null}

        {activeTab === "place" ? (
          <div className="stack gap-lg">
            <div className="section-header">
              <div>
                <h2>Place Order</h2>
                <p className="muted">
                  Orders are submitted to the connected broker through
                  the backend. This form does not simulate execution.
                </p>
              </div>

              <Badge>
                {selectedAccount
                  ? "Kotak Neo account selected"
                  : "No account selected"}
              </Badge>
            </div>

            {!effectiveAccountId ? (
              <Alert
                variant="warning"
                title="Broker account required"
                message="Connect/select a Kotak Neo account before submitting a live order."
              />
            ) : null}

            <Card>
              <Grid columns={3}>
                <Field
                  label="Trading Symbol"
                  required
                >
                  <Input
                    value={orderForm.symbol}
                    onChange={(event) =>
                      updateOrderForm(
                        "symbol",
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="RELIANCE"
                    disabled={placing}
                  />
                </Field>

                <Field label="Exchange" required>
                  <Select
                    value={orderForm.exchange}
                    onChange={(event) =>
                      updateOrderForm(
                        "exchange",
                        event.target.value
                      )
                    }
                    disabled={placing}
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

                <Field label="Side" required>
                  <Select
                    value={orderForm.side}
                    onChange={(event) =>
                      updateOrderForm(
                        "side",
                        event.target.value
                      )
                    }
                    disabled={placing}
                    options={[
                      {
                        value: "BUY",
                        label: "BUY",
                      },
                      {
                        value: "SELL",
                        label: "SELL",
                      },
                    ]}
                  />
                </Field>

                <Field label="Order Type" required>
                  <Select
                    value={orderForm.orderType}
                    onChange={(event) =>
                      updateOrderForm(
                        "orderType",
                        event.target.value
                      )
                    }
                    disabled={placing}
                    options={[
                      {
                        value: "MARKET",
                        label: "Market",
                      },
                      {
                        value: "LIMIT",
                        label: "Limit",
                      },
                      {
                        value: "SL",
                        label: "Stop Loss",
                      },
                      {
                        value: "SL-M",
                        label: "Stop Loss Market",
                      },
                    ]}
                  />
                </Field>

                <Field label="Quantity" required>
                  <NumberInput
                    value={orderForm.quantity}
                    onChange={(event) =>
                      updateOrderForm(
                        "quantity",
                        event.target.value
                      )
                    }
                    min="1"
                    step="1"
                    placeholder="Quantity"
                    disabled={placing}
                  />
                </Field>

                <Field label="Product" required>
                  <Select
                    value={orderForm.product}
                    onChange={(event) =>
                      updateOrderForm(
                        "product",
                        event.target.value
                      )
                    }
                    disabled={placing}
                    options={[
                      {
                        value: "CNC",
                        label: "CNC",
                      },
                      {
                        value: "MIS",
                        label: "MIS",
                      },
                      {
                        value: "NRML",
                        label: "NRML",
                      },
                    ]}
                  />
                </Field>

                <Field label="Validity">
                  <Select
                    value={orderForm.validity}
                    onChange={(event) =>
                      updateOrderForm(
                        "validity",
                        event.target.value
                      )
                    }
                    disabled={placing}
                    options={[
                      {
                        value: "DAY",
                        label: "DAY",
                      },
                      {
                        value: "IOC",
                        label: "IOC",
                      },
                    ]}
                  />
                </Field>

                {orderForm.orderType === "LIMIT" ||
                orderForm.orderType === "SL" ? (
                  <Field
                    label="Price"
                    required={
                      orderForm.orderType === "LIMIT" ||
                      orderForm.orderType === "SL"
                    }
                  >
                    <NumberInput
                      value={orderForm.price}
                      onChange={(event) =>
                        updateOrderForm(
                          "price",
                          event.target.value
                        )
                      }
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      disabled={placing}
                    />
                  </Field>
                ) : null}

                {orderForm.orderType === "SL" ||
                orderForm.orderType === "SL-M" ? (
                  <Field
                    label="Trigger Price"
                    required
                  >
                    <NumberInput
                      value={orderForm.triggerPrice}
                      onChange={(event) =>
                        updateOrderForm(
                          "triggerPrice",
                          event.target.value
                        )
                      }
                      min="0"
                      step="0.01"
                      placeholder="Trigger price"
                      disabled={placing}
                    />
                  </Field>
                ) : null}

                <Field
                  label="Disclosed Quantity"
                  hint="Optional."
                >
                  <NumberInput
                    value={orderForm.disclosedQuantity}
                    onChange={(event) =>
                      updateOrderForm(
                        "disclosedQuantity",
                        event.target.value
                      )
                    }
                    min="0"
                    step="1"
                    placeholder="Optional"
                    disabled={placing}
                  />
                </Field>
              </Grid>
            </Card>

            <Alert
              variant="warning"
              title="Live trading action"
              message="Submitting this form can create a real broker order when the backend is configured for live trading. Verify symbol, side, quantity, product and price before submitting."
            />

            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setOrderForm(INITIAL_ORDER)
                }
                disabled={placing}
              >
                Reset
              </Button>

              <Button
                variant={
                  orderForm.side === "BUY"
                    ? "success"
                    : "danger"
                }
                onClick={handlePlaceOrder}
                loading={placing}
                disabled={!effectiveAccountId}
              >
                Submit {orderForm.side} Order
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Modal
        open={showModifyModal}
        onClose={() => {
          if (!modifying) {
            setShowModifyModal(false);
            setSelectedOrder(null);
          }
        }}
        title="Modify Order"
        size="medium"
      >
        {selectedOrder ? (
          <div className="stack gap-md">
            <Card>
              <div className="row justify-between">
                <div>
                  <div className="muted">
                    Symbol
                  </div>
                  <strong>
                    {symbolOf(selectedOrder)}
                  </strong>
                </div>

                <div>
                  <div className="muted">
                    Order ID
                  </div>
                  <strong>
                    {orderId(selectedOrder) || "—"}
                  </strong>
                </div>

                <StatusBadge
                  status={statusOf(selectedOrder)}
                />
              </div>
            </Card>

            <Grid columns={2}>
              <Field label="Quantity">
                <NumberInput
                  value={modifyForm.quantity}
                  onChange={(event) =>
                    updateModifyForm(
                      "quantity",
                      event.target.value
                    )
                  }
                  min="1"
                  step="1"
                  disabled={modifying}
                />
              </Field>

              <Field label="Price">
                <NumberInput
                  value={modifyForm.price}
                  onChange={(event) =>
                    updateModifyForm(
                      "price",
                      event.target.value
                    )
                  }
                  min="0"
                  step="0.01"
                  disabled={modifying}
                />
              </Field>

              <Field label="Trigger Price">
                <NumberInput
                  value={modifyForm.triggerPrice}
                  onChange={(event) =>
                    updateModifyForm(
                      "triggerPrice",
                      event.target.value
                    )
                  }
                  min="0"
                  step="0.01"
                  disabled={modifying}
                />
              </Field>

              <Field label="Order Type">
                <Select
                  value={modifyForm.orderType}
                  onChange={(event) =>
                    updateModifyForm(
                      "orderType",
                      event.target.value
                    )
                  }
                  disabled={modifying}
                  options={[
                    {
                      value: "",
                      label: "Keep current",
                    },
                    {
                      value: "MARKET",
                      label: "Market",
                    },
                    {
                      value: "LIMIT",
                      label: "Limit",
                    },
                    {
                      value: "SL",
                      label: "Stop Loss",
                    },
                    {
                      value: "SL-M",
                      label: "Stop Loss Market",
                    },
                  ]}
                />
              </Field>

              <Field label="Validity">
                <Select
                  value={modifyForm.validity}
                  onChange={(event) =>
                    updateModifyForm(
                      "validity",
                      event.target.value
                    )
                  }
                  disabled={modifying}
                  options={[
                    {
                      value: "",
                      label: "Keep current",
                    },
                    {
                      value: "DAY",
                      label: "DAY",
                    },
                    {
                      value: "IOC",
                      label: "IOC",
                    },
                  ]}
                />
              </Field>
            </Grid>

            <Alert
              variant="warning"
              title="Modify live order"
              message="Only submit changes you have verified. The backend will forward the modification to the broker."
            />

            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  setShowModifyModal(false)
                }
                disabled={modifying}
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                onClick={handleModifyOrder}
                loading={modifying}
              >
                Modify Order
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={showCancelDialog}
        title="Cancel Order"
        message={
          selectedOrder
            ? `Cancel order ${orderId(selectedOrder) || ""} for ${
                symbolOf(selectedOrder)
              }? This sends a cancellation request to the broker.`
            : "Cancel the selected order?"
        }
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        variant="danger"
        loading={cancelling}
        onConfirm={handleCancelOrder}
        onCancel={() => {
          if (!cancelling) {
            setShowCancelDialog(false);
            setSelectedOrder(null);
          }
        }}
      />
    </div>
  );
}
