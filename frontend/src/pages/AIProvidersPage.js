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
