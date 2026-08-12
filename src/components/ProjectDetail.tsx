"use client";

/**
 * A single project: its mock base URL plus the endpoint table with inline
 * enable/disable, copy-url, duplicate and delete.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Input,
  MethodBadge,
  Select,
  Toggle,
} from "@/components/ui";
import { ApiError, adminApi } from "@/lib/api-client";
import { HTTP_METHODS } from "@/lib/types";

export interface ProjectDetailProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  defaultHeaderCount: number;
}

export interface ProjectEndpointRow {
  id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  enabled: boolean;
  authType: string;
  scenarioCount: number;
  fieldCount: number;
  tags: string[];
}

export interface ProjectDetailProps {
  project: ProjectDetailProject;
  endpoints: ProjectEndpointRow[];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const subscribeNever = (): (() => void) => () => {};
const readOrigin = (): string => window.location.origin;
const readServerOrigin = (): string => "";

/** The browser origin, empty during SSR so the markup stays identical. */
function useOrigin(): string {
  return React.useSyncExternalStore(subscribeNever, readOrigin, readServerOrigin);
}

function mockUrl(origin: string, slug: string, path = ""): string {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${origin.replace(/\/+$/, "")}/api/mock/${slug}${suffix}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const AUTH_LABELS: Record<string, string> = {
  none: "Public",
  apiKey: "API key",
  bearer: "Bearer",
  basic: "Basic",
};

function IconRoute({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <circle cx="5" cy="5.25" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="14.75" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 5.25h4.25A2.75 2.75 0 0114 8v0a2.75 2.75 0 01-2.75 2.75H8.5A2 2 0 006.5 12.75v0A2 2 0 008.5 14.75H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDots({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="10" cy="15.5" r="1.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Row menu
 * ------------------------------------------------------------------ */

function RowMenu({
  openHref,
  onDuplicate,
  onDelete,
  busy,
}: {
  openHref: string;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Endpoint actions"
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconDots className="h-4 w-4" />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            <Link
              role="menuitem"
              href={openHref}
              className="block px-3 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100"
              onClick={() => setOpen(false)}
            >
              Open
            </Link>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[13px] text-slate-700 transition-colors hover:bg-slate-100"
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-1.5 text-left text-[13px] text-rose-600 transition-colors hover:bg-rose-50"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export function ProjectDetail({ project, endpoints }: ProjectDetailProps) {
  const router = useRouter();
  const origin = useOrigin();

  /**
   * Optimistic enabled/disabled flags. They are tied to the props array they
   * were made against, so the moment fresh server data arrives they are
   * discarded rather than masking it.
   */
  const [optimistic, setOptimistic] = React.useState<{
    source: ProjectEndpointRow[];
    map: Record<string, boolean>;
  }>({ source: endpoints, map: {} });

  const rows = React.useMemo(() => {
    if (optimistic.source !== endpoints) return endpoints;
    const { map } = optimistic;
    if (Object.keys(map).length === 0) return endpoints;
    return endpoints.map((row) => (row.id in map ? { ...row, enabled: map[row.id] } : row));
  }, [endpoints, optimistic]);

  const [search, setSearch] = React.useState("");
  const [method, setMethod] = React.useState("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectEndpointRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const baseUrl = mockUrl(origin, project.slug);

  const methodOptions = React.useMemo(() => {
    const present = new Set(rows.map((row) => row.method.toUpperCase()));
    return [
      { value: "all", label: "All methods" },
      ...HTTP_METHODS.filter((httpMethod) => present.has(httpMethod)).map((httpMethod) => ({
        value: httpMethod,
        label: httpMethod,
      })),
    ];
  }, [rows]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (method !== "all" && row.method.toUpperCase() !== method) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.path.toLowerCase().includes(needle) ||
        row.description.toLowerCase().includes(needle) ||
        row.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [rows, search, method]);

  function setOverride(id: string, enabled: boolean) {
    setOptimistic((current) => ({
      source: endpoints,
      map: { ...(current.source === endpoints ? current.map : {}), [id]: enabled },
    }));
  }

  function clearOverride(id: string) {
    setOptimistic((current) => {
      if (current.source !== endpoints) return { source: endpoints, map: {} };
      if (!(id in current.map)) return current;
      const map = { ...current.map };
      delete map[id];
      return { source: endpoints, map };
    });
  }

  async function toggleEnabled(row: ProjectEndpointRow, enabled: boolean) {
    setBusyId(row.id);
    setOverride(row.id, enabled);
    try {
      await adminApi.updateEndpoint(row.id, { enabled });
      toast(`"${row.name}" ${enabled ? "enabled" : "disabled"}`, "success");
      router.refresh();
    } catch (err) {
      clearOverride(row.id);
      toast(errorMessage(err, "Could not update the endpoint"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(row: ProjectEndpointRow) {
    setBusyId(row.id);
    try {
      const copy = await adminApi.duplicateEndpoint(row.id);
      toast(`Duplicated as "${copy.name}"`, "success");
      router.refresh();
    } catch (err) {
      toast(errorMessage(err, "Could not duplicate the endpoint"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteEndpoint(deleteTarget.id);
      toast(`Endpoint "${deleteTarget.name}" deleted`, "success");
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err, "Could not delete the endpoint"), "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-slate-500">
        <Link href="/projects" className="transition-colors hover:text-slate-800">
          Projects
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-slate-700">{project.name}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-hidden="true"
            />
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
              {project.name}
            </h1>
            <Badge tone="gray">
              {rows.length} endpoint{rows.length === 1 ? "" : "s"}
            </Badge>
            {project.defaultHeaderCount > 0 ? (
              <Badge tone="blue">
                {project.defaultHeaderCount} default header
                {project.defaultHeaderCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          {project.description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-slate-500">
              {project.description}
            </p>
          ) : null}

          <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white py-1.5 pr-1.5 pl-3 shadow-sm">
            <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              Base URL
            </span>
            <code className="truncate font-mono text-[12.5px] text-slate-800">
              {baseUrl || `/api/mock/${project.slug}`}
            </code>
            <CopyButton value={baseUrl || `/api/mock/${project.slug}`} label="Copy" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/projects/${project.id}/endpoints/new`}>
            <Button size="sm">New endpoint</Button>
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconRoute className="h-5 w-5" />}
          title="No endpoints registered"
          description="Register a method and path, describe the request payload with validation rules, then add the response scenarios this sandbox should return."
          action={
            <Link href={`/projects/${project.id}/endpoints/new`}>
              <Button>Create the first endpoint</Button>
            </Link>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-[220px] flex-1">
              <Input
                placeholder="Search by name, path or tag…"
                value={search}
                aria-label="Search endpoints"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="w-40">
              <Select
                options={methodOptions}
                value={method}
                aria-label="Filter by method"
                onChange={(event) => setMethod(event.target.value)}
              />
            </div>
            <p className="pb-2 text-[12px] text-slate-500">
              {filtered.length} of {rows.length} shown
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No endpoint matches the filter</p>
              <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-slate-500">
                Try a different search term or clear the method filter.
              </p>
              <div className="mt-4 flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setMethod("all");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70">
                    <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Method
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Endpoint
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Auth
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Scenarios
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Fields
                    </th>
                    <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Enabled
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const href = `/projects/${project.id}/endpoints/${row.id}`;
                    const url = mockUrl(origin, project.slug, row.path);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-2.5 align-top">
                          <MethodBadge method={row.method} />
                        </td>
                        <td className="max-w-[380px] px-4 py-2.5 align-top">
                          <Link
                            href={href}
                            className="block truncate text-[13px] font-medium text-slate-900 hover:text-indigo-700"
                          >
                            {row.name}
                          </Link>
                          <p className="truncate font-mono text-[12px] text-slate-500">{row.path}</p>
                          {row.tags.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.tags.map((tag) => (
                                <Badge key={tag} tone="gray">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <Badge tone={row.authType === "none" ? "gray" : "indigo"}>
                            {AUTH_LABELS[row.authType] ?? row.authType}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right align-top font-mono text-[12.5px] text-slate-600">
                          {row.scenarioCount}
                        </td>
                        <td className="px-4 py-2.5 text-right align-top font-mono text-[12.5px] text-slate-600">
                          {row.fieldCount}
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <Toggle
                            size="sm"
                            checked={row.enabled}
                            disabled={busyId === row.id}
                            onChange={(next) => {
                              void toggleEnabled(row, next);
                            }}
                          />
                        </td>
                        <td className="px-4 py-2.5 align-top">
                          <div className="flex items-center justify-end gap-1">
                            <CopyButton value={url} />
                            <RowMenu
                              openHref={href}
                              busy={busyId === row.id}
                              onDuplicate={() => {
                                void duplicate(row);
                              }}
                              onDelete={() => setDeleteTarget(row)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete endpoint"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" (${deleteTarget.method} ${deleteTarget.path}) and its ${deleteTarget.scenarioCount} response scenario${
                deleteTarget.scenarioCount === 1 ? "" : "s"
              } will be removed. Callers will start receiving ENDPOINT_NOT_FOUND. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete endpoint"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default ProjectDetail;
