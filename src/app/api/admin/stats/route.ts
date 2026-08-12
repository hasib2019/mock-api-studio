import { fail, guard, handleError, ok } from "@/lib/http";
import type { StudioStats } from "@/lib/api-client";
import { logStats } from "@/lib/logs";
import { listEndpoints, listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const [projects, endpoints, logs] = await Promise.all([
      listProjects(),
      listEndpoints(),
      logStats(),
    ]);

    const stats: StudioStats = {
      projects: projects.length,
      endpoints: endpoints.length,
      enabledEndpoints: endpoints.filter((endpoint) => endpoint.enabled).length,
      logs,
    };
    return ok(stats);
  } catch (e) {
    return handleError(e);
  }
}
