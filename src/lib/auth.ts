/**
 * Studio session handling - signed cookie, no session store.
 *
 * Server only. Imported by the auth routes, the admin routes, the authenticated
 * layout and by `src/proxy.ts` (which runs on the Node.js runtime, so
 * `node:crypto` is available there too).
 */

import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import type { SessionPayload, StudioUser } from "@/lib/types";

export const SESSION_COOKIE = "mas_session";

/** 12 hours. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const DEV_SECRET = "mock-api-studio-dev-secret-do-not-use-in-production";

let warnedAboutSecret = false;

export function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (process.env.NODE_ENV === "production" && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn(
      "[auth] SESSION_SECRET is not set - falling back to the built-in development secret. " +
        "Set SESSION_SECRET before running this in production.",
    );
  }
  return DEV_SECRET;
}

/* ------------------------------------------------------------------ *
 * Token
 * ------------------------------------------------------------------ */

function signBody(body: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${signBody(body)}`;
}

function toSessionPayload(value: unknown): SessionPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { sub, username, name, role, exp } = record;

  if (typeof sub !== "string" || sub === "") return null;
  if (typeof username !== "string" || username === "") return null;
  if (typeof name !== "string") return null;
  if (role !== "admin" && role !== "member") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;

  return { sub, username, name, role, exp };
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;

  const body = token.slice(0, separator);
  const signature = Buffer.from(token.slice(separator + 1), "utf8");
  const expected = Buffer.from(signBody(body), "utf8");
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(signature, expected)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const payload = toSessionPayload(parsed);
  if (!payload) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/** Builds the payload signed into the cookie for a freshly authenticated user. */
export function newSessionPayload(user: StudioUser): SessionPayload {
  return {
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

/* ------------------------------------------------------------------ *
 * Cookie
 * ------------------------------------------------------------------ */

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
}

/**
 * A cookie marked `Secure` is only stored/sent by the browser over HTTPS (or
 * from `localhost`, which browsers treat as trustworthy on its own). Next.js
 * itself never terminates TLS here - a reverse proxy (Caddy, Vercel's edge)
 * does, and forwards to this app in plain HTTP - so `NODE_ENV` alone cannot
 * tell us whether the browser's connection was actually encrypted. Trust
 * `X-Forwarded-Proto` from the proxy first, falling back to the request's
 * own scheme for the rare case nothing sits in front of this process.
 */
export function isSecureRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0]?.trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export function sessionCookieOptions(
  maxAge: number = SESSION_TTL_SECONDS,
  secure: boolean = process.env.NODE_ENV === "production",
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge,
  };
}

/* ------------------------------------------------------------------ *
 * Reading the current session
 * ------------------------------------------------------------------ */

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
