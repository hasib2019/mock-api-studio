"use client";

/**
 * Studio dashboard. Everything it shows is handed down from the server
 * component as plain serialisable props; the only client-side work is the
 * "load the demo data" action and the refresh that follows it.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  MethodBadge,
  SectionHeader,
  StatusBadge,
  type BadgeTone,
} from "@/components/ui";
import { ApiError, adminApi } from "@/lib/api-client";

/* ------------------------------------------------------------------ *
 * Props
 * ------------------------------------------------------------------ */

export interface DashboardProject {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  endpointCount: number;
  enabledCount: number;
}

export interface DashboardRequest {
  id: string;
  ts: string;
  method: string;
  path: string;
  status: number;
  outcome: string;
  durationMs: number;
  endpointName: string | null;
}

export interface DashboardTotals {
  projects: number;
  endpoints: number;
  enabledEndpoints: number;
  requestsToday: number;
  failedToday: number;
  totalRequests: number;
}

export interface DashboardViewProps {
  projects: DashboardProject[];
  totals: DashboardTotals;
  recent: DashboardRequest[];
}

/* ------------------------------------------------------------------ *
 * Formatting helpers
 * ------------------------------------------------------------------ */

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function formatNumber(value: number): string {
  return Number.isFinite(value) ? NUMBER_FORMAT.format(value) : "0";
}

function formatClock(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const OUTCOME_META: Record<string, { label: string; tone: BadgeTone }> = {
  matched: { label: "Matched", tone: "green" },
  validation_failed: { label: "Validation", tone: "amber" },
  auth_failed: { label: "Auth failed", tone: "red" },
  not_found: { label: "Not found", tone: "gray" },
  disabled: { label: "Disabled", tone: "purple" },
};

function outcomeMeta(outcome: string): { label: string; tone: BadgeTone } {
  return OUTCOME_META[outcome] ?? { label: outcome, tone: "gray" };
}

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */

type IconProps = { className?: string };

function IconFolder({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.75 6.25a1.5 1.5 0 011.5-1.5h2.9c.4 0 .78.16 1.06.44l1.06 1.06h6.48a1.5 1.5 0 011.5 1.5v6.5a1.5 1.5 0 01-1.5 1.5H4.25a1.5 1.5 0 01-1.5-1.5v-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRoute({ className = "h-4 w-4" }: IconProps) {
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

function IconPulse({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.75 10.25h3l1.75-4.5 2.75 8.5 2-4h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlert({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M10 3.75l7 12.5H3l7-12.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8.5v3m0 2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconSparkles({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M7.5 3.25l1.15 3.1 3.1 1.15-3.1 1.15L7.5 11.75 6.35 8.65 3.25 7.5l3.1-1.15L7.5 3.25zM14 11l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7L14 11z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Stat tile
 * ------------------------------------------------------------------ */

type TileAccent = "indigo" | "emerald" | "amber" | "rose";

const TILE_ACCENTS: Record<TileAccent, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
};

function StatTile({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  accent: TileAccent;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] leading-4 font-medium text-slate-500">{label}</p>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TILE_ACCENTS[accent]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl leading-8 font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 truncate text-xs leading-4 text-slate-500">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export function DashboardView({ projects, totals, recent }: DashboardViewProps) {
  const router = useRouter();
  const [seeding, setSeeding] = React.useState(false);

  async function loadDemo() {
    if (seeding) return;
    setSeeding(true);
    try {
      const result = await adminApi.seedDemo();
      toast(
        `Demo installed — ${result.projects} project${result.projects === 1 ? "" : "s"}, ${result.endpoints} endpoint${result.endpoints === 1 ? "" : "s"}`,
        "success",
      );
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not load the demo data", "error");
    } finally {
      setSeeding(false);
    }
  }

  const empty = projects.length === 0;
  const failureRate =
    totals.requestsToday > 0
      ? `${Math.round((totals.failedToday / totals.requestsToday) * 100)}% of the last 24h`
      : "No traffic in the last 24h";

  return (
    <div>
      <SectionHeader
        title="Dashboard"
        description="Your mock banking APIs at a glance — what is registered, and what has been called."
        actions={
          <>
            {empty ? null : (
              <Button variant="secondary" size="sm" onClick={loadDemo} loading={seeding}>
                Load demo APIs
              </Button>
            )}
            <Link href="/projects?new=1">
              <Button size="sm">New project</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Projects"
          value={formatNumber(totals.projects)}
          hint={totals.projects === 0 ? "Nothing registered yet" : "Mock API namespaces"}
          accent="indigo"
          icon={<IconFolder className="h-4 w-4" />}
        />
        <StatTile
          label="Endpoints"
          value={formatNumber(totals.endpoints)}
          hint={`${formatNumber(totals.enabledEndpoints)} enabled`}
          accent="emerald"
          icon={<IconRoute className="h-4 w-4" />}
        />
        <StatTile
          label="Requests today"
          value={formatNumber(totals.requestsToday)}
          hint={`${formatNumber(totals.totalRequests)} logged in total`}
          accent="amber"
          icon={<IconPulse className="h-4 w-4" />}
        />
        <StatTile
          label="Failed today"
          value={formatNumber(totals.failedToday)}
          hint={failureRate}
          accent="rose"
          icon={<IconAlert className="h-4 w-4" />}
        />
      </div>

      {empty ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconSparkles className="h-5 w-5" />}
            title="No projects yet"
            description="A project is a namespace for your mock endpoints and owns the URL prefix /api/mock/<slug>. Start from the demo banking pack (NPSB, BEFTN, NID verification) or build your own from scratch."
            action={
              <>
                <Button onClick={loadDemo} loading={seeding}>
                  Load demo banking APIs
                </Button>
                <Link href="/projects?new=1">
                  <Button variant="secondary">Create project</Button>
                </Link>
              </>
            }
          />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card
            title="Recent requests"
            description="The last calls that hit the mock runtime."
            bodyClassName="p-0"
            actions={
              <Link
                href="/logs"
                className="rounded-md px-1.5 py-1 text-[13px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                View all logs
              </Link>
            }
          >
            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">No requests yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-slate-500">
                  Call one of your mock endpoints and it shows up here immediately.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Time
                      </th>
                      <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Method
                      </th>
                      <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Path
                      </th>
                      <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Outcome
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((entry) => {
                      const meta = outcomeMeta(entry.outcome);
                      return (
                        <tr
                          key={entry.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                        >
                          <td
                            className="px-4 py-2 font-mono text-[12px] whitespace-nowrap text-slate-500"
                            title={entry.ts}
                            suppressHydrationWarning
                          >
                            {formatClock(entry.ts)}
                          </td>
                          <td className="px-4 py-2">
                            <MethodBadge method={entry.method} />
                          </td>
                          <td className="max-w-[260px] px-4 py-2">
                            <p className="truncate font-mono text-[12.5px] text-slate-800">
                              {entry.path}
                            </p>
                            {entry.endpointName ? (
                              <p className="truncate text-[11px] leading-4 text-slate-400">
                                {entry.endpointName}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2">
                            <StatusBadge status={entry.status} />
                          </td>
                          <td className="px-4 py-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-[12px] whitespace-nowrap text-slate-500">
                            {formatNumber(entry.durationMs)} ms
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card
            title="Projects"
            description="Each project owns one mock URL namespace."
            actions={
              <Link
                href="/projects"
                className="rounded-md px-1.5 py-1 text-[13px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
              >
                Manage
              </Link>
            }
          >
            {projects.length === 0 ? (
              <p className="py-6 text-center text-[13px] leading-5 text-slate-500">
                Once you create a project it is listed here.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group block rounded-lg border border-slate-200 px-3.5 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                        aria-hidden="true"
                      />
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900 group-hover:text-indigo-700">
                        {project.name}
                      </p>
                      <Badge tone="gray">
                        {project.endpointCount} ep{project.endpointCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11.5px] text-slate-500">
                      /api/mock/{project.slug}
                    </p>
                    {project.description ? (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-slate-500">
                        {project.description}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DashboardView;
