import type { NextRequest } from "next/server";

import { fail, guard, handleError, ok, readJsonBody, validateEndpointPatch } from "@/lib/http";
import { deleteEndpoint, getEndpoint, updateEndpoint } from "@/lib/store";

export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ endpointId: string }>;
}

export async function GET(_request: NextRequest, ctx: Context): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { endpointId } = await ctx.params;
    const endpoint = await getEndpoint(endpointId);
    if (!endpoint) return fail("Endpoint not found", 404);
    return ok(endpoint);
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: NextRequest, ctx: Context): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { endpointId } = await ctx.params;
    const raw = await readJsonBody<unknown>(request);
    const endpoint = await updateEndpoint(endpointId, validateEndpointPatch(raw));
    return ok(endpoint);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_request: NextRequest, ctx: Context): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { endpointId } = await ctx.params;
    await deleteEndpoint(endpointId);
    return ok<{ deleted: true }>({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
