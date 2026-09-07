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
  Section,
  StatusBadge,
  Table,
} from "../components/UI.jsx";

import { systemApi } from "../api.jsx";

import {
  formatDateTime,
  formatNumber,
  getApiArray,
  getApiData,
  getErrorMessage,
} from "../utils.js";

import {
  useBrokerState,
  useSystemState,
} from "../context.jsx";

/* ============================================================
   SYSTEM MODULE
   ------------------------------------------------------------
   Responsibilities:
   - Backend/system health
   - Service/component status
   - Runtime information
   - Broker connectivity summary
   - System metrics when actually supplied by backend
   - Recent system events
   - Refresh / health check

   No fake health, uptime, CPU, RAM, service or broker values
   are created on the frontend.
   ============================================================ */

/* ============================================================
   SAFE VALUE HELPERS
   ============================================================ */

function readValue(object, keys, fallback = null) {
  if (!object || typeof object !== "object") {
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

function normalizeStatus(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value).trim().toUpperCase();
}

function statusFromObject(object) {
  return normalizeStatus(
    readValue(object, [
      "status",
      "state",
      "health",
      "service_status",
      "serviceStatus",
    ])
  );
}

function isHealthyStatus(status) {
  return [
    "OK",
    "HEALTHY",
    "UP",
    "RUNNING",
    "ACTIVE",
    "CONNECTED",
    "ONLINE",
    "READY",
  ].includes(status);
}

/* ============================================================
   SERVICE NORMALIZATION
   ============================================================ */

function normalizeService(service) {
  return {
    id: readValue(service, [
      "id",
      "service_id",
      "serviceId",
      "name",
    ]),

    name:
      readValue(service, [
        "name",
        "service_name",
        "serviceName",
        "component",
      ]) || "Unnamed Service",

    status: statusFromObject(service),

    message:
      readValue(service, [
        "message",
        "detail",
        "description",
      ]) || "",

    version: readValue(service, [
      "version",
      "service_version",
      "serviceVersion",
    ]),

    uptime: readValue(service, [
      "uptime",
      "uptime_seconds",
      "uptimeSeconds",
    ]),

    updatedAt: readValue(service, [
      "updated_at",
      "updatedAt",
      "checked_at",
      "checkedAt",
    ]),

    raw: service,
  };
}

/* ============================================================
   EVENT NORMALIZATION
   ============================================================ */

function normalizeEvent(event) {
  return {
    id: readValue(event, [
      "id",
      "event_id",
      "eventId",
    ]),

    time: readValue(event, [
      "timestamp",
      "time",
      "created_at",
      "createdAt",
    ]),

    level:
      normalizeStatus(
        readValue(event, [
          "level",
          "severity",
          "type",
        ])
      ) || "INFO",

    source:
      readValue(event, [
        "source",
        "service",
        "component",
      ]) || "System",

    message:
      readValue(event, [
        "message",
        "detail",
        "description",
      ]) || "",
  };
}

/* ============================================================
   MAIN PAGE
   ============================================================ */

export default function System() {
  const {
    systemState,
    setSystemState,
  } = useSystemState();

  const {
    connected: brokerConnected,
    accounts,
    primaryAccount,
  } = useBrokerState();

  /* ==========================================================
     STATE
     ========================================================== */

  const [system, setSystem] = useState(null);
  const [services, setServices] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  /* ==========================================================
     SYSTEM API METHOD RESOLUTION
     ========================================================== */

  const getSystemMethod = useCallback(
    (names) =>
      names
        .map((name) => systemApi?.[name])
        .find(
          (candidate) =>
            typeof candidate === "function"
        ),
    []
  );

  /* ==========================================================
     LOAD SYSTEM OVERVIEW
     ========================================================== */

  const loadSystem = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const overviewMethod = getSystemMethod([
        "get",
        "getSystem",
        "overview",
        "getOverview",
        "status",
        "getStatus",
      ]);

      if (!overviewMethod) {
        throw new Error(
          "System overview API is not available in the centralized API contract."
        );
      }

      const response = await overviewMethod();
      const data = getApiData(response);

      setSystem(data || null);

      /*
       * Keep global system state synchronized with the actual
       * backend response. Do not create a synthetic state.
       */
      if (setSystemState) {
        setSystemState(data || {});
      }

      /* --------------------------------------------------------
         Optional backend service list
         -------------------------------------------------------- */

      const servicesMethod = getSystemMethod([
        "getServices",
        "services",
        "listServices",
        "getComponents",
        "components",
      ]);

      if (servicesMethod) {
        try {
          const serviceResponse =
            await servicesMethod();

          const serviceData =
            getApiData(serviceResponse);

          setServices(
            getApiArray(serviceData).map(
              normalizeService
            )
          );
        } catch {
          /*
           * Service details are supplemental. The main system
           * response remains authoritative.
           */
          setServices([]);
        }
      } else {
        setServices([]);
      }

      /* --------------------------------------------------------
         Optional recent system events
         -------------------------------------------------------- */

      const eventsMethod = getSystemMethod([
        "listEvents",
        "getEvents",
        "events",
        "recentEvents",
      ]);

      if (eventsMethod) {
        try {
          const eventResponse =
            await eventsMethod({
              limit: 10,
            });

          const eventData =
            getApiData(eventResponse);

          setEvents(
            getApiArray(eventData).map(
              normalizeEvent
            )
          );
        } catch {
          setEvents([]);
        }
      } else {
        setEvents([]);
      }
    } catch (requestError) {
      setSystem(null);
      setServices([]);
      setEvents([]);

      setError(
        getErrorMessage(requestError)
      );
    } finally {
      setLoading(false);
    }
  }, [
    getSystemMethod,
    setSystemState,
  ]);

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    loadSystem();
  }, [loadSystem]);

  /* ==========================================================
     HEALTH CHECK
     ========================================================== */

  const runHealthCheck = async () => {
    setHealthChecking(true);
    setError("");
    setMessage("");

    try {
      const healthMethod = getSystemMethod([
        "health",
        "getHealth",
        "checkHealth",
        "healthCheck",
      ]);

      if (!healthMethod) {
        /*
         * If the overview endpoint itself is the only supported
         * system endpoint, refresh it instead of fabricating a
         * health result.
         */
        await loadSystem();

        setMessage(
          "System status refreshed from the backend."
        );

        return;
      }

      const response = await healthMethod();
      const data = getApiData(response);

      if (data && typeof data === "object") {
        setSystem((current) => ({
          ...(current || {}),
          ...data,
        }));

        if (setSystemState) {
          setSystemState(data);
        }
      }

      setMessage(
        "Backend health check completed."
      );

      await loadSystem();
    } catch (requestError) {
      setError(
        getErrorMessage(requestError)
      );
    } finally {
      setHealthChecking(false);
    }
  };

  /* ==========================================================
     DERIVED SYSTEM STATUS
     ========================================================== */

  const systemStatus = useMemo(() => {
    const direct =
      normalizeStatus(
        readValue(system, [
          "status",
          "state",
          "health",
          "system_status",
          "systemStatus",
        ])
      );

    if (direct) {
      return direct;
    }

    return normalizeStatus(
      readValue(systemState, [
        "status",
        "state",
        "health",
      ])
    );
  }, [system, systemState]);

  const statusHealthy =
    isHealthyStatus(systemStatus);

  /* ==========================================================
     SYSTEM METRICS
     ========================================================== */

  const uptime = readValue(system, [
    "uptime",
    "uptime_seconds",
    "uptimeSeconds",
    "system_uptime",
  ]);

  const cpu = readValue(system, [
    "cpu",
    "cpu_usage",
    "cpuUsage",
    "cpu_percent",
    "cpuPercent",
  ]);

  const memory = readValue(system, [
    "memory",
    "memory_usage",
    "memoryUsage",
    "ram_usage",
    "ramUsage",
    "memory_percent",
    "memoryPercent",
  ]);

  const version = readValue(system, [
    "version",
    "app_version",
    "appVersion",
    "release",
  ]);

  const environment = readValue(system, [
    "environment",
    "env",
    "deployment",
  ]);

  const checkedAt = readValue(system, [
    "checked_at",
    "checkedAt",
    "timestamp",
    "updated_at",
    "updatedAt",
  ]);

  /* ==========================================================
     DATABASE / API / WORKER STATUS
     ========================================================== */

  const databaseStatus = normalizeStatus(
    readValue(system, [
      "database_status",
      "databaseStatus",
      "db_status",
      "dbStatus",
    ])
  );

  const apiStatus = normalizeStatus(
    readValue(system, [
      "api_status",
      "apiStatus",
      "backend_status",
      "backendStatus",
    ])
  );

  const workerStatus = normalizeStatus(
    readValue(system, [
      "worker_status",
      "workerStatus",
      "automation_status",
      "automationStatus",
    ])
  );

  /* ==========================================================
     BROKER STATUS
     ========================================================== */

  const connectedAccounts = useMemo(() => {
    if (!Array.isArray(accounts)) {
      return 0;
    }

    return accounts.filter((account) => {
      const status = normalizeStatus(
        readValue(account, [
          "status",
          "state",
          "connection_status",
          "connectionStatus",
        ])
      );

      return (
        status === "CONNECTED" ||
        status === "ACTIVE" ||
        status === "ONLINE" ||
        account?.connected === true
      );
    }).length;
  }, [accounts]);

  const brokerStatusText =
    brokerConnected
      ? "CONNECTED"
      : primaryAccount
      ? "ACCOUNT SELECTED"
      : "UNAVAILABLE";

  /* ==========================================================
     SERVICE TABLE
     ========================================================== */

  const serviceColumns = useMemo(
    () => [
      {
        key: "name",
        label: "Service",
        render: (service) => (
          <div>
            <strong>
              {service.name}
            </strong>

            {service.message ? (
              <div className="muted">
                {service.message}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (service) =>
          service.status ? (
            <StatusBadge
              status={service.status}
            />
          ) : (
            <Badge>
              UNAVAILABLE
            </Badge>
          ),
      },
      {
        key: "version",
        label: "Version",
        render: (service) =>
          service.version ||
          "Unavailable",
      },
      {
        key: "uptime",
        label: "Uptime",
        render: (service) =>
          service.uptime !== null
            ? formatNumber(
                service.uptime
              )
            : "Unavailable",
      },
      {
        key: "updatedAt",
        label: "Checked",
        render: (service) =>
          service.updatedAt
            ? formatDateTime(
                service.updatedAt
              )
            : "Unavailable",
      },
    ],
    []
  );

  /* ==========================================================
     EVENT TABLE
     ========================================================== */

  const eventColumns = useMemo(
    () => [
      {
        key: "time",
        label: "Time",
        render: (event) =>
          event.time
            ? formatDateTime(
                event.time
              )
            : "Unavailable",
      },
      {
        key: "level",
        label: "Level",
        render: (event) => (
          <Badge>
            {event.level}
          </Badge>
        ),
      },
      {
        key: "source",
        label: "Source",
        render: (event) =>
          event.source,
      },
      {
        key: "message",
        label: "Message",
        render: (event) =>
          event.message ||
          "Unavailable",
      },
    ],
    []
  );

  return (
    <div className="page system-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="System"
        subtitle="Platform health, runtime status and infrastructure visibility"
        actions={
          <div className="row gap-sm">
            <Badge>
              SYSTEM
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadSystem
              }
              loading={
                loading
              }
            >
              Refresh
            </Button>

            <Button
              variant="primary"
              onClick={
                runHealthCheck
              }
              loading={
                healthChecking
              }
            >
              Health Check
            </Button>
          </div>
        }
      />

      {/* ======================================================
          STATUS MESSAGES
          ====================================================== */}

      {message ? (
        <Alert
          variant="success"
          title="System"
          message={
            message
          }
        />
      ) : null}

      {error ? (
        <ErrorState
          title="System request failed"
          message={
            error
          }
          onRetry={
            loadSystem
          }
        />
      ) : null}

      {/* ======================================================
          MAIN STATUS
          ====================================================== */}

      {loading && !system ? (
        <Loading
          label="Loading system status..."
        />
      ) : !system ? (
        <EmptyState
          title="System status unavailable"
          message="The backend did not return system information. No synthetic health values are displayed."
        />
      ) : (
        <>
          {/* ==================================================
              CORE STATUS CARDS
              ================================================== */}

          <Grid columns={4}>
            <Card>
              <div className="eyebrow">
                SYSTEM
              </div>

              <div className="mt-sm">
                {systemStatus ? (
                  <StatusBadge
                    status={
                      systemStatus
                    }
                  />
                ) : (
                  <Badge>
                    UNAVAILABLE
                  </Badge>
                )}
              </div>

              <div className="muted mt-sm">
                Backend-reported health
              </div>
            </Card>

            <Card>
              <div className="eyebrow">
                BROKER
              </div>

              <div className="mt-sm">
                <Badge>
                  {brokerStatusText}
                </Badge>
              </div>

              <div className="muted mt-sm">
                {connectedAccounts > 0
                  ? `${connectedAccounts} connected account(s)`
                  : "No connected account confirmed"}
              </div>
            </Card>

            <Card>
              <div className="eyebrow">
                API
              </div>

              <div className="mt-sm">
                {apiStatus ? (
                  <StatusBadge
                    status={
                      apiStatus
                    }
                  />
                ) : (
                  <Badge>
                    UNAVAILABLE
                  </Badge>
                )}
              </div>

              <div className="muted mt-sm">
                Backend API status
              </div>
            </Card>

            <Card>
              <div className="eyebrow">
                WORKER
              </div>

              <div className="mt-sm">
                {workerStatus ? (
                  <StatusBadge
                    status={
                      workerStatus
                    }
                  />
                ) : (
                  <Badge>
                    UNAVAILABLE
                  </Badge>
                )}
              </div>

              <div className="muted mt-sm">
                Automation/runtime worker
              </div>
            </Card>
          </Grid>

          {/* ==================================================
              RUNTIME INFORMATION
              ================================================== */}

          <Panel>
            <Section
              title="Runtime Information"
              description="Only values supplied by the backend are displayed."
            >
              <Grid columns={4}>
                <Card>
                  <div className="eyebrow">
                    VERSION
                  </div>

                  <h3>
                    {version ||
                      "Unavailable"}
                  </h3>
                </Card>

                <Card>
                  <div className="eyebrow">
                    ENVIRONMENT
                  </div>

                  <h3>
                    {environment ||
                      "Unavailable"}
                  </h3>
                </Card>

                <Card>
                  <div className="eyebrow">
                    CPU
                  </div>

                  <h3>
                    {cpu !== null
                      ? `${formatNumber(
                          cpu
                        )}%`
                      : "Unavailable"}
                  </h3>
                </Card>

                <Card>
                  <div className="eyebrow">
                    MEMORY
                  </div>

                  <h3>
                    {memory !== null
                      ? `${formatNumber(
                          memory
                        )}%`
                      : "Unavailable"}
                  </h3>
                </Card>
              </Grid>

              <div className="detail-grid mt-md">
                <div>
                  <div className="eyebrow">
                    UPTIME
                  </div>

                  <div className="detail-value">
                    {uptime !== null
                      ? formatNumber(
                          uptime
                        )
                      : "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    LAST CHECK
                  </div>

                  <div className="detail-value">
                    {checkedAt
                      ? formatDateTime(
                          checkedAt
                        )
                      : "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    HEALTH
                  </div>

                  <div className="detail-value">
                    {statusHealthy
                      ? "Healthy according to backend"
                      : systemStatus ||
                        "Unavailable"}
                  </div>
                </div>
              </div>
            </Section>
          </Panel>

          {/* ==================================================
              DEPENDENCY STATUS
              ================================================== */}

          <Panel>
            <Section
              title="Infrastructure Dependencies"
              description="Database, API and worker states are backend-reported."
            >
              <div className="detail-grid">
                <div>
                  <div className="eyebrow">
                    DATABASE
                  </div>

                  <div className="mt-sm">
                    {databaseStatus ? (
                      <StatusBadge
                        status={
                          databaseStatus
                        }
                      />
                    ) : (
                      <Badge>
                        UNAVAILABLE
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    BACKEND API
                  </div>

                  <div className="mt-sm">
                    {apiStatus ? (
                      <StatusBadge
                        status={
                          apiStatus
                        }
                      />
                    ) : (
                      <Badge>
                        UNAVAILABLE
                      </Badge>
                    )}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    AUTOMATION WORKER
                  </div>

                  <div className="mt-sm">
                    {workerStatus ? (
                      <StatusBadge
                        status={
                          workerStatus
                        }
                      />
                    ) : (
                      <Badge>
                        UNAVAILABLE
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          </Panel>

          {/* ==================================================
              SERVICE REGISTRY
              ================================================== */}

          <Panel>
            <Section
              title="Services"
              description="Individual service health is shown only when the backend exposes it."
            >
              {!services.length ? (
                <EmptyState
                  title="Service details unavailable"
                  message="The backend did not provide an individual service registry."
                />
              ) : (
                <Table
                  columns={
                    serviceColumns
                  }
                  data={
                    services
                  }
                />
              )}
            </Section>
          </Panel>

          {/* ==================================================
              RECENT SYSTEM EVENTS
              ================================================== */}

          <Panel>
            <Section
              title="Recent System Events"
              description="Recent backend events, when supported by the system API."
            >
              {!events.length ? (
                <EmptyState
                  title="No recent events available"
                  message="The backend did not return recent system events."
                />
              ) : (
                <Table
                  columns={
                    eventColumns
                  }
                  data={
                    events
                  }
                />
              )}
            </Section>
          </Panel>

          {/* ==================================================
              BROKER CONNECTION SUMMARY
              ================================================== */}

          <Card>
            <Section
              title="Broker Connection"
              description="Trading connectivity is controlled by the Broker module."
            >
              <div className="detail-grid">
                <div>
                  <div className="eyebrow">
                    CONNECTION
                  </div>

                  <div className="mt-sm">
                    <Badge>
                      {brokerStatusText}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    CONNECTED ACCOUNTS
                  </div>

                  <div className="detail-value">
                    {formatNumber(
                      connectedAccounts
                    )}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    PRIMARY ACCOUNT
                  </div>

                  <div className="detail-value">
                    {primaryAccount
                      ? readValue(
                          primaryAccount,
                          [
                            "name",
                            "account_name",
                            "accountName",
                            "id",
                            "account_id",
                            "accountId",
                          ],
                          "Selected"
                        )
                      : "Unavailable"}
                  </div>
                </div>
              </div>

              <div className="mt-md">
                <Alert
                  variant="info"
                  title="Trading safety"
                  message="This page does not place, modify or cancel orders. Broker trading operations remain inside the Broker and Orders modules and are subject to backend authorization and risk controls."
                />
              </div>
            </Section>
          </Card>
        </>
      )}
    </div>
  );
}
