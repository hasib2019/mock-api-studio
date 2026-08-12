"use client";

/**
 * Request log browser.
 *
 * Everything the mock runtime served is written to `data/logs/requests.json`;
 * this view filters it, and opens one entry at a time in a wide modal so the
 * exact request/response pair can be inspected.
 */

import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  CodeBlock,
  ConfirmDialog,
  EmptyState,
  Input,
  MethodBadge,
  Modal,
  SectionHeader,
  Select,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { adminApi } from "@/lib/api-client";
import type { BadgeTone } from "@/components/ui";
import type { LogOutcome, ProjectDef, RequestLog } from "@/lib/types";

const OUTCOME_LABELS: Record<LogOutcome, string> = {
  matched: "Matched",
  validation_failed: "Validation failed",
  auth_failed: "Auth failed",
  not_found: "Not found",
  disabled: "Disabled",
};

const OUTCOME_TONES: Record<LogOutcome, BadgeTone> = {
  matched: "green",
  validation_failed: "amber",
  auth_failed: "red",
  not_found: "gray",
  disabled: "purple",
};

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome as LogOutcome] ?? outcome;
}

function outcomeTone(outcome: string): BadgeTone {
  return OUTCOME_TONES[outcome as LogOutcome] ?? "gray";
}

/** ISO strings are rendered as-is (UTC) so the server and client markup match. */
function formatDate(ts: string): string {
  return ts.length >= 10 ? ts.slice(0, 10) : ts;
}

function formatTime(ts: string): string {
  return ts.length >= 19 ? ts.slice(11, 19) : ts;
}

function pretty(value: unknown): string {
  if (value === undefined) return "(none)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}

function searchHaystack(log: RequestLog): string {
  return [
    log.path,
    log.url,
    log.method,
    log.endpointName ?? "",
    log.projectSlug ?? "",
    log.scenarioName ?? "",
    String(log.status),
    pretty(log.requestBody),
    pretty(log.responseBody),
  ]
    .join(" ")
    .toLowerCase();
}

export interface LogsViewProps {
  projects: ProjectDef[];
  initialLogs: RequestLog[];
}

export function LogsView({ projects, initialLogs }: LogsViewProps) {
  const [logs, setLogs] = React.useState<RequestLog[]>(initialLogs);
  const [projectId, setProjectId] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<RequestLog | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);

  const projectName = React.useCallback(
    (id: string | null) => projects.find((project) => project.id === id)?.name ?? "—",
    [projects],
  );

  async function load(nextProjectId = projectId, nextOutcome = outcome) {
    setLoading(true);
    try {
      const rows = await adminApi.listLogs({
        projectId: nextProjectId || undefined,
        outcome: nextOutcome || undefined,
        limit: 200,
      });
      setLogs(rows);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load the request logs", "error");
    } finally {
      setLoading(false);
    }
  }

  async function clearLogs() {
    setClearing(true);
    try {
      const { cleared } = await adminApi.clearLogs({ projectId: projectId || undefined });
      toast(`Cleared ${cleared} log ${cleared === 1 ? "entry" : "entries"}`, "success");
      setConfirmOpen(false);
      setSelected(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not clear the logs", "error");
    } finally {
      setClearing(false);
    }
  }

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return logs;
    return logs.filter((log) => searchHaystack(log).includes(needle));
  }, [logs, search]);

  const projectOptions = [
    { value: "", label: "All projects" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  const outcomeOptions = [
    { value: "", label: "All outcomes" },
    ...(Object.keys(OUTCOME_LABELS) as LogOutcome[]).map((key) => ({
      value: key,
      label: OUTCOME_LABELS[key],
    })),
  ];

  return (
    <div>
      <SectionHeader
        title="Request logs"
        description="The last 200 calls served by the mock runtime, newest first."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={logs.length === 0}
            >
              Clear logs
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
        <Select
          label="Project"
          value={projectId}
          options={projectOptions}
          onChange={(event) => {
            setProjectId(event.target.value);
            void load(event.target.value, outcome);
          }}
        />
        <Select
          label="Outcome"
          value={outcome}
          options={outcomeOptions}
          onChange={(event) => {
            setOutcome(event.target.value);
            void load(projectId, event.target.value);
          }}
        />
        <Input
          label="Search"
          placeholder="Match the path or anything inside the request/response body"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={logs.length === 0 ? "No requests logged yet" : "No entries match the filters"}
          description={
            logs.length === 0
              ? "Call one of your mock endpoints and the request will show up here."
              : "Loosen the search text or pick a different project/outcome."
          }
          action={
            logs.length === 0 ? null : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setProjectId("");
                  setOutcome("");
                  void load("", "");
                }}
              >
                Reset filters
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Time (UTC)</th>
                  <th className="px-4 py-2.5">Method</th>
                  <th className="px-4 py-2.5">Path</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Outcome</th>
                  <th className="px-4 py-2.5 text-right">Duration</th>
                  <th className="px-4 py-2.5">Scenario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    tabIndex={0}
                    onClick={() => setSelected(log)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected(log);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                      <span className="font-mono">{formatTime(log.ts)}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">
                        {formatDate(log.ts)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <MethodBadge method={log.method} />
                    </td>
                    <td className="max-w-[320px] px-4 py-2">
                      <span className="block truncate font-mono text-slate-800">{log.path}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {log.endpointName ?? "unmatched"} · {projectName(log.projectId)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={outcomeTone(log.outcome)}>{outcomeLabel(log.outcome)}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-slate-600">
                      {log.durationMs} ms
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2 text-slate-600">
                      {log.scenarioName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[12px] text-slate-500">
            <span>
              Showing {filtered.length} of {logs.length} loaded {logs.length === 1 ? "entry" : "entries"}
            </span>
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="h-3.5 w-3.5" />
                Loading
              </span>
            ) : null}
          </div>
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        wide
        title={
          selected ? (
            <span className="flex flex-wrap items-center gap-2">
              <MethodBadge method={selected.method} />
              <span className="font-mono text-[13px]">{selected.path}</span>
              <StatusBadge status={selected.status} />
              <Badge tone={outcomeTone(selected.outcome)}>{outcomeLabel(selected.outcome)}</Badge>
            </span>
          ) : (
            "Request"
          )
        }
        description={
          selected
            ? `${formatDate(selected.ts)} ${formatTime(selected.ts)} UTC · ${selected.durationMs} ms · ${
                selected.scenarioName ?? "no scenario"
              }`
            : undefined
        }
        footer={
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Project</dt>
                <dd className="min-w-0 truncate text-slate-800">
                  {projectName(selected.projectId)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Endpoint</dt>
                <dd className="min-w-0 truncate text-slate-800">
                  {selected.endpointName ?? "unmatched"}
                </dd>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="w-24 shrink-0 text-slate-500">URL</dt>
                <dd className="min-w-0 font-mono break-all text-slate-800">{selected.url}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Client IP</dt>
                <dd className="min-w-0 font-mono text-slate-800">{selected.ip ?? "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Log id</dt>
                <dd className="min-w-0 font-mono truncate text-slate-800">{selected.id}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Request headers
              </h3>
              <CodeBlock code={pretty(selected.requestHeaders)} copyable maxHeight={220} />
            </div>

            <div>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Query string
              </h3>
              <CodeBlock code={pretty(selected.requestQuery)} copyable maxHeight={180} />
            </div>

            <div>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Request body
              </h3>
              <CodeBlock code={pretty(selected.requestBody)} copyable maxHeight={280} />
            </div>

            <div>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Validation issues
                {selected.issues.length > 0 ? (
                  <span className="ml-1.5 text-rose-600">({selected.issues.length})</span>
                ) : null}
              </h3>
              <CodeBlock
                code={selected.issues.length > 0 ? pretty(selected.issues) : "[]"}
                copyable
                maxHeight={240}
              />
            </div>

            <div>
              <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Response body
              </h3>
              <CodeBlock code={pretty(selected.responseBody)} copyable maxHeight={320} />
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear request logs"
        message={
          projectId
            ? `Every logged request for ${projectName(projectId)} will be deleted. This cannot be undone.`
            : "Every logged request from every project will be deleted. This cannot be undone."
        }
        confirmLabel="Clear logs"
        loading={clearing}
        onConfirm={() => void clearLogs()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default LogsView;
