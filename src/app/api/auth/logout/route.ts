import { NextResponse } from "next/server";

import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import type { ApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json<ApiResponse<{ ok: true }>>({
    ok: true,
    data: { ok: true },
  });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), expires: new Date(0) });
  return response;
}
