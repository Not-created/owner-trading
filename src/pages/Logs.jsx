import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Grid,
  Loading,
  PageHeader,
  Panel,
  Select,
  StatusBadge,
  Table,
  Tabs,
} from "../components/UI.jsx";
import { systemApi } from "../api.jsx";
import {
  formatDateTime,
  getApiArray,
  getApiData,
  getErrorMessage,
} from "../utils.js";
import { useBrokerState } from "../context.jsx";

/* ============================================================
   LOGS MODULE
   ------------------------------------------------------------
   Central application/audit log viewer.

   Responsibilities:
   - backend log retrieval
   - severity filtering
   - category/source filtering
   - text search
   - account filtering
   - pagination
   - refresh
   - real loading/error/empty states
   - defensive sensitive-data redaction

   IMPORTANT:
   This page is READ-ONLY.
   It does not create, modify or delete trading records.
   ============================================================ */

/* ============================================================
   CONSTANTS
   ============================================================ */

const TABS = [
  {
    id: "all",
    label: "All Logs",
  },
  {
    id: "errors",
    label: "Errors",
  },
  {
    id: "audit",
    label: "Audit",
  },
];

const SEVERITY_OPTIONS = [
  {
    value: "ALL",
    label: "All Severities",
  },
  {
    value: "DEBUG",
    label: "Debug",
  },
  {
    value: "INFO",
    label: "Info",
  },
  {
    value: "WARNING",
    label: "Warning",
  },
  {
    value: "ERROR",
    label: "Error",
  },
  {
    value: "CRITICAL",
    label: "Critical",
  },
];

const SOURCE_OPTIONS = [
  {
    value: "ALL",
    label: "All Sources",
  },
  {
    value: "AUTH",
    label: "Authentication",
  },
  {
    value: "BROKER",
    label: "Broker",
  },
  {
    value: "ORDER",
    label: "Orders",
  },
  {
    value: "POSITION",
    label: "Positions",
  },
  {
    value: "STRATEGY",
    label: "Strategies",
  },
  {
    value: "BACKTEST",
    label: "Backtest",
  },
  {
    value: "RISK",
    label: "Risk",
  },
  {
    value: "SYSTEM",
    label: "System",
  },
  {
    value: "OWNER",
    label: "Owner Control",
  },
  {
    value: "AI",
    label: "AI",
  },
];

/* ============================================================
   GENERIC DATA HELPERS
   ------------------------------------------------------------
   Backend ke different field names ko safely normalize karta hai.
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

function normalizeSeverity(value) {
  const normalized =
    String(
      value || "INFO"
    ).toUpperCase();

  if (
    [
      "DEBUG",
      "INFO",
      "WARNING",
      "WARN",
      "ERROR",
      "CRITICAL",
      "FATAL",
    ].includes(
      normalized
    )
  ) {
    if (
      normalized === "WARN"
    ) {
      return "WARNING";
    }

    if (
      normalized === "FATAL"
    ) {
      return "CRITICAL";
    }

    return normalized;
  }

  return "INFO";
}

function normalizeSource(value) {
  const normalized =
    String(
      value || "SYSTEM"
    )
      .trim()
      .toUpperCase();

  return normalized || "SYSTEM";
}

function normalizeLog(item) {
  const message =
    readValue(
      item,
      [
        "message",
        "msg",
        "detail",
        "description",
        "event",
      ],
      ""
    );

  return {
    id:
      readValue(
        item,
        [
          "id",
          "log_id",
          "logId",
          "event_id",
          "eventId",
        ]
      ) || null,

    timestamp:
      readValue(
        item,
        [
          "timestamp",
          "created_at",
          "createdAt",
          "time",
          "datetime",
        ]
      ),

    severity:
      normalizeSeverity(
        readValue(
          item,
          [
            "severity",
            "level",
            "log_level",
            "logLevel",
          ]
        )
      ),

    source:
      normalizeSource(
        readValue(
          item,
          [
            "source",
            "module",
            "component",
            "service",
            "category",
          ]
        )
      ),

    message:
      String(
        message || ""
      ),

    actor:
      readValue(
        item,
        [
          "actor",
          "username",
          "user",
          "user_name",
          "userName",
        ]
      ),

    account:
      readValue(
        item,
        [
          "account",
          "account_name",
          "accountName",
          "account_id",
          "accountId",
          "broker_account_id",
        ]
      ),

    requestId:
      readValue(
        item,
        [
          "request_id",
          "requestId",
          "correlation_id",
          "correlationId",
        ]
      ),

    action:
      readValue(
        item,
        [
          "action",
          "action_type",
          "actionType",
          "event_type",
          "eventType",
        ]
      ),

    raw: item,
  };
}

/* ============================================================
   SENSITIVE DATA REDACTION
   ------------------------------------------------------------
   Logs should never expose broker credentials, sessions,
   authorization headers or secret material.
   ============================================================ */

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|consumer[_-]?key|mpin|totp|otp|authorization|cookie|session|credential|private[_-]?key)/i;

function redactSensitiveValue(
  value,
  key = ""
) {
  if (
    SENSITIVE_KEY_PATTERN.test(
      String(key)
    )
  ) {
    return "[REDACTED]";
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      (item) =>
        redactSensitiveValue(
          item
        )
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output = {};

    Object.entries(
      value
    ).forEach(
      ([childKey, childValue]) => {
        output[childKey] =
          redactSensitiveValue(
            childValue,
            childKey
          );
      }
    );

    return output;
  }

  return value;
}

function safeLogDetails(log) {
  if (
    !log?.raw ||
    typeof log.raw !==
      "object"
  ) {
    return null;
  }

  return redactSensitiveValue(
    log.raw
  );
}

/* ============================================================
   LOG SEARCH TEXT
   ============================================================ */

function searchableLogText(
  log
) {
  return [
    log.id,
    log.timestamp,
    log.severity,
    log.source,
    log.message,
    log.actor,
    log.account,
    log.requestId,
    log.action,
  ]
    .filter(
      (value) =>
        value !==
          null &&
        value !==
          undefined
    )
    .join(" ")
    .toLowerCase();
}

/* ============================================================
   MAIN LOGS PAGE
   ============================================================ */

export default function Logs() {
  const {
    accounts = [],
  } = useBrokerState();

  const [activeTab, setActiveTab] =
    useState("all");

  const [logs, setLogs] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [severity, setSeverity] =
    useState("ALL");

  const [source, setSource] =
    useState("ALL");

  const [accountId, setAccountId] =
    useState("ALL");

  const [selectedLog, setSelectedLog] =
    useState(null);

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(50);

  const [total, setTotal] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  /* ==========================================================
     LOAD LOGS
     ----------------------------------------------------------
     Only backend data is displayed.
     No local/demo log fallback is created.
     ========================================================== */

  const loadLogs =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const method =
            [
              "listLogs",
              "getLogs",
              "logs",
              "list",
            ]
              .map(
                (name) =>
                  systemApi?.[
                    name
                  ]
              )
              .find(
                (
                  candidate
                ) =>
                  typeof candidate ===
                  "function"
              );

          if (!method) {
            throw new Error(
              "System log API is not available in the centralized API contract."
            );
          }

          const response =
            await method({
              page,
              page_size:
                pageSize,
              severity:
                severity !==
                "ALL"
                  ? severity
                  : undefined,
              source:
                source !==
                "ALL"
                  ? source
                  : undefined,
              account_id:
                accountId !==
                "ALL"
                  ? accountId
                  : undefined,
              search:
                search.trim() ||
                undefined,
            });

          const data =
            getApiData(
              response
            );

          const returnedLogs =
            getApiArray(
              data
            ).map(
              normalizeLog
            );

          setLogs(
            returnedLogs
          );

          const backendTotal =
            readValue(
              data,
              [
                "total",
                "total_count",
                "totalCount",
                "count",
              ]
            );

          setTotal(
            Number.isFinite(
              Number(
                backendTotal
              )
            )
              ? Number(
                  backendTotal
                )
              : null
          );

          setLastUpdated(
            new Date().toISOString()
          );
        } catch (requestError) {
          setLogs([]);
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
        accountId,
        page,
        pageSize,
        search,
        severity,
        source,
      ]
    );

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  /* ==========================================================
     FILTERED LOGS
     ----------------------------------------------------------
     Backend filters are preferred. Tab filtering is additionally
     applied locally to the already returned real records.
     ========================================================== */

  const filteredLogs =
    useMemo(() => {
      let result =
        Array.isArray(logs)
          ? logs
          : [];

      if (
        activeTab ===
        "errors"
      ) {
        result =
          result.filter(
            (log) =>
              log.severity ===
                "ERROR" ||
              log.severity ===
                "CRITICAL"
          );
      }

      if (
        activeTab ===
        "audit"
      ) {
        result =
          result.filter(
            (log) =>
              log.source ===
                "OWNER" ||
              log.action ||
              log.actor
          );
      }

      const query =
        search
          .trim()
          .toLowerCase();

      if (query) {
        result =
          result.filter(
            (log) =>
              searchableLogText(
                log
              ).includes(
                query
              )
          );
      }

      return result;
    }, [
      activeTab,
      logs,
      search,
    ]);

  /* ==========================================================
     SUMMARY METRICS
     ----------------------------------------------------------
     Counts are calculated only from returned real log records.
     ========================================================== */

  const summary =
    useMemo(() => {
      const list =
        Array.isArray(
          logs
        )
          ? logs
          : [];

      return {
        total: list.length,

        errors:
          list.filter(
            (log) =>
              log.severity ===
                "ERROR" ||
              log.severity ===
                "CRITICAL"
          ).length,

        warnings:
          list.filter(
            (log) =>
              log.severity ===
              "WARNING"
          ).length,

        audit:
          list.filter(
            (log) =>
              log.source ===
                "OWNER" ||
              log.action ||
              log.actor
          ).length,
      };
    }, [logs]);

  /* ==========================================================
     TABLE COLUMNS
     ========================================================== */

  const columns =
    useMemo(
      () => [
        {
          key: "timestamp",
          label: "Time",
          render: (log) =>
            formatDateTime(
              log.timestamp
            ),
        },

        {
          key: "severity",
          label: "Severity",
          render: (log) => (
            <StatusBadge
              status={
                log.severity
              }
            />
          ),
        },

        {
          key: "source",
          label: "Source",
          render: (log) => (
            <Badge>
              {log.source}
            </Badge>
          ),
        },

        {
          key: "action",
          label: "Action",
          render: (log) =>
            log.action ||
            "—",
        },

        {
          key: "message",
          label: "Message",
          render: (log) => (
            <button
              type="button"
              className="link-button"
              onClick={() =>
                setSelectedLog(
                  log
                )
              }
            >
              {log.message ||
                "No message"}
            </button>
          ),
        },

        {
          key: "actor",
          label: "Actor",
          render: (log) =>
            log.actor ||
            "—",
        },

        {
          key: "account",
          label: "Account",
          render: (log) =>
            log.account ||
            "—",
        },

        {
          key: "requestId",
          label: "Request ID",
          render: (log) =>
            log.requestId ||
            "—",
        },
      ],
      []
    );

  /* ==========================================================
     PAGE CONTROLS
     ========================================================== */

  const nextPage =
    () => {
      if (
        total !== null &&
        page *
          pageSize >=
          total
      ) {
        return;
      }

      if (
        filteredLogs.length <
        pageSize &&
        total === null
      ) {
        return;
      }

      setPage(
        (current) =>
          current + 1
      );
    };

  const previousPage =
    () => {
      setPage(
        (current) =>
          Math.max(
            1,
            current - 1
          )
      );
    };

  const resetFilters =
    () => {
      setSearch("");
      setSeverity(
        "ALL"
      );
      setSource(
        "ALL"
      );
      setAccountId(
        "ALL"
      );
      setPage(1);
    };

  /* ==========================================================
     ACCOUNT OPTIONS
     ========================================================== */

  const accountOptions =
    useMemo(
      () => [
        {
          value: "ALL",
          label:
            "All Accounts",
        },

        ...accounts
          .map(
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

              if (
                id ===
                  null ||
                id ===
                  undefined
              ) {
                return null;
              }

              return {
                value:
                  String(
                    id
                  ),
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
          )
          .filter(
            Boolean
          ),
      ],
      [accounts]
    );

  return (
    <div className="page logs-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Logs"
        subtitle="Application, trading and owner audit activity"
        actions={
          <div className="row gap-sm">
            <Badge>
              READ ONLY
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadLogs
              }
              loading={
                loading
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ======================================================
          SECURITY NOTICE
          ====================================================== */}

      <Alert
        variant="info"
        title="Sensitive data protection"
        message="Credentials, broker tokens, MPIN/TOTP values, authorization headers and session material must never be exposed through the log viewer."
      />

      {/* ======================================================
          SUMMARY
          ====================================================== */}

      <Grid columns={4}>
        <Card>
          <div className="eyebrow">
            RETURNED LOGS
          </div>

          <h2>
            {summary.total}
          </h2>

          <div className="muted">
            Records in current backend response
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            ERRORS
          </div>

          <h2>
            {summary.errors}
          </h2>

          <div className="muted">
            Error and critical records
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            WARNINGS
          </div>

          <h2>
            {summary.warnings}
          </h2>

          <div className="muted">
            Warning records
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            AUDIT
          </div>

          <h2>
            {summary.audit}
          </h2>

          <div className="muted">
            Owner/action related records
          </div>
        </Card>
      </Grid>

      {/* ======================================================
          MAIN LOG PANEL
          ====================================================== */}

      <Panel>
        {/* ====================================================
            LOG TABS
            ==================================================== */}

        <Tabs
          items={TABS}
          activeTab={
            activeTab
          }
          onChange={(tab) => {
            setActiveTab(
              tab
            );
            setPage(1);
          }}
        />

        {/* ====================================================
            FILTER BAR
            ==================================================== */}

        <Card>
          <Grid columns={5}>
            <div>
              <label className="field-label">
                Search
              </label>

              <input
                className="input"
                type="search"
                value={search}
                placeholder="Search logs..."
                onChange={(
                  event
                ) => {
                  setSearch(
                    event.target
                      .value
                  );
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="field-label">
                Severity
              </label>

              <Select
                value={
                  severity
                }
                onChange={(
                  event
                ) => {
                  setSeverity(
                    event.target
                      .value
                  );
                  setPage(1);
                }}
                options={
                  SEVERITY_OPTIONS
                }
              />
            </div>

            <div>
              <label className="field-label">
                Source
              </label>

              <Select
                value={
                  source
                }
                onChange={(
                  event
                ) => {
                  setSource(
                    event.target
                      .value
                  );
                  setPage(1);
                }}
                options={
                  SOURCE_OPTIONS
                }
              />
            </div>

            <div>
              <label className="field-label">
                Account
              </label>

              <Select
                value={
                  accountId
                }
                onChange={(
                  event
                ) => {
                  setAccountId(
                    event.target
                      .value
                  );
                  setPage(1);
                }}
                options={
                  accountOptions
                }
              />
            </div>

            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={
                  resetFilters
                }
              >
                Reset
              </Button>
            </div>
          </Grid>
        </Card>

        {/* ====================================================
            DATA STATE
            ==================================================== */}

        {error ? (
          <ErrorState
            title="Unable to load logs"
            message={
              error
            }
            onRetry={
              loadLogs
            }
          />
        ) : loading ? (
          <Loading
            label="Loading logs from backend..."
          />
        ) : !filteredLogs.length ? (
          <EmptyState
            title="No logs available"
            message="No backend log records match the current filters. This is not treated as fake or zero activity."
          />
        ) : (
          <Table
            columns={
              columns
            }
            data={
              filteredLogs
            }
          />
        )}

        {/* ====================================================
            PAGINATION
            ==================================================== */}

        <div className="row justify-between mt-md">
          <div className="muted">
            Page{" "}
            {page}
            {total !== null
              ? ` • ${total} total records`
              : ""}
          </div>

          <div className="row gap-sm">
            <Select
              value={
                String(
                  pageSize
                )
              }
              onChange={(
                event
              ) => {
                setPageSize(
                  Number(
                    event.target
                      .value
                  )
                );
                setPage(1);
              }}
              options={[
                {
                  value: "25",
                  label:
                    "25 / page",
                },
                {
                  value: "50",
                  label:
                    "50 / page",
                },
                {
                  value: "100",
                  label:
                    "100 / page",
                },
              ]}
            />

            <Button
              variant="secondary"
              onClick={
                previousPage
              }
              disabled={
                page <= 1 ||
                loading
              }
            >
              Previous
            </Button>

            <Button
              variant="secondary"
              onClick={
                nextPage
              }
              disabled={
                loading ||
                (total !==
                  null &&
                  page *
                    pageSize >=
                    total) ||
                (total ===
                  null &&
                  filteredLogs.length <
                    pageSize)
              }
            >
              Next
            </Button>
          </div>
        </div>
      </Panel>

      {/* ======================================================
          LAST UPDATED
          ====================================================== */}

      <div className="muted text-right">
        Last loaded:{" "}
        {lastUpdated
          ? formatDateTime(
              lastUpdated
            )
          : "Not loaded"}
      </div>

      {/* ======================================================
          LOG DETAILS MODAL
          ====================================================== */}

      {selectedLog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() =>
            setSelectedLog(
              null
            )
          }
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-details-title"
            onClick={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  LOG DETAILS
                </div>

                <h2 id="log-details-title">
                  {selectedLog.message ||
                    "Log Record"}
                </h2>
              </div>

              <Button
                variant="secondary"
                onClick={() =>
                  setSelectedLog(
                    null
                  )
                }
              >
                Close
              </Button>
            </div>

            <div className="stack gap-md">
              <Grid columns={2}>
                <div>
                  <div className="muted">
                    Time
                  </div>

                  <strong>
                    {formatDateTime(
                      selectedLog.timestamp
                    )}
                  </strong>
                </div>

                <div>
                  <div className="muted">
                    Severity
                  </div>

                  <StatusBadge
                    status={
                      selectedLog.severity
                    }
                  />
                </div>

                <div>
                  <div className="muted">
                    Source
                  </div>

                  <strong>
                    {
                      selectedLog.source
                    }
                  </strong>
                </div>

                <div>
                  <div className="muted">
                    Action
                  </div>

                  <strong>
                    {selectedLog.action ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <div className="muted">
                    Actor
                  </div>

                  <strong>
                    {selectedLog.actor ||
                      "—"}
                  </strong>
                </div>

                <div>
                  <div className="muted">
                    Request ID
                  </div>

                  <strong>
                    {selectedLog.requestId ||
                      "—"}
                  </strong>
                </div>
              </Grid>

              <div>
                <div className="muted">
                  Message
                </div>

                <pre className="log-detail">
                  {
                    selectedLog.message ||
                    "No message returned."
                  }
                </pre>
              </div>

              {safeLogDetails(
                selectedLog
              ) ? (
                <div>
                  <div className="muted">
                    Backend Record
                  </div>

                  <pre className="log-detail">
                    {JSON.stringify(
                      safeLogDetails(
                        selectedLog
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
