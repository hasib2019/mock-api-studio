import { ProjectsView, type ProjectRow } from "@/components/ProjectsView";
import { listEndpoints, listProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const [searchParams, projects, endpoints] = await Promise.all([
    props.searchParams,
    listProjects(),
    listEndpoints(),
  ]);

  const counts = new Map<string, { total: number; enabled: number }>();
  for (const endpoint of endpoints) {
    const bucket = counts.get(endpoint.projectId) ?? { total: 0, enabled: 0 };
    bucket.total += 1;
    if (endpoint.enabled) bucket.enabled += 1;
    counts.set(endpoint.projectId, bucket);
  }

  const rows: ProjectRow[] = projects.map((project) => {
    const bucket = counts.get(project.id) ?? { total: 0, enabled: 0 };
    return { ...project, endpointCount: bucket.total, enabledCount: bucket.enabled };
  });

  const initialCreate = firstValue(searchParams.new) === "1";

  return <ProjectsView projects={rows} initialCreate={initialCreate} />;
}
