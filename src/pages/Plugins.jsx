import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

import {
  pluginApi,
} from "../api.jsx";

import {
  getApiArray,
  getApiData,
  getErrorMessage,
  formatDateTime,
} from "../utils.js";

/* ============================================================
   PLUGINS MODULE
   ------------------------------------------------------------
   Central plugin registry UI.

   Responsibilities:
   - list backend-registered plugins
   - inspect plugin metadata/status
   - register/install a plugin
   - enable/disable a plugin
   - remove a plugin
   - show real backend state only

   Plugin credentials/secrets are never stored in this page.
   ============================================================ */

/* ============================================================
   SAFE VALUE HELPERS
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

/* ============================================================
   PLUGIN NORMALIZATION
   ============================================================ */

function normalizePlugin(
  plugin
) {
  const status =
    readValue(
      plugin,
      [
        "status",
        "state",
        "plugin_status",
      ]
    );

  const enabled =
    plugin?.enabled !== undefined
      ? Boolean(plugin.enabled)
      : status === "enabled" ||
        status === "active";

  return {
    id:
      readValue(
        plugin,
        [
          "id",
          "plugin_id",
          "pluginId",
        ]
      ),

    name:
      readValue(
        plugin,
        [
          "name",
          "display_name",
          "displayName",
        ]
      ) || "Unnamed Plugin",

    description:
      readValue(
        plugin,
        [
          "description",
          "summary",
        ]
      ) || "",

    version:
      readValue(
        plugin,
        [
          "version",
          "plugin_version",
        ]
      ),

    type:
      readValue(
        plugin,
        [
          "type",
          "plugin_type",
          "category",
        ]
      ),

    status:
      status,

    enabled,

    capabilities:
      Array.isArray(
        plugin?.capabilities
      )
        ? plugin.capabilities
        : [],

    createdAt:
      readValue(
        plugin,
        [
          "created_at",
          "createdAt",
        ]
      ),

    updatedAt:
      readValue(
        plugin,
        [
          "updated_at",
          "updatedAt",
        ]
      ),

    source:
      readValue(
        plugin,
        [
          "source",
          "origin",
        ]
      ),

    raw: plugin,
  };
}

/* ============================================================
   MAIN PAGE
   ============================================================ */

export default function Plugins() {
  /* ==========================================================
     STATE
     ========================================================== */

  const [
    plugins,
    setPlugins,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  /* ==========================================================
     REGISTER FORM
     ========================================================== */

  const [
    pluginName,
    setPluginName,
  ] = useState("");

  const [
    pluginType,
    setPluginType,
  ] = useState("");

  const [
    pluginSource,
    setPluginSource,
  ] = useState("");

  const [
    pluginDescription,
    setPluginDescription,
  ] = useState("");

  const [
    registering,
    setRegistering,
  ] = useState(false);

  /* ==========================================================
     LOAD PLUGINS
     ========================================================== */

  const loadPlugins =
    useCallback(
      async () => {
        setLoading(true);
        setError("");

        try {
          const method =
            [
              "list",
              "getPlugins",
              "listPlugins",
              "get",
            ]
              .map(
                (name) =>
                  pluginApi?.[name]
              )
              .find(
                (candidate) =>
                  typeof candidate ===
                  "function"
              );

          if (!method) {
            throw new Error(
              "Plugin list API is not available in the centralized API contract."
            );
          }

          const response =
            await method();

          const data =
            getApiData(
              response
            );

          setPlugins(
            getApiArray(
              data
            ).map(
              normalizePlugin
            )
          );
        } catch (
          requestError
        ) {
          setPlugins([]);
          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    loadPlugins();
  }, [
    loadPlugins,
  ]);

  /* ==========================================================
     FILTERED PLUGINS
     ========================================================== */

  const filteredPlugins =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return plugins.filter(
        (plugin) => {
          const matchesSearch =
            !query ||
            [
              plugin.name,
              plugin.description,
              plugin.type,
              plugin.version,
              plugin.source,
            ]
              .filter(Boolean)
              .some(
                (value) =>
                  String(
                    value
                  )
                    .toLowerCase()
                    .includes(
                      query
                    )
              );

          if (
            !matchesSearch
          ) {
            return false;
          }

          if (
            statusFilter ===
            "all"
          ) {
            return true;
          }

          if (
            statusFilter ===
            "enabled"
          ) {
            return (
              plugin.enabled ===
              true
            );
          }

          if (
            statusFilter ===
            "disabled"
          ) {
            return (
              plugin.enabled ===
              false
            );
          }

          return true;
        }
      );
    }, [
      plugins,
      search,
      statusFilter,
    ]);

  /* ==========================================================
     PLUGIN COUNTS
     ========================================================== */

  const enabledCount =
    useMemo(
      () =>
        plugins.filter(
          (plugin) =>
            plugin.enabled
        ).length,
      [plugins]
    );

  const disabledCount =
    useMemo(
      () =>
        plugins.filter(
          (plugin) =>
            plugin.enabled ===
            false
        ).length,
      [plugins]
    );

  /* ==========================================================
     ENABLE / DISABLE
     ========================================================== */

  const togglePlugin =
    async (
      plugin
    ) => {
      if (!plugin?.id) {
        setError(
          "This plugin has no backend identifier."
        );
        return;
      }

      const action =
        plugin.enabled
          ? "disable"
          : "enable";

      const confirmed =
        window.confirm(
          `${plugin.enabled ? "Disable" : "Enable"} plugin "${plugin.name}"?`
        );

      if (!confirmed) {
        return;
      }

      setActionLoading(
        `${action}:${plugin.id}`
      );
      setError("");
      setMessage("");

      try {
        const methodNames =
          plugin.enabled
            ? [
                "disable",
                "disablePlugin",
              ]
            : [
                "enable",
                "enablePlugin",
              ];

        const method =
          methodNames
            .map(
              (name) =>
                pluginApi?.[name]
            )
            .find(
              (candidate) =>
                typeof candidate ===
                "function"
            );

        if (!method) {
          throw new Error(
            `Plugin ${action} API is not available in the centralized API contract.`
          );
        }

        await method(
          plugin.id
        );

        setMessage(
          `Plugin "${plugin.name}" ${action} request completed.`
        );

        await loadPlugins();
      } catch (
        requestError
      ) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setActionLoading("");
      }
    };

  /* ==========================================================
     REMOVE PLUGIN
     ========================================================== */

  const removePlugin =
    async (
      plugin
    ) => {
      if (!plugin?.id) {
        setError(
          "This plugin has no backend identifier."
        );
        return;
      }

      const confirmed =
        window.confirm(
          `Remove plugin "${plugin.name}"? This action may affect functionality that depends on it.`
        );

      if (!confirmed) {
        return;
      }

      setActionLoading(
        `remove:${plugin.id}`
      );
      setError("");
      setMessage("");

      try {
        const method =
          [
            "remove",
            "delete",
            "deletePlugin",
            "uninstall",
          ]
            .map(
              (name) =>
                pluginApi?.[name]
            )
            .find(
              (candidate) =>
                typeof candidate ===
                "function"
            );

        if (!method) {
          throw new Error(
            "Plugin removal API is not available in the centralized API contract."
          );
        }

        await method(
          plugin.id
        );

        setMessage(
          `Plugin "${plugin.name}" removal request completed.`
        );

        await loadPlugins();
      } catch (
        requestError
      ) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setActionLoading("");
      }
    };

  /* ==========================================================
     REGISTER PLUGIN
     ========================================================== */

  const registerPlugin =
    async () => {
      const name =
        pluginName.trim();

      if (!name) {
        setError(
          "Plugin name is required."
        );
        return;
      }

      setRegistering(true);
      setError("");
      setMessage("");

      try {
        const method =
          [
            "create",
            "register",
            "registerPlugin",
            "install",
          ]
            .map(
              (name) =>
                pluginApi?.[name]
            )
            .find(
              (candidate) =>
                typeof candidate ===
                "function"
            );

        if (!method) {
          throw new Error(
            "Plugin registration API is not available in the centralized API contract."
          );
        }

        const payload = {
          name,
          type:
            pluginType.trim() ||
            undefined,
          source:
            pluginSource.trim() ||
            undefined,
          description:
            pluginDescription.trim() ||
            undefined,
        };

        await method(
          payload
        );

        setPluginName("");
        setPluginType("");
        setPluginSource("");
        setPluginDescription("");

        setMessage(
          `Plugin "${name}" registration request completed.`
        );

        await loadPlugins();
      } catch (
        requestError
      ) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setRegistering(false);
      }
    };

  /* ==========================================================
     PLUGIN TABLE
     ========================================================== */

  const columns =
    useMemo(
      () => [
        {
          key: "name",
          label: "Plugin",
          render:
            (plugin) => (
              <div>
                <strong>
                  {plugin.name}
                </strong>

                {plugin.description ? (
                  <div className="muted">
                    {
                      plugin.description
                    }
                  </div>
                ) : null}
              </div>
            ),
        },
        {
          key: "type",
          label: "Type",
          render:
            (plugin) =>
              plugin.type ||
              "Unavailable",
        },
        {
          key: "version",
          label: "Version",
          render:
            (plugin) =>
              plugin.version ||
              "Unavailable",
        },
        {
          key: "status",
          label: "Status",
          render:
            (plugin) => {
              if (
                plugin.enabled ===
                true
              ) {
                return (
                  <StatusBadge
                    status="ACTIVE"
                  />
                );
              }

              if (
                plugin.enabled ===
                false
              ) {
                return (
                  <StatusBadge
                    status="DISABLED"
                  />
                );
              }

              return (
                <Badge>
                  UNKNOWN
                </Badge>
              );
            },
        },
        {
          key: "capabilities",
          label:
            "Capabilities",
          render:
            (plugin) =>
              plugin.capabilities.length
                ? plugin.capabilities.join(
                    ", "
                  )
                : "Unavailable",
        },
        {
          key: "updatedAt",
          label:
            "Updated",
          render:
            (plugin) =>
              plugin.updatedAt
                ? formatDateTime(
                    plugin.updatedAt
                  )
                : "Unavailable",
        },
        {
          key: "actions",
          label:
            "Actions",
          render:
            (plugin) => (
              <div className="row gap-sm">
                <Button
                  variant={
                    plugin.enabled
                      ? "secondary"
                      : "primary"
                  }
                  loading={
                    actionLoading ===
                    `${
                      plugin.enabled
                        ? "disable"
                        : "enable"
                    }:${plugin.id}`
                  }
                  onClick={() =>
                    togglePlugin(
                      plugin
                    )
                  }
                  disabled={
                    !plugin.id
                  }
                >
                  {plugin.enabled
                    ? "Disable"
                    : "Enable"}
                </Button>

                <Button
                  variant="danger"
                  loading={
                    actionLoading ===
                    `remove:${plugin.id}`
                  }
                  onClick={() =>
                    removePlugin(
                      plugin
                    )
                  }
                  disabled={
                    !plugin.id
                  }
                >
                  Remove
                </Button>
              </div>
            ),
        },
      ],
      [
        actionLoading,
      ]
    );

  return (
    <div className="page plugins-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Plugins"
        subtitle="Manage backend-registered platform plugins"
        actions={
          <div className="row gap-sm">
            <Badge>
              PLUGIN REGISTRY
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadPlugins
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
          SAFETY NOTICE
          ====================================================== */}

      <Alert
        variant="info"
        title="Backend is the source of truth"
        message="Plugin availability, status and capabilities are shown only when returned by the backend registry."
      />

      {/* ======================================================
          SUMMARY
          ====================================================== */}

      <Grid columns={3}>
        <Card>
          <div className="eyebrow">
            REGISTERED
          </div>

          <h2>
            {plugins.length}
          </h2>

          <div className="muted">
            Backend-registered plugins
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            ENABLED
          </div>

          <h2>
            {enabledCount}
          </h2>

          <div className="muted">
            Currently enabled
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            DISABLED
          </div>

          <h2>
            {disabledCount}
          </h2>

          <div className="muted">
            Currently disabled
          </div>
        </Card>
      </Grid>

      {/* ======================================================
          REGISTER / INSTALL
          ====================================================== */}

      <Card>
        <Section
          title="Register Plugin"
          description="Register a plugin through the backend registry. The backend remains responsible for actual installation, validation and execution."
        >
          <Grid columns={2}>
            <div>
              <label className="field-label">
                Plugin Name
              </label>

              <input
                className="input"
                value={
                  pluginName
                }
                onChange={(
                  event
                ) =>
                  setPluginName(
                    event.target.value
                  )
                }
                placeholder="Plugin name"
              />
            </div>

            <div>
              <label className="field-label">
                Plugin Type
              </label>

              <input
                className="input"
                value={
                  pluginType
                }
                onChange={(
                  event
                ) =>
                  setPluginType(
                    event.target.value
                  )
                }
                placeholder="Plugin type"
              />
            </div>
          </Grid>

          <div className="mt-md">
            <label className="field-label">
              Source
            </label>

            <input
              className="input"
              value={
                pluginSource
              }
              onChange={(
                event
              ) =>
                setPluginSource(
                  event.target.value
                )
              }
              placeholder="Backend-supported plugin source"
            />
          </div>

          <div className="mt-md">
            <label className="field-label">
              Description
            </label>

            <textarea
              className="textarea"
              rows={4}
              value={
                pluginDescription
              }
              onChange={(
                event
              ) =>
                setPluginDescription(
                  event.target.value
                )
              }
              placeholder="Plugin description"
            />
          </div>

          <div className="form-actions mt-md">
            <Button
              variant="primary"
              onClick={
                registerPlugin
              }
              loading={
                registering
              }
              disabled={
                !pluginName.trim()
              }
            >
              Register Plugin
            </Button>
          </div>
        </Section>
      </Card>

      {/* ======================================================
          FILTERS
          ====================================================== */}

      <Panel>
        <Section
          title="Plugin Registry"
          description="Search and filter the real backend plugin registry."
        >
          <Grid columns={2}>
            <div>
              <label className="field-label">
                Search
              </label>

              <input
                className="input"
                value={
                  search
                }
                onChange={(
                  event
                ) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search plugins..."
              />
            </div>

            <div>
              <label className="field-label">
                Status
              </label>

              <select
                className="select"
                value={
                  statusFilter
                }
                onChange={(
                  event
                ) =>
                  setStatusFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                <option value="enabled">
                  Enabled
                </option>

                <option value="disabled">
                  Disabled
                </option>
              </select>
            </div>
          </Grid>
        </Section>

        {/* ====================================================
            MESSAGES
            ==================================================== */}

        {message ? (
          <Alert
            variant="success"
            title="Plugin operation"
            message={
              message
            }
          />
        ) : null}

        {error ? (
          <ErrorState
            title="Plugin operation failed"
            message={
              error
            }
            onRetry={
              loadPlugins
            }
          />
        ) : null}

        {/* ====================================================
            PLUGIN DATA
            ==================================================== */}

        {loading &&
        !plugins.length ? (
          <Loading
            label="Loading plugin registry..."
          />
        ) : !plugins.length ? (
          <EmptyState
            title="No plugins available"
            message="The backend did not return any registered plugins."
          />
        ) : !filteredPlugins.length ? (
          <EmptyState
            title="No matching plugins"
            message="No registered plugin matches the current search or status filter."
          />
        ) : (
          <Table
            columns={
              columns
            }
            data={
              filteredPlugins
            }
          />
        )}
      </Panel>
    </div>
  );
}
