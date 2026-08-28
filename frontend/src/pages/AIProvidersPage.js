import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Zap,
  AlertCircle,
  Activity,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";


/*
|--------------------------------------------------------------------------
| Universal AI Providers
|--------------------------------------------------------------------------
|
| FINAL FRONTEND CONTRACT
|
| Backend endpoints used by this page:
|
| GET    /ai/providers
| POST   /ai/default
| GET    /ai/health
| POST   /ai/chat
| GET    /ai/usage
| GET    /ai/presets
| POST   /ai/presets
| DELETE /ai/presets/:preset_id
|
| Provider-specific implementation remains inside the backend AI
| provider plugins. This page only consumes the universal provider
| contract returned by the AI Core.
|
| Important:
| - Only providers returned by the backend are displayed.
| - No fake providers/models are created in the frontend.
| - Unsupported providers/models therefore naturally remain unavailable.
| - The selected default provider/model always comes from the backend.
| - Provider failover information returned by the backend is displayed.
| - API keys and provider secrets are never handled by this page.
|
*/


/* ------------------------------------------------------------------ */
/* Safe helpers                                                       */
/* ------------------------------------------------------------------ */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object"
    ? value
    : {};
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "YES" : "NO";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}


/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AIProvidersPage() {
  const [providers, setProviders] = useState([]);
  const [defaultCfg, setDefaultCfg] = useState({
    provider: "",
    model: "",
  });

  const [health, setHealth] = useState({});
  const [usage, setUsage] = useState({
    total_requests: 0,
    by_provider: {},
  });

  const [presets, setPresets] = useState([]);

  const [prompt, setPrompt] = useState(
    "Summarize the current market structure in 2 sentences."
  );

  const [chatResp, setChatResp] = useState(null);

  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [busyAction, setBusyAction] = useState(null);


  /* ---------------------------------------------------------------- */
  /* Load complete AI page state                                     */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [
        providersResponse,
        usageResponse,
        presetsResponse,
      ] = await Promise.all([
        api.get("/ai/providers"),
        api.get("/ai/usage"),
        api.get("/ai/presets"),
      ]);

      const providerData =
        safeObject(providersResponse?.data);

      const usageData =
        safeObject(usageResponse?.data);

      const presetData =
        safeObject(presetsResponse?.data);

      setProviders(
        safeArray(providerData.providers)
      );

      setDefaultCfg({
        provider:
          providerData.default?.provider || "",
        model:
          providerData.default?.model || "",
      });

      setUsage({
        total_requests:
          Number(usageData.total_requests) || 0,
        by_provider:
          safeObject(usageData.by_provider),
      });

      setPresets(
        safeArray(presetData.presets)
      );
    } catch (error) {
      const message =
        formatApiError(error);

      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    load();
  }, [load]);


  /* ---------------------------------------------------------------- */
  /* Health                                                           */
  /* ---------------------------------------------------------------- */

  const runHealth = async () => {
    if (busyAction) {
      return;
    }

    setBusyAction("health");

    try {
      const { data } =
        await api.get("/ai/health");

      const map = {};

      for (
        const result of safeArray(data?.results)
      ) {
        if (result?.provider) {
          map[result.provider] = result;
        }
      }

      setHealth(map);

      toast.success(
        "AI provider health check complete"
      );
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusyAction(null);
    }
  };


  /* ---------------------------------------------------------------- */
  /* Default provider/model                                           */
  /* ---------------------------------------------------------------- */

  const setDefault = async (
    provider,
    model
  ) => {
    if (
      !provider ||
      !model ||
      busyAction
    ) {
      return;
    }

    setBusyAction(
      `default:${provider}`
    );

    try {
      await api.post(
        "/ai/default",
        {
          provider,
          model,
        }
      );

      setDefaultCfg({
        provider,
        model,
      });

      toast.success(
        `Default → ${provider}/${model}`
      );
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusyAction(null);
    }
  };


  /* ---------------------------------------------------------------- */
  /* Chat                                                             */
  /* ---------------------------------------------------------------- */

  const sendChat = async (
    text = prompt
  ) => {
    const value =
      String(text || "").trim();

    if (
      !value ||
      busyAction
    ) {
      return;
    }

    setBusyAction("chat");
    setChatResp(null);

    try {
      const { data } =
        await api.post(
          "/ai/chat",
          {
            prompt: value,
          }
        );

      setChatResp(
        safeObject(data)
      );

      /*
       * Chat creates a usage record in the backend.
       * Refresh usage/provider state after a successful request.
       */
      await load();
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusyAction(null);
    }
  };


  /* ---------------------------------------------------------------- */
  /* Presets                                                          */
  /* ---------------------------------------------------------------- */

  const runPreset = async (
    preset
  ) => {
    if (
      !preset?.prompt ||
      busyAction
    ) {
      return;
    }

    setPrompt(
      preset.prompt
    );

    await sendChat(
      preset.prompt
    );
  };


  const createPreset = async () => {
    const name =
      newName.trim();

    const presetPrompt =
      newPrompt.trim();

    if (
      !name ||
      !presetPrompt ||
      busyAction
    ) {
      return;
    }

    setBusyAction("create-preset");

    try {
      await api.post(
        "/ai/presets",
        {
          name,
          prompt: presetPrompt,
          category: "custom",
        }
      );

      setNewName("");
      setNewPrompt("");

      toast.success(
        "Preset saved"
      );

      await load();
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusyAction(null);
    }
  };


  const deletePreset = async (
    presetId
  ) => {
    if (
      !presetId ||
      busyAction
    ) {
      return;
    }

    setBusyAction(
      `delete-preset:${presetId}`
    );

    try {
      await api.delete(
        `/ai/presets/${presetId}`
      );

      toast.success(
        "Preset removed"
      );

      await load();
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusyAction(null);
    }
  };


  /* ---------------------------------------------------------------- */
  /* Derived state                                                    */
  /* ---------------------------------------------------------------- */

  const configuredProviderCount =
    useMemo(
      () =>
        providers.filter(
          (provider) =>
            health[
              provider.provider_id
            ]?.ok
        ).length,
      [
        providers,
        health,
      ]
    );

  const totalProviderCount =
    providers.length;


  const defaultProvider =
    providers.find(
      (provider) =>
        provider.provider_id ===
        defaultCfg.provider
    );


  /* ---------------------------------------------------------------- */
  /* Loading state                                                    */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div
        data-testid={
          TEST_IDS.ai.root
        }
        className="p-6 max-w-[1400px]"
      >
        <div className="border border-term-border bg-term-surface p-8 min-h-[240px] flex flex-col items-center justify-center">
          <RefreshCw
            size={16}
            className="animate-spin text-term-accent"
          />

          <div className="font-mono text-[11px] text-term-muted uppercase mt-3">
            Loading AI Core...
          </div>
        </div>
      </div>
    );
  }


  /* ---------------------------------------------------------------- */
  /* Error state                                                      */
  /* ---------------------------------------------------------------- */

  if (loadError) {
    return (
      <div
        data-testid={
          TEST_IDS.ai.root
        }
        className="p-6 max-w-[1400px]"
      >
        <div className="border border-term-danger/40 bg-term-danger/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle
              size={16}
              className="text-term-danger mt-0.5 shrink-0"
            />

            <div className="min-w-0">
              <div className="font-mono text-[10px] text-term-danger uppercase">
                AI Core unavailable
              </div>

              <div className="font-mono text-[11px] text-term-secondary mt-2 break-words">
                {loadError}
              </div>

              <button
                onClick={load}
                className="mt-4 h-8 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-2"
              >
                <RefreshCw size={11} />
                retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div
      data-testid={
        TEST_IDS.ai.root
      }
      className="p-4 md:p-6 space-y-6 max-w-[1400px]"
    >
      {/* ------------------------------------------------------------ */}
      {/* Header                                                       */}
      {/* ------------------------------------------------------------ */}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            // ai.core
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Universal AI Providers
          </h1>

          <p className="text-term-secondary text-[13px] mt-1 max-w-3xl">
            Every registered AI provider is exposed through one
            universal interface. Select the default model, test
            provider health, monitor usage and run command presets.
          </p>
        </div>


        <button
          data-testid={
            TEST_IDS.ai.healthBtn
          }
          onClick={
            runHealth
          }
          disabled={
            Boolean(busyAction)
          }
          className="h-9 px-4 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center justify-center gap-2 self-start md:self-auto"
        >
          <Zap size={12} />

          {busyAction === "health"
            ? "running..."
            : "run health check"}
        </button>
      </div>


      {/* ------------------------------------------------------------ */}
      {/* AI Core summary                                              */}
      {/* ------------------------------------------------------------ */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="registered"
          value={totalProviderCount}
          icon={
            <Cpu size={13} />
          }
        />

        <SummaryCard
          label="healthy"
          value={
            configuredProviderCount
          }
          icon={
            <Activity size={13} />
          }
          tone="success"
        />

        <SummaryCard
          label="total requests"
          value={
            usage.total_requests
          }
          icon={
            <BarChart3 size={13} />
          }
        />

        <SummaryCard
          label="default"
          value={
            defaultProvider
              ? defaultProvider.display_name
              : defaultCfg.provider || "—"
          }
          icon={
            <CheckCircle2 size={13} />
          }
          compact
        />
      </div>


      {/* ------------------------------------------------------------ */}
      {/* Provider cards                                               */}
      {/* ------------------------------------------------------------ */}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] text-term-muted uppercase">
              ai.providers
            </div>

            <div className="font-display text-[14px] font-bold">
              Registered providers
            </div>
          </div>

          <span className="font-mono text-[9px] text-term-muted uppercase">
            backend registry
          </span>
        </div>


        {providers.length === 0 ? (
          <EmptyState
            label="No AI providers are registered."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {providers.map(
              (provider) => {
                const providerId =
                  provider.provider_id;

                const providerHealth =
                  health[
                    providerId
                  ];

                const providerUsage =
                  safeObject(
                    usage.by_provider?.[
                      providerId
                    ]
                  );

                const isDefault =
                  defaultCfg.provider ===
                  providerId;

                const models =
                  safeArray(
                    provider.available_models
                  );

                const selectedModel =
                  isDefault
                    ? defaultCfg.model
                    : provider.default_model;

                return (
                  <ProviderCard
                    key={providerId}
                    provider={
                      provider
                    }
                    providerHealth={
                      providerHealth
                    }
                    providerUsage={
                      providerUsage
                    }
                    isDefault={
                      isDefault
                    }
                    selectedModel={
                      selectedModel
                    }
                    models={
                      models
                    }
                    busy={
                      Boolean(
                        busyAction
                      )
                    }
                    onSetDefault={
                      setDefault
                    }
                  />
                );
              }
            )}
          </div>
        )}
      </section>
  );
}


/* ------------------------------------------------------------------ */
/* Summary card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
  compact = false,
}) {
  const toneClass =
    tone === "success"
      ? "text-term-success"
      : "text-term-text";

  return (
    <div className="border border-term-border bg-term-surface p-3 min-h-[78px]">
      <div className="flex items-center gap-2">
        <span className="text-term-muted">
          {icon}
        </span>

        <span className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
          {label}
        </span>
      </div>

      <div
        className={`font-mono mt-2 leading-none ${toneClass} ${
          compact
            ? "text-[13px] truncate"
            : "text-xl"
        }`}
        title={formatValue(value)}
      >
        {formatValue(value)}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Provider card                                                      */
/* ------------------------------------------------------------------ */

function ProviderCard({
  provider,
  providerHealth,
  providerUsage,
  isDefault,
  selectedModel,
  models,
  busy,
  onSetDefault,
}) {
  const providerId =
    provider.provider_id;

  const displayName =
    provider.display_name ||
    provider.name ||
    providerId;

  const healthy =
    providerHealth?.ok === true;

  const modelOptions =
    models.length > 0
      ? models
      : selectedModel
        ? [selectedModel]
        : [];

  const [model, setModel] =
    useState(selectedModel || "");

  useEffect(() => {
    setModel(
      selectedModel || ""
    );
  }, [selectedModel]);


  const usageCount =
    Number(
      providerUsage?.requests ??
      providerUsage?.total_requests ??
      0
    ) || 0;


  const chooseDefault = () => {
    if (
      !providerId ||
      !model ||
      busy
    ) {
      return;
    }

    onSetDefault(
      providerId,
      model
    );
  };


  return (
    <article
      className={`border bg-term-surface ${
        isDefault
          ? "border-term-accent"
          : "border-term-border"
      }`}
    >
      {/* ---------------------------------------------------------- */}
      {/* Provider header                                            */}
      {/* ---------------------------------------------------------- */}

      <header className="p-4 border-b border-term-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-bold truncate">
              {displayName}
            </div>

            <div className="font-mono text-[9px] text-term-muted uppercase mt-1 truncate">
              {providerId}
            </div>
          </div>

          <div className="shrink-0">
            {providerHealth ? (
              <span
                className={`font-mono text-[9px] uppercase ${
                  healthy
                    ? "text-term-success"
                    : "text-term-danger"
                }`}
              >
                ●{" "}
                {healthy
                  ? "healthy"
                  : "error"}
              </span>
            ) : (
              <span className="font-mono text-[9px] text-term-muted uppercase">
                ● unchecked
              </span>
            )}
          </div>
        </div>


        {provider.description && (
          <p className="text-term-secondary text-[11px] mt-3 leading-relaxed">
            {provider.description}
          </p>
        )}
      </header>


      {/* ---------------------------------------------------------- */}
      {/* Provider metadata                                           */}
      {/* ---------------------------------------------------------- */}

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <MetaItem
            label="version"
            value={
              provider.version ||
              "—"
            }
          />

          <MetaItem
            label="requests"
            value={usageCount}
          />
        </div>


        {/* -------------------------------------------------------- */}
        {/* Model selector                                           */}
        {/* -------------------------------------------------------- */}

        <div>
          <label className="font-mono text-[9px] text-term-muted uppercase tracking-wider block mb-1">
            Model
          </label>

          {modelOptions.length > 0 ? (
            <select
              value={model}
              onChange={(event) =>
                setModel(
                  event.target.value
                )
              }
              className="w-full h-9 px-2 bg-term-panel border border-term-border font-mono text-[11px] text-term-text focus:border-term-accent focus:outline-none"
            >
              {modelOptions.map(
                (modelName) => (
                  <option
                    key={modelName}
                    value={modelName}
                  >
                    {modelName}
                  </option>
                )
              )}
            </select>
          ) : (
            <div className="h-9 px-3 flex items-center border border-term-border bg-term-panel font-mono text-[10px] text-term-muted">
              No model exposed
            </div>
          )}
        </div>


        {/* -------------------------------------------------------- */}
        {/* Default action                                           */}
        {/* -------------------------------------------------------- */}

        <button
          onClick={
            chooseDefault
          }
          disabled={
            busy ||
            !model ||
            isDefault
          }
          className={`w-full h-9 font-mono text-[10px] uppercase flex items-center justify-center gap-2 border ${
            isDefault
              ? "border-term-success/40 text-term-success bg-term-success/5"
              : "border-term-border hover:border-term-accent hover:text-term-accent"
          } disabled:opacity-40`}
        >
          {isDefault ? (
            <>
              <CheckCircle2
                size={12}
              />
              default provider
            </>
          ) : (
            <>
              <Play
                size={12}
              />
              use as default
            </>
          )}
        </button>


        {/* -------------------------------------------------------- */}
        {/* Health detail                                            */}
        {/* -------------------------------------------------------- */}

        {providerHealth && (
          <div className="border-t border-term-border/60 pt-3">
            <div className="font-mono text-[9px] text-term-muted uppercase mb-1">
              health detail
            </div>

            <div
              className={`font-mono text-[10px] break-words ${
                healthy
                  ? "text-term-secondary"
                  : "text-term-danger"
              }`}
            >
              {providerHealth.detail ||
                providerHealth.message ||
                providerHealth.error ||
                (healthy
                  ? "Provider is healthy."
                  : "Provider health check failed.")}
            </div>

            {providerHealth.latency_ms !==
              undefined && (
              <div className="font-mono text-[9px] text-term-muted mt-1">
                latency:{" "}
                {providerHealth.latency_ms}
                ms
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}


/* ------------------------------------------------------------------ */
/* Metadata item                                                      */
/* ------------------------------------------------------------------ */

function MetaItem({
  label,
  value,
}) {
  return (
    <div className="border border-term-border/60 p-2">
      <div className="font-mono text-[8px] text-term-muted uppercase">
        {label}
      </div>

      <div className="font-mono text-[11px] text-term-secondary mt-1 truncate">
        {formatValue(value)}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Chat + presets workspace                                          */
/* ------------------------------------------------------------------ */

function EmptyState({
  label,
}) {
  return (
    <div className="border border-term-border bg-term-surface p-8 text-center">
      <div className="font-mono text-[10px] text-term-muted uppercase">
        {label}
      </div>
    </div>
  );
              }
/* ------------------------------------------------------------------ */
/* Chat + presets workspace                                           */
/* ------------------------------------------------------------------ */

function AIWorkspace({
  prompt,
  setPrompt,
  chatResp,
  busyAction,
  sendChat,
  presets,
  runPreset,
  newName,
  setNewName,
  newPrompt,
  setNewPrompt,
  createPreset,
  deletePreset,
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

      {/* ------------------------------------------------------------ */}
      {/* AI chat                                                      */}
      {/* ------------------------------------------------------------ */}

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              ai.chat
            </div>

            <div className="font-display text-[13px] font-bold">
              AI Workspace
            </div>
          </div>

          <span className="font-mono text-[9px] text-term-muted uppercase">
            universal
          </span>
        </header>

        <div className="p-4 space-y-3">
          <textarea
            value={prompt}
            onChange={(event) =>
              setPrompt(event.target.value)
            }
            rows={6}
            maxLength={12000}
            disabled={Boolean(busyAction)}
            placeholder="Ask the configured AI provider..."
            className="w-full bg-term-panel border border-term-border p-3 font-mono text-[11px] text-term-text focus:border-term-accent focus:outline-none resize-none disabled:opacity-50"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] text-term-muted">
              {prompt.length}/12000
            </span>

            <button
              onClick={() =>
                sendChat(prompt)
              }
              disabled={
                Boolean(busyAction) ||
                !prompt.trim()
              }
              className="h-9 px-4 bg-term-accent text-white font-mono text-[10px] uppercase disabled:opacity-40 flex items-center gap-2"
            >
              <Send size={11} />

              {busyAction === "chat"
                ? "thinking..."
                : "send"}
            </button>
          </div>

          {chatResp && (
            <div className="border border-term-border bg-term-panel">
              <div className="px-3 py-2 border-b border-term-border flex flex-wrap gap-x-3 gap-y-1">
                {chatResp.provider && (
                  <span className="font-mono text-[9px] text-term-muted">
                    provider: {chatResp.provider}
                  </span>
                )}

                {chatResp.model && (
                  <span className="font-mono text-[9px] text-term-muted">
                    model: {chatResp.model}
                  </span>
                )}

                {chatResp.latency_ms !==
                  undefined && (
                  <span className="font-mono text-[9px] text-term-muted">
                    latency: {chatResp.latency_ms}ms
                  </span>
                )}
              </div>

              <pre className="p-3 font-mono text-[11px] text-term-text whitespace-pre-wrap break-words overflow-x-auto">
                {chatResp.text ||
                  chatResp.answer ||
                  chatResp.response ||
                  JSON.stringify(
                    chatResp,
                    null,
                    2
                  )}
              </pre>
            </div>
          )}
        </div>
      </section>


      {/* ------------------------------------------------------------ */}
      {/* Presets                                                      */}
      {/* ------------------------------------------------------------ */}

      <section className="border border-term-border bg-term-surface">
        <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
          <div>
            <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
              ai.presets
            </div>

            <div className="font-display text-[13px] font-bold">
              Command presets
            </div>
          </div>

          <span className="font-mono text-[9px] text-term-muted">
            {presets.length} saved
          </span>
        </header>

        <div className="p-4 space-y-3">

          {/* Existing presets */}
          {presets.length === 0 ? (
            <div className="border border-term-border/60 p-4 text-center">
              <div className="font-mono text-[10px] text-term-muted">
                No presets saved.
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {presets.map(
                (preset, index) => {
                  const presetId =
                    preset.preset_id ||
                    preset.id;

                  return (
                    <div
                      key={
                        presetId ||
                        `preset-${index}`
                      }
                      className="border border-term-border/60 p-3 bg-term-panel"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] text-term-text">
                            {preset.name ||
                              "Unnamed preset"}
                          </div>

                          {preset.category && (
                            <div className="font-mono text-[8px] text-term-muted uppercase mt-1">
                              {preset.category}
                            </div>
                          )}

                          <div className="font-mono text-[9px] text-term-secondary mt-2 whitespace-pre-wrap break-words">
                            {preset.prompt ||
                              "—"}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() =>
                              runPreset(
                                preset
                              )
                            }
                            disabled={
                              Boolean(
                                busyAction
                              ) ||
                              !preset.prompt
                            }
                            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1"
                          >
                            <Play size={9} />
                            run
                          </button>

                          {presetId && (
                            <button
                              onClick={() =>
                                deletePreset(
                                  presetId
                                )
                              }
                              disabled={
                                Boolean(
                                  busyAction
                                )
                              }
                              className="h-7 w-7 border border-term-border font-mono text-[9px] hover:border-term-danger hover:text-term-danger disabled:opacity-40 flex items-center justify-center"
                              title="Delete preset"
                            >
                              <Trash2
                                size={10}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}


          {/* Create preset */}
          <div className="border-t border-term-border pt-3">
            <div className="font-mono text-[9px] text-term-muted uppercase mb-2">
              create preset
            </div>

            <div className="space-y-2">
              <input
                value={newName}
                onChange={(event) =>
                  setNewName(
                    event.target.value
                  )
                }
                maxLength={100}
                disabled={
                  Boolean(
                    busyAction
                  )
                }
                placeholder="Preset name"
                className="w-full h-9 px-3 bg-term-panel border border-term-border font-mono text-[10px] focus:border-term-accent focus:outline-none disabled:opacity-50"
              />

              <textarea
                value={newPrompt}
                onChange={(event) =>
                  setNewPrompt(
                    event.target.value
                  )
                }
                rows={3}
                maxLength={4000}
                disabled={
                  Boolean(
                    busyAction
                  )
                }
                placeholder="Preset prompt"
                className="w-full bg-term-panel border border-term-border p-3 font-mono text-[10px] focus:border-term-accent focus:outline-none resize-none disabled:opacity-50"
              />

              <button
                onClick={
                  createPreset
                }
                disabled={
                  Boolean(
                    busyAction
                  ) ||
                  !newName.trim() ||
                  !newPrompt.trim()
                }
                className="h-8 px-3 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-2"
              >
                <Plus size={10} />
                save preset
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Usage panel                                                        */
/* ------------------------------------------------------------------ */

function UsagePanel({
  usage,
}) {
  const entries =
    Object.entries(
      safeObject(
        usage?.by_provider
      )
    );

  return (
    <section className="border border-term-border bg-term-surface">
      <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
        <div>
          <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
            ai.usage
          </div>

          <div className="font-display text-[13px] font-bold">
            Usage
          </div>
        </div>

        <span className="font-mono text-[9px] text-term-muted">
          total:{" "}
          {Number(
            usage?.total_requests
          ) || 0}
        </span>
      </header>

      <div className="p-4">
        {entries.length === 0 ? (
          <div className="font-mono text-[10px] text-term-muted">
            No provider usage recorded.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {entries.map(
              ([provider, data]) => {
                const item =
                  safeObject(data);

                const requests =
                  Number(
                    item.requests ??
                    item.total_requests ??
                    item.count ??
                    0
                  ) || 0;

                return (
                  <div
                    key={provider}
                    className="border border-term-border/60 p-3 bg-term-panel"
                  >
                    <div className="font-mono text-[9px] text-term-muted uppercase truncate">
                      {provider}
                    </div>

                    <div className="font-mono text-xl text-term-text mt-1">
                      {requests}
                    </div>

                    {item.errors !==
                      undefined && (
                      <div className="font-mono text-[9px] text-term-danger mt-1">
                        errors:{" "}
                        {formatValue(
                          item.errors
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Final page sections                                                */
/* ------------------------------------------------------------------ */

/*
 * NOTE:
 * The following wrapper is intentionally kept separate from the main
 * provider registry card so future AI modules can consume the same
 * universal provider state without introducing provider-specific UI
 * contracts.
 */

function WorkspaceSection({
  prompt,
  setPrompt,
  chatResp,
  busyAction,
  sendChat,
  presets,
  runPreset,
  newName,
  setNewName,
  newPrompt,
  setNewPrompt,
  createPreset,
  deletePreset,
}) {
  return (
    <AIWorkspace
      prompt={prompt}
      setPrompt={setPrompt}
      chatResp={chatResp}
      busyAction={busyAction}
      sendChat={sendChat}
      presets={presets}
      runPreset={runPreset}
      newName={newName}
      setNewName={setNewName}
      newPrompt={newPrompt}
      setNewPrompt={setNewPrompt}
      createPreset={createPreset}
      deletePreset={deletePreset}
    />
  );
}


/* ------------------------------------------------------------------ */
/* Additional export-safe utilities                                   */
/* ------------------------------------------------------------------ */

function ProviderHealthBadge({
  health,
}) {
  if (!health) {
    return (
      <span className="font-mono text-[9px] text-term-muted uppercase">
        unchecked
      </span>
    );
  }

  return (
    <span
      className={`font-mono text-[9px] uppercase ${
        health.ok
          ? "text-term-success"
          : "text-term-danger"
      }`}
    >
      {health.ok
        ? "healthy"
        : "error"}
    </span>
  );
    }
      <WorkspaceSection
        prompt={prompt}
        setPrompt={setPrompt}
        chatResp={chatResp}
        busyAction={busyAction}
        sendChat={sendChat}
        presets={presets}
        runPreset={runPreset}
        newName={newName}
        setNewName={setNewName}
        newPrompt={newPrompt}
        setNewPrompt={setNewPrompt}
        createPreset={createPreset}
        deletePreset={deletePreset}
      />

      <UsagePanel
        usage={usage}
      />


