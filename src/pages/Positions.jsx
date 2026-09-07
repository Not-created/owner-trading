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
  PageHeader,
  Panel,
  PnlValue,
  SearchInput,
  Select,
  StatusBadge,
  Table,
} from "../components/UI.jsx";
import { useBrokerState } from "../context.jsx";
import { brokerApi } from "../api.jsx";
import {
  formatCurrency,
  formatNumber,
  getApiArray,
  getApiData,
  getErrorMessage,
  normalizeOrderSide,
  safeNumber,
} from "../utils.js";

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

function symbolOf(position) {
  return (
    value(position, [
      "symbol",
      "tradingsymbol",
      "trading_symbol",
      "instrument_name",
      "instrumentName",
      "instrument",
    ]) || "—"
  );
}

function exchangeOf(position) {
  return (
    value(position, [
      "exchange",
      "exchange_segment",
      "exchangeSegment",
      "segment",
    ]) || "—"
  );
}

function quantityOf(position) {
  return safeNumber(
    value(position, [
      "quantity",
      "qty",
      "net_quantity",
      "netQuantity",
      "position_quantity",
      "positionQuantity",
    ]),
    0
  );
}

function buyQuantityOf(position) {
  return safeNumber(
    value(position, [
      "buy_quantity",
      "buyQuantity",
      "day_buy_quantity",
      "dayBuyQuantity",
    ]),
    0
  );
}

function sellQuantityOf(position) {
  return safeNumber(
    value(position, [
      "sell_quantity",
      "sellQuantity",
      "day_sell_quantity",
      "daySellQuantity",
    ]),
    0
  );
}

function averagePriceOf(position) {
  return safeNumber(
    value(position, [
      "average_price",
      "averagePrice",
      "avg_price",
      "avgPrice",
      "buy_average",
      "buyAverage",
      "net_average_price",
      "netAveragePrice",
    ]),
    0
  );
}

function ltpOf(position) {
  return safeNumber(
    value(position, [
      "ltp",
      "last_price",
      "lastPrice",
      "market_price",
      "marketPrice",
      "close",
    ]),
    0
  );
}

function realizedPnlOf(position) {
  return safeNumber(
    value(position, [
      "realized_pnl",
      "realizedPnl",
      "realised_pnl",
      "realisedPnl",
      "realized_profit_loss",
      "realizedProfitLoss",
    ]),
    0
  );
}

function unrealizedPnlOf(position) {
  return safeNumber(
    value(position, [
      "unrealized_pnl",
      "unrealizedPnl",
      "unrealised_pnl",
      "unrealisedPnl",
      "unrealized_profit_loss",
      "unrealizedProfitLoss",
    ]),
    0
  );
}

function pnlOf(position) {
  const explicitPnl = value(position, [
    "pnl",
    "profit_loss",
    "profitLoss",
    "p_and_l",
    "pAndL",
  ]);

  if (
    explicitPnl !== null &&
    explicitPnl !== undefined &&
    explicitPnl !== ""
  ) {
    return safeNumber(explicitPnl, 0);
  }

  return (
    realizedPnlOf(position) +
    unrealizedPnlOf(position)
  );
}

function productOf(position) {
  return (
    value(position, [
      "product",
      "product_type",
      "productType",
    ]) || "—"
  );
}

function sideOf(position) {
  const explicitSide = value(position, [
    "side",
    "transaction_type",
    "transactionType",
    "position_side",
    "positionSide",
  ]);

  if (explicitSide) {
    return normalizeOrderSide(explicitSide);
  }

  const quantity = quantityOf(position);

  if (quantity > 0) {
    return "BUY";
  }

  if (quantity < 0) {
    return "SELL";
  }

  return "FLAT";
}

function positionIdOf(position) {
  return value(position, [
    "id",
    "position_id",
    "positionId",
  ]);
}

function absoluteQuantity(position) {
  return Math.abs(quantityOf(position));
}

function isOpenPosition(position) {
  return quantityOf(position) !== 0;
}

function DataTable({
  columns,
  rows,
  loading,
  error,
  emptyMessage,
}) {
  if (loading) {
    return <Loading label="Loading positions..." />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!rows.length) {
    return (
      <EmptyState
        title="No positions"
        message={emptyMessage}
      />
    );
  }

  return <Table columns={columns} data={rows} />;
}

export default function Positions() {
  const {
    accounts,
    primaryAccount,
  } = useBrokerState();

  const [positions, setPositions] = useState([]);

  const [loading, setLoading] = useState(false);
  const [squaringOff, setSquaringOff] = useState(false);

  const [pageError, setPageError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [dataError, setDataError] = useState("");

  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState("OPEN");

  const [selectedAccountId, setSelectedAccountId] = useState(
    primaryAccount?.id ||
      primaryAccount?.account_id ||
      ""
  );

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

  const loadPositions = useCallback(async () => {
    setLoading(true);
    setDataError("");
    setPageError("");

    try {
      if (!effectiveAccountId) {
        setPositions([]);
        return;
      }

      const response = await brokerApi.getPositions(
        effectiveAccountId
      );

      setPositions(getApiArray(response));
    } catch (error) {
      setDataError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [effectiveAccountId]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const openPositions = useMemo(
    () => positions.filter(isOpenPosition),
    [positions]
  );

  const closedPositions = useMemo(
    () => positions.filter(
      (position) => !isOpenPosition(position)
    ),
    [positions]
  );

  const filteredPositions = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    return positions.filter((position) => {
      const symbol = symbolOf(position)
        .toLowerCase();

      const exchange = exchangeOf(position)
        .toLowerCase();

      const product = productOf(position)
        .toLowerCase();

      const side = String(sideOf(position))
        .toLowerCase();

      const quantity = quantityOf(position);

      const matchesSearch =
        !query ||
        symbol.includes(query) ||
        exchange.includes(query) ||
        product.includes(query);

      const matchesSide =
        sideFilter === "ALL" ||
        side === sideFilter.toLowerCase();

      const matchesProduct =
        productFilter === "ALL" ||
        product === productFilter.toLowerCase();

      const matchesPosition =
        positionFilter === "ALL" ||
        (positionFilter === "OPEN" &&
          quantity !== 0) ||
        (positionFilter === "CLOSED" &&
          quantity === 0);

      return (
        matchesSearch &&
        matchesSide &&
        matchesProduct &&
        matchesPosition
      );
    });
  }, [
    positions,
    search,
    sideFilter,
    productFilter,
    positionFilter,
  ]);

  const totals = useMemo(() => {
    return positions.reduce(
      (result, position) => {
        const quantity = quantityOf(position);
        const pnl = pnlOf(position);
        const realized = realizedPnlOf(position);
        const unrealized = unrealizedPnlOf(position);

        result.netQuantity += quantity;
        result.buyQuantity += buyQuantityOf(position);
        result.sellQuantity += sellQuantityOf(position);
        result.realizedPnl += realized;
        result.unrealizedPnl += unrealized;
        result.totalPnl += pnl;

        if (quantity > 0) {
          result.longCount += 1;
        }

        if (quantity < 0) {
          result.shortCount += 1;
        }

        if (quantity === 0) {
          result.flatCount += 1;
        }

        return result;
      },
      {
        netQuantity: 0,
        buyQuantity: 0,
        sellQuantity: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        longCount: 0,
        shortCount: 0,
        flatCount: 0,
      }
    );
  }, [positions]);

  const exposure = useMemo(
    () =>
      openPositions.reduce(
        (total, position) =>
          total +
          Math.abs(
            quantityOf(position) *
              ltpOf(position)
          ),
        0
      ),
    [openPositions]
  );

  const bestPosition = useMemo(() => {
    if (!positions.length) {
      return null;
    }

    return positions.reduce(
      (best, position) => {
        if (!best) {
          return position;
        }

        return pnlOf(position) >
          pnlOf(best)
          ? position
          : best;
      },
      null
    );
  }, [positions]);

  const worstPosition = useMemo(() => {
    if (!positions.length) {
      return null;
    }

    return positions.reduce(
      (worst, position) => {
        if (!worst) {
          return position;
        }

        return pnlOf(position) <
          pnlOf(worst)
          ? position
          : worst;
      },
      null
    );
  }, [positions]);

  const handleSquareOff = async (position) => {
    if (!effectiveAccountId) {
      setPageError(
        "Select a broker account before squaring off a position."
      );
      return;
    }

    const symbol = symbolOf(position);
    const quantity = Math.abs(
      quantityOf(position)
    );

    if (!symbol || symbol === "—") {
      setPageError(
        "The selected position has no valid trading symbol."
      );
      return;
    }

    if (!quantity) {
      setPageError(
        "The selected position has no open quantity."
      );
      return;
    }

    const currentSide = sideOf(position);

    if (
      currentSide !== "BUY" &&
      currentSide !== "SELL"
    ) {
      setPageError(
        "Unable to determine the position side safely. Square-off was not submitted."
      );
      return;
    }

    const confirmation = window.confirm(
      `Square off ${quantity} ${symbol} at the broker? This can create a real market order.`
    );

    if (!confirmation) {
      return;
    }

    setSquaringOff(true);
    setPageError("");
    setActionMessage("");

    try {
      const exitSide =
        currentSide === "BUY"
          ? "SELL"
          : "BUY";

      const response = await brokerApi.placeOrder({
        accountId: effectiveAccountId,
        symbol,
        exchange: exchangeOf(position),
        side: exitSide,
        orderType: "MARKET",
        quantity,
        product: productOf(position),
        validity: "DAY",
      });

      const result = getApiData(response);

      if (!result && response === null) {
        throw new Error(
          "The broker did not return a square-off response."
        );
      }

      setActionMessage(
        `Square-off order submitted for ${symbol}.`
      );

      await loadPositions();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setSquaringOff(false);
    }
  };

  const handleSquareOffAll = async () => {
    if (!effectiveAccountId) {
      setPageError(
        "Select a broker account before squaring off positions."
      );
      return;
    }

    if (!openPositions.length) {
      setActionMessage(
        "There are no open positions to square off."
      );
      return;
    }

    const confirmation = window.confirm(
      `Square off all ${openPositions.length} open position(s)? This can create multiple real market orders.`
    );

    if (!confirmation) {
      return;
    }

    setSquaringOff(true);
    setPageError("");
    setActionMessage("");

    try {
      const results = [];

      for (const position of openPositions) {
        const symbol = symbolOf(position);
        const quantity = Math.abs(
          quantityOf(position)
        );
        const currentSide = sideOf(position);

        if (
          symbol === "—" ||
          quantity <= 0 ||
          !["BUY", "SELL"].includes(
            currentSide
          )
        ) {
          continue;
        }

        const exitSide =
          currentSide === "BUY"
            ? "SELL"
            : "BUY";

        const response =
          await brokerApi.placeOrder({
            accountId:
              effectiveAccountId,
            symbol,
            exchange:
              exchangeOf(position),
            side: exitSide,
            orderType: "MARKET",
            quantity,
            product:
              productOf(position),
            validity: "DAY",
          });

        results.push(response);
      }

      if (!results.length) {
        throw new Error(
          "No valid open positions were available for square-off."
        );
      }

      setActionMessage(
        `${results.length} square-off order request(s) were submitted.`
      );

      await loadPositions();
    } catch (error) {
      setPageError(
        getErrorMessage(error)
      );
    } finally {
      setSquaringOff(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "symbol",
        label: "Symbol",
        render: (position) => (
          <div>
            <strong>
              {symbolOf(position)}
            </strong>
            <div className="muted text-xs">
              {exchangeOf(position)}
            </div>
          </div>
        ),
      },
      {
        key: "side",
        label: "Side",
        render: (position) => (
          <Badge>
            {sideOf(position)}
          </Badge>
        ),
      },
      {
        key: "quantity",
        label: "Net Qty",
        render: (position) =>
          formatNumber(
            quantityOf(position)
          ),
      },
      {
        key: "buyQuantity",
        label: "Buy Qty",
        render: (position) =>
          formatNumber(
            buyQuantityOf(position)
          ),
      },
      {
        key: "sellQuantity",
        label: "Sell Qty",
        render: (position) =>
          formatNumber(
            sellQuantityOf(position)
          ),
      },
      {
        key: "average",
        label: "Avg. Price",
        render: (position) =>
          averagePriceOf(position) > 0
            ? formatCurrency(
                averagePriceOf(position)
              )
            : "—",
      },
      {
        key: "ltp",
        label: "LTP",
        render: (position) =>
          ltpOf(position) > 0
            ? formatCurrency(
                ltpOf(position)
              )
            : "—",
      },
      {
        key: "pnl",
        label: "P&L",
        render: (position) => (
          <PnlValue
            value={pnlOf(position)}
          />
        ),
      },
      {
        key: "product",
        label: "Product",
        render: (position) =>
          productOf(position),
      },
      {
        key: "action",
        label: "Action",
        render: (position) =>
          isOpenPosition(position) ? (
            <Button
              size="small"
              variant="danger"
              onClick={() =>
                handleSquareOff(position)
              }
              loading={squaringOff}
            >
              Square Off
            </Button>
          ) : (
            <Badge>
              Closed
            </Badge>
          ),
      },
    ],
    [squaringOff]
  );

  return (
    <div className="page positions-page">
      <PageHeader
        title="Positions"
        subtitle="Live broker positions, exposure and P&L"
        actions={
          <div className="row gap-sm">
            <Badge>
              {openPositions.length} open
            </Badge>

            <Button
              variant="secondary"
              onClick={loadPositions}
              loading={loading}
            >
              Refresh
            </Button>

            <Button
              variant="danger"
              onClick={handleSquareOffAll}
              loading={squaringOff}
              disabled={
                !openPositions.length
              }
            >
              Square Off All
            </Button>
          </div>
        }
      />

      {pageError ? (
        <Alert
          variant="danger"
          title="Position operation failed"
          message={pageError}
        />
      ) : null}

      {actionMessage ? (
        <Alert
          variant="success"
          title="Position"
          message={actionMessage}
        />
      ) : null}

      <Grid
        columns={4}
        className="metrics-grid"
      >
        <Card className="metric-card">
          <div className="metric-card__label">
            Open Positions
          </div>

          <div className="metric-card__value">
            {formatNumber(
              openPositions.length
            )}
          </div>

          <div className="metric-card__subtext">
            Long {totals.longCount} · Short{" "}
            {totals.shortCount}
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Total P&L
          </div>

          <div className="metric-card__value">
            <PnlValue
              value={totals.totalPnl}
            />
          </div>

          <div className="metric-card__subtext">
            Realized + unrealized
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Unrealized P&L
          </div>

          <div className="metric-card__value">
            <PnlValue
              value={totals.unrealizedPnl}
            />
          </div>

          <div className="metric-card__subtext">
            Current open-position P&L
          </div>
        </Card>

        <Card className="metric-card">
          <div className="metric-card__label">
            Gross Exposure
          </div>

          <div className="metric-card__value">
            {formatCurrency(exposure)}
          </div>

          <div className="metric-card__subtext">
            Based on broker-reported LTP
          </div>
        </Card>
      </Grid>

      <Panel>
        <div className="section-header">
          <div>
            <h2>Position Book</h2>
            <p className="muted">
              Data below is populated from the selected
              broker account. No position values are
              generated locally.
            </p>
          </div>

          <div className="row gap-sm">
            <Badge>
              Buy {formatNumber(
                totals.buyQuantity
              )}
            </Badge>

            <Badge>
              Sell {formatNumber(
                totals.sellQuantity
              )}
            </Badge>
          </div>
        </div>

        {!effectiveAccountId ? (
          <EmptyState
            title="No broker account selected"
            message="Connect and select a Kotak Neo account to load live positions."
          />
        ) : (
          <div className="stack gap-lg">
            <Card>
              <Grid columns={4}>
                <Field label="Search">
                  <SearchInput
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Symbol, exchange or product"
                  />
                </Field>

                <Field label="Position">
                  <Select
                    value={positionFilter}
                    onChange={(event) =>
                      setPositionFilter(
                        event.target.value
                      )
                    }
                    options={[
                      {
                        value: "OPEN",
                        label: "Open positions",
                      },
                      {
                        value: "CLOSED",
                        label: "Closed / flat",
                      },
                      {
                        value: "ALL",
                        label: "All",
                      },
                    ]}
                  />
                </Field>

                <Field label="Side">
                  <Select
                    value={sideFilter}
                    onChange={(event) =>
                      setSideFilter(
                        event.target.value
                      )
                    }
                    options={[
                      {
                        value: "ALL",
                        label: "All sides",
                      },
                      {
                        value: "BUY",
                        label: "Long / Buy",
                      },
                      {
                        value: "SELL",
                        label: "Short / Sell",
                      },
                      {
                        value: "FLAT",
                        label: "Flat",
                      },
                    ]}
                  />
                </Field>

                <Field label="Product">
                  <Select
                    value={productFilter}
                    onChange={(event) =>
                      setProductFilter(
                        event.target.value
                      )
                    }
                    options={[
                      {
                        value: "ALL",
                        label: "All products",
                      },
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
              </Grid>
            </Card>

            <DataTable
              columns={columns}
              rows={filteredPositions}
              loading={loading}
              error={dataError}
              emptyMessage={
                positions.length
                  ? "No positions match the selected filters."
                  : "The broker returned no positions."
              }
            />
          </div>
        )}
      </Panel>

      <Grid columns={2}>
        <Card>
          <div className="section-header">
            <div>
              <h3>Best Position</h3>
              <p className="muted">
                Highest broker-reported P&L in the
                current position response.
              </p>
            </div>
          </div>

          {bestPosition ? (
            <div className="row justify-between">
              <div>
                <strong>
                  {symbolOf(bestPosition)}
                </strong>
                <div className="muted">
                  Qty{" "}
                  {formatNumber(
                    quantityOf(bestPosition)
                  )}
                </div>
              </div>

              <PnlValue
                value={pnlOf(bestPosition)}
              />
            </div>
          ) : (
            <EmptyState
              title="Unavailable"
              message="No position data is available."
            />
          )}
        </Card>

        <Card>
          <div className="section-header">
            <div>
              <h3>Worst Position</h3>
              <p className="muted">
                Lowest broker-reported P&L in the
                current position response.
              </p>
            </div>
          </div>

          {worstPosition ? (
            <div className="row justify-between">
              <div>
                <strong>
                  {symbolOf(worstPosition)}
                </strong>
                <div className="muted">
                  Qty{" "}
                  {formatNumber(
                    quantityOf(worstPosition)
                  )}
                </div>
              </div>

              <PnlValue
                value={pnlOf(worstPosition)}
              />
            </div>
          ) : (
            <EmptyState
              title="Unavailable"
              message="No position data is available."
            />
          )}
        </Card>
      </Grid>
    </div>
  );
}
