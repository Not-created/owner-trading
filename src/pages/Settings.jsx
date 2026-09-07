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
  Grid,
  Loading,
  PageHeader,
  Panel,
  Section,
  Select,
  StatusBadge,
  Switch,
  Tabs,
} from "../components/UI.jsx";

import {
  settingsApi,
} from "../api.jsx";

import {
  getApiData,
  getErrorMessage,
  readStorage,
} from "../utils.js";

import {
  useTheme,
} from "../context.jsx";

/* ============================================================
   SETTINGS MODULE
   ------------------------------------------------------------
   Central application settings.

   Responsibilities:
   - global appearance/theme
   - application preferences
   - server-backed settings
   - preference persistence
   - real loading/error states
   - safe settings display
   - no broker credentials
   - no trading secrets
   - no fake configuration state

   IMPORTANT:
   Broker credentials, sessions, MPIN/TOTP and API secrets are
   intentionally NOT handled by this page.
   ============================================================ */

/* ============================================================
   SETTINGS TABS
   ============================================================ */

const TABS = [
  {
    id: "appearance",
    label: "Appearance",
  },
  {
    id: "application",
    label: "Application",
  },
  {
    id: "trading",
    label: "Trading Preferences",
  },
  {
    id: "security",
    label: "Security",
  },
];

/* ============================================================
   DEFAULT UI VALUES
   ------------------------------------------------------------
   These are only UI-safe defaults for controls.
   They are NOT presented as backend-confirmed trading state.
   ============================================================ */

const DEFAULT_PREFERENCES = {
  theme: "dark",
  compactMode: false,
  reduceMotion: false,
  notifications: true,
  soundNotifications: false,
  autoRefresh: true,
  refreshInterval: 15,
  timezone: "Asia/Kolkata",
  confirmLiveOrders: true,
  confirmDestructiveActions: true,
};

/* ============================================================
   GENERIC RESPONSE HELPERS
   ============================================================ */

function readValue(
  object,
  keys,
  fallback = null
) {
  if (
    !object ||
    typeof object !==
      "object"
  ) {
    return fallback;
  }

  for (
    const key of keys
  ) {
    if (
      object[key] !==
        undefined &&
      object[key] !==
        null &&
      object[key] !==
        ""
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

function normalizePreferences(
  data
) {
  const source =
    data &&
    typeof data ===
      "object"
      ? data
      : {};

  return {
    ...DEFAULT_PREFERENCES,

    theme:
      String(
        readValue(
          source,
          [
            "theme",
            "appearance",
          ],
          DEFAULT_PREFERENCES.theme
        )
      ).toLowerCase() ===
      "light"
        ? "light"
        : "dark",

    compactMode:
      toBoolean(
        readValue(
          source,
          [
            "compact_mode",
            "compactMode",
          ]
        ),
        DEFAULT_PREFERENCES.compactMode
      ),

    reduceMotion:
      toBoolean(
        readValue(
          source,
          [
            "reduce_motion",
            "reduceMotion",
          ]
        ),
        DEFAULT_PREFERENCES.reduceMotion
      ),

    notifications:
      toBoolean(
        readValue(
          source,
          [
            "notifications",
            "notifications_enabled",
            "notificationsEnabled",
          ]
        ),
        DEFAULT_PREFERENCES.notifications
      ),

    soundNotifications:
      toBoolean(
        readValue(
          source,
          [
            "sound_notifications",
            "soundNotifications",
          ]
        ),
        DEFAULT_PREFERENCES.soundNotifications
      ),

    autoRefresh:
      toBoolean(
        readValue(
          source,
          [
            "auto_refresh",
            "autoRefresh",
          ]
        ),
        DEFAULT_PREFERENCES.autoRefresh
      ),

    refreshInterval:
      Number(
        readValue(
          source,
          [
            "refresh_interval",
            "refreshInterval",
          ],
          DEFAULT_PREFERENCES.refreshInterval
        )
      ) ||
      DEFAULT_PREFERENCES.refreshInterval,

    timezone:
      String(
        readValue(
          source,
          [
            "timezone",
            "time_zone",
          ],
          DEFAULT_PREFERENCES.timezone
        )
      ),

    confirmLiveOrders:
      toBoolean(
        readValue(
          source,
          [
            "confirm_live_orders",
            "confirmLiveOrders",
          ]
        ),
        DEFAULT_PREFERENCES.confirmLiveOrders
      ),

    confirmDestructiveActions:
      toBoolean(
        readValue(
          source,
          [
            "confirm_destructive_actions",
            "confirmDestructiveActions",
          ]
        ),
        DEFAULT_PREFERENCES.confirmDestructiveActions
      ),
  };
}

/* ============================================================
   API METHOD RESOLUTION
   ------------------------------------------------------------
   Existing centralized settingsApi ka available contract use
   karta hai. Missing backend method hone par fake save nahi hota.
   ============================================================ */

function getSettingsMethod(
  names,
  operation
) {
  for (
    const name of names
  ) {
    if (
      typeof settingsApi?.[
        name
      ] === "function"
    ) {
      return settingsApi[
        name
      ].bind(settingsApi);
    }
  }

  throw new Error(
    `Settings operation "${operation}" is not available in the centralized API contract.`
  );
}

/* ============================================================
   MAIN SETTINGS PAGE
   ============================================================ */

export default function Settings() {
  const {
    theme,
    setTheme,
  } = useTheme();

  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "appearance"
  );

  const [
    preferences,
    setPreferences,
  ] = useState(
    () => ({
      ...DEFAULT_PREFERENCES,
      theme:
        theme ===
        "light"
          ? "light"
          : "dark",
    })
  );

  const [
    originalPreferences,
    setOriginalPreferences,
  ] = useState(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(
    false
  );

  const [
    saving,
    setSaving,
  ] = useState(
    false
  );

  const [
    error,
    setError,
  ] = useState(
    ""
  );

  const [
    message,
    setMessage,
  ] = useState(
    ""
  );

  /* ==========================================================
     LOAD SERVER SETTINGS
     ========================================================== */

  const loadSettings =
    useCallback(
      async () => {
        setLoading(
          true
        );
        setError(
          ""
        );

        try {
          const method =
            getSettingsMethod(
              [
                "get",
                "getSettings",
                "load",
                "list",
              ],
              "load settings"
            );

          const response =
            await method();

          const data =
            getApiData(
              response
            );

          const normalized =
            normalizePreferences(
              data
            );

          /*
           * Global theme context remains the final UI source.
           * Backend theme, when supplied, is synchronized here.
           */
          if (
            normalized.theme ===
            "light"
          ) {
            setTheme(
              "light"
            );
          } else {
            setTheme(
              "dark"
            );
          }

          setPreferences(
            normalized
          );

          setOriginalPreferences(
            normalized
          );
        } catch (
          requestError
        ) {
          /*
           * No fake backend settings are displayed as confirmed.
           * Theme can still remain available through local UI context.
           */
          setError(
            getErrorMessage(
              requestError
            )
          );

          setPreferences(
            (current) => ({
              ...DEFAULT_PREFERENCES,
              theme:
                theme ===
                "light"
                  ? "light"
                  : "dark",
              ...current,
            })
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        setTheme,
        theme,
      ]
    );

  useEffect(() => {
    loadSettings();
  }, [
    loadSettings,
  ]);

  /* ==========================================================
     THEME CONTROL
     ----------------------------------------------------------
     Theme immediately changes globally through context.
     ========================================================== */

  const handleThemeChange =
    (nextTheme) => {
      const normalized =
        nextTheme ===
        "light"
          ? "light"
          : "dark";

      setTheme(
        normalized
      );

      setPreferences(
        (current) => ({
          ...current,
          theme:
            normalized,
        })
      );

      setMessage(
        `Theme changed to ${normalized}.`
      );
    };

  /* ==========================================================
     UPDATE LOCAL FORM STATE
     ========================================================== */

  const updatePreference =
    (
      key,
      value
    ) => {
      setMessage(
        ""
      );

      setPreferences(
        (current) => ({
          ...current,
          [key]:
            value,
        })
      );
    };

  /* ==========================================================
     SAVE SETTINGS
     ----------------------------------------------------------
     Settings are sent to backend only through centralized
     settingsApi.
     ========================================================== */

  const saveSettings =
    async () => {
      setSaving(
        true
      );
      setError(
        ""
      );
      setMessage(
        ""
      );

      try {
        const method =
          getSettingsMethod(
            [
              "update",
              "save",
              "updateSettings",
              "set",
            ],
            "save settings"
          );

        const payload = {
          theme:
            preferences.theme,

          compact_mode:
            preferences.compactMode,

          reduce_motion:
            preferences.reduceMotion,

          notifications:
            preferences.notifications,

          sound_notifications:
            preferences.soundNotifications,

          auto_refresh:
            preferences.autoRefresh,

          refresh_interval:
            preferences.refreshInterval,

          timezone:
            preferences.timezone,

          confirm_live_orders:
            preferences.confirmLiveOrders,

          confirm_destructive_actions:
            preferences.confirmDestructiveActions,
        };

        const response =
          await method(
            payload
          );

        const returned =
          getApiData(
            response
          );

        /*
         * If backend returns a settings object, normalize it.
         * Otherwise retain exactly what was submitted.
         */
        const confirmed =
          returned &&
          typeof returned ===
            "object"
            ? normalizePreferences(
                returned
              )
            : normalizePreferences(
                payload
              );

        setPreferences(
          confirmed
        );

        setOriginalPreferences(
          confirmed
        );

        setTheme(
          confirmed.theme
        );

        setMessage(
          readValue(
            returned,
            [
              "message",
              "detail",
            ]
          ) ||
            "Settings saved successfully."
        );
      } catch (
        requestError
      ) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  /* ==========================================================
     RESET UNSAVED CHANGES
     ========================================================== */

  const resetChanges =
    () => {
      if (
        originalPreferences
      ) {
        setPreferences(
          originalPreferences
        );

        setTheme(
          originalPreferences.theme
        );
      } else {
        const fallback =
          normalizePreferences(
            {
              theme:
                theme,
            }
          );

        setPreferences(
          fallback
        );

        setTheme(
          fallback.theme
        );
      }

      setMessage(
        "Unsaved changes were reset."
      );

      setError(
        ""
      );
    };

  /* ==========================================================
     CHANGE DETECTION
     ========================================================== */

  const hasChanges =
    useMemo(() => {
      if (
        !originalPreferences
      ) {
        return false;
      }

      return (
        JSON.stringify(
          preferences
        ) !==
        JSON.stringify(
          originalPreferences
        )
      );
    }, [
      preferences,
      originalPreferences,
    ]);

  /* ==========================================================
     TIMEZONE OPTIONS
     ----------------------------------------------------------
     These are display preferences only.
     They do not change broker/exchange timezone behavior.
     ========================================================== */

  const timezoneOptions = [
    {
      value:
        "Asia/Kolkata",
      label:
        "India — Asia/Kolkata",
    },
    {
      value:
        "UTC",
      label:
        "UTC",
    },
  ];

  /* ==========================================================
     REFRESH OPTIONS
     ========================================================== */

  const refreshOptions = [
    {
      value: "5",
      label:
        "5 seconds",
    },
    {
      value: "15",
      label:
        "15 seconds",
    },
    {
      value: "30",
      label:
        "30 seconds",
    },
    {
      value: "60",
      label:
        "60 seconds",
    },
  ];

  return (
    <div className="page settings-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Settings"
        subtitle="Application appearance and owner preferences"
        actions={
          <div className="row gap-sm">
            <Badge>
              SETTINGS
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadSettings
              }
              loading={
                loading
              }
            >
              Reload
            </Button>

            <Button
              variant="primary"
              onClick={
                saveSettings
              }
              loading={
                saving
              }
              disabled={
                !hasChanges
              }
            >
              Save Changes
            </Button>
          </div>
        }
      />

      {/* ======================================================
          GLOBAL NOTICE
          ====================================================== */}

      <Alert
        variant="info"
        title="Settings boundary"
        message="This page controls application preferences. Broker credentials, sessions, MPIN/TOTP and other secrets are not stored in browser storage or exposed through these settings."
      />

      {/* ======================================================
          ERROR / SUCCESS
          ====================================================== */}

      {error ? (
        <Alert
          variant="danger"
          title="Settings error"
          message={
            error
          }
        />
      ) : null}

      {message ? (
        <Alert
          variant="success"
          title="Settings"
          message={
            message
          }
        />
      ) : null}

      {/* ======================================================
          MAIN SETTINGS PANEL
          ====================================================== */}

      <Panel>
        <Tabs
          items={TABS}
          activeTab={
            activeTab
          }
          onChange={
            setActiveTab
          }
        />

        {loading ? (
          <Loading
            label="Loading settings..."
          />
        ) : (
          <div className="stack gap-lg">
            {/* ==================================================
                APPEARANCE
                ================================================== */}

            {activeTab ===
            "appearance" ? (
              <>
                <Card>
                  <Section
                    title="Global Appearance"
                    description="Theme applies across the complete Owner Trading application."
                  >
                    <Grid columns={2}>
                      <Card>
                        <div className="eyebrow">
                          CURRENT THEME
                        </div>

                        <h2>
                          {preferences.theme ===
                          "light"
                            ? "Light"
                            : "Dark"}
                        </h2>

                        <p className="muted">
                          The same theme is used by the dashboard, broker, trading, strategy and administration screens.
                        </p>

                        <div className="row gap-sm">
                          <Button
                            variant={
                              preferences.theme ===
                              "dark"
                                ? "primary"
                                : "secondary"
                            }
                            onClick={() =>
                              handleThemeChange(
                                "dark"
                              )
                            }
                          >
                            Dark
                          </Button>

                          <Button
                            variant={
                              preferences.theme ===
                              "light"
                                ? "primary"
                                : "secondary"
                            }
                            onClick={() =>
                              handleThemeChange(
                                "light"
                              )
                            }
                          >
                            Light
                          </Button>
                        </div>
                      </Card>

                      <Card>
                        <div className="eyebrow">
                          GLOBAL UI STATE
                        </div>

                        <div className="row justify-between">
                          <span>
                            Theme
                          </span>

                          <StatusBadge
                            status={preferences.theme.toUpperCase()}
                          />
                        </div>

                        <div className="row justify-between mt-md">
                          <span>
                            Reduced Motion
                          </span>

                          <Switch
                            checked={
                              preferences.reduceMotion
                            }
                            onChange={(
                              event
                            ) =>
                              updatePreference(
                                "reduceMotion",
                                event
                                  .target
                                  .checked
                              )
                            }
                          />
                        </div>

                        <div className="row justify-between mt-md">
                          <span>
                            Compact Mode
                          </span>

                          <Switch
                            checked={
                              preferences.compactMode
                            }
                            onChange={(
                              event
                            ) =>
                              updatePreference(
                                "compactMode",
                                event
                                  .target
                                  .checked
                              )
                            }
                          />
                        </div>
                      </Card>
                    </Grid>
                  </Section>
                </Card>

                <Card>
                  <Section
                    title="Display Preferences"
                    description="Visual preferences only; they do not modify trading engine behavior."
                  >
                    <Grid columns={2}>
                      <div className="row justify-between">
                        <div>
                          <strong>
                            Reduced Motion
                          </strong>

                          <div className="muted">
                            Minimize interface animations.
                          </div>
                        </div>

                        <Switch
                          checked={
                            preferences.reduceMotion
                          }
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "reduceMotion",
                              event
                                .target
                                .checked
                            )
                          }
                        />
                      </div>

                      <div className="row justify-between">
                        <div>
                          <strong>
                            Compact Mode
                          </strong>

                          <div className="muted">
                            Use a denser information layout where supported.
                          </div>
                        </div>

                        <Switch
                          checked={
                            preferences.compactMode
                          }
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "compactMode",
                              event
                                .target
                                .checked
                            )
                          }
                        />
                      </div>
                    </Grid>
                  </Section>
                </Card>
              </>
            ) : null}

            {/* ==================================================
                APPLICATION
                ================================================== */}

            {activeTab ===
            "application" ? (
              <>
                <Card>
                  <Section
                    title="Notifications"
                    description="Application-level notification preferences."
                  >
                    <Grid columns={2}>
                      <div className="row justify-between">
                        <div>
                          <strong>
                            Notifications
                          </strong>

                          <div className="muted">
                            Allow application notifications where supported.
                          </div>
                        </div>

                        <Switch
                          checked={
                            preferences.notifications
                          }
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "notifications",
                              event
                                .target
                                .checked
                            )
                          }
                        />
                      </div>

                      <div className="row justify-between">
                        <div>
                          <strong>
                            Sound Notifications
                          </strong>

                          <div className="muted">
                            Play supported notification sounds.
                          </div>
                        </div>

                        <Switch
                          checked={
                            preferences.soundNotifications
                          }
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "soundNotifications",
                              event
                                .target
                                .checked
                            )
                          }
                        />
                      </div>
                    </Grid>
                  </Section>
                </Card>

                <Card>
                  <Section
                    title="Data Refresh"
                    description="Controls frontend refresh preference. It does not create a new market-data engine."
                  >
                    <Grid columns={2}>
                      <div className="row justify-between">
                        <div>
                          <strong>
                            Automatic Refresh
                          </strong>

                          <div className="muted">
                            Allow supported screens to refresh their backend data automatically.
                          </div>
                        </div>

                        <Switch
                          checked={
                            preferences.autoRefresh
                          }
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "autoRefresh",
                              event
                                .target
                                .checked
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="field-label">
                          Preferred Refresh Interval
                        </label>

                        <Select
                          value={String(
                            preferences.refreshInterval
                          )}
                          onChange={(
                            event
                          ) =>
                            updatePreference(
                              "refreshInterval",
                              Number(
                                event
                                  .target
                                  .value
                              )
                            )
                          }
                          options={
                            refreshOptions
                          }
                          disabled={
                            !preferences.autoRefresh
                          }
                        />
                      </div>
                    </Grid>
                  </Section>
                </Card>

                <Card>
                  <Section
                    title="Time Zone"
                    description="Display preference only. Exchange/broker timestamps remain governed by their backend source."
                  >
                    <div className="max-width-md">
                      <Select
                        value={
                          preferences.timezone
                        }
                        onChange={(
                          event
                        ) =>
                          updatePreference(
                            "timezone",
                            event
                              .target
                              .value
                          )
                        }
                        options={
                          timezoneOptions
                        }
                      />
                    </div>
                  </Section>
                </Card>
              </>
            ) : null}

            {/* ==================================================
                TRADING PREFERENCES
                ================================================== */}

            {activeTab ===
            "trading" ? (
              <>
                <Alert
                  variant="warning"
                  title="Trading safety"
                  message="These are confirmation preferences only. They do not replace backend risk validation, owner controls, broker authentication or the canonical order engine."
                />

                <Card>
                  <Section
                    title="Live Order Confirmation"
                    description="UI confirmation preference before a supported live order action."
                  >
                    <div className="row justify-between">
                      <div>
                        <strong>
                          Confirm Live Orders
                        </strong>

                        <div className="muted">
                          Ask for confirmation before supported live order submission.
                        </div>
                      </div>

                      <Switch
                        checked={
                          preferences.confirmLiveOrders
                        }
                        onChange={(
                          event
                        ) =>
                          updatePreference(
                            "confirmLiveOrders",
                            event
                              .target
                              .checked
                          )
                        }
                      />
                    </div>
                  </Section>
                </Card>

                <Card>
                  <Section
                    title="Destructive Action Confirmation"
                    description="UI confirmation for actions such as cancellation and square-off."
                  >
                    <div className="row justify-between">
                      <div>
                        <strong>
                          Confirm Destructive Actions
                        </strong>

                        <div className="muted">
                          Keep confirmation dialogs enabled for high-impact actions.
                        </div>
                      </div>

                      <Switch
                        checked={
                          preferences.confirmDestructiveActions
                        }
                        onChange={(
                          event
                        ) =>
                          updatePreference(
                            "confirmDestructiveActions",
                            event
                              .target
                              .checked
                          )
                        }
                      />
                    </div>
                  </Section>
                </Card>
              </>
            ) : null}

            {/* ==================================================
                SECURITY
                ================================================== */}

            {activeTab ===
            "security" ? (
              <>
                <Card>
                  <Section
                    title="Authentication Security"
                    description="Authentication and credential management remain on the secure backend."
                  >
                    <Grid columns={2}>
                      <div>
                        <div className="eyebrow">
                          SESSION
                        </div>

                        <h3>
                          Backend Managed
                        </h3>

                        <p className="muted">
                          Authentication sessions are not configured or exposed through this page.
                        </p>
                      </div>

                      <div>
                        <div className="eyebrow">
                          CREDENTIALS
                        </div>

                        <h3>
                          Protected
                        </h3>

                        <p className="muted">
                          Broker secrets, MPIN/TOTP and API credentials are not editable here.
                        </p>
                      </div>
                    </Grid>
                  </Section>
                </Card>

                <Card>
                  <Section
                    title="Security Boundaries"
                    description="Settings must never weaken the backend security boundary."
                  >
                    <div className="stack gap-sm">
                      <div className="row justify-between">
                        <span>
                          Broker credentials in browser storage
                        </span>

                        <Badge>
                          NOT USED
                        </Badge>
                      </div>

                      <div className="row justify-between">
                        <span>
                          Session tokens exposed to UI
                        </span>

                        <Badge>
                          NOT USED
                        </Badge>
                      </div>

                      <div className="row justify-between">
                        <span>
                          Backend authorization
                        </span>

                        <Badge>
                          REQUIRED
                        </Badge>
                      </div>

                      <div className="row justify-between">
                        <span>
                          Trading risk validation
                        </span>

                        <Badge>
                          BACKEND
                        </Badge>
                      </div>
                    </div>
                  </Section>
                </Card>

                <Alert
                  variant="info"
                  title="Authentication management"
                  message="Password changes, active sessions and two-factor authentication belong to the authenticated security/profile flow rather than application display preferences."
                />
              </>
            ) : null}

            {/* ==================================================
                SAVE BAR
                ================================================== */}

            <Card>
              <div className="row justify-between">
                <div>
                  <strong>
                    {hasChanges
                      ? "Unsaved changes"
                      : "Settings synchronized"}
                  </strong>

                  <div className="muted">
                    {hasChanges
                      ? "Save the changes when you are ready."
                      : "No unsaved settings changes."}
                  </div>
                </div>

                <div className="row gap-sm">
                  <Button
                    variant="secondary"
                    onClick={
                      resetChanges
                    }
                    disabled={
                      !hasChanges ||
                      saving
                    }
                  >
                    Reset
                  </Button>

                  <Button
                    variant="primary"
                    onClick={
                      saveSettings
                    }
                    loading={
                      saving
                    }
                    disabled={
                      !hasChanges
                    }
                  >
                    Save Settings
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Panel>

      {/* ======================================================
          ARCHITECTURE NOTICE
          ====================================================== */}

      <Alert
        variant="info"
        title="Backend remains the source of truth"
        message="Settings only control supported application preferences. They cannot bypass broker authentication, risk checks, owner controls, strategy deployment permissions or live order validation."
      />
    </div>
  );
}
