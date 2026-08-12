import { notFound } from "next/navigation";

import { EndpointBuilder } from "@/components/builder/EndpointBuilder";
import { getEndpoint, getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function EditEndpointPage(props: {
  params: Promise<{ projectId: string; endpointId: string }>;
}) {
  const { projectId, endpointId } = await props.params;

  const [project, endpoint] = await Promise.all([getProject(projectId), getEndpoint(endpointId)]);
  if (!project || !endpoint || endpoint.projectId !== project.id) notFound();

  return <EndpointBuilder project={project} initial={endpoint} mode="edit" />;
}
