import type { NextRequest } from "next/server";

import { fail, guard, handleError, isRecord, ok, readJsonBody } from "@/lib/http";
import { deleteProject, getProject, listEndpoints, updateProject } from "@/lib/store";
import type { EndpointDef, ProjectDef } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ProjectDetail {
  project: ProjectDef;
  endpoints: EndpointDef[];
}

function headerMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/projects/[projectId]">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { projectId } = await ctx.params;
    const project = await getProject(projectId);
    if (!project) return fail("Project not found", 404);

    const endpoints = await listEndpoints(project.id);
    const detail: ProjectDetail = { project, endpoints };
    return ok(detail);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/projects/[projectId]">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { projectId } = await ctx.params;
    const raw = await readJsonBody<unknown>(request);
    if (!isRecord(raw)) return fail("Request body must be a JSON object", 400);

    const patch: Partial<ProjectDef> = {};

    if (raw.name !== undefined) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) return fail("Project name is required", 400);
      patch.name = name;
    }
    if (raw.slug !== undefined) {
      const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
      if (!slug) return fail("Project slug is required", 400);
      patch.slug = slug;
    }
    if (raw.description !== undefined) {
      patch.description = typeof raw.description === "string" ? raw.description : "";
    }
    if (raw.defaultHeaders !== undefined) {
      patch.defaultHeaders = headerMap(raw.defaultHeaders);
    }
    if (raw.color !== undefined && typeof raw.color === "string" && raw.color.trim()) {
      patch.color = raw.color.trim();
    }

    const project = await updateProject(projectId, patch);
    return ok(project);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/projects/[projectId]">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { projectId } = await ctx.params;
    await deleteProject(projectId);
    return ok<{ deleted: true }>({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
