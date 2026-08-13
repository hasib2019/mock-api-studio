import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  isSecureRequest,
  newSessionPayload,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth";
import { ensureSeedUser, verifyCredentials } from "@/lib/users";
import type { ApiResponse, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

interface LoginData {
  username: string;
  name: string;
  role: UserRole;
}

/* ------------------------------------------------------------------ *
 * Failed-attempt throttle (in memory, per username)
 * ------------------------------------------------------------------ */

const MAX_FAILURES = 10;
const WINDOW_MS = 5 * 60 * 1000;

interface FailureWindow {
  count: number;
  resetAt: number;
}

const failures = new Map<string, FailureWindow>();

function prune(now: number): void {
  for (const [key, window] of failures) {
    if (window.resetAt <= now) failures.delete(key);
  }
}

/** Milliseconds left on the lockout, or 0 when the caller may try again. */
function lockoutRemaining(key: string, now: number): number {
  const window = failures.get(key);
  if (!window || window.resetAt <= now) return 0;
  return window.count >= MAX_FAILURES ? window.resetAt - now : 0;
}

function recordFailure(key: string, now: number): void {
  const window = failures.get(key);
  if (!window || window.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  window.count += 1;
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

function readCredentials(raw: unknown): { username: string; password: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { username, password } = record;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const trimmed = username.trim();
  if (trimmed === "" || password === "") return null;
  return { username: trimmed, password };
}

export async function POST(request: NextRequest) {
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }

  const credentials = readCredentials(raw);
  if (!credentials) {
    return NextResponse.json<ApiResponse<LoginData>>(
      { ok: false, error: "Username and password are required." },
      { status: 400 },
    );
  }

  const now = Date.now();
  prune(now);

  const key = credentials.username.toLowerCase();
  const remaining = lockoutRemaining(key, now);
  if (remaining > 0) {
    const minutes = Math.max(1, Math.ceil(remaining / 60_000));
    return NextResponse.json<ApiResponse<LoginData>>(
      {
        ok: false,
        error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "retry-after": String(Math.ceil(remaining / 1000)) } },
    );
  }

  await ensureSeedUser();
  const user = await verifyCredentials(credentials.username, credentials.password);

  if (!user) {
    recordFailure(key, now);
    return NextResponse.json<ApiResponse<LoginData>>(
      { ok: false, error: "Invalid username or password" },
      { status: 401 },
    );
  }

  failures.delete(key);

  const token = signSession(newSessionPayload(user));
  const response = NextResponse.json<ApiResponse<LoginData>>({
    ok: true,
    data: { username: user.username, name: user.name, role: user.role },
  });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(undefined, isSecureRequest(request)),
  );
  return response;
}
