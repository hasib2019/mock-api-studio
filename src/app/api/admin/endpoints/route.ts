import type { NextRequest } from "next/server";

import { fail, guard, handleError, ok, readJsonBody, validateEndpointInput } from "@/lib/http";
import { createEndpoint, listEndpoints } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
    const endpoints = await listEndpoints(projectId || undefined);
    return ok(endpoints);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const raw = await readJsonBody<unknown>(request);
    const endpoint = await createEndpoint(validateEndpointInput(raw));
    return ok(endpoint, 201);
  } catch (e) {
    return handleError(e);
  }
}
