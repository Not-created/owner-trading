import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Network,
  Server,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";
import { toast } from "sonner";

function Panel({
  title,
  subtitle,
  children,
  right,
}) {
  return (
    <section className="border border-term-border bg-term-surface">
      <header className="h-10 px-4 flex items-center justify-between border-b border-term-border">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            {subtitle}
          </div>

          <div className="font-display text-[13px] font-bold tracking-tight -mt-0.5">
            {title}
          </div>
        </div>

        {right}
      </header>

      <div className="p-4">
        {children}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "text-term-text",
}) {
  return (
    <div className="border border-term-border/60 p-3">
      <div className="font-mono text-[10px] uppercase text-term-muted mb-1">
        {label}
      </div>

      <div
        className={`font-mono text-2xl leading-none ${tone}`}
      >
        {value}
      </div>

      {sub && (
        <div className="font-mono text-[10px] text-term-muted mt-1">
          {sub}
        </div>
      )}
    </div>
  );
}

function StatusValue({
  ok,
  onlineLabel = "ONLINE",
  offlineLabel = "OFFLINE",
}) {
  return (
    <span
      className={
        ok
          ? "text-term-success"
          : "text-term-danger"
      }
    >
      {ok
        ? onlineLabel
        : offlineLabel}
    </span>
  );
}

export default function DashboardPage() {
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [logs, setLogs] = useState([]);

  const [health, setHealth] =
    useState(null);

  const [aiHealth, setAiHealth] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [aiHealthLoading, setAiHealthLoading] =
    useState(false);

  const loadDashboard =
    useCallback(
      async (
        showRefreshState = false
      ) => {
        if (showRefreshState) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        try {
          const [
            providersResponse,
            accountsResponse,
            pluginsResponse,
            logsResponse,
            healthResponse,
          ] = await Promise.all([
            api.get("/ai/providers"),
            api.get("/brokers/accounts"),
            api.get("/brokers/plugins"),
            api.get("/logs", {
              params: {
                limit: 8,
              },
            }),
            api.get("/health"),
          ]);

          setProviders(
            Array.isArray(
              providersResponse?.data
                ?.providers
            )
              ? providersResponse.data.providers
              : []
          );

          setAccounts(
            Array.isArray(
              accountsResponse?.data
                ?.accounts
            )
              ? accountsResponse.data.accounts
              : []
          );

          setPlugins(
            Array.isArray(
              pluginsResponse?.data
                ?.plugins
            )
              ? pluginsResponse.data.plugins
              : []
          );

          setLogs(
            Array.isArray(
              logsResponse?.data
                ?.logs
            )
              ? logsResponse.data.logs
              : []
          );

          setHealth(
            healthResponse?.data ||
              null
          );
        } catch (error) {
          toast.error(
            formatApiError(error)
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    loadDashboard(false);
  }, [loadDashboard]);

  const runHealth =
    useCallback(async () => {
      if (aiHealthLoading) {
        return;
      }

      setAiHealthLoading(true);

      try {
        const { data } =
          await api.get(
            "/ai/health"
          );

        setAiHealth(
          Array.isArray(
            data?.results
          )
            ? data.results
            : []
        );

        toast.success(
          "AI provider health check completed"
        );
      } catch (error) {
        toast.error(
          formatApiError(error)
        );
      } finally {
        setAiHealthLoading(false);
      }
    }, [aiHealthLoading]);

  const connectedAccounts =
    accounts.filter(
      (account) =>
        account.status ===
        "connected"
    );

  const primaryAccount =
    accounts.find(
      (account) =>
        account.is_primary
    );

  return (
    <div
      data-testid={
        TEST_IDS.dashboard.root
      }
      className="p-4 sm:p-6 space-y-6 max-w-[1400px]"
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            // overview
          </div>

          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Command Center
          </h1>

          <div className="font-mono text-[10px] text-term-muted mt-1">
            owner trading platform · runtime overview
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="font-mono text-[11px] text-term-secondary">
            runtime{" "}
            <span className={health?.ok ? "text-term-success" : "text-term-danger"}>
              {health?.ok ? "available" : health ? "unavailable" : "checking"}
            </span>
          </div>

          <button
            onClick={() =>
              loadDashboard(true)
            }
            disabled={
              loading ||
              refreshing
            }
            className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1.5"
          >
            {refreshing ? (
              <Loader2
                size={11}
                className="animate-spin"
              />
            ) : (
              <RefreshCw size={11} />
            )}

            refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric
          label="AI providers"
          value={
            loading
              ? "—"
              : providers.length
          }
          sub="registered"
        />

        <Metric
          label="Broker plugins"
          value={
            loading
              ? "—"
              : plugins.length
          }
          sub="runtime registered"
        />

        <Metric
          label="Connected brokers"
          value={
            loading
              ? "—"
              : connectedAccounts.length
          }
          sub={`${accounts.length} configured`}
          tone={
            connectedAccounts.length
              ? "text-term-success"
              : "text-term-text"
          }
        />

        <Metric
          label="Database"
          value={
            loading
              ? "—"
              : health?.ok
              ? "ONLINE"
              : "OFF"
          }
          tone={
            health?.ok
              ? "text-term-success"
              : "text-term-danger"
          }
          sub="mongodb"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="AI Core"
          subtitle="providers.status"
          right={
            <button
              data-testid={
                TEST_IDS.ai.healthBtn
              }
              onClick={
                runHealth
              }
              disabled={
                aiHealthLoading
              }
              className="h-7 px-2 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-1.5"
            >
              {aiHealthLoading ? (
                <Loader2
                  size={10}
                  className="animate-spin"
                />
              ) : (
                <Activity size={10} />
              )}

              {aiHealthLoading
                ? "checking"
                : "run health"}
            </button>
          }
        >
          <div
            data-testid={
              TEST_IDS.dashboard.aiStatus
            }
            className="space-y-2"
          >
            {providers.length ===
            0 ? (
              <div className="border border-term-border/50 p-3 font-mono text-[11px] text-term-muted">
                No AI provider is currently registered.
              </div>
            ) : (
              providers.map(
                (provider) => {
                  const result =
                    aiHealth.find(
                      (item) =>
                        item.provider ===
                        provider.provider_id
                    );

                  return (
                    <div
                      key={
                        provider.provider_id
                      }
                      className="flex items-center justify-between border-b border-term-border/50 pb-2 last:border-0 gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">
                          {
                            provider.display_name
                          }
                        </div>

                        <div className="font-mono text-[10px] text-term-muted truncate">
                          {provider.default_model ||
                            "model unavailable"}
                        </div>
                      </div>

                      <div className="font-mono text-[11px] shrink-0">
                        {result ? (
                          <span
                            className={
                              result.ok
                                ? "text-term-success"
                                : "text-term-danger"
                            }
                          >
                            {result.ok
                              ? `OK · ${result.latency_ms ?? 0}ms`
                              : "FAIL"}
                          </span>
                        ) : (
                          <span className="text-term-muted">
                            idle
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>

          <Link
            to="/ai"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline"
          >
            <Cpu size={11} />
            open ai core
            <ArrowUpRight size={11} />
          </Link>
        </Panel>

        <Panel
          title="Brokers"
          subtitle="broker.core"
        >
          <div
            data-testid={
              TEST_IDS.dashboard.brokerStatus
            }
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">
                registered adapters
              </span>

              <span className="font-mono">
                {plugins.length}
              </span>
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">
                accounts configured
              </span>

              <span className="font-mono">
                {accounts.length}
              </span>
            </div>

            <div className="flex items-center justify-between text-[12px]">
              <span className="text-term-secondary">
                connected accounts
              </span>

              <span className="font-mono text-term-success">
                {connectedAccounts.length}
              </span>
            </div>

            <div className="flex items-center justify-between text-[12px] gap-3">
              <span className="text-term-secondary">
                primary account
              </span>

              <span className="font-mono text-term-muted truncate">
                {primaryAccount?.label ||
                  "—"}
              </span>
            </div>

            {plugins.length ===
              0 && (
              <div className="border border-term-border/50 p-3 mt-2 font-mono text-[11px] text-term-muted">
                Broker Core is available, but no broker adapter is
                currently registered.
              </div>
            )}

            {plugins.length > 0 && (
              <div className="border border-term-border/50 p-3 mt-2">
                <div className="font-mono text-[9px] text-term-muted uppercase mb-2">
                  active registry
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {plugins.map(
                    (plugin) => (
                      <span
                        key={
                          plugin.plugin_id
                        }
                        className="border border-term-success/30 text-term-success px-1.5 py-0.5 font-mono text-[8px] uppercase"
                      >
                        {plugin.plugin_id}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <Link
            to="/brokers"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline"
          >
            <Network size={11} />
            manage brokers
            <ArrowUpRight size={11} />
          </Link>
        </Panel>

        <Panel
          title="System"
          subtitle="system.health"
        >
          <div
            data-testid={
              TEST_IDS.dashboard.systemStatus
            }
            className="space-y-2 font-mono text-[11px]"
          >
            <div className="flex justify-between">
              <span className="text-term-muted">
                api
              </span>

              <StatusValue
                ok={Boolean(
                  health?.ok
                )}
                onlineLabel="200 OK"
                offlineLabel="OFFLINE"
              />
            </div>

            <div className="flex justify-between">
              <span className="text-term-muted">
                database
              </span>

              <StatusValue
                ok={Boolean(
                  health?.ok
                )}
                onlineLabel="connected"
                offlineLabel="offline"
              />
            </div>

            <div className="flex justify-between">
              <span className="text-term-muted">
                encryption
              </span>

              <span className="text-term-muted">configured server-side</span>
            </div>

            <div className="flex justify-between">
              <span className="text-term-muted">
                audit_log
              </span>

              <span className="text-term-muted">available via logs</span>
            </div>

            <div className="flex justify-between">
              <span className="text-term-muted">
                rate_limit
              </span>

              <span className="text-term-muted">not reported</span>
            </div>

            <div className="flex justify-between">
              <span className="text-term-muted">
                security
              </span>

              <span className="text-term-muted flex items-center gap-1">
                <ShieldCheck size={10} />
                configured
              </span>
            </div>
          </div>

          <Link
            to="/logs"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-term-accent hover:underline"
          >
            <Server size={11} />
            view audit stream
            <ArrowUpRight size={11} />
          </Link>
        </Panel>
      </div>

      <Panel
        title="Recent audit stream"
        subtitle="logs.tail"
        right={
          <span className="font-mono text-[10px] text-term-muted">
            last 8
          </span>
        }
      >
        <div
          data-testid={
            TEST_IDS.dashboard.recentLogs
          }
          className="font-mono text-[11px] space-y-1"
        >
          {logs.length === 0 ? (
            <div className="text-term-muted">
              no events
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={
                  log.id ||
                  `${log.created_at}-${log.message}`
                }
                className="flex gap-3 items-baseline"
              >
                <span className="text-term-muted w-40 shrink-0">
                  {log.created_at
                    ?.slice(0, 19)
                    .replace(
                      "T",
                      " "
                    )}
                </span>

                <span
                  className={`w-16 shrink-0 uppercase log-${log.level}`}
                >
                  {log.level}
                </span>

                <span className="w-20 shrink-0 text-term-secondary">
                  {log.category}
                </span>

                <span className="text-term-text break-words">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
    }
