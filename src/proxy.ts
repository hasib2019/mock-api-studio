/**
 * Studio gate. Runs on the Node.js runtime (Next 16 default for proxy), so the
 * cookie signature is verified with `node:crypto` right here.
 *
 * Public on purpose:
 *   /login, /api/auth/*  - you cannot sign in through a locked door
 *   /api/mock/*          - the whole point of the product: other systems call
 *                          the mock endpoints and must never need a studio session
 *   /_next/*, favicon, static assets
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import type { ApiErr } from "@/lib/types";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/mock", "/_next"];

const PUBLIC_FILES = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.json"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  // Anything with a file extension is a static asset from /public.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json<ApiErr>({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api/mock|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
