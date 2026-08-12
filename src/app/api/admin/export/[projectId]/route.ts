import { NextResponse, type NextRequest } from "next/server";

import { toOpenApi, toPostman, toStudioJson } from "@/lib/export";
import { fail, guard, handleError } from "@/lib/http";
import { getProject, listEndpoints } from "@/lib/store";

export const dynamic = "force-dynamic";

const FORMATS = ["json", "openapi", "postman"] as const;

/**
 * Downloads one project as a file.
 *
 *   ?format=json     native studio backup - feed it back to /api/admin/import
 *   ?format=openapi  OpenAPI 3.1 document
 *   ?format=postman  Postman v2.1 collection
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/export/[projectId]">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const { projectId } = await ctx.params;
    const project = await getProject(projectId);
    if (!project) return fail("Project not found", 404);

    const requested = (request.nextUrl.searchParams.get("format") ?? "json").trim().toLowerCase();
    const format = FORMATS.find((candidate) => candidate === requested);
    if (!format) {
      return fail(`Unsupported export format "${requested}". Use json, openapi or postman.`, 400);
    }

    const endpoints = await listEndpoints(project.id);
    const origin = request.nextUrl.origin;

    const document =
      format === "openapi"
        ? toOpenApi(project, endpoints, origin)
        : format === "postman"
          ? toPostman(project, endpoints, origin)
          : toStudioJson(project, endpoints);

    // A download, not an envelope: the file must be usable as-is by Swagger UI,
    // by Postman, or by the import route.
    return NextResponse.json(document, {
      headers: {
        "content-disposition": `attachment; filename="${project.slug}-${format}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
