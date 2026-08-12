import {
  DashboardView,
  type DashboardProject,
  type DashboardRequest,
  type DashboardTotals,
} from "@/components/DashboardView";
import { listLogs, logStats } from "@/lib/logs";
import { listEndpoints, listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, endpoints, stats, recentLogs] = await Promise.all([
    listProjects(),
    listEndpoints(),
    logStats(),
    listLogs({ limit: 8 }),
  ]);

  const byProject = new Map<string, { total: number; enabled: number }>();
  for (const endpoint of endpoints) {
    const bucket = byProject.get(endpoint.projectId) ?? { total: 0, enabled: 0 };
    bucket.total += 1;
    if (endpoint.enabled) bucket.enabled += 1;
    byProject.set(endpoint.projectId, bucket);
  }

  const projectCards: DashboardProject[] = projects.map((project) => {
    const counts = byProject.get(project.id) ?? { total: 0, enabled: 0 };
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description ?? "",
      color: project.color,
      endpointCount: counts.total,
      enabledCount: counts.enabled,
    };
  });

  const totals: DashboardTotals = {
    projects: projects.length,
    endpoints: endpoints.length,
    enabledEndpoints: endpoints.filter((endpoint) => endpoint.enabled).length,
    requestsToday: stats.last24h,
    failedToday: stats.failed24h,
    totalRequests: stats.total,
  };

  const recent: DashboardRequest[] = recentLogs.map((log) => ({
    id: log.id,
    ts: log.ts,
    method: log.method,
    path: log.path,
    status: log.status,
    outcome: log.outcome,
    durationMs: log.durationMs,
    endpointName: log.endpointName,
  }));

  return <DashboardView projects={projectCards} totals={totals} recent={recent} />;
}
