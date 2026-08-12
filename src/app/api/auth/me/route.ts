import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import type { ApiResponse, SessionPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json<ApiResponse<SessionPayload>>(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  return NextResponse.json<ApiResponse<SessionPayload>>({ ok: true, data: session });
}
