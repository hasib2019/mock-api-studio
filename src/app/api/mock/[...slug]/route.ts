/**
 * The mock runtime.
 *
 * One catch-all route serves every endpoint any user ever registers:
 *
 *   /api/mock/<projectSlug>/<endpointPath...>
 *
 * Pipeline: resolve -> enabled? -> auth -> parse body -> validate -> pick a
 * scenario -> delay -> render the {{token}} template -> respond -> log.
 *
 * Two invariants hold for every branch below:
 *   - the caller always gets JSON plus the `x-mock-*` diagnostic headers,
 *   - logging is best effort and can never change or break the response.
 */

import { after, NextResponse, type NextRequest } from "next/server";

import { isStructuredContentType } from "@/lib/content-type";
import {
  defaultAuthError,
  defaultRequestSpec,
  defaultValidationError,
} from "@/lib/defaults";
import { newId } from "@/lib/ids";
import { appendLog } from "@/lib/logs";
import { resolveRoute } from "@/lib/matcher";
import { matchScenario } from "@/lib/scenario";
import { renderTemplate } from "@/lib/template";
import { validateRequest, type RequestPayloads } from "@/lib/validation/engine";
import type {
  AuthSpec,
  ContentType,
  EndpointDef,
  ErrorTemplate,
  HttpMethod,
  LogOutcome,
  ProjectDef,
  ResponseScenario,
  TemplateContext,
  ValidationIssue,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Next generates `{ slug: string[] }` for `[...slug]`; typed inline so this
 * file compiles before `next typegen` has ever run.
 */
interface MockRouteContext {
  params: Promise<{ slug?: string[] }>;
}

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const MAX_DELAY_MS = 30_000;
const MAX_LOGGED_TEXT = 2_000;
const MAX_ISSUE_SAMPLE = 200;
const MAX_HEADER_TAG = 160;

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS";
const EXPOSED_HEADERS =
  "x-mock-endpoint-id, x-mock-endpoint-name, x-mock-scenario, x-mock-outcome, x-mock-duration-ms";

/** Never persisted verbatim into the request log. */
const REDACTED_HEADERS = new Set(["authorization", "cookie"]);

/** RFC 7230 token characters - anything else is not a legal header name. */
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** Header values must be printable ASCII or the platform throws on send. */
const UNSAFE_HEADER_CHARS = /[^\x20-\x7E]+/g;

const STUDIO_HINT =
  "Open the endpoint list for this project in Mock API Studio to see every registered method and path.";

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Sum of the configured latencies, clamped to something a caller survives. */
function totalDelay(...values: Array<number | undefined>): number {
  let total = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) total += value;
  }
  return Math.min(Math.round(total), MAX_DELAY_MS);
}

function normalizeStatus(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  return rounded >= 100 && rounded <= 599 ? rounded : fallback;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unknown error";
}

/** Arrays are objects too: keeping one lets `{{body[0].id}}` resolve. */
function asPayloadRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return value as unknown as Record<string, unknown>;
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
  return {};
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function safeStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value === undefined ? null : value);
    return json === undefined ? "null" : json;
  } catch {
    return JSON.stringify({
      status: "FAILED",
      responseCode: "RESPONSE_SERIALIZATION_ERROR",
      message: "The rendered response body could not be serialised to JSON.",
    });
  }
}

/**
 * Serialises a rendered body for a non-structured (XML/plain text/...)
 * response. A raw template (the common case) already rendered to a string;
 * an object/array only shows up here if a `{{body}}`-only template was fed a
 * structured request context (e.g. a JSON-in/XML-out bridge), so fall back
 * to JSON text rather than the useless `"[object Object]"` from `String()`.
 */
function rawBodyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return safeStringify(value);
}

function sanitizeHeaderValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).replace(UNSAFE_HEADER_CHARS, " ").replace(/\s+/g, " ").trim();
}

/** Same, but a diagnostic header always carries something readable. */
function headerTag(value: unknown): string {
  const clean = truncate(sanitizeHeaderValue(value), MAX_HEADER_TAG);
  return clean === "" ? "-" : clean;
}

function applyHeaders(target: Headers, source: Record<string, string> | undefined): void {
  if (!source) return;
  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = String(rawName).trim();
    if (!HEADER_NAME_RE.test(name)) continue;
    try {
      target.set(name, sanitizeHeaderValue(rawValue));
    } catch {
      /* a value the platform still refuses is simply dropped */
    }
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": ALLOWED_METHODS,
    "access-control-allow-headers": "*",
    "access-control-expose-headers": EXPOSED_HEADERS,
    "access-control-max-age": "86400",
  };
}

/* ------------------------------------------------------------------ *
 * Reading the incoming request
 * ------------------------------------------------------------------ */

interface HeaderSnapshot {
  values: Record<string, string>;
  redacted: Record<string, string>;
}

function readHeaders(request: NextRequest): HeaderSnapshot {
  const values: Record<string, string> = {};
  const redacted: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    values[name] = value;
    redacted[name] = REDACTED_HEADERS.has(name) ? "[redacted]" : value;
  });
  return { values, redacted };
}

interface QuerySnapshot {
  values: Record<string, unknown>;
  flat: Record<string, string>;
}

/** A key repeated in the query string becomes an array for the validator. */
function readQuery(params: URLSearchParams): QuerySnapshot {
  const values: Record<string, unknown> = {};
  const flat: Record<string, string> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    values[key] = all.length > 1 ? all : all[0];
    flat[key] = all.join(", ");
  }
  return { values, flat };
}

function clientIp(headers: Record<string, string>): string | undefined {
  const forwarded = headers["x-forwarded-for"];
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return headers["x-real-ip"] || undefined;
}

/** The raw text is read exactly once; every parser works off this string. */
async function readRawBody(request: NextRequest, method: string): Promise<string> {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return "";
  try {
    return await request.text();
  } catch {
    return "";
  }
}

interface ParsedBody {
  /** what the validator and the templates see */
  value: Record<string, unknown> | string;
  /** what goes into the request log */
  logged: unknown;
  /** set when the caller sent something that cannot be parsed at all */
  issue: ValidationIssue | null;
}

/**
 * Parsing follows the *registered* content type, not the header the caller
 * happened to send: if the endpoint is declared as JSON we always attempt
 * `JSON.parse` and report a `json` issue when that fails. A non-structured
 * content type (XML/SOAP/plain text/...) is never parsed - the raw text
 * itself is the value, so no parse failure is possible there.
 */
function parseBody(contentType: ContentType, raw: string): ParsedBody {
  if (contentType === "none") {
    const text = raw.trim();
    return { value: {}, logged: text ? truncate(text, MAX_LOGGED_TEXT) : null, issue: null };
  }

  if (contentType === "application/x-www-form-urlencoded") {
    const value = readQuery(new URLSearchParams(raw)).values;
    return { value, logged: value, issue: null };
  }

  const text = raw.trim();

  if (!isStructuredContentType(contentType)) {
    return { value: text, logged: text ? truncate(text, MAX_LOGGED_TEXT) : null, issue: null };
  }

  if (!text) return { value: {}, logged: null, issue: null };

  try {
    const parsed: unknown = JSON.parse(text);
    return { value: asPayloadRecord(parsed), logged: parsed, issue: null };
  } catch (error) {
    return {
      value: {},
      logged: truncate(text, MAX_LOGGED_TEXT),
      issue: {
        location: "body",
        field: "body",
        rule: "json",
        message: `Request body is not valid JSON: ${messageOf(error)}`,
        received: truncate(text, MAX_ISSUE_SAMPLE),
        expected: "application/json",
      },
    };
  }
}

/* ------------------------------------------------------------------ *
 * Endpoint auth
 * ------------------------------------------------------------------ */

interface AuthCheck {
  ok: boolean;
  field: string;
  message: string;
}

const AUTH_OK: AuthCheck = { ok: true, field: "", message: "" };

function secureEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeBasic(credentials: string): { username: string; password: string } | null {
  try {
    const decoded = Buffer.from(credentials, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

/**
 * A configured secret must match exactly; a secret left blank in the builder
 * means "any credential of the right shape is accepted", which keeps a
 * half-finished endpoint usable instead of permanently locked.
 */
function checkAuth(auth: AuthSpec | undefined, headers: Record<string, string>): AuthCheck {
  const type = auth?.type ?? "none";
  if (type === "none") return AUTH_OK;

  if (type === "apiKey") {
    const headerName = (auth?.headerName || "x-api-key").toLowerCase();
    const received = headers[headerName] ?? "";
    if (!received) {
      return { ok: false, field: headerName, message: `Missing "${headerName}" header` };
    }
    const expected = auth?.token ?? "";
    if (expected && !secureEquals(received, expected)) {
      return { ok: false, field: headerName, message: `Invalid "${headerName}" value` };
    }
    return AUTH_OK;
  }

  const authorization = headers.authorization ?? "";
  if (!authorization) {
    return { ok: false, field: "authorization", message: 'Missing "Authorization" header' };
  }

  const space = authorization.indexOf(" ");
  const scheme = (space === -1 ? authorization : authorization.slice(0, space)).toLowerCase();
  const credentials = space === -1 ? "" : authorization.slice(space + 1).trim();

  if (type === "bearer") {
    if (scheme !== "bearer") {
      return {
        ok: false,
        field: "authorization",
        message: 'Authorization header must use the "Bearer" scheme',
      };
    }
    if (!credentials) {
      return { ok: false, field: "authorization", message: "Bearer token is empty" };
    }
    const expected = auth?.token ?? "";
    if (expected && !secureEquals(credentials, expected)) {
      return { ok: false, field: "authorization", message: "Invalid bearer token" };
    }
    return AUTH_OK;
  }

  if (scheme !== "basic") {
    return {
      ok: false,
      field: "authorization",
      message: 'Authorization header must use the "Basic" scheme',
    };
  }
  const decoded = decodeBasic(credentials);
  if (!decoded) {
    return {
      ok: false,
      field: "authorization",
      message: "Basic credentials must be base64 of username:password",
    };
  }
  const expectedUser = auth?.username ?? "";
  const expectedPassword = auth?.password ?? "";
  if (!expectedUser && !expectedPassword && !decoded.username) {
    return { ok: false, field: "authorization", message: "Basic credentials are empty" };
  }
  if (expectedUser && !secureEquals(decoded.username, expectedUser)) {
    return { ok: false, field: "authorization", message: "Invalid username or password" };
  }
  if (expectedPassword && !secureEquals(decoded.password, expectedPassword)) {
    return { ok: false, field: "authorization", message: "Invalid username or password" };
  }
  return AUTH_OK;
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

interface RenderedTemplate {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function renderErrorTemplate(
  template: ErrorTemplate | undefined,
  fallback: ErrorTemplate,
  ctx: TemplateContext,
): RenderedTemplate {
  const source = template && template.body !== undefined ? template : fallback;
  return {
    status: normalizeStatus(source.status, fallback.status),
    headers: source.headers ?? {},
    body: renderTemplate(source.body, ctx),
  };
}

function mergeHeaders(
  ...sources: Array<Record<string, string> | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Not-found / disabled envelopes
 * ------------------------------------------------------------------ */

interface NotFoundInput {
  method: string;
  slug: string;
  projectFound: boolean;
  path: string;
  availableMethods?: HttpMethod[];
}

/** A 404 from a sandbox has to say exactly what was tried and what exists. */
function notFoundBody(input: NotFoundInput): Record<string, unknown> {
  const head = {
    status: "FAILED",
    responseCode: "ENDPOINT_NOT_FOUND",
  };
  const tail = {
    method: input.method,
    project: input.slug || null,
    path: input.path,
    timestamp: new Date().toISOString(),
  };

  if (!input.projectFound) {
    return {
      ...head,
      message: input.slug
        ? `No mock project is registered with the slug "${input.slug}".`
        : "No project slug was supplied.",
      hint:
        "The first segment after /api/mock is the project slug: " +
        "/api/mock/<projectSlug>/<endpointPath>. Check the project list in " +
        "Mock API Studio for the slug you meant.",
      ...tail,
    };
  }

  const methods = input.availableMethods ?? [];
  if (methods.length > 0) {
    return {
      ...head,
      message: `"${input.path}" exists in project "${input.slug}" but not for ${input.method}.`,
      availableMethods: methods,
      hint:
        `Retry with ${methods.join(" or ")}, or register a ${input.method} endpoint ` +
        `for this path. ${STUDIO_HINT}`,
      ...tail,
    };
  }

  return {
    ...head,
    message: `No ${input.method} endpoint is registered at "${input.path}" in project "${input.slug}".`,
    hint:
      'Paths are matched segment by segment; a ":param" segment matches exactly one ' +
      `segment. ${STUDIO_HINT}`,
    ...tail,
  };
}

function disabledBody(endpoint: EndpointDef, project: ProjectDef): Record<string, unknown> {
  return {
    status: "FAILED",
    responseCode: "ENDPOINT_DISABLED",
    message: `The endpoint "${endpoint.name}" (${endpoint.method} ${endpoint.path}) is currently disabled.`,
    method: endpoint.method,
    project: project.slug,
    path: endpoint.path,
    hint: "Enable it from the endpoint page in Mock API Studio to start serving this route again.",
    timestamp: new Date().toISOString(),
  };
}

function noScenarioBody(endpoint: EndpointDef, project: ProjectDef): Record<string, unknown> {
  return {
    status: "FAILED",
    responseCode: "NO_SCENARIO",
    message: `The endpoint "${endpoint.name}" has no enabled response scenario.`,
    method: endpoint.method,
    project: project.slug,
    path: endpoint.path,
    hint: `Add or enable at least one response scenario for this endpoint. ${STUDIO_HINT}`,
    timestamp: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Responding + logging
 * ------------------------------------------------------------------ */

/** Everything about the incoming call the log needs, captured up front. */
interface RequestFacts {
  method: string;
  url: string;
  path: string;
  startedAt: number;
  ip: string | undefined;
  requestHeaders: Record<string, string>;
  requestQuery: Record<string, string>;
}

interface RespondInput {
  facts: RequestFacts;
  requestBody: unknown;
  project: ProjectDef | null;
  endpoint: EndpointDef | null;
  scenario: ResponseScenario | null;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  outcome: LogOutcome;
  issues: ValidationIssue[];
  /**
   * Set only for a rendered scenario/error body (never for the studio's own
   * 404/disabled/no-scenario diagnostics, which stay JSON - the caller's
   * expected content type isn't known yet at that point in the pipeline).
   */
  responseContentType?: ContentType;
}

async function respond(input: RespondInput): Promise<Response> {
  const durationMs = Date.now() - input.facts.startedAt;

  const raw =
    input.responseContentType !== undefined &&
    !isStructuredContentType(input.responseContentType);

  const headers = new Headers();
  applyHeaders(headers, input.headers);
  applyHeaders(headers, corsHeaders());
  headers.set(
    "content-type",
    raw ? `${input.responseContentType}; charset=utf-8` : "application/json; charset=utf-8",
  );
  headers.set("x-mock-endpoint-id", headerTag(input.endpoint?.id));
  headers.set("x-mock-endpoint-name", headerTag(input.endpoint?.name));
  headers.set("x-mock-scenario", headerTag(input.scenario?.name));
  headers.set("x-mock-outcome", input.outcome);
  headers.set("x-mock-duration-ms", String(durationMs));

  const text = raw ? rawBodyText(input.body) : safeStringify(input.body);
  const isHead = input.facts.method === "HEAD";
  if (isHead) headers.set("content-length", String(Buffer.byteLength(text, "utf8")));

  // Logging happens after the response has been sent (`waitUntil` on Vercel),
  // so the caller never waits on the log INSERT + retention prune.
  after(async () => {
    try {
      await appendLog({
        id: newId("log"),
        ts: new Date().toISOString(),
        projectId: input.project?.id ?? null,
        projectSlug: input.project?.slug ?? null,
        endpointId: input.endpoint?.id ?? null,
        endpointName: input.endpoint?.name ?? null,
        method: input.facts.method,
        path: input.facts.path,
        url: input.facts.url,
        status: input.status,
        durationMs,
        outcome: input.outcome,
        scenarioId: input.scenario?.id ?? null,
        scenarioName: input.scenario?.name ?? null,
        requestHeaders: input.facts.requestHeaders,
        requestQuery: input.facts.requestQuery,
        requestBody: input.requestBody,
        responseBody: input.body,
        issues: input.issues,
        ip: input.facts.ip,
      });
    } catch {
      /* a broken log must never break the mock */
    }
  });

  return new NextResponse(isHead ? null : text, { status: input.status, headers });
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

async function handle(request: NextRequest, context: MockRouteContext): Promise<Response> {
  const startedAt = Date.now();
  const method = (request.method || "GET").toUpperCase();
  const url = request.url;

  try {
    const routeParams = await context.params;
    const segments = (Array.isArray(routeParams?.slug) ? routeParams.slug : []).filter(
      (segment) => typeof segment === "string" && segment.length > 0,
    );
    const calledPath = `/${segments.join("/")}`;

    const { values: headerValues, redacted: loggedHeaders } = readHeaders(request);
    const { values: queryValues, flat: loggedQuery } = readQuery(request.nextUrl.searchParams);
    const rawBody = await readRawBody(request, method);

    const facts: RequestFacts = {
      method,
      url,
      path: calledPath,
      startedAt,
      ip: clientIp(headerValues),
      requestHeaders: loggedHeaders,
      requestQuery: loggedQuery,
    };
    const rawBodyLog = rawBody.trim() ? truncate(rawBody.trim(), MAX_LOGGED_TEXT) : null;

    /* 1 - resolve ---------------------------------------------------- */

    let resolution = await resolveRoute(method, segments);
    // HEAD falls back to the GET endpoint when no HEAD route was registered,
    // which is what every HTTP client expects from a real server.
    if (resolution.kind !== "ok" && method === "HEAD") {
      const asGet = await resolveRoute("GET", segments);
      if (asGet.kind === "ok") resolution = asGet;
    }

    if (resolution.kind !== "ok") {
      const body = notFoundBody({
        method,
        slug: resolution.slug,
        projectFound: resolution.kind === "no_route",
        path: resolution.kind === "no_route" ? resolution.path : calledPath,
        availableMethods:
          resolution.kind === "no_route" ? resolution.methodMismatch : undefined,
      });
      return await respond({
        facts,
        requestBody: rawBodyLog,
        project: null,
        endpoint: null,
        scenario: null,
        status: 404,
        headers: {},
        body,
        outcome: "not_found",
        issues: [],
      });
    }

    const { project, endpoint, params } = resolution.route;

    /* 2 - enabled? --------------------------------------------------- */

    if (endpoint.enabled === false) {
      return await respond({
        facts,
        requestBody: rawBodyLog,
        project,
        endpoint,
        scenario: null,
        status: 503,
        headers: mergeHeaders(project.defaultHeaders, { "retry-after": "60" }),
        body: disabledBody(endpoint, project),
        outcome: "disabled",
        issues: [],
      });
    }

    /* 3 - parse the body (every template below can echo it) ----------- */

    const spec = endpoint.request ?? defaultRequestSpec();
    const parsed = parseBody(spec.contentType ?? "application/json", rawBody);

    const meta: Record<string, unknown> = {
      method,
      path: calledPath,
      endpoint: endpoint.name,
      project: project.name,
      url,
    };

    /* 4 - auth ------------------------------------------------------- */

    const auth = checkAuth(endpoint.auth, headerValues);
    if (!auth.ok) {
      const issues: ValidationIssue[] = [
        {
          location: "auth",
          field: auth.field,
          rule: "required",
          message: auth.message,
          expected: endpoint.auth?.type ?? "none",
        },
      ];
      const authCtx: TemplateContext = {
        body: parsed.value,
        query: queryValues,
        headers: headerValues,
        path: params,
        issues,
        meta,
      };
      const rendered = renderErrorTemplate(
        endpoint.authError,
        defaultAuthError(endpoint.responseContentType),
        authCtx,
      );
      await sleep(totalDelay(endpoint.delayMs));
      return await respond({
        facts,
        requestBody: parsed.logged,
        project,
        endpoint,
        scenario: null,
        status: rendered.status,
        headers: mergeHeaders(project.defaultHeaders, rendered.headers),
        body: rendered.body,
        outcome: "auth_failed",
        issues,
        responseContentType: endpoint.responseContentType,
      });
    }

    /* 5 - validate --------------------------------------------------- */

    const structured = isStructuredContentType(spec.contentType ?? "application/json");
    let issues: ValidationIssue[];
    let coerced: RequestPayloads;

    if (parsed.issue) {
      // An unparseable body has nothing to check against the schema.
      issues = [parsed.issue];
      coerced = { body: {}, query: queryValues, headers: headerValues, path: params };
    } else {
      // A raw (non-structured) body has no FieldDef tree of its own - force it
      // empty so stale body rules left over from a JSON-to-XML switch never
      // fire a phantom "field is missing" error against an empty object.
      const result = validateRequest(structured ? spec : { ...spec, body: [] }, {
        body: structured ? (parsed.value as Record<string, unknown>) : {},
        query: queryValues,
        headers: headerValues,
        path: params,
      });
      issues = result.issues;
      coerced = result.value;
    }

    // Templating and scenario matching run on the COERCED values, so
    // `{{body.amount}}` renders as a number rather than the raw string. A
    // non-structured body bypasses coercion entirely - the raw text itself
    // is what conditions and templates see.
    const ctx: TemplateContext = {
      body: !structured
        ? (parsed.value as string)
        : // The validator drops a non-object root; keep an array body addressable.
          Array.isArray(parsed.value)
          ? parsed.value
          : coerced.body,
      query: coerced.query,
      headers: coerced.headers,
      path: coerced.path ?? params,
      issues,
      meta,
    };

    if (issues.length > 0) {
      const rendered = renderErrorTemplate(
        endpoint.validationError,
        defaultValidationError(endpoint.responseContentType),
        ctx,
      );
      await sleep(totalDelay(endpoint.delayMs));
      return await respond({
        facts,
        requestBody: parsed.logged,
        project,
        endpoint,
        scenario: null,
        status: rendered.status,
        headers: mergeHeaders(project.defaultHeaders, rendered.headers),
        body: rendered.body,
        outcome: "validation_failed",
        issues,
        responseContentType: endpoint.responseContentType,
      });
    }

    /* 6 - pick a scenario and render --------------------------------- */

    const scenario = matchScenario(endpoint.scenarios ?? [], ctx);
    if (!scenario) {
      return await respond({
        facts,
        requestBody: parsed.logged,
        project,
        endpoint,
        scenario: null,
        status: 501,
        headers: mergeHeaders(project.defaultHeaders),
        body: noScenarioBody(endpoint, project),
        outcome: "matched",
        issues: [],
      });
    }

    await sleep(totalDelay(endpoint.delayMs, scenario.delayMs));

    return await respond({
      facts,
      requestBody: parsed.logged,
      project,
      endpoint,
      scenario,
      status: normalizeStatus(scenario.status, 200),
      headers: mergeHeaders(project.defaultHeaders, scenario.headers),
      body: renderTemplate(scenario.body, ctx),
      outcome: "matched",
      issues: [],
      responseContentType: endpoint.responseContentType,
    });
  } catch (error) {
    console.error("[mock-runtime] unhandled error", error);

    const headers = new Headers(corsHeaders());
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-mock-endpoint-id", "-");
    headers.set("x-mock-endpoint-name", "-");
    headers.set("x-mock-scenario", "-");
    headers.set("x-mock-outcome", "error");
    headers.set("x-mock-duration-ms", String(Date.now() - startedAt));

    const body = safeStringify({
      status: "FAILED",
      responseCode: "MOCK_RUNTIME_ERROR",
      message: messageOf(error),
    });
    return new NextResponse(method === "HEAD" ? null : body, { status: 500, headers });
  }
}

/* ------------------------------------------------------------------ *
 * Exports
 * ------------------------------------------------------------------ */

/**
 * CORS preflight is answered before any lookup - a preflight carries no body
 * and must succeed even for a path that was never registered.
 */
export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders(), "content-length": "0" },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
