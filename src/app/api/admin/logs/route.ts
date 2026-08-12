import type { NextRequest } from "next/server";

import { fail, guard, handleError, ok } from "@/lib/http";
import { clearLogs, listLogs } from "@/lib/logs";

export const dynamic = "force-dynamic";

/** Reads a query parameter, treating an empty string as "not set". */
function param(request: NextRequest, key: string): string | undefined {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value ? value : undefined;
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const rawLimit = param(request, "limit");
    const parsed = rawLimit === undefined ? Number.NaN : Number(rawLimit);
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;

    const logs = await listLogs({
      projectId: param(request, "projectId"),
      endpointId: param(request, "endpointId"),
      outcome: param(request, "outcome"),
      limit,
    });
    return ok(logs);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const cleared = await clearLogs({
      projectId: param(request, "projectId"),
      endpointId: param(request, "endpointId"),
    });
    return ok({ cleared });
  } catch (e) {
    return handleError(e);
  }
}
