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
  Select,
  StatusBadge,
  Table,
  Tabs,
  Textarea,
} from "../components/UI.jsx";

import {
  aiApi,
} from "../api.jsx";

import {
  getApiArray,
  getApiData,
  getErrorMessage,
  formatDateTime,
  formatNumber,
} from "../utils.js";

/* ============================================================
   AI MODULE
   ------------------------------------------------------------
   Central AI workspace.

   Responsibilities:
   - AI provider discovery
   - provider health
   - default provider/model
   - AI chat
   - usage statistics
   - prompt presets
   - preset creation/editing/deletion
   - real backend state only

   IMPORTANT:
   - No fake AI responses.
   - No fake provider health.
   - No API keys stored in browser state.
   - AI Developer/codebase modification workflow belongs
     to the Owner Control / backend developer architecture.
   ============================================================ */

/* ============================================================
   TABS
   ============================================================ */

const TABS = [
  {
    id: "chat",
    label: "AI Chat",
  },
  {
    id: "providers",
    label: "Providers",
  },
  {
    id: "presets",
    label: "Presets",
  },
  {
    id: "usage",
    label: "Usage",
  },
];

/* ============================================================
   PROVIDER HELPERS
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

function normalizeProvider(
  provider
) {
  return {
    id:
      readValue(
        provider,
        [
          "id",
          "provider_id",
          "providerId",
          "name",
        ]
      ) || null,

    name:
      readValue(
        provider,
        [
          "name",
          "provider",
          "display_name",
          "displayName",
        ]
      ) ||
      "Unknown",

    model:
      readValue(
        provider,
        [
          "model",
          "default_model",
          "defaultModel",
        ]
      ) ||
      null,

    enabled:
      provider?.enabled !==
        undefined
        ? Boolean(
            provider.enabled
          )
        : null,

    healthy:
      provider?.healthy !==
        undefined
        ? Boolean(
            provider.healthy
          )
        : provider?.health_status ===
          "healthy"
          ? true
          : provider?.health_status ===
            "unhealthy"
          ? false
          : null,

    latency:
      readValue(
        provider,
        [
          "latency_ms",
          "latencyMs",
          "response_time_ms",
        ]
      ),

    models:
      Array.isArray(
        provider?.models
      )
        ? provider.models
        : [],

    raw: provider,
  };
}

/* ============================================================
   PRESET HELPERS
   ============================================================ */

function normalizePreset(
  preset
) {
  return {
    id:
      readValue(
        preset,
        [
          "id",
          "preset_id",
          "presetId",
        ]
      ) || null,

    name:
      readValue(
        preset,
        [
          "name",
          "title",
        ]
      ) ||
      "Unnamed Preset",

    description:
      readValue(
        preset,
        [
          "description",
          "detail",
        ]
      ) ||
      "",

    prompt:
      readValue(
        preset,
        [
          "prompt",
          "template",
          "content",
        ]
      ) ||
      "",

    category:
      readValue(
        preset,
        [
          "category",
          "type",
        ]
      ) ||
      "General",

    enabled:
      preset?.enabled !==
        undefined
        ? Boolean(
            preset.enabled
          )
        : true,

    raw: preset,
  };
}

/* ============================================================
   MAIN AI PAGE
   ============================================================ */

export default function AI() {
  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "chat"
  );

  /* ==========================================================
     PROVIDER STATE
     ========================================================== */

  const [
    providers,
    setProviders,
  ] = useState([]);

  const [
    defaultProvider,
    setDefaultProvider,
  ] = useState("");

  const [
    defaultModel,
    setDefaultModel,
  ] = useState("");

  const [
    providerLoading,
    setProviderLoading,
  ] = useState(false);

  /* ==========================================================
     CHAT STATE
     ========================================================== */

  const [
    prompt,
    setPrompt,
  ] = useState("");

  const [
    chatMessages,
    setChatMessages,
  ] = useState([]);

  const [
    chatLoading,
    setChatLoading,
  ] = useState(false);

  const [
    chatError,
    setChatError,
  ] = useState("");

  const [
    selectedChatProvider,
    setSelectedChatProvider,
  ] = useState("");

  const [
    selectedChatModel,
    setSelectedChatModel,
  ] = useState("");

  /* ==========================================================
     USAGE STATE
     ========================================================== */

  const [
    usage,
    setUsage,
  ] = useState(null);

  const [
    usageLoading,
    setUsageLoading,
  ] = useState(false);

  /* ==========================================================
     PRESET STATE
     ========================================================== */

  const [
    presets,
    setPresets,
  ] = useState([]);

  const [
    presetLoading,
    setPresetLoading,
  ] = useState(false);

  const [
    presetSaving,
    setPresetSaving,
  ] = useState(false);

  const [
    presetError,
    setPresetError,
  ] = useState("");

  const [
    presetMessage,
    setPresetMessage,
  ] = useState("");

  const [
    editingPreset,
    setEditingPreset,
  ] = useState(null);

  const [
    presetName,
    setPresetName,
  ] = useState("");

  const [
    presetDescription,
    setPresetDescription,
  ] = useState("");

  const [
    presetCategory,
    setPresetCategory,
  ] = useState(
    "General"
  );

  const [
    presetPrompt,
    setPresetPrompt,
  ] = useState("");

  /* ==========================================================
     GLOBAL PAGE ERROR
     ========================================================== */

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  /* ==========================================================
     LOAD PROVIDERS
     ========================================================== */

  const loadProviders =
    useCallback(
      async () => {
        setProviderLoading(
          true
        );

        try {
          const method =
            [
              "getProviders",
              "providers",
              "listProviders",
            ]
              .map(
                (name) =>
                  aiApi?.[
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
              "AI provider API is not available in the centralized API contract."
            );
          }

          const response =
            await method();

          const data =
            getApiData(
              response
            );

          const list =
            getApiArray(
              data
            ).map(
              normalizeProvider
            );

          setProviders(
            list
          );

          const backendDefaultProvider =
            readValue(
              data,
              [
                "default_provider",
                "defaultProvider",
              ]
            );

          const backendDefaultModel =
            readValue(
              data,
              [
                "default_model",
                "defaultModel",
              ]
            );

          if (
            backendDefaultProvider
          ) {
            setDefaultProvider(
              String(
                backendDefaultProvider
              )
            );
          }

          if (
            backendDefaultModel
          ) {
            setDefaultModel(
              String(
                backendDefaultModel
              )
            );
          }

          setError("");
        } catch (
          requestError
        ) {
          setProviders([]);
          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setProviderLoading(
            false
          );
        }
      },
      []
    );

  /* ==========================================================
     LOAD USAGE
     ========================================================== */

  const loadUsage =
    useCallback(
      async () => {
        setUsageLoading(
          true
        );

        try {
          const method =
            [
              "getUsage",
              "usage",
            ]
              .map(
                (name) =>
                  aiApi?.[
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
              "AI usage API is not available in the centralized API contract."
            );
          }

          const response =
            await method();

          setUsage(
            getApiData(
              response
            )
          );
        } catch (
          requestError
        ) {
          setUsage(
            null
          );

          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setUsageLoading(
            false
          );
        }
      },
      []
    );

  /* ==========================================================
     LOAD PRESETS
     ========================================================== */

  const loadPresets =
    useCallback(
      async () => {
        setPresetLoading(
          true
        );
        setPresetError("");

        try {
          const method =
            [
              "getPresets",
              "listPresets",
              "presets",
            ]
              .map(
                (name) =>
                  aiApi?.[
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
              "AI preset API is not available in the centralized API contract."
            );
          }

          const response =
            await method();

          const data =
            getApiData(
              response
            );

          setPresets(
            getApiArray(
              data
            ).map(
              normalizePreset
            )
          );
        } catch (
          requestError
        ) {
          setPresets([]);
          setPresetError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setPresetLoading(
            false
          );
        }
      },
      []
    );

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    loadProviders();
    loadUsage();
    loadPresets();
  }, [
    loadProviders,
    loadUsage,
    loadPresets,
  ]);

  /* ==========================================================
     PROVIDER OPTIONS
     ========================================================== */

  const providerOptions =
    useMemo(
      () =>
        providers
          .filter(
            (provider) =>
              provider.id
          )
          .map(
            (provider) => ({
              value:
                String(
                  provider.id
                ),
              label:
                provider.name,
            })
          ),
      [providers]
    );

  /* ==========================================================
     SELECTED PROVIDER MODELS
     ========================================================== */

  const selectedProvider =
    useMemo(
      () =>
        providers.find(
          (provider) =>
            String(
              provider.id
            ) ===
            String(
              selectedChatProvider
            )
        ) ||
        providers.find(
          (provider) =>
            String(
              provider.id
            ) ===
            String(
              defaultProvider
            )
        ) ||
        null,
      [
        defaultProvider,
        providers,
        selectedChatProvider,
      ]
    );

  const modelOptions =
    useMemo(() => {
      if (
        !selectedProvider
      ) {
        return [];
      }

      return selectedProvider.models
        .map(
          (model) => {
            const value =
              typeof model ===
              "string"
                ? model
                : readValue(
                    model,
                    [
                      "id",
                      "name",
                      "model",
                    ]
                  );

            if (!value) {
              return null;
            }

            return {
              value:
                String(
                  value
                ),
              label:
                String(
                  value
                ),
            };
          }
        )
        .filter(
          Boolean
        );
    }, [
      selectedProvider,
    ]);

  /* ==========================================================
     PROVIDER HEALTH CHECK
     ========================================================== */

  const checkProviderHealth =
    async () => {
      setProviderLoading(
        true
      );
      setError("");

      try {
        const method =
          [
            "health",
            "getHealth",
            "checkHealth",
          ]
            .map(
              (name) =>
                aiApi?.[
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
            "AI health API is not available in the centralized API contract."
          );
        }

        const response =
          await method();

        const data =
          getApiData(
            response
          );

        if (
          Array.isArray(
            data
          )
        ) {
          setProviders(
            data.map(
              normalizeProvider
            )
          );
        } else {
          await loadProviders();
        }

        setMessage(
          "AI provider health check completed."
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
        setProviderLoading(
          false
        );
      }
    };

  /* ==========================================================
     SAVE DEFAULT PROVIDER
     ========================================================== */

  const saveDefaultProvider =
    async () => {
      if (
        !defaultProvider
      ) {
        setError(
          "Select an AI provider before saving."
        );
        return;
      }

      setProviderLoading(
        true
      );
      setError("");
      setMessage("");

      try {
        const method =
          [
            "setDefault",
            "setDefaultProvider",
            "updateDefault",
          ]
            .map(
              (name) =>
                aiApi?.[
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
            "AI default-provider API is not available in the centralized API contract."
          );
        }

        await method({
          provider:
            defaultProvider,
          model:
            defaultModel ||
            undefined,
        });

        setMessage(
          "Default AI provider updated."
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
        setProviderLoading(
          false
        );
      }
    };

  /* ==========================================================
     SEND CHAT MESSAGE
     ========================================================== */

  const sendChat =
    async () => {
      const text =
        prompt.trim();

      if (!text) {
        setChatError(
          "Enter a prompt before sending."
        );
        return;
      }

      setChatLoading(
        true
      );
      setChatError("");

      const userMessage = {
        role: "user",
        content:
          text,
        createdAt:
          new Date().toISOString(),
      };

      setChatMessages(
        (current) => [
          ...current,
          userMessage,
        ]
      );

      setPrompt("");

      try {
        const method =
          [
            "chat",
            "ask",
            "complete",
          ]
            .map(
              (name) =>
                aiApi?.[
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
            "AI chat API is not available in the centralized API contract."
          );
        }

        const response =
          await method({
            prompt:
              text,
            provider:
              selectedChatProvider ||
              defaultProvider ||
              undefined,
            model:
              selectedChatModel ||
              defaultModel ||
              undefined,
          });

        const data =
          getApiData(
            response
          );

        const answer =
          readValue(
            data,
            [
              "response",
              "answer",
              "content",
              "message",
              "text",
            ]
          );

        if (
          answer ===
          null ||
          answer ===
          undefined
        ) {
          throw new Error(
            "AI backend returned no response content."
          );
        }

        setChatMessages(
          (current) => [
            ...current,
            {
              role:
                "assistant",
              content:
                String(
                  answer
                ),
              createdAt:
                new Date().toISOString(),
              provider:
                readValue(
                  data,
                  [
                    "provider",
                    "provider_name",
                  ]
                ),
              model:
                readValue(
                  data,
                  [
                    "model",
                  ]
                ),
            },
          ]
        );

        loadUsage();
      } catch (
        requestError
      ) {
        setChatError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setChatLoading(
          false
        );
      }
    };

  /* ==========================================================
     PRESET FORM RESET
     ========================================================== */

  const resetPresetForm =
    () => {
      setEditingPreset(
        null
      );
      setPresetName("");
      setPresetDescription(
        ""
      );
      setPresetCategory(
        "General"
      );
      setPresetPrompt("");
    };

  /* ==========================================================
     PRESET EDIT
     ========================================================== */

  const editPreset =
    (preset) => {
      setEditingPreset(
        preset
      );
      setPresetName(
        preset.name
      );
      setPresetDescription(
        preset.description
      );
      setPresetCategory(
        preset.category
      );
      setPresetPrompt(
        preset.prompt
      );
    };

  /* ==========================================================
     SAVE PRESET
     ========================================================== */

  const savePreset =
    async () => {
      if (
        !presetName.trim()
      ) {
        setPresetError(
          "Preset name is required."
        );
        return;
      }

      if (
        !presetPrompt.trim()
      ) {
        setPresetError(
          "Preset prompt is required."
        );
        return;
      }

      setPresetSaving(
        true
      );
      setPresetError("");
      setPresetMessage("");

      try {
        const payload = {
          name:
            presetName.trim(),
          description:
            presetDescription.trim(),
          category:
            presetCategory,
          prompt:
            presetPrompt.trim(),
        };

        let response;

        if (
          editingPreset?.id
        ) {
          const method =
            [
              "updatePreset",
              "update",
            ]
              .map(
                (name) =>
                  aiApi?.[
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
              "AI preset update API is not available in the centralized API contract."
            );
          }

          response =
            await method(
              editingPreset.id,
              payload
            );
        } else {
          const method =
            [
              "createPreset",
              "create",
            ]
              .map(
                (name) =>
                  aiApi?.[
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
              "AI preset creation API is not available in the centralized API contract."
            );
          }

          response =
            await method(
              payload
            );
        }

        const returned =
          getApiData(
            response
          );

        const saved =
          returned
            ? normalizePreset(
                returned
              )
            : null;

        if (
          saved?.id
        ) {
          setPresets(
            (current) => {
              const exists =
                current.some(
                  (item) =>
                    String(
                      item.id
                    ) ===
                    String(
                      saved.id
                    )
                );

              if (
                exists
              ) {
                return current.map(
                  (
                    item
                  ) =>
                    String(
                      item.id
                    ) ===
                    String(
                      saved.id
                    )
                      ? saved
                      : item
                );
              }

              return [
                ...current,
                saved,
              ];
            }
          );
        } else {
          await loadPresets();
        }

        setPresetMessage(
          editingPreset
            ? "Preset updated successfully."
            : "Preset created successfully."
        );

        resetPresetForm();
      } catch (
        requestError
      ) {
        setPresetError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setPresetSaving(
          false
        );
      }
    };

  /* ==========================================================
     DELETE PRESET
     ========================================================== */

  const deletePreset =
    async (preset) => {
      if (
        !preset?.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `Delete AI preset "${preset.name}"?`
        );

      if (
        !confirmed
      ) {
        return;
      }

      setPresetError("");

      try {
        const method =
          [
            "deletePreset",
            "removePreset",
            "remove",
            "delete",
          ]
            .map(
              (name) =>
                aiApi?.[
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
            "AI preset delete API is not available in the centralized API contract."
          );
        }

        await method(
          preset.id
        );

        setPresets(
          (current) =>
            current.filter(
              (item) =>
                String(
                  item.id
                ) !==
                String(
                  preset.id
                )
            )
        );

        setPresetMessage(
          "Preset deleted successfully."
        );
      } catch (
        requestError
      ) {
        setPresetError(
          getErrorMessage(
            requestError
          )
        );
      }
    };

  /* ==========================================================
     PRESET TABLE
     ========================================================== */

  const presetColumns =
    useMemo(
      () => [
        {
          key: "name",
          label: "Name",
          render:
            (preset) =>
              preset.name,
        },
        {
          key: "category",
          label:
            "Category",
          render:
            (preset) =>
              preset.category,
        },
        {
          key: "description",
          label:
            "Description",
          render:
            (preset) =>
              preset.description ||
              "—",
        },
        {
          key: "enabled",
          label:
            "Status",
          render:
            (preset) => (
              <StatusBadge
                status={
                  preset.enabled
                    ? "ACTIVE"
                    : "DISABLED"
                }
              />
            ),
        },
        {
          key: "actions",
          label:
            "Actions",
          render:
            (preset) => (
              <div className="row gap-sm">
                <Button
                  variant="secondary"
                  onClick={() =>
                    editPreset(
                      preset
                    )
                  }
                >
                  Edit
                </Button>

                <Button
                  variant="danger"
                  onClick={() =>
                    deletePreset(
                      preset
                    )
                  }
                >
                  Delete
                </Button>
              </div>
            ),
        },
      ],
      []
    );

  return (
    <div className="page ai-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="AI"
        subtitle="AI providers, chat, presets and usage"
        actions={
          <div className="row gap-sm">
            <Badge>
              AI CORE
            </Badge>

            <Button
              variant="secondary"
              onClick={() => {
                loadProviders();
                loadUsage();
                loadPresets();
              }}
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
        title="AI is advisory unless explicitly connected to an authorized workflow"
        message="AI responses do not automatically place live orders, activate strategies or bypass risk controls."
      />

      {/* ======================================================
          TOP STATUS
          ====================================================== */}

      <Grid columns={4}>
        <Card>
          <div className="eyebrow">
            PROVIDERS
          </div>

          <h2>
            {providers.length}
          </h2>

          <div className="muted">
            Backend-registered providers
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            DEFAULT PROVIDER
          </div>

          <h3>
            {defaultProvider ||
              "Unavailable"}
          </h3>

          <div className="muted">
            {defaultModel ||
              "Model unavailable"}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            PRESETS
          </div>

          <h2>
            {presets.length}
          </h2>

          <div className="muted">
            Backend prompt presets
          </div>
        </Card>

        <Card>
          <div className="eyebrow">
            AI STATUS
          </div>

          <h3>
            {providers.some(
              (provider) =>
                provider.healthy ===
                true
            )
              ? "AVAILABLE"
              : providers.length
              ? "UNKNOWN"
              : "UNAVAILABLE"}
          </h3>

          <div className="muted">
            Based only on backend provider state
          </div>
        </Card>
      </Grid>

      {/* ======================================================
          MAIN TABS
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

        {/* ====================================================
            CHAT
            ==================================================== */}

        {activeTab ===
        "chat" ? (
          <div className="stack gap-lg">
            <Card>
              <Section
                title="AI Chat"
                description="Send a request through the centralized AI backend."
              >
                <Grid columns={3}>
                  <div>
                    <label className="field-label">
                      Provider
                    </label>

                    <Select
                      value={
                        selectedChatProvider ||
                        defaultProvider
                      }
                      onChange={(
                        event
                      ) => {
                        setSelectedChatProvider(
                          event
                            .target
                            .value
                        );
                        setSelectedChatModel(
                          ""
                        );
                      }}
                      options={[
                        {
                          value:
                            "",
                          label:
                            "Use Default Provider",
                        },
                        ...providerOptions,
                      ]}
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Model
                    </label>

                    <Select
                      value={
                        selectedChatModel ||
                        defaultModel
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedChatModel(
                          event
                            .target
                            .value
                        )
                      }
                      options={[
                        {
                          value:
                            "",
                          label:
                            "Use Default Model",
                        },
                        ...modelOptions,
                      ]}
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Routing
                    </label>

                    <div className="settings-inline-status">
                      <Badge>
                        BACKEND
                      </Badge>

                      <span className="muted">
                        Provider failover remains server-side.
                      </span>
                    </div>
                  </div>
                </Grid>
              </Section>
            </Card>

            <Card>
              <div className="ai-chat-window">
                {!chatMessages.length ? (
                  <EmptyState
                    title="No conversation yet"
                    message="Send a prompt to start an AI conversation."
                  />
                ) : (
                  chatMessages.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={`${item.createdAt}-${index}`}
                        className={`ai-message ${
                          item.role ===
                          "user"
                            ? "ai-message-user"
                            : "ai-message-assistant"
                        }`}
                      >
                        <div className="eyebrow">
                          {item.role ===
                          "user"
                            ? "YOU"
                            : "AI"}
                        </div>

                        <div className="ai-message-content">
                          {
                            item.content
                          }
                        </div>

                        {item.provider ||
                        item.model ? (
                          <div className="muted">
                            {item.provider ||
                              "Provider unavailable"}

                            {item.model
                              ? ` • ${item.model}`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    )
                  )
                )}
              </div>
            </Card>

            {chatError ? (
              <Alert
                variant="danger"
                title="AI request failed"
                message={
                  chatError
                }
              />
            ) : null}

            <Card>
              <Textarea
                label="Prompt"
                value={
                  prompt
                }
                onChange={(
                  event
                ) =>
                  setPrompt(
                    event
                      .target
                      .value
                  )
                }
                placeholder="Ask the AI..."
                rows={6}
              />

              <div className="row justify-between mt-md">
                <span className="muted">
                  AI output is backend-generated. No fabricated response is shown.
                </span>

                <Button
                  variant="primary"
                  onClick={
                    sendChat
                  }
                  loading={
                    chatLoading
                  }
                  disabled={
                    !prompt.trim()
                  }
                >
                  Send
                </Button>
              </div>
            </Card>
          </div>
        ) : null}

        {/* ====================================================
            PROVIDERS
            ==================================================== */}

        {activeTab ===
        "providers" ? (
          <div className="stack gap-lg">
            <Card>
              <Section
                title="Default AI Provider"
                description="Choose the provider/model used when an explicit provider is not requested."
              >
                <Grid columns={3}>
                  <div>
                    <label className="field-label">
                      Provider
                    </label>

                    <Select
                      value={
                        defaultProvider
                      }
                      onChange={(
                        event
                      ) => {
                        setDefaultProvider(
                          event
                            .target
                            .value
                        );

                        const provider =
                          providers.find(
                            (
                              item
                            ) =>
                              String(
                                item.id
                              ) ===
                              String(
                                event
                                  .target
                                  .value
                              )
                          );

                        setDefaultModel(
                          provider
                            ?.model ||
                            ""
                        );
                      }}
                      options={
                        providerOptions
                      }
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Model
                    </label>

                    <input
                      className="input"
                      value={
                        defaultModel
                      }
                      onChange={(
                        event
                      ) =>
                        setDefaultModel(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="Backend model"
                    />
                  </div>

                  <div className="form-actions">
                    <Button
                      variant="primary"
                      onClick={
                        saveDefaultProvider
                      }
                      loading={
                        providerLoading
                      }
                    >
                      Save Default
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={
                        checkProviderHealth
                      }
                      loading={
                        providerLoading
                      }
                    >
                      Health Check
                    </Button>
                  </div>
                </Grid>
              </Section>
            </Card>

            {error ? (
              <ErrorState
                title="Unable to load AI providers"
                message={
                  error
                }
                onRetry={
                  loadProviders
                }
              />
            ) : providerLoading &&
              !providers.length ? (
              <Loading
                label="Loading AI providers..."
              />
            ) : !providers.length ? (
              <EmptyState
                title="No AI providers available"
                message="The backend did not return any configured AI providers."
              />
            ) : (
              <Grid columns={3}>
                {providers.map(
                  (
                    provider
                  ) => (
                    <Card
                      key={
                        provider.id
                      }
                    >
                      <div className="row justify-between">
                        <div>
                          <div className="eyebrow">
                            PROVIDER
                          </div>

                          <h3>
                            {
                              provider.name
                            }
                          </h3>
                        </div>

                        {provider.healthy ===
                        null ? (
                          <Badge>
                            UNKNOWN
                          </Badge>
                        ) : (
                          <StatusBadge
                            status={
                              provider.healthy
                                ? "HEALTHY"
                                : "UNHEALTHY"
                            }
                          />
                        )}
                      </div>

                      <div className="stack gap-sm mt-md">
                        <div className="row justify-between">
                          <span className="muted">
                            Enabled
                          </span>

                          <span>
                            {provider.enabled ===
                            null
                              ? "Unknown"
                              : provider.enabled
                              ? "Yes"
                              : "No"}
                          </span>
                        </div>

                        <div className="row justify-between">
                          <span className="muted">
                            Default Model
                          </span>

                          <span>
                            {provider.model ||
                              "Unavailable"}
                          </span>
                        </div>

                        <div className="row justify-between">
                          <span className="muted">
                            Latency
                          </span>

                          <span>
                            {provider.latency !==
                            null
                              ? `${formatNumber(
                                  provider.latency
                                )} ms`
                              : "Unavailable"}
                          </span>
                        </div>

                        <div className="row justify-between">
                          <span className="muted">
                            Models
                          </span>

                          <span>
                            {provider.models.length ||
                              "Unavailable"}
                          </span>
                        </div>
                      </div>
                    </Card>
                  )
                )}
              </Grid>
            )}
          </div>
        ) : null}

        {/* ====================================================
            PRESETS
            ==================================================== */}

        {activeTab ===
        "presets" ? (
          <div className="stack gap-lg">
            {presetError ? (
              <Alert
                variant="danger"
                title="Preset error"
                message={
                  presetError
                }
              />
            ) : null}

            {presetMessage ? (
              <Alert
                variant="success"
                title="Preset"
                message={
                  presetMessage
                }
              />
            ) : null}

            <Card>
              <Section
                title={
                  editingPreset
                    ? "Edit Preset"
                    : "Create Preset"
                }
                description="Prompt presets are stored through the backend AI preset API."
              >
                <Grid columns={2}>
                  <div>
                    <label className="field-label">
                      Name
                    </label>

                    <input
                      className="input"
                      value={
                        presetName
                      }
                      onChange={(
                        event
                      ) =>
                        setPresetName(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="Preset name"
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Category
                    </label>

                    <input
                      className="input"
                      value={
                        presetCategory
                      }
                      onChange={(
                        event
                      ) =>
                        setPresetCategory(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="General"
                    />
                  </div>
                </Grid>

                <div className="mt-md">
                  <label className="field-label">
                    Description
                  </label>

                  <input
                    className="input"
                    value={
                      presetDescription
                    }
                    onChange={(
                      event
                    ) =>
                      setPresetDescription(
                        event
                          .target
                          .value
                      )
                    }
                    placeholder="What this preset is used for"
                  />
                </div>

                <div className="mt-md">
                  <Textarea
                    label="Prompt"
                    value={
                      presetPrompt
                    }
                    onChange={(
                      event
                    ) =>
                      setPresetPrompt(
                        event
                          .target
                          .value
                      )
                    }
                    rows={7}
                    placeholder="Preset prompt..."
                  />
                </div>

                <div className="row gap-sm mt-md">
                  <Button
                    variant="primary"
                    onClick={
                      savePreset
                    }
                    loading={
                      presetSaving
                    }
                  >
                    {editingPreset
                      ? "Update Preset"
                      : "Create Preset"}
                  </Button>

                  {editingPreset ? (
                    <Button
                      variant="secondary"
                      onClick={
                        resetPresetForm
                      }
                    >
                      Cancel Edit
                    </Button>
                  ) : null}
                </div>
              </Section>
            </Card>

            {presetLoading ? (
              <Loading
                label="Loading AI presets..."
              />
            ) : !presets.length ? (
              <EmptyState
                title="No AI presets"
                message="No backend prompt presets were returned."
              />
            ) : (
              <Table
                columns={
                  presetColumns
                }
                data={
                  presets
                }
              />
            )}
          </div>
        ) : null}

        {/* ====================================================
            USAGE
            ==================================================== */}

        {activeTab ===
        "usage" ? (
          <div className="stack gap-lg">
            {usageLoading ? (
              <Loading
                label="Loading AI usage..."
              />
            ) : !usage ? (
              <EmptyState
                title="Usage unavailable"
                message="The backend did not return AI usage statistics."
              />
            ) : (
              <>
                <Grid columns={4}>
                  <Card>
                    <div className="eyebrow">
                      REQUESTS
                    </div>

                    <h2>
                      {readValue(
                        usage,
                        [
                          "requests",
                          "request_count",
                          "requestCount",
                        ],
                        "Unavailable"
                      )}
                    </h2>
                  </Card>

                  <Card>
                    <div className="eyebrow">
                      INPUT TOKENS
                    </div>

                    <h2>
                      {readValue(
                        usage,
                        [
                          "input_tokens",
                          "inputTokens",
                          "prompt_tokens",
                        ],
                        "Unavailable"
                      )}
                    </h2>
                  </Card>

                  <Card>
                    <div className="eyebrow">
                      OUTPUT TOKENS
                    </div>

                    <h2>
                      {readValue(
                        usage,
                        [
                          "output_tokens",
                          "outputTokens",
                          "completion_tokens",
                        ],
                        "Unavailable"
                      )}
                    </h2>
                  </Card>

                  <Card>
                    <div className="eyebrow">
                      TOTAL TOKENS
                    </div>

                    <h2>
                      {readValue(
                        usage,
                        [
                          "total_tokens",
                          "totalTokens",
                        ],
                        "Unavailable"
                      )}
                    </h2>
                  </Card>
                </Grid>

                <Card>
                  <Section
                    title="Usage Details"
                    description="Only backend-reported usage is displayed."
                  >
                    <pre className="log-detail">
                      {JSON.stringify(
                        usage,
                        null,
                        2
                      )}
                    </pre>
                  </Section>
                </Card>
              </>
            )}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
