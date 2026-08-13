import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isSecureRequest, sessionCookieOptions } from "@/lib/auth";
import type { ApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = NextResponse.json<ApiResponse<{ ok: true }>>({
    ok: true,
    data: { ok: true },
  });
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0, isSecureRequest(request)),
    expires: new Date(0),
  });
  return response;
}
