import { notFound } from "next/navigation";

import { EndpointBuilder } from "@/components/builder/EndpointBuilder";
import { newEndpoint } from "@/lib/defaults";
import { getProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function NewEndpointPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await props.params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const blank = newEndpoint(project.id);

  return <EndpointBuilder project={project} initial={blank} mode="create" />;
}
