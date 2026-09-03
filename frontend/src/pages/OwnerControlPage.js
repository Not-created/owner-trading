import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  Clock3,
  Command,
  Cpu,
  Database,
  FileCode,
  GitBranch,
  ListChecks,
  RefreshCw,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api, formatApiError } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";


/*
|--------------------------------------------------------------------------
| Owner Control
|--------------------------------------------------------------------------
|
| FINAL FRONTEND CONTRACT
|
| Existing backend endpoints used by this page:
|
| GET  /dev/health
| GET  /dev/capabilities
| GET  /dev/modules
| GET  /dev/db-schema
| POST /dev/ask
| GET  /dev/approvals
| POST /dev/approvals
| POST /dev/approvals/:approval_id/decide
|
| No broker-specific, AI-provider-specific, strategy-specific or
| deployment-specific API is hard-coded here.
|
| This page is the owner/developer control surface. Actual trading,
| broker execution, strategy execution and deployment remain behind
| their respective backend modules and approval boundaries.
|
*/


/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

const TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: Command,
    tid: TEST_IDS.ownerControl.tabOverview,
  },
  {
    id: "modules",
    label: "Modules",
    icon: Cpu,
    tid: TEST_IDS.ownerControl.tabModules,
  },
  {
    id: "schema",
    label: "DB Schema",
    icon: Database,
    tid: TEST_IDS.ownerControl.tabSchema,
  },
  {
    id: "dev",
    label: "AI Developer",
    icon: FileCode,
    tid: TEST_IDS.ownerControl.tabDev,
  },
  {
    id: "approvals",
    label: "Approvals",
    icon: ListChecks,
    tid: TEST_IDS.ownerControl.tabApprovals,
  },
];


/* ------------------------------------------------------------------ */
/* Generic helpers                                                    */
/* ------------------------------------------------------------------ */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
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

function formatDate(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}


/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */

export default function OwnerControlPage() {
  const [tab, setTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    setRefreshKey((value) => value + 1);
  };

  return (
    <div
      data-testid={TEST_IDS.ownerControl.root}
      className="p-4 md:p-6 space-y-6 max-w-[1500px]"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">
            // owner.control
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Owner Control
          </h1>

          <p className="text-term-secondary text-[13px] mt-1 max-w-3xl">
            Central control center for platform inspection, AI Developer
            operations, database visibility and approval-gated actions.
          </p>
        </div>

        <button
          onClick={refresh}
          className="h-8 px-3 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent flex items-center justify-center gap-2 self-start md:self-auto"
        >
          <RefreshCw size={11} />
          refresh
        </button>
      </div>


      {/* Security boundary */}
      <div className="border border-term-warning/30 bg-term-warning/5 p-3 flex items-start gap-2">
        <ShieldAlert
          size={14}
          className="text-term-warning mt-0.5 shrink-0"
        />

        <div>
          <div className="font-mono text-[10px] uppercase text-term-warning">
            Owner approval boundary
          </div>

          <div className="font-mono text-[10px] text-term-secondary mt-1 leading-relaxed">
            Inspection and reasoning may be read-only. Critical write,
            delete, command, Git, deployment and other dangerous operations
            remain approval-gated by the backend.
          </div>
        </div>
      </div>


      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {/* Sidebar */}
        <aside className="col-span-12 lg:col-span-3">
          <div className="border border-term-border bg-term-surface">
            {TABS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;

              return (
                <button
                  key={item.id}
                  data-testid={item.tid}
                  onClick={() => setTab(item.id)}
                  className={`w-full text-left min-h-10 px-4 py-2 font-mono text-[10px] uppercase border-l-2 flex items-center gap-2 ${
                    active
                      ? "bg-term-hover border-term-accent text-term-text"
                      : "border-transparent text-term-secondary hover:text-term-text hover:bg-term-hover/40"
                  }`}
                >
                  <Icon size={12} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>


        {/* Content */}
        <section className="col-span-12 lg:col-span-9">
          {tab === "overview" && (
            <Overview refreshKey={refreshKey} />
          )}

          {tab === "modules" && (
            <ModulesTab refreshKey={refreshKey} />
          )}

          {tab === "schema" && (
            <SchemaTab refreshKey={refreshKey} />
          )}

          {tab === "dev" && (
            <DevTab />
          )}

          {tab === "approvals" && (
            <ApprovalsTab refreshKey={refreshKey} />
          )}
        </section>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Panel                                                              */
/* ------------------------------------------------------------------ */

function Panel({
  title,
  subtitle,
  children,
  right = null,
}) {
  return (
    <section className="border border-term-border bg-term-surface">
      <header className="min-h-10 px-4 py-2 flex items-center justify-between border-b border-term-border gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[9px] text-term-muted uppercase tracking-wider">
            {subtitle}
          </div>

          <div className="font-display text-[13px] font-bold tracking-tight truncate">
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


/* ------------------------------------------------------------------ */
/* Overview                                                           */
/* ------------------------------------------------------------------ */

function Overview({ refreshKey }) {
  const [health, setHealth] = useState(null);
  const [caps, setCaps] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [healthResponse, capabilitiesResponse] =
        await Promise.all([
          api.get("/dev/health"),
          api.get("/dev/capabilities"),
        ]);

      setHealth(
        safeObject(healthResponse?.data)
      );

      setCaps(
        safeObject(capabilitiesResponse?.data)
      );
    } catch (error) {
      setError(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);


  if (loading) {
    return (
      <LoadingState label="Loading owner control status..." />
    );
  }


  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={load}
      />
    );
  }


  const read = safeArray(caps?.read);
  const reason = safeArray(caps?.reason);
  const gated = safeArray(caps?.gated_by_approval);
  const neverAutomatic = safeArray(caps?.never_automatic);


  return (
    <div className="space-y-4">
      <Panel
        title="Project health"
        subtitle="dev.health"
        right={
          <span className="font-mono text-[9px] text-term-success uppercase">
            live
          </span>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Object.entries(health).length === 0 ? (
            <EmptyState label="No health data returned." />
          ) : (
            Object.entries(health).map(([key, value]) => (
              <div
                key={key}
                className="border border-term-border/60 p-3 bg-term-panel"
              >
                <div className="font-mono text-[9px] uppercase text-term-muted">
                  {key.replace(/_/g, " ")}
                </div>

                <div
                  className={`font-mono text-xl leading-none mt-2 truncate ${
                    value === false
                      ? "text-term-danger"
                      : value === true
                        ? "text-term-success"
                        : "text-term-text"
                  }`}
                  title={formatValue(value)}
                >
                  {formatValue(value)}
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>


      <Panel
        title="AI Developer capabilities"
        subtitle="dev.capabilities"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CapBlock
            label="READ"
            items={read}
            tone="text-term-success"
            icon={<GitBranch size={11} />}
          />

          <CapBlock
            label="REASON"
            items={reason}
            tone="text-term-accent"
            icon={<Cpu size={11} />}
          />

          <CapBlock
            label="GATED"
            items={gated}
            tone="text-term-warning"
            icon={<ShieldAlert size={11} />}
          />
        </div>


        <div className="mt-4 border border-term-danger/40 bg-term-danger/5 p-3">
          <div className="font-mono text-[9px] uppercase text-term-danger mb-1 flex items-center gap-1">
            <ShieldAlert size={11} />
            Never automatic
          </div>

          {neverAutomatic.length > 0 ? (
            <div className="font-mono text-[10px] text-term-text leading-relaxed">
              {neverAutomatic.join(" · ")}
            </div>
          ) : (
            <div className="font-mono text-[10px] text-term-muted">
              No restricted operations reported.
            </div>
          )}

          {caps?.note && (
            <div className="font-mono text-[9px] text-term-muted mt-2 leading-relaxed">
              {caps.note}
            </div>
          )}
        </div>
      </Panel>


      <Panel
        title="Control boundary"
        subtitle="owner.security"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusCard
            icon={<Activity size={13} />}
            title="Inspection"
            detail="Platform state can be inspected without modifying project files."
            tone="success"
          />

          <StatusCard
            icon={<Cpu size={13} />}
            title="Reasoning"
            detail="AI Developer can analyze the available project snapshot and return proposals."
            tone="accent"
          />

          <StatusCard
            icon={<ShieldAlert size={13} />}
            title="Critical actions"
            detail="Write, delete, Git, command and deployment operations remain approval-gated."
            tone="warning"
          />
        </div>
      </Panel>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Capability block                                                   */
/* ------------------------------------------------------------------ */

function CapBlock({
  label,
  items,
  tone,
  icon,
}) {
  return (
    <div className="border border-term-border p-3 bg-term-panel min-h-[130px]">
      <div
        className={`font-mono text-[9px] uppercase mb-2 flex items-center gap-1 ${tone}`}
      >
        {icon}
        {label}
      </div>

      {items.length === 0 ? (
        <div className="font-mono text-[10px] text-term-muted">
          —
        </div>
      ) : (
        <ul className="space-y-1 font-mono text-[10px] text-term-secondary">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              · {formatValue(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Status card                                                        */
/* ------------------------------------------------------------------ */

function StatusCard({
  icon,
  title,
  detail,
  tone,
}) {
  const toneClass =
    tone === "success"
      ? "text-term-success"
      : tone === "warning"
        ? "text-term-warning"
        : "text-term-accent";

  return (
    <div className="border border-term-border p-3 bg-term-panel">
      <div
        className={`font-mono text-[10px] uppercase flex items-center gap-1 ${toneClass}`}
      >
        {icon}
        {title}
      </div>

      <div className="font-mono text-[10px] text-term-secondary mt-2 leading-relaxed">
        {detail}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Modules                                                            */
/* ------------------------------------------------------------------ */

function ModulesTab({ refreshKey }) {
  const [modules, setModules] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get("/dev/modules");

      setModules(
        safeArray(data?.modules)
      );
    } catch (error) {
      setError(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);


  return (
    <Panel
      title="Backend modules"
      subtitle="dev.modules"
      right={
        <span className="font-mono text-[9px] text-term-muted">
          {modules.length} modules
        </span>
      }
    >
      {loading ? (
        <LoadingState label="Loading backend modules..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={load}
        />
      ) : modules.length === 0 ? (
        <EmptyState label="No modules returned." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[650px]">
            <thead className="border-b border-term-border">
              <tr className="font-mono text-[9px] text-term-muted uppercase">
                <th className="h-9 px-3">
                  Module
                </th>

                <th className="h-9 px-3">
                  Files
                </th>

                <th className="h-9 px-3">
                  Endpoints
                </th>
              </tr>
            </thead>

            <tbody className="font-mono text-[10px]">
              {modules.map((module, index) => {
                const files = safeArray(module.files);
                const endpoints = safeArray(module.endpoints);

                return (
                  <tr
                    key={
                      module.module_id ||
                      `module-${index}`
                    }
                    className="border-b border-term-border/40 align-top hover:bg-term-hover/30"
                  >
                    <td className="px-3 py-2 text-term-text">
                      {module.module_id || "—"}
                    </td>

                    <td className="px-3 py-2 text-term-secondary">
                      {files.length}
                    </td>

                    <td className="px-3 py-2 text-term-secondary">
                      {endpoints.length === 0 ? (
                        "—"
                      ) : (
                        <div className="space-y-0.5">
                          {endpoints.map(
                            (endpoint, endpointIndex) => (
                              <div
                                key={`${endpoint}-${endpointIndex}`}
                              >
                                {formatValue(endpoint)}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


/* ------------------------------------------------------------------ */
/* DB schema                                                          */
/* ------------------------------------------------------------------ */
function SchemaTab({ refreshKey }) {
  const [collections, setCollections] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get("/dev/db-schema");

      setCollections(
        safeArray(data?.collections)
      );
    } catch (error) {
      setError(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);


  return (
    <Panel
      title="MongoDB collections"
      subtitle="dev.db_schema"
      right={
        <span className="font-mono text-[9px] text-term-muted">
          {collections.length} collections
        </span>
      }
    >
      {loading ? (
        <LoadingState label="Loading database schema..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={load}
        />
      ) : collections.length === 0 ? (
        <EmptyState label="No collections returned." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[650px]">
            <thead className="border-b border-term-border">
              <tr className="font-mono text-[9px] text-term-muted uppercase">
                <th className="h-9 px-3">
                  Collection
                </th>

                <th className="h-9 px-3">
                  Documents
                </th>

                <th className="h-9 px-3">
                  Sample keys
                </th>
              </tr>
            </thead>

            <tbody className="font-mono text-[10px]">
              {collections.map(
                (collection, index) => {
                  const keys = safeArray(
                    collection.sample_keys
                  );

                  return (
                    <tr
                      key={
                        collection.collection ||
                        `collection-${index}`
                      }
                      className="border-b border-term-border/40 align-top hover:bg-term-hover/30"
                    >
                      <td className="px-3 py-2">
                        {collection.collection ||
                          "—"}
                      </td>

                      <td className="px-3 py-2 text-term-secondary">
                        {formatValue(
                          collection.count
                        )}
                      </td>

                      <td className="px-3 py-2 text-term-secondary break-words">
                        {keys.length > 0
                          ? keys.join(", ")
                          : "—"}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


/* ------------------------------------------------------------------ */
/* AI Developer console                                               */
/* ------------------------------------------------------------------ */

function DevTab() {
  const [question, setQuestion] = useState(
    "Give me a 5-line health summary of this project."
  );

  const [output, setOutput] = useState(null);
  const [busy, setBusy] = useState(false);


  const send = async () => {
    const trimmed = question.trim();

    if (!trimmed || busy) {
      return;
    }

    setBusy(true);
    setOutput(null);

    try {
      const { data } = await api.post(
        "/dev/ask",
        {
          question: trimmed,
        }
      );

      setOutput(
        safeObject(data)
      );
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusy(false);
    }
  };


  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      send();
    }
  };


  return (
    <Panel
      title="AI Developer console"
      subtitle="dev.ask"
      right={
        <span className="font-mono text-[9px] text-term-muted uppercase">
          read-only · proposals only
        </span>
      }
    >
      <div className="space-y-3">
        <div className="border border-term-border/60 bg-term-panel p-3">
          <div className="font-mono text-[10px] text-term-secondary leading-relaxed">
            The AI Developer receives the project's available architecture
            snapshot and returns analysis or proposals. Critical project
            actions remain behind the explicit approval system.
          </div>

          <div className="font-mono text-[9px] text-term-muted mt-2">
            Shortcut: Ctrl/Cmd + Enter
          </div>
        </div>


        <textarea
          data-testid={
            TEST_IDS.ownerControl.devInput
          }
          value={question}
          onChange={(event) =>
            setQuestion(event.target.value)
          }
          onKeyDown={handleKeyDown}
          rows={4}
          maxLength={12000}
          disabled={busy}
          placeholder="Ask the AI Developer about the current project..."
          className="w-full bg-term-panel border border-term-border p-3 font-mono text-[11px] focus:border-term-accent focus:outline-none resize-none disabled:opacity-50"
        />


        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[9px] text-term-muted">
            {question.length}/12000
          </span>

          <button
            data-testid={
              TEST_IDS.ownerControl.devSend
            }
            onClick={send}
            disabled={
              busy ||
              !question.trim()
            }
            className="h-9 px-4 bg-term-accent text-white font-mono text-[10px] uppercase disabled:opacity-40 flex items-center gap-2"
          >
            <Send size={11} />

            {busy
              ? "thinking..."
              : "ask ai developer"}
          </button>
        </div>


        {output && (
          <div
            data-testid={
              TEST_IDS.ownerControl.devOutput
            }
            className="border border-term-border bg-term-panel"
          >
            <div className="px-3 py-2 border-b border-term-border flex flex-wrap items-center gap-x-3 gap-y-1">
              {output.provider && (
                <span className="font-mono text-[9px] text-term-muted">
                  provider: {output.provider}
                </span>
              )}

              {output.model && (
                <span className="font-mono text-[9px] text-term-muted">
                  model: {output.model}
                </span>
              )}

              {typeof output.latency_ms ===
                "number" && (
                <span className="font-mono text-[9px] text-term-muted flex items-center gap-1">
                  <Clock3 size={9} />
                  {output.latency_ms}ms
                </span>
              )}
            </div>

            <pre className="p-3 font-mono text-[11px] whitespace-pre-wrap break-words text-term-text overflow-x-auto">
              {output.text ||
                output.answer ||
                JSON.stringify(
                  output,
                  null,
                  2
                )}
            </pre>
          </div>
        )}
      </div>
    </Panel>
  );
}


/* ------------------------------------------------------------------ */
/* Approvals                                                          */
/* ------------------------------------------------------------------ */

function ApprovalsTab({ refreshKey }) {
  const [items, setItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    action_type: "write_file",
    title: "",
    reason: "",
  });


  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get(
        "/dev/approvals"
      );

      setItems(
        safeArray(data?.approvals)
      );
    } catch (error) {
      setError(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    load();
  }, [load, refreshKey]);


  const createApproval = async () => {
    if (
      busy ||
      !form.title.trim()
    ) {
      return;
    }

    setBusy(true);

    try {
      await api.post(
        "/dev/approvals",
        {
          action_type:
            form.action_type,
          title:
            form.title.trim(),
          reason:
            form.reason.trim(),
          payload: {},
        }
      );

      setForm({
        action_type: "write_file",
        title: "",
        reason: "",
      });

      toast.success(
        "Approval request created"
      );

      await load();
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusy(false);
    }
  };


  const decide = async (
    approvalId,
    decision
  ) => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      await api.post(
        `/dev/approvals/${approvalId}/decide`,
        {
          decision,
        }
      );

      toast.success(
        decision === "approved"
          ? "Approval accepted"
          : "Approval rejected"
      );

      await load();
    } catch (error) {
      toast.error(
        formatApiError(error)
      );
    } finally {
      setBusy(false);
    }
  };


  const pendingCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.status ===
          "pending"
      ).length,
    [items]
  );


  return (
    <div className="space-y-4">
      <Panel
        title="Create approval request"
        subtitle="dev.approvals.new"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={
                form.action_type
              }
              disabled={busy}
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    action_type:
                      event.target
                        .value,
                  })
                )
              }
              className="h-9 px-2 bg-term-panel border border-term-border font-mono text-[10px] focus:border-term-accent focus:outline-none"
            >
              {[
                "write_file",
                "delete_file",
                "run_migration",
                "install_dependency",
                "git_commit",
                "git_push",
                "deploy",
                "replace_module",
                "run_command",
              ].map(
                (action) => (
                  <option
                    key={action}
                    value={action}
                  >
                    {action}
                  </option>
                )
              )}
            </select>


            <input
              value={form.title}
              disabled={busy}
              maxLength={200}
              placeholder="Title — what will change"
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    title:
                      event.target
                        .value,
                  })
                )
              }
              className="h-9 px-3 bg-term-panel border border-term-border font-mono text-[10px] focus:border-term-accent focus:outline-none"
            />


            <input
              value={form.reason}
              disabled={busy}
              maxLength={500}
              placeholder="Reason / rollback plan"
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    reason:
                      event.target
                        .value,
                  })
                )
              }
              className="h-9 px-3 bg-term-panel border border-term-border font-mono text-[10px] focus:border-term-accent focus:outline-none"
            />
          </div>


          <div className="flex justify-end">
            <button
              data-testid={
                TEST_IDS.ownerControl
                  .approvalNew
              }
              onClick={
                createApproval
              }
              disabled={
                busy ||
                !form.title.trim()
              }
              className="h-9 px-4 border border-term-border font-mono text-[10px] uppercase hover:border-term-accent hover:text-term-accent disabled:opacity-40 flex items-center gap-2"
            >
              <ListChecks size={11} />

              {busy
                ? "processing..."
                : "queue approval"}
            </button>
          </div>
        </div>
      </Panel>


      <Panel
        title="Pending & recent approvals"
        subtitle="dev.approvals"
        right={
          <span className="font-mono text-[9px] text-term-warning uppercase">
            {pendingCount} pending
          </span>
        }
      >
        {loading ? (
          <LoadingState label="Loading approvals..." />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={load}
          />
        ) : items.length === 0 ? (
          <EmptyState label="No approval records yet." />
        ) : (
          <div className="space-y-2">
            {items.map(
              (approval, index) => (
                <ApprovalRow
                  key={
                    approval.approval_id ||
                    `approval-${index}`
                  }
                  approval={approval}
                  busy={busy}
                  onDecide={decide}
                />
              )
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Approval row                                                       */
/* ------------------------------------------------------------------ */

function ApprovalRow({
  approval,
  busy,
  onDecide,
}) {
  const status =
    String(
      approval.status ||
        "pending"
    ).toLowerCase();

  const statusClass =
    status === "approved"
      ? "text-term-success"
      : status === "rejected"
        ? "text-term-danger"
        : "text-term-warning";


  return (
    <div className="border border-term-border/60 p-3 bg-term-panel">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            {status === "approved" ? (
              <Check
                size={13}
                className="text-term-success mt-0.5 shrink-0"
              />
            ) : status === "rejected" ? (
              <X
                size={13}
                className="text-term-danger mt-0.5 shrink-0"
              />
            ) : (
              <CircleAlert
                size={13}
                className="text-term-warning mt-0.5 shrink-0"
              />
            )}

            <div className="text-[12px] text-term-text break-words">
              {approval.title ||
                "Untitled approval"}
            </div>
          </div>

          <div className="font-mono text-[9px] text-term-muted uppercase mt-1 ml-5 flex flex-wrap gap-x-2 gap-y-1">
            <span>
              {approval.action_type ||
                "unknown"}
            </span>

            {approval.dangerous && (
              <span className="text-term-danger">
                DANGEROUS
              </span>
            )}

            {approval.created_at && (
              <span>
                {formatDate(
                  approval.created_at
                )}
              </span>
            )}
          </div>

          {approval.reason && (
            <div className="text-term-secondary text-[10px] mt-2 ml-5 leading-relaxed">
              {approval.reason}
            </div>
          )}

          {approval.approval_id && (
            <div className="font-mono text-[8px] text-term-muted mt-2 ml-5 break-all">
              ID: {approval.approval_id}
            </div>
          )}
        </div>


        <div className="flex items-center gap-2 lg:shrink-0">
          <span
            className={`font-mono text-[9px] uppercase ${statusClass}`}
          >
            {status}
          </span>

          {status ===
            "pending" && (
            <>
              <button
                onClick={() =>
                  onDecide(
                    approval.approval_id,
                    "approved"
                  )
                }
                disabled={
                  busy ||
                  !approval.approval_id
                }
                className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-success hover:text-term-success disabled:opacity-40 flex items-center gap-1"
              >
                <Check size={10} />
                approve
              </button>

              <button
                onClick={() =>
                  onDecide(
                    approval.approval_id,
                    "rejected"
                  )
                }
                disabled={
                  busy ||
                  !approval.approval_id
                }
                className="h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-danger hover:text-term-danger disabled:opacity-40 flex items-center gap-1"
              >
                <X size={10} />
                reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Shared states                                                      */
/* ------------------------------------------------------------------ */

function LoadingState({
  label,
}) {
  return (
    <div className="min-h-[100px] flex items-center justify-center gap-2 font-mono text-[10px] text-term-muted">
      <RefreshCw
        size={12}
        className="animate-spin"
      />
      {label}
    </div>
  );
}


function EmptyState({
  label,
}) {
  return (
    <div className="min-h-[80px] flex items-center justify-center font-mono text-[10px] text-term-muted">
      {label}
    </div>
  );
}


function ErrorState({
  message,
  onRetry,
}) {
  return (
    <div className="border border-term-danger/30 bg-term-danger/5 p-4">
      <div className="flex items-start gap-2">
        <CircleAlert
          size={13}
          className="text-term-danger mt-0.5 shrink-0"
        />

        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase text-term-danger">
            Request failed
          </div>

          <div className="font-mono text-[10px] text-term-secondary mt-1 break-words">
            {message}
          </div>

          <button
            onClick={onRetry}
            className="mt-3 h-7 px-2 border border-term-border font-mono text-[9px] uppercase hover:border-term-accent hover:text-term-accent flex items-center gap-1"
          >
            <RefreshCw size={10} />
            retry
          </button>
        </div>
      </div>
    </div>
  );
        }
