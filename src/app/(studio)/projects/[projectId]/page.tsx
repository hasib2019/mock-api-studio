import { notFound } from "next/navigation";

import {
  ProjectDetail,
  type ProjectDetailProject,
  type ProjectEndpointRow,
} from "@/components/ProjectDetail";
import { getProject, listEndpoints } from "@/lib/store";
import type { FieldDef } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Counts every registered field, including the nested ones. */
function countFields(fields: FieldDef[]): number {
  let total = 0;
  for (const field of fields) {
    total += 1;
    if (field.children.length > 0) total += countFields(field.children);
  }
  return total;
}

export default async function ProjectPage(props: PageProps<"/projects/[projectId]">) {
  const { projectId } = await props.params;

  const project = await getProject(projectId);
  if (!project) notFound();

  const endpoints = await listEndpoints(project.id);

  const detail: ProjectDetailProject = {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description ?? "",
    color: project.color,
    defaultHeaderCount: Object.keys(project.defaultHeaders).length,
  };

  const rows: ProjectEndpointRow[] = endpoints.map((endpoint) => ({
    id: endpoint.id,
    name: endpoint.name,
    description: endpoint.description ?? "",
    method: endpoint.method,
    path: endpoint.path,
    enabled: endpoint.enabled,
    authType: endpoint.auth.type,
    scenarioCount: endpoint.scenarios.length,
    fieldCount:
      countFields(endpoint.request.body) +
      countFields(endpoint.request.query) +
      countFields(endpoint.request.headers),
    tags: endpoint.tags,
  }));

  return <ProjectDetail project={detail} endpoints={rows} />;
}
