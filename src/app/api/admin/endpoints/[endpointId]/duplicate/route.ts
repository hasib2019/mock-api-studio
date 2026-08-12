import type { NextRequest } from "next/server";

import { fail, guard, handleError, ok } from "@/lib/http";
import { duplicateEndpoint } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/endpoints/[endpointId]/duplicate">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { endpointId } = await ctx.params;
    const copy = await duplicateEndpoint(endpointId);
    return ok(copy, 201);
  } catch (e) {
    return handleError(e);
  }
}
