import type { NextRequest } from "next/server";

import { fail, guard, handleError, isRecord, ok, readJsonBody } from "@/lib/http";
import { createProject, listProjects } from "@/lib/store";
import type { ProjectDef, ProjectInput } from "@/lib/types";

export const dynamic = "force-dynamic";

function headerMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

export async function GET(): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const projects: ProjectDef[] = await listProjects();
    return ok(projects);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const raw = await readJsonBody<unknown>(request);
    if (!isRecord(raw)) return fail("Request body must be a JSON object", 400);

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return fail("Project name is required", 400);

    const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
    const id = typeof raw.id === "string" ? raw.id.trim() : "";

    const input: ProjectInput = {
      name,
      slug: slug || name,
      description: typeof raw.description === "string" ? raw.description : "",
      defaultHeaders: headerMap(raw.defaultHeaders),
      color: typeof raw.color === "string" ? raw.color : "",
      ...(id ? { id } : {}),
    };

    const project = await createProject(input);
    return ok(project, 201);
  } catch (e) {
    return handleError(e);
  }
}
