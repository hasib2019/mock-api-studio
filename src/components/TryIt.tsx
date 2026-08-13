"use client";

/**
 * Try-it console.
 *
 * Fires a real browser request at the mock endpoint and shows exactly what the
 * caller would get back. Everything on screen is seeded from what the user
 * registered: the body from the field examples/defaults, the query and header
 * editors from the registered keys, the auth helper from `endpoint.auth`.
 */

import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  CodeBlock,
  CopyButton,
  Input,
  JsonEditor,
  KeyValueEditor,
  MethodBadge,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/ui";
import { isStructuredContentType } from "@/lib/content-type";
import type {
  AuthSpec,
  ContentType,
  EndpointDef,
  FieldDef,
  FieldType,
  HttpMethod,
  ProjectDef,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Sample payload built from the registered fields
 * ------------------------------------------------------------------ */

const MAX_SAMPLE_DEPTH = 6;

function enumSample(field: FieldDef): unknown {
  const rule = field.rules.find((r) => r.enabled && r.rule === "enum");
  if (!rule) return undefined;
  if (Array.isArray(rule.value) && rule.value.length > 0) return rule.value[0];
  if (typeof rule.value === "string") {
    const first = rule.value.split(",")[0]?.trim();
    if (first) return first;
  }
  return undefined;
}

function numericSample(field: FieldDef): number {
  for (const rule of field.rules) {
    if (!rule.enabled) continue;
    const n = Number(rule.value);
    if (!Number.isFinite(n)) continue;
    if (rule.rule === "min") return n;
    if (rule.rule === "greaterThan") return n + 1;
  }
  return 0;
}

function scalarSample(type: FieldType | undefined): unknown {
  switch (type) {
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "object":
      return {};
    case "array":
      return [];
    case "any":
      return null;
    default:
      return "";
  }
}

function sampleForField(field: FieldDef, depth: number): unknown {
  if (field.example !== undefined) return field.example;
  if (field.defaultValue !== undefined) return field.defaultValue;

  const fromEnum = enumSample(field);
  if (fromEnum !== undefined) return fromEnum;

  if (field.type === "object") {
    return depth >= MAX_SAMPLE_DEPTH ? {} : sampleObject(field.children, depth + 1);
  }
  if (field.type === "array") {
    if (field.itemType === "object") {
      return depth >= MAX_SAMPLE_DEPTH ? [] : [sampleObject(field.children, depth + 1)];
    }
    return [scalarSample(field.itemType ?? "string")];
  }
  if (field.type === "number" || field.type === "integer") return numericSample(field);
  return scalarSample(field.type);
}

function sampleObject(fields: FieldDef[], depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.name) continue;
    out[field.name] = sampleForField(field, depth);
  }
  return out;
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function recordFromFields(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (!field.name) continue;
    const seed = field.example !== undefined ? field.example : field.defaultValue;
    out[field.name] = asText(seed);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Auth helper
 * ------------------------------------------------------------------ */

function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function credentialHeaders(auth: AuthSpec): Record<string, string> {
  if (auth.type === "apiKey") {
    return { [auth.headerName?.trim() || "x-api-key"]: auth.token ?? "" };
  }
  if (auth.type === "bearer") {
    return { authorization: `Bearer ${auth.token ?? ""}` };
  }
  if (auth.type === "basic") {
    return { authorization: `Basic ${base64(`${auth.username ?? ""}:${auth.password ?? ""}`)}` };
  }
  return {};
}

function describeAuth(auth: AuthSpec): string {
  switch (auth.type) {
    case "apiKey":
      return `API key sent in the ${auth.headerName?.trim() || "x-api-key"} header.`;
    case "bearer":
      return "Bearer token sent in the Authorization header.";
    case "basic":
      return "HTTP Basic credentials sent in the Authorization header.";
    default:
      return "This endpoint is open, no credentials are checked.";
  }
}

/* ------------------------------------------------------------------ *
 * URL + request assembly
 * ------------------------------------------------------------------ */

const METHODS_WITH_BODY = new Set<HttpMethod>(["POST", "PUT", "PATCH", "DELETE"]);

function mockPathOf(project: ProjectDef, endpoint: EndpointDef): string {
  const path = endpoint.path.startsWith("/") ? endpoint.path : `/${endpoint.path}`;
  return `/api/mock/${project.slug}${path}`;
}

function pathParamsOf(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment.startsWith(":") && segment.length > 1)
    .map((segment) => segment.slice(1));
}

function absolutise(raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

function buildTargetUrl(raw: string, query: Record<string, string>): string {
  const url = new URL(absolutise(raw));
  for (const [key, value] of Object.entries(query)) {
    const name = key.trim();
    if (!name || value === "") continue;
    url.searchParams.set(name, value);
  }
  return url.toString();
}

/**
 * `window.location.origin`, read the hydration-safe way: the server snapshot is
 * an empty origin (so the URL renders as a plain path) and the browser snapshot
 * takes over on the first client render.
 */
const subscribeToNothing = () => () => undefined;
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

function safeTargetUrl(raw: string, query: Record<string, string>): string {
  try {
    return buildTargetUrl(raw, query);
  } catch {
    return raw;
  }
}

function contentTypeHeader(contentType: ContentType): string | null {
  return contentType === "none" ? null : contentType;
}

function seedBodyText(endpoint: EndpointDef, structured: boolean): string {
  if (!structured) return endpoint.request.sampleBody ?? "";
  return JSON.stringify(sampleObject(endpoint.request.body, 0), null, 2);
}

function encodeBody(bodyText: string, contentType: ContentType): string {
  const text = bodyText.trim();
  if (contentType !== "application/x-www-form-urlencoded") return text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text || "{}") as unknown;
  } catch {
    throw new Error("The body must be valid JSON so it can be form-encoded.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Form-encoded bodies must be a flat JSON object.");
  }
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    form.set(key, asText(value));
  }
  return form.toString();
}

/* ------------------------------------------------------------------ *
 * cURL
 * ------------------------------------------------------------------ */

type CurlFlavor = "bash" | "cmd";

function buildCurl(
  flavor: CurlFlavor,
  method: HttpMethod,
  url: string,
  headers: Record<string, string>,
  body: string | null,
): string {
  const entries = Object.entries(headers).filter(([key]) => key.trim() !== "");

  if (flavor === "cmd") {
    const parts = [`curl -X ${method} "${url}"`];
    for (const [key, value] of entries) {
      parts.push(`-H "${key}: ${value.replace(/"/g, '\\"')}"`);
    }
    if (body !== null) {
      let oneLine: string;
      try {
        oneLine = JSON.stringify(JSON.parse(body) as unknown);
      } catch {
        oneLine = body.replace(/\r?\n\s*/g, " ");
      }
      parts.push(`-d "${oneLine.replace(/"/g, '\\"')}"`);
    }
    return parts.join(" ");
  }

  const lines = [`curl -X ${method} \\`, `  "${url}"`];
  for (const [key, value] of entries) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H "${key}: ${value.replace(/"/g, '\\"')}"`);
  }
  if (body !== null) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -d '${body.split("'").join("'\\''")}'`);
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ *
 * Response
 * ------------------------------------------------------------------ */

interface MockIssue {
  field: string;
  message: string;
  rule: string;
}

function extractIssues(parsed: unknown): MockIssue[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const errors = (parsed as Record<string, unknown>).errors;
  if (!Array.isArray(errors)) return [];

  return errors.map((entry: unknown, index: number): MockIssue => {
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      return {
        field: asText(record.field ?? record.name ?? `#${index + 1}`),
        message: asText(record.message ?? record.error ?? JSON.stringify(entry)),
        rule: asText(record.rule ?? record.code ?? ""),
      };
    }
    return { field: `#${index + 1}`, message: asText(entry), rule: "" };
  });
}

type SendState =
  | { kind: "idle" }
  | { kind: "failed"; message: string; durationMs: number }
  | {
      kind: "done";
      status: number;
      statusText: string;
      durationMs: number;
      headers: Array<[string, string]>;
      bodyText: string;
      issues: MockIssue[];
    };

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export interface TryItProps {
  project: ProjectDef;
  endpoint: EndpointDef;
}

export function TryIt({ project, endpoint }: TryItProps) {
  const structuredRequest = isStructuredContentType(endpoint.request.contentType);
  const [urlOverride, setUrlOverride] = React.useState<string | null>(null);
  const [bodyText, setBodyText] = React.useState(() => seedBodyText(endpoint, structuredRequest));
  const [query, setQuery] = React.useState<Record<string, string>>(() =>
    recordFromFields(endpoint.request.query),
  );
  const [headers, setHeaders] = React.useState<Record<string, string>>(() =>
    recordFromFields(endpoint.request.headers),
  );
  const [tab, setTab] = React.useState("body");
  const [flavor, setFlavor] = React.useState<CurlFlavor>("bash");
  const [sending, setSending] = React.useState(false);
  const [result, setResult] = React.useState<SendState>({ kind: "idle" });

  const origin = React.useSyncExternalStore(subscribeToNothing, browserOrigin, serverOrigin);
  const mockPath = mockPathOf(project, endpoint);
  const url = urlOverride ?? `${origin}${mockPath}`;
  const pathParams = pathParamsOf(endpoint.path);
  const sendsBody =
    endpoint.request.contentType !== "none" && METHODS_WITH_BODY.has(endpoint.method);

  /* re-seed when the console is pointed at a different endpoint */
  const lastEndpointId = React.useRef(endpoint.id);
  React.useEffect(() => {
    if (lastEndpointId.current === endpoint.id) return;
    lastEndpointId.current = endpoint.id;
    setUrlOverride(null);
    setBodyText(seedBodyText(endpoint, structuredRequest));
    setQuery(recordFromFields(endpoint.request.query));
    setHeaders(recordFromFields(endpoint.request.headers));
    setResult({ kind: "idle" });
  }, [endpoint, structuredRequest]);

  const outgoingHeaders = React.useMemo(() => {
    const merged: Record<string, string> = {};
    const ct = contentTypeHeader(endpoint.request.contentType);
    if (ct && sendsBody) merged["content-type"] = ct;
    for (const [key, value] of Object.entries(headers)) {
      if (key.trim() === "" || value === "") continue;
      merged[key.trim()] = value;
    }
    return merged;
  }, [endpoint.request.contentType, headers, sendsBody]);

  const curl = React.useMemo(
    () =>
      buildCurl(
        flavor,
        endpoint.method,
        safeTargetUrl(url, query),
        outgoingHeaders,
        sendsBody ? bodyText.trim() : null,
      ),
    [bodyText, endpoint.method, flavor, outgoingHeaders, query, sendsBody, url],
  );

  function reseed() {
    setBodyText(seedBodyText(endpoint, structuredRequest));
    setQuery(recordFromFields(endpoint.request.query));
    setHeaders(recordFromFields(endpoint.request.headers));
    setUrlOverride(null);
    setResult({ kind: "idle" });
    toast("Reset to the registered examples", "info");
  }

  function fillCredentials() {
    const credentials = credentialHeaders(endpoint.auth);
    if (Object.keys(credentials).length === 0) {
      toast("This endpoint does not require credentials", "info");
      return;
    }
    setHeaders((current) => ({ ...current, ...credentials }));
    setTab("headers");
    toast("Credentials added to the headers", "success");
  }

  async function send() {
    if (sending) return;

    let target: string;
    let payload: string | null = null;
    try {
      target = buildTargetUrl(url, query);
      if (sendsBody) payload = encodeBody(bodyText, endpoint.request.contentType);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not build the request", "error");
      return;
    }

    if (target.includes("/:")) {
      toast("The URL still contains a :param placeholder, fill it in first", "error");
      return;
    }

    setSending(true);
    setResult({ kind: "idle" });
    const started = performance.now();

    try {
      const response = await fetch(target, {
        method: endpoint.method,
        headers: outgoingHeaders,
        body: payload,
        cache: "no-store",
      });
      const text = await response.text();
      const durationMs = Math.round(performance.now() - started);

      const responseHeaders: Array<[string, string]> = [];
      response.headers.forEach((value, key) => {
        responseHeaders.push([key, value]);
      });
      responseHeaders.sort((a, b) => a[0].localeCompare(b[0]));

      let parsed: unknown;
      let pretty = text;
      try {
        parsed = JSON.parse(text) as unknown;
        pretty = JSON.stringify(parsed, null, 2);
      } catch {
        parsed = undefined;
      }

      setResult({
        kind: "done",
        status: response.status,
        statusText: response.statusText,
        durationMs,
        headers: responseHeaders,
        bodyText: pretty || "(empty response body)",
        issues: extractIssues(parsed),
      });
    } catch (err) {
      setResult({
        kind: "failed",
        message: err instanceof Error ? err.message : "The request could not be sent",
        durationMs: Math.round(performance.now() - started),
      });
    } finally {
      setSending(false);
    }
  }

  const tabs = [
    ...(sendsBody
      ? [{ id: "body", label: "Body", badge: endpoint.request.body.length || undefined }]
      : []),
    { id: "query", label: "Query", badge: Object.keys(query).length || undefined },
    { id: "headers", label: "Headers", badge: Object.keys(headers).length || undefined },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

  const scenarioHeader =
    result.kind === "done"
      ? (result.headers.find(([key]) => key === "x-mock-scenario")?.[1] ?? null)
      : null;

  return (
    <div className="space-y-4">
      {/* ---------------------------- request ---------------------------- */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Try it</h2>
            <p className="mt-0.5 text-[13px] leading-5 text-slate-500">
              Sends a real request from your browser straight to the mock runtime.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={reseed}>
              Reset
            </Button>
            <Button size="sm" onClick={send} loading={sending}>
              Send request
            </Button>
          </div>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-2">
            <MethodBadge method={endpoint.method} className="h-9 px-2.5 text-[12px]" />
            <Input
              value={url}
              mono
              spellCheck={false}
              aria-label="Mock URL"
              onChange={(event) => setUrlOverride(event.target.value)}
            />
            <CopyButton value={url} label="Copy URL" className="h-9" />
          </div>

          {pathParams.length > 0 ? (
            <p className="text-[12px] leading-5 text-slate-500">
              Path parameters:{" "}
              {pathParams.map((name) => (
                <code
                  key={name}
                  className="mr-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-[11.5px] text-slate-700"
                >
                  :{name}
                </code>
              ))}
              replace them in the URL above with real values before sending.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={endpoint.auth.type === "none" ? "gray" : "indigo"}>
                {endpoint.auth.type === "none" ? "no auth" : endpoint.auth.type}
              </Badge>
              <span className="truncate text-[12.5px] text-slate-600">
                {describeAuth(endpoint.auth)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fillCredentials}
              disabled={endpoint.auth.type === "none"}
            >
              Fill credentials
            </Button>
          </div>

          <Tabs tabs={tabs} active={activeTab} onChange={setTab} />

          {activeTab === "body" && sendsBody ? (
            <div className="space-y-2">
              {structuredRequest ? (
                <JsonEditor value={bodyText} onChange={setBodyText} minHeight={200} />
              ) : (
                <Textarea
                  aria-label="Request body"
                  mono
                  rows={10}
                  value={bodyText}
                  onChange={(event) => setBodyText(event.target.value)}
                />
              )}
              <p className="text-[12px] text-slate-500">
                {structuredRequest
                  ? "Pre-filled from the registered field examples and defaults."
                  : "Pre-filled from the registered sample body."}{" "}
                Content type:{" "}
                <code className="font-mono text-[11.5px] text-slate-700">
                  {endpoint.request.contentType}
                </code>
              </p>
            </div>
          ) : null}

          {activeTab === "query" ? (
            <div className="space-y-2">
              <KeyValueEditor
                value={query}
                onChange={setQuery}
                keyPlaceholder="param"
                valuePlaceholder="value"
                addLabel="Add query param"
              />
              <p className="text-[12px] text-slate-500">
                Rows with an empty value are dropped before the request is sent.
              </p>
            </div>
          ) : null}

          {activeTab === "headers" ? (
            <div className="space-y-2">
              <KeyValueEditor
                value={headers}
                onChange={setHeaders}
                keyPlaceholder="header"
                valuePlaceholder="value"
                addLabel="Add header"
              />
              <p className="text-[12px] text-slate-500">
                The content-type header is added automatically whenever a body is sent.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* ------------------------------ cURL ------------------------------ */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Copy as cURL</h2>
          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {(["bash", "cmd"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFlavor(option)}
                  className={
                    option === flavor
                      ? "bg-indigo-600 px-2.5 py-1 text-[12px] font-medium text-white"
                      : "bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  }
                >
                  {option === "bash" ? "bash (multi-line)" : "cmd (single line)"}
                </button>
              ))}
            </div>
            <CopyButton value={curl} label="Copy as cURL" />
          </div>
        </header>
        <div className="px-5 py-4">
          <CodeBlock code={curl} maxHeight={280} />
          <p className="mt-2 text-[12px] text-slate-500">
            {flavor === "bash"
              ? "Single-quoted body with backslash line continuations, for bash, zsh or Git Bash."
              : "One line, double quotes with escaped inner quotes, for Windows cmd.exe."}
          </p>
        </div>
      </section>

      {/* ---------------------------- response ---------------------------- */}
      {result.kind === "failed" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
          <p className="text-sm font-semibold text-rose-800">Request failed</p>
          <p className="mt-1 font-mono text-[12.5px] leading-5 break-words text-rose-700">
            {result.message}
          </p>
          <p className="mt-1 text-[12px] text-rose-600">
            Gave up after {result.durationMs} ms. Check that the studio is running and that the URL
            is reachable from this browser.
          </p>
        </div>
      ) : null}

      {result.kind === "done" ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Response</h2>
            <StatusBadge status={result.status} />
            {result.statusText ? (
              <span className="text-[12.5px] text-slate-500">{result.statusText}</span>
            ) : null}
            <Badge tone="gray">{result.durationMs} ms</Badge>
            {scenarioHeader ? <Badge tone="indigo">scenario: {scenarioHeader}</Badge> : null}
          </header>

          <div className="space-y-4 px-5 py-4">
            {result.issues.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-[13px] font-semibold text-rose-800">
                  {result.issues.length} validation{" "}
                  {result.issues.length === 1 ? "error" : "errors"} returned
                </p>
                <ul className="mt-2 space-y-1.5">
                  {result.issues.map((issue, index) => (
                    <li
                      key={`${issue.field}-${index}`}
                      className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]"
                    >
                      <code className="font-mono font-semibold text-rose-800">{issue.field}</code>
                      <span className="text-rose-700">{issue.message}</span>
                      {issue.rule ? (
                        <span className="font-mono text-[11.5px] text-rose-500">
                          [{issue.rule}]
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Response headers
              </h3>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-[12.5px]">
                  <tbody className="divide-y divide-slate-100">
                    {result.headers.map(([key, value]) => (
                      <tr key={key}>
                        <td className="w-1/3 bg-slate-50 px-3 py-1.5 font-mono text-slate-600">
                          {key}
                        </td>
                        <td className="px-3 py-1.5 font-mono break-all text-slate-800">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
                Response body
              </h3>
              <CodeBlock code={result.bodyText} copyable maxHeight={420} />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default TryIt;
