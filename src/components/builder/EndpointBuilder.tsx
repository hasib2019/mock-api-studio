"use client";

/**
 * The endpoint builder — register a mock endpoint, the payload contract it
 * enforces and the responses it can return.
 *
 * The whole `EndpointDef` lives in one state object and is edited immutably.
 * JSON bodies are kept twice: as parsed values on the endpoint (what gets
 * saved) and as raw text drafts (what the user is typing); a draft only flows
 * back into the endpoint once it parses.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { FieldList } from "@/components/builder/FieldEditor";
import { ScenarioEditor } from "@/components/builder/ScenarioEditor";
import { TokenHelp } from "@/components/builder/TokenHelp";
import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  ConfirmDialog,
  CopyButton,
  Input,
  JsonEditor,
  KeyValueEditor,
  MethodBadge,
  Modal,
  Select,
  Tabs,
  Textarea,
  Toggle,
} from "@/components/ui";
import { ApiError, adminApi } from "@/lib/api-client";
import { newScenario } from "@/lib/defaults";
import { normalizePath } from "@/lib/ids";
import { renderTemplate } from "@/lib/template";
import {
  AUTH_TYPES,
  CONTENT_TYPES,
  HTTP_METHODS,
  type AuthSpec,
  type AuthType,
  type ContentType,
  type EndpointDef,
  type EndpointInput,
  type ErrorTemplate,
  type FieldDef,
  type FieldType,
  type HttpMethod,
  type ProjectDef,
  type RequestSpec,
  type ResponseScenario,
  type TemplateContext,
  type ValidationMode,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Constants + small helpers
 * ------------------------------------------------------------------ */

type TabId = "overview" | "request" | "responses" | "preview";
type PayloadTarget = "body" | "query" | "headers";
type ErrorTemplateKey = "validationError" | "authError";

const TAB_IDS: ReadonlyArray<TabId> = ["overview", "request", "responses", "preview"];

const VALIDATION_DRAFT = "validationError";
const AUTH_DRAFT = "authError";

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({ value: method, label: method }));

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  "application/json": "application/json",
  "application/x-www-form-urlencoded": "application/x-www-form-urlencoded",
  none: "No body",
};

const CONTENT_TYPE_OPTIONS = CONTENT_TYPES.map((value) => ({
  value,
  label: CONTENT_TYPE_LABELS[value],
}));

const AUTH_LABELS: Record<AuthType, string> = {
  none: "No authentication",
  apiKey: "API key header",
  bearer: "Bearer token",
  basic: "Basic auth",
};

const AUTH_OPTIONS = AUTH_TYPES.map((value) => ({ value, label: AUTH_LABELS[value] }));

const VALIDATION_MODE_OPTIONS = [
  { value: "collectAll", label: "Collect every error" },
  { value: "failFast", label: "Stop at the first error" },
];

const PAYLOAD_TARGET_OPTIONS = [
  { value: "body", label: "Body" },
  { value: "query", label: "Query string" },
  { value: "headers", label: "Headers" },
];

const BODY_METHODS: ReadonlyArray<HttpMethod> = ["POST", "PUT", "PATCH", "DELETE"];

const SAMPLE_PATH_VALUE = "123";

/**
 * `window.location.origin` read the hydration-safe way: the server snapshot is
 * empty, the client snapshot is the real origin, and the value never changes
 * afterwards so the subscription is a no-op.
 */
const NOOP = () => {};
const subscribeToOrigin = () => NOOP;
const readOrigin = () => window.location.origin;
const readServerOrigin = () => "";

function isTabId(value: string): value is TabId {
  return TAB_IDS.includes(value as TabId);
}

function isMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as ReadonlyArray<string>).includes(value);
}

function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as ReadonlyArray<string>).includes(value);
}

function isAuthType(value: string): value is AuthType {
  return (AUTH_TYPES as ReadonlyArray<string>).includes(value);
}

function toInt(text: string, fallback: number): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return fallback;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringifyBody(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

function parseDraft(text: string): { ok: boolean; value: unknown } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false, value: undefined };
  }
}

function scenarioDraftKey(id: string): string {
  return `scenario:${id}`;
}

function buildDrafts(endpoint: EndpointDef): Record<string, string> {
  const drafts: Record<string, string> = {
    [VALIDATION_DRAFT]: stringifyBody(endpoint.validationError.body),
    [AUTH_DRAFT]: stringifyBody(endpoint.authError.body),
  };
  for (const scenario of endpoint.scenarios) {
    drafts[scenarioDraftKey(scenario.id)] = stringifyBody(scenario.body);
  }
  return drafts;
}

/** The payload the admin API accepts — `createdAt`/`updatedAt` are server-owned. */
function toInput(endpoint: EndpointDef): EndpointInput {
  return {
    id: endpoint.id,
    projectId: endpoint.projectId,
    name: endpoint.name,
    description: endpoint.description,
    method: endpoint.method,
    path: endpoint.path,
    enabled: endpoint.enabled,
    auth: endpoint.auth,
    request: endpoint.request,
    scenarios: endpoint.scenarios,
    validationError: endpoint.validationError,
    authError: endpoint.authError,
    delayMs: endpoint.delayMs,
    tags: endpoint.tags,
    notes: endpoint.notes,
  };
}

function signatureOf(endpoint: EndpointDef, drafts: Record<string, string>): string {
  return JSON.stringify({ endpoint: toInput(endpoint), drafts });
}

function readFields(spec: RequestSpec, target: PayloadTarget): FieldDef[] {
  if (target === "query") return spec.query;
  if (target === "headers") return spec.headers;
  return spec.body;
}

function writeFields(spec: RequestSpec, target: PayloadTarget, fields: FieldDef[]): RequestSpec {
  if (target === "query") return { ...spec, query: fields };
  if (target === "headers") return { ...spec, headers: fields };
  return { ...spec, body: fields };
}

function displayPath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function pathParams(path: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const segment of displayPath(path).split("/")) {
    if (segment.startsWith(":") && segment.length > 1) params[segment.slice(1)] = SAMPLE_PATH_VALUE;
  }
  return params;
}

/* ------------------------------------------------------------------ *
 * Sample payload generation (Preview tab)
 * ------------------------------------------------------------------ */

const SAMPLE_DEPTH = 5;

function sampleForType(type: FieldType | undefined): unknown {
  switch (type) {
    case "number":
      return 100;
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "object":
      return {};
    case "array":
      return [];
    case "any":
      return null;
    default:
      return "string";
  }
}

function sampleField(field: FieldDef, depth: number): unknown {
  if (field.example !== undefined) return field.example;
  if (field.defaultValue !== undefined) return field.defaultValue;

  if (field.type === "object") {
    return depth >= SAMPLE_DEPTH ? {} : sampleObject(field.children, depth + 1);
  }
  if (field.type === "array") {
    if (field.itemType === "object") {
      return depth >= SAMPLE_DEPTH ? [] : [sampleObject(field.children, depth + 1)];
    }
    return [sampleForType(field.itemType ?? "string")];
  }

  const allowed = field.rules.find((rule) => rule.enabled && rule.rule === "enum");
  if (allowed && Array.isArray(allowed.value) && allowed.value.length > 0) return allowed.value[0];

  return sampleForType(field.type);
}

function sampleObject(fields: FieldDef[], depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    out[name] = sampleField(field, depth);
  }
  return out;
}

function asStringRecord(source: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  }
  return out;
}

function encodeForm(source: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) params.set(key, value);
  return params.toString();
}

/* ------------------------------------------------------------------ *
 * Local validation
 * ------------------------------------------------------------------ */

interface BuilderErrors {
  name?: string;
  path?: string;
  fields: Record<string, string>;
  scenarios: Record<string, string>;
  bodies: Record<string, string>;
}

const NO_ERRORS: BuilderErrors = { fields: {}, scenarios: {}, bodies: {} };

const PATH_RE = /^\/[A-Za-z0-9\-._~/:*]*$/;

function collectFieldProblems(
  fields: FieldDef[],
  location: string,
  into: Record<string, string>,
  problems: string[],
): void {
  const seen = new Map<string, true>();
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) {
      into[field.id] = "A field name is required";
      problems.push(`a ${location} field is missing its name`);
    } else if (seen.has(name.toLowerCase())) {
      into[field.id] = `Duplicate name “${name}” at this level`;
      problems.push(`${location} has two fields called “${name}”`);
    } else {
      seen.set(name.toLowerCase(), true);
    }
    if (field.children.length > 0) collectFieldProblems(field.children, location, into, problems);
  }
}

/* ------------------------------------------------------------------ *
 * Collapsible section (Request tab)
 * ------------------------------------------------------------------ */

function Section({
  title,
  description,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 5.5l4.5 4.5L8 14.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <Badge tone={count > 0 ? "indigo" : "gray"}>{count}</Badge>
        <span className="ml-auto hidden truncate pl-3 text-[12px] text-slate-500 sm:block">
          {description}
        </span>
      </button>
      {open ? <div className="border-t border-slate-200 px-4 py-3.5">{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

export function EndpointBuilder({
  project,
  initial,
  mode,
}: {
  project: ProjectDef;
  initial: EndpointDef;
  mode: "create" | "edit";
}) {
  const router = useRouter();

  const [endpoint, setEndpoint] = React.useState<EndpointDef>(initial);
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() => buildDrafts(initial));
  const [savedSignature, setSavedSignature] = React.useState(() =>
    signatureOf(initial, buildDrafts(initial)),
  );
  const [tagsText, setTagsText] = React.useState(() => initial.tags.join(", "));
  const [errors, setErrors] = React.useState<BuilderErrors>(NO_ERRORS);
  const [tab, setTab] = React.useState<TabId>("overview");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const origin = React.useSyncExternalStore(subscribeToOrigin, readOrigin, readServerOrigin);
  const [openSections, setOpenSections] = React.useState<Record<PayloadTarget, boolean>>({
    body: true,
    query: false,
    headers: false,
  });

  const [inferOpen, setInferOpen] = React.useState(false);
  const [inferTarget, setInferTarget] = React.useState<PayloadTarget>("body");
  const [inferMode, setInferMode] = React.useState<"append" | "replace">("append");
  const [inferRunning, setInferRunning] = React.useState(false);
  const [inferText, setInferText] = React.useState(
    '{\n  "accountNumber": "1234567890",\n  "amount": 1500.5,\n  "currency": "BDT"\n}',
  );

  const signature = React.useMemo(() => signatureOf(endpoint, drafts), [endpoint, drafts]);
  const dirty = signature !== savedSignature;

  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ---------------------------- mutations ---------------------------- */

  /** Every edit funnels through here so stale inline errors clear themselves. */
  const mutate = React.useCallback((updater: (prev: EndpointDef) => EndpointDef) => {
    setEndpoint(updater);
    setErrors(NO_ERRORS);
  }, []);

  const update = React.useCallback(
    (patch: Partial<EndpointDef>) => {
      mutate((prev) => ({ ...prev, ...patch }));
    },
    [mutate],
  );

  const updateRequest = React.useCallback(
    (patch: Partial<RequestSpec>) => {
      mutate((prev) => ({ ...prev, request: { ...prev.request, ...patch } }));
    },
    [mutate],
  );

  const updateAuth = React.useCallback(
    (patch: Partial<AuthSpec>) => {
      mutate((prev) => ({ ...prev, auth: { ...prev.auth, ...patch } }));
    },
    [mutate],
  );

  function setPayloadFields(target: PayloadTarget, fields: FieldDef[]) {
    mutate((prev) => ({ ...prev, request: writeFields(prev.request, target, fields) }));
  }

  function patchErrorTemplate(which: ErrorTemplateKey, patch: Partial<ErrorTemplate>) {
    mutate((prev) =>
      which === "validationError"
        ? { ...prev, validationError: { ...prev.validationError, ...patch } }
        : { ...prev, authError: { ...prev.authError, ...patch } },
    );
  }

  function setErrorBodyText(which: ErrorTemplateKey, text: string) {
    const key = which === "validationError" ? VALIDATION_DRAFT : AUTH_DRAFT;
    setDrafts((prev) => ({ ...prev, [key]: text }));
    setErrors(NO_ERRORS);
    const parsed = parseDraft(text);
    if (parsed.ok) patchErrorTemplate(which, { body: parsed.value });
  }

  function setScenarioBodyText(id: string, text: string) {
    setDrafts((prev) => ({ ...prev, [scenarioDraftKey(id)]: text }));
    setErrors(NO_ERRORS);
    const parsed = parseDraft(text);
    if (!parsed.ok) return;
    mutate((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => (s.id === id ? { ...s, body: parsed.value } : s)),
    }));
  }

  function updateScenario(next: ResponseScenario) {
    mutate((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => (s.id === next.id ? next : s)),
    }));
  }

  function addScenario() {
    const scenario = newScenario({
      name: `Scenario ${endpoint.scenarios.length + 1}`,
      isDefault: endpoint.scenarios.length === 0,
    });
    mutate((prev) => ({ ...prev, scenarios: [...prev.scenarios, scenario] }));
    setDrafts((prev) => ({
      ...prev,
      [scenarioDraftKey(scenario.id)]: stringifyBody(scenario.body),
    }));
  }

  function removeScenario(id: string) {
    mutate((prev) => {
      const scenarios = prev.scenarios.filter((s) => s.id !== id);
      if (scenarios.length > 0 && !scenarios.some((s) => s.isDefault)) {
        scenarios[0] = { ...scenarios[0], isDefault: true };
      }
      return { ...prev, scenarios };
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[scenarioDraftKey(id)];
      return next;
    });
  }

  function moveScenario(id: string, direction: -1 | 1) {
    mutate((prev) => {
      const index = prev.scenarios.findIndex((s) => s.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.scenarios.length) return prev;
      const scenarios = [...prev.scenarios];
      const [moved] = scenarios.splice(index, 1);
      scenarios.splice(target, 0, moved);
      return { ...prev, scenarios };
    });
  }

  function makeDefaultScenario(id: string) {
    mutate((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s) => ({ ...s, isDefault: s.id === id })),
    }));
  }

  /* --------------------------- schema infer --------------------------- */

  async function runInfer() {
    const parsed = parseDraft(inferText);
    if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") {
      toast("Paste a valid JSON object or array first", "error");
      return;
    }

    setInferRunning(true);
    try {
      const inferred = await adminApi.inferSchema(parsed.value, inferTarget);
      if (inferred.length === 0) {
        toast("Nothing could be inferred from that sample", "error");
        return;
      }
      const existing = readFields(endpoint.request, inferTarget);
      const next = inferMode === "replace" ? inferred : [...existing, ...inferred];
      setPayloadFields(inferTarget, next);
      setOpenSections((prev) => ({ ...prev, [inferTarget]: true }));
      setInferOpen(false);
      setTab("request");
      toast(
        `${inferred.length} field${inferred.length === 1 ? "" : "s"} ${
          inferMode === "replace" ? "generated" : "appended"
        }`,
        "success",
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not read that sample", "error");
    } finally {
      setInferRunning(false);
    }
  }

  /* ------------------------------ saving ------------------------------ */

  function validate(): BuilderErrors | null {
    const next: BuilderErrors = { fields: {}, scenarios: {}, bodies: {} };
    const problems: string[] = [];
    const flagged: TabId[] = [];
    const mark = (candidate: TabId) => {
      if (!flagged.includes(candidate)) flagged.push(candidate);
    };

    if (!endpoint.name.trim()) {
      next.name = "Give the endpoint a name";
      problems.push("the endpoint needs a name");
      mark("overview");
    }

    const path = normalizePath(endpoint.path);
    if (!path || path === "/") {
      next.path = "A path is required, e.g. /accounts/:accountId/transfer";
      problems.push("the endpoint needs a path");
      mark("overview");
    } else if (!PATH_RE.test(path)) {
      next.path = "Only letters, digits and - . _ ~ / : * are allowed";
      problems.push("the path contains unsupported characters");
      mark("overview");
    }

    const beforeFields = problems.length;
    collectFieldProblems(endpoint.request.body, "the body", next.fields, problems);
    collectFieldProblems(endpoint.request.query, "the query", next.fields, problems);
    collectFieldProblems(endpoint.request.headers, "the headers", next.fields, problems);
    if (problems.length > beforeFields) mark("request");

    if (endpoint.scenarios.length === 0) {
      problems.push("at least one response scenario is required");
      mark("responses");
    }

    for (const scenario of endpoint.scenarios) {
      if (!scenario.name.trim()) {
        next.scenarios[scenario.id] = "Name this scenario";
        problems.push("a scenario is missing its name");
        mark("responses");
      } else if (!Number.isInteger(scenario.status) || scenario.status < 100 || scenario.status > 599) {
        next.scenarios[scenario.id] = `“${scenario.name}” needs a status between 100 and 599`;
        problems.push(`“${scenario.name}” has an invalid status code`);
        mark("responses");
      }
      const key = scenarioDraftKey(scenario.id);
      if (!parseDraft(drafts[key] ?? "").ok) {
        next.bodies[key] = "Invalid JSON";
        problems.push(`the body of “${scenario.name || "a scenario"}” is not valid JSON`);
        mark("responses");
      }
    }

    for (const key of [VALIDATION_DRAFT, AUTH_DRAFT]) {
      if (!parseDraft(drafts[key] ?? "").ok) {
        next.bodies[key] = "Invalid JSON";
        problems.push(
          `the ${key === VALIDATION_DRAFT ? "validation" : "auth"} error body is not valid JSON`,
        );
        mark("responses");
      }
    }

    if (problems.length === 0) return null;

    if (flagged.length > 0) setTab(flagged[0]);
    toast(
      problems.length === 1
        ? `Cannot save — ${problems[0]}.`
        : `Cannot save — ${problems[0]} (and ${problems.length - 1} more).`,
      "error",
    );
    return next;
  }

  async function save() {
    if (saving) return;

    const problems = validate();
    if (problems) {
      setErrors(problems);
      return;
    }

    const normalized: EndpointDef = {
      ...endpoint,
      name: endpoint.name.trim(),
      path: normalizePath(endpoint.path),
    };

    setSaving(true);
    try {
      const saved =
        mode === "create"
          ? await adminApi.createEndpoint(toInput(normalized))
          : await adminApi.updateEndpoint(normalized.id, toInput(normalized));

      const savedDrafts = buildDrafts(saved);
      mutate(() => saved);
      setDrafts(savedDrafts);
      setTagsText(saved.tags.join(", "));
      setSavedSignature(signatureOf(saved, savedDrafts));
      toast(mode === "create" ? "Endpoint created" : "Endpoint saved", "success");

      if (mode === "create") {
        router.replace(`/projects/${saved.projectId}/endpoints/${saved.id}`);
      }
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save the endpoint", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await adminApi.deleteEndpoint(endpoint.id);
      setSavedSignature(signature);
      toast("Endpoint deleted", "success");
      router.replace(`/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not delete the endpoint", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  /* ----------------------------- preview ------------------------------ */

  const shownPath = displayPath(endpoint.path);
  const mockUrl = `${origin}/api/mock/${project.slug}${shownPath}`;

  const sampleBody = React.useMemo(
    () => sampleObject(endpoint.request.body, 0),
    [endpoint.request.body],
  );
  const sampleQuery = React.useMemo(
    () => asStringRecord(sampleObject(endpoint.request.query, 0)),
    [endpoint.request.query],
  );
  const sampleHeaders = React.useMemo(
    () => asStringRecord(sampleObject(endpoint.request.headers, 0)),
    [endpoint.request.headers],
  );

  const sampleBodyText = React.useMemo(() => stringifyBody(sampleBody), [sampleBody]);

  const curl = React.useMemo(() => {
    const query = encodeForm(sampleQuery);
    const url = `${origin || "http://localhost:3000"}/api/mock/${project.slug}${shownPath.replace(
      /\/:([A-Za-z0-9_]+)/g,
      `/${SAMPLE_PATH_VALUE}`,
    )}${query ? `?${query}` : ""}`;

    const lines = [`curl -X ${endpoint.method} "${url}"`];
    const sendsBody =
      endpoint.request.contentType !== "none" && BODY_METHODS.includes(endpoint.method);

    if (sendsBody) lines.push(`  -H "content-type: ${endpoint.request.contentType}"`);
    for (const [key, value] of Object.entries(sampleHeaders)) {
      lines.push(`  -H "${key}: ${value}"`);
    }
    if (endpoint.auth.type === "apiKey") {
      lines.push(`  -H "${endpoint.auth.headerName || "x-api-key"}: ${endpoint.auth.token ?? ""}"`);
    } else if (endpoint.auth.type === "bearer") {
      lines.push(`  -H "Authorization: Bearer ${endpoint.auth.token ?? ""}"`);
    } else if (endpoint.auth.type === "basic") {
      lines.push(`  -u "${endpoint.auth.username ?? ""}:${endpoint.auth.password ?? ""}"`);
    }
    if (sendsBody) {
      lines.push(
        endpoint.request.contentType === "application/json"
          ? `  -d '${sampleBodyText || "{}"}'`
          : `  -d "${encodeForm(asStringRecord(sampleBody))}"`,
      );
    }
    return lines.join(" \\\n");
  }, [
    endpoint.auth,
    endpoint.method,
    endpoint.request.contentType,
    origin,
    project.slug,
    sampleBody,
    sampleBodyText,
    sampleHeaders,
    sampleQuery,
    shownPath,
  ]);

  const defaultScenario =
    endpoint.scenarios.find((scenario) => scenario.isDefault) ?? endpoint.scenarios[0] ?? null;

  const renderedResponse = React.useMemo(() => {
    if (!defaultScenario) return "// no response scenario registered yet";
    const ctx: TemplateContext = {
      body: sampleBody,
      query: sampleQuery,
      headers: sampleHeaders,
      path: pathParams(endpoint.path),
      meta: { method: endpoint.method, path: shownPath, endpoint: endpoint.name },
    };
    try {
      return stringifyBody(renderTemplate(defaultScenario.body, ctx)) || "null";
    } catch {
      return stringifyBody(defaultScenario.body) || "null";
    }
  }, [
    defaultScenario,
    endpoint.method,
    endpoint.name,
    endpoint.path,
    sampleBody,
    sampleHeaders,
    sampleQuery,
    shownPath,
  ]);

  const fieldCount =
    endpoint.request.body.length + endpoint.request.query.length + endpoint.request.headers.length;

  const existingTargetCount = readFields(endpoint.request, inferTarget).length;

  /* ------------------------------- view ------------------------------- */

  return (
    <div className="pb-16">
      {/* ---------------------------- header ---------------------------- */}
      <div className="sticky top-0 z-20 -mx-8 -mt-8 mb-5 border-b border-slate-200 bg-slate-50/90 px-8 py-3.5 backdrop-blur">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <Link
            href={`/projects/${project.id}`}
            title="Back to the project"
            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M12 5l-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <div className="min-w-56 flex-1">
            <input
              value={endpoint.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Endpoint name"
              aria-label="Endpoint name"
              spellCheck={false}
              className={`-ml-1.5 w-full rounded-md border bg-transparent px-1.5 py-0.5 text-lg leading-7 font-semibold tracking-tight text-slate-900 transition-colors placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:outline-none ${
                errors.name
                  ? "border-rose-400 bg-rose-50/40"
                  : "border-transparent hover:border-slate-300 hover:bg-white focus:border-indigo-500"
              }`}
            />
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <span className="truncate font-mono text-[12px] text-slate-500">
                {mockUrl || `/api/mock/${project.slug}${shownPath}`}
              </span>
              <CopyButton value={mockUrl} label="URL" />
              <span className="text-[12px] text-slate-400">in {project.name}</span>
            </div>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            {dirty ? <Badge tone="amber">Unsaved changes</Badge> : null}
            <Toggle
              checked={endpoint.enabled}
              onChange={(checked) => update({ enabled: checked })}
              label={endpoint.enabled ? "Enabled" : "Disabled"}
            />
            {mode === "edit" ? (
              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : (
              <Button variant="outline" onClick={() => router.push(`/projects/${project.id}`)}>
                Cancel
              </Button>
            )}
            <Button onClick={save} loading={saving}>
              {mode === "create" ? "Create endpoint" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        className="mb-5"
        active={tab}
        onChange={(id) => {
          if (isTabId(id)) setTab(id);
        }}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "request", label: "Request", badge: fieldCount || undefined },
          { id: "responses", label: "Responses", badge: endpoint.scenarios.length || undefined },
          { id: "preview", label: "Preview" },
        ]}
      />

      {/* --------------------------- overview --------------------------- */}
      {tab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card title="Basics" description="How the endpoint is identified and routed.">
              <div className="space-y-4">
                <Input
                  label="Name"
                  placeholder="NPSB Fund Transfer"
                  value={endpoint.name}
                  error={errors.name}
                  onChange={(event) => update({ name: event.target.value })}
                />

                <Textarea
                  label="Description"
                  rows={2}
                  placeholder="What this endpoint stands in for."
                  value={endpoint.description ?? ""}
                  onChange={(event) => update({ description: event.target.value })}
                />

                <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                  <Select
                    label="Method"
                    value={endpoint.method}
                    options={METHOD_OPTIONS}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (isMethod(next)) update({ method: next });
                    }}
                  />
                  <Input
                    label="Path"
                    mono
                    spellCheck={false}
                    placeholder="/accounts/:accountId/transfer"
                    hint="A segment starting with “:” becomes a path parameter, readable as {{path.accountId}}."
                    value={endpoint.path}
                    error={errors.path}
                    onChange={(event) => update({ path: event.target.value })}
                    onBlur={(event) => update({ path: normalizePath(event.target.value) })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Tags"
                    placeholder="npsb, transfer, retail"
                    hint="Comma separated — used for filtering and the docs page."
                    value={tagsText}
                    onChange={(event) => {
                      setTagsText(event.target.value);
                      update({
                        tags: event.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter((tag) => tag.length > 0),
                      });
                    }}
                  />
                  <Input
                    label="Artificial delay (ms)"
                    inputMode="numeric"
                    placeholder="0"
                    hint="Applied to every response, on top of the scenario delay."
                    value={endpoint.delayMs === 0 ? "" : String(endpoint.delayMs)}
                    onChange={(event) => update({ delayMs: toInt(event.target.value, 0) })}
                  />
                </div>

                <Textarea
                  label="Notes"
                  rows={3}
                  placeholder="Anything the team should know — upstream quirks, ticket links, sample credentials."
                  value={endpoint.notes ?? ""}
                  onChange={(event) => update({ notes: event.target.value })}
                />
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card
              title="Authentication"
              description="Checked before the payload is validated."
            >
              <div className="space-y-4">
                <Select
                  label="Type"
                  value={endpoint.auth.type}
                  options={AUTH_OPTIONS}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (!isAuthType(next)) return;
                    updateAuth({
                      type: next,
                      headerName:
                        next === "apiKey" ? (endpoint.auth.headerName ?? "x-api-key") : undefined,
                    });
                  }}
                />

                {endpoint.auth.type === "apiKey" ? (
                  <>
                    <Input
                      label="Header name"
                      mono
                      spellCheck={false}
                      placeholder="x-api-key"
                      value={endpoint.auth.headerName ?? ""}
                      onChange={(event) => updateAuth({ headerName: event.target.value })}
                    />
                    <Input
                      label="Expected value"
                      mono
                      spellCheck={false}
                      placeholder="sandbox-key-001"
                      value={endpoint.auth.token ?? ""}
                      onChange={(event) => updateAuth({ token: event.target.value })}
                    />
                  </>
                ) : null}

                {endpoint.auth.type === "bearer" ? (
                  <Input
                    label="Expected token"
                    mono
                    spellCheck={false}
                    hint="Compared against the Authorization: Bearer … header."
                    placeholder="eyJhbGciOi…"
                    value={endpoint.auth.token ?? ""}
                    onChange={(event) => updateAuth({ token: event.target.value })}
                  />
                ) : null}

                {endpoint.auth.type === "basic" ? (
                  <>
                    <Input
                      label="Username"
                      mono
                      spellCheck={false}
                      value={endpoint.auth.username ?? ""}
                      onChange={(event) => updateAuth({ username: event.target.value })}
                    />
                    <Input
                      label="Password"
                      mono
                      spellCheck={false}
                      value={endpoint.auth.password ?? ""}
                      onChange={(event) => updateAuth({ password: event.target.value })}
                    />
                  </>
                ) : null}

                {endpoint.auth.type === "none" ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[13px] leading-5 text-slate-500">
                    The endpoint is open — every caller reaches the validation step.
                  </p>
                ) : (
                  <p className="text-[13px] leading-5 text-slate-500">
                    A failed check returns the auth error template on the Responses tab.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ---------------------------- request --------------------------- */}
      {tab === "request" ? (
        <div className="space-y-5">
          <Card
            title="Payload rules"
            description="How the incoming request is parsed and how strictly it is checked."
            actions={
              <Button variant="secondary" size="sm" onClick={() => setInferOpen(true)}>
                Generate from sample JSON
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Content type"
                value={endpoint.request.contentType}
                options={CONTENT_TYPE_OPTIONS}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isContentType(next)) updateRequest({ contentType: next });
                }}
              />
              <Select
                label="Validation mode"
                value={endpoint.request.validationMode}
                options={VALIDATION_MODE_OPTIONS}
                onChange={(event) =>
                  updateRequest({
                    validationMode:
                      event.target.value === "failFast"
                        ? ("failFast" as ValidationMode)
                        : ("collectAll" as ValidationMode),
                  })
                }
              />
              <div className="flex items-center pt-5">
                <Toggle
                  checked={endpoint.request.allowUnknownFields}
                  onChange={(checked) => updateRequest({ allowUnknownFields: checked })}
                  label="Allow unknown fields"
                />
              </div>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-slate-500">
              {endpoint.request.allowUnknownFields
                ? "Unregistered body and query keys pass straight through."
                : "Unregistered body and query keys are rejected. Headers are never checked this way — proxies add their own."}
            </p>
          </Card>

          <Section
            title="Body"
            description="Validated against the parsed request body"
            count={endpoint.request.body.length}
            open={openSections.body}
            onToggle={() => setOpenSections((prev) => ({ ...prev, body: !prev.body }))}
          >
            <FieldList
              fields={endpoint.request.body}
              errors={errors.fields}
              onChange={(fields) => setPayloadFields("body", fields)}
            />
          </Section>

          <Section
            title="Query string"
            description="Values arrive as strings and are coerced to the declared type"
            count={endpoint.request.query.length}
            open={openSections.query}
            onToggle={() => setOpenSections((prev) => ({ ...prev, query: !prev.query }))}
          >
            <FieldList
              fields={endpoint.request.query}
              errors={errors.fields}
              onChange={(fields) => setPayloadFields("query", fields)}
              emptyLabel="No query parameters registered."
            />
          </Section>

          <Section
            title="Headers"
            description="Matched case-insensitively; only registered headers are checked"
            count={endpoint.request.headers.length}
            open={openSections.headers}
            onToggle={() => setOpenSections((prev) => ({ ...prev, headers: !prev.headers }))}
          >
            <FieldList
              fields={endpoint.request.headers}
              errors={errors.fields}
              onChange={(fields) => setPayloadFields("headers", fields)}
              emptyLabel="No headers registered."
            />
          </Section>
        </div>
      ) : null}

      {/* --------------------------- responses -------------------------- */}
      {tab === "responses" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Response scenarios</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-slate-500">
                Evaluated top to bottom — the first enabled scenario whose conditions all pass is
                returned. If none match, the default is used.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={addScenario}>
              Add scenario
            </Button>
          </div>

          {endpoint.scenarios.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-[13px] text-slate-500">
              No scenario registered yet — the endpoint would have nothing to return.
            </p>
          ) : (
            <div className="space-y-4">
              {endpoint.scenarios.map((scenario, index) => (
                <ScenarioEditor
                  key={scenario.id}
                  scenario={scenario}
                  index={index}
                  total={endpoint.scenarios.length}
                  bodyText={drafts[scenarioDraftKey(scenario.id)] ?? ""}
                  error={errors.scenarios[scenario.id]}
                  onChange={updateScenario}
                  onBodyTextChange={(text) => setScenarioBodyText(scenario.id, text)}
                  onMakeDefault={() => makeDefaultScenario(scenario.id)}
                  onMove={(direction) => moveScenario(scenario.id, direction)}
                  onRemove={() => removeScenario(scenario.id)}
                />
              ))}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Validation error response"
              description="Returned when the payload fails the registered rules."
            >
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Status"
                    inputMode="numeric"
                    value={String(endpoint.validationError.status)}
                    onChange={(event) =>
                      patchErrorTemplate("validationError", {
                        status: toInt(event.target.value, 0),
                      })
                    }
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">Headers</p>
                  <KeyValueEditor
                    value={endpoint.validationError.headers}
                    onChange={(headers) => patchErrorTemplate("validationError", { headers })}
                    addLabel="Add header"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">
                    Body — {"{{errors}}"}, {"{{errorCount}}"} and {"{{firstError.field}}"} are
                    available here
                  </p>
                  <JsonEditor
                    value={drafts[VALIDATION_DRAFT] ?? ""}
                    onChange={(text) => setErrorBodyText("validationError", text)}
                    minHeight={200}
                  />
                </div>
              </div>
            </Card>

            <Card
              title="Auth error response"
              description="Returned when the credentials above do not match."
            >
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Status"
                    inputMode="numeric"
                    value={String(endpoint.authError.status)}
                    onChange={(event) =>
                      patchErrorTemplate("authError", { status: toInt(event.target.value, 0) })
                    }
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">Headers</p>
                  <KeyValueEditor
                    value={endpoint.authError.headers}
                    onChange={(headers) => patchErrorTemplate("authError", { headers })}
                    addLabel="Add header"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">Body</p>
                  <JsonEditor
                    value={drafts[AUTH_DRAFT] ?? ""}
                    onChange={(text) => setErrorBodyText("authError", text)}
                    minHeight={200}
                  />
                </div>
              </div>
            </Card>
          </div>

          <Card title="Template tokens" description="Click a token to copy it.">
            <TokenHelp />
          </Card>
        </div>
      ) : null}

      {/* ---------------------------- preview --------------------------- */}
      {tab === "preview" ? (
        <div className="space-y-5">
          <Card
            title="Mock URL"
            description="Point your integration here — no auth on the studio, only what you registered above."
            actions={<CopyButton value={mockUrl} label="Copy" />}
          >
            <div className="flex flex-wrap items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <code className="font-mono text-[13px] break-all text-slate-700">{mockUrl}</code>
            </div>
            {Object.keys(pathParams(endpoint.path)).length > 0 ? (
              <p className="mt-2 text-[13px] leading-5 text-slate-500">
                Path parameters:{" "}
                {Object.keys(pathParams(endpoint.path))
                  .map((name) => `:${name}`)
                  .join(", ")}{" "}
                — the sample below substitutes “{SAMPLE_PATH_VALUE}”.
              </p>
            ) : null}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Sample request body"
              description="Built from each field's example, default or type."
            >
              <CodeBlock code={sampleBodyText || "{}"} copyable maxHeight={320} />
            </Card>

            <Card title="Example response" description="The default scenario, tokens rendered.">
              <CodeBlock code={renderedResponse} copyable maxHeight={320} />
              {defaultScenario ? (
                <p className="mt-2 text-[13px] leading-5 text-slate-500">
                  Scenario “{defaultScenario.name}” · status {defaultScenario.status} · delay{" "}
                  {endpoint.delayMs + defaultScenario.delayMs} ms
                </p>
              ) : null}
            </Card>
          </div>

          <Card title="curl" description="Copy-paste to try the endpoint from a terminal.">
            <CodeBlock code={curl} copyable />
          </Card>
        </div>
      ) : null}

      {/* --------------------------- dialogs ---------------------------- */}
      <Modal
        open={inferOpen}
        onClose={() => setInferOpen(false)}
        wide
        title="Generate fields from a sample"
        description="Paste a representative payload; every key becomes a registered field with an inferred type."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInferOpen(false)} disabled={inferRunning}>
              Cancel
            </Button>
            <Button onClick={runInfer} loading={inferRunning}>
              {inferMode === "replace" ? "Replace fields" : "Append fields"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Add to"
            value={inferTarget}
            options={PAYLOAD_TARGET_OPTIONS}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "body" || next === "query" || next === "headers") setInferTarget(next);
            }}
          />

          {existingTargetCount > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-[13px] leading-5 text-amber-900">
                {existingTargetCount} field{existingTargetCount === 1 ? " is" : "s are"} already
                registered there. What should happen to them?
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-amber-900">
                  <input
                    type="radio"
                    name="infer-mode"
                    className="h-4 w-4 accent-indigo-600"
                    checked={inferMode === "append"}
                    onChange={() => setInferMode("append")}
                  />
                  Keep them and append
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-amber-900">
                  <input
                    type="radio"
                    name="infer-mode"
                    className="h-4 w-4 accent-indigo-600"
                    checked={inferMode === "replace"}
                    onChange={() => setInferMode("replace")}
                  />
                  Replace them
                </label>
              </div>
            </div>
          ) : null}

          <JsonEditor value={inferText} onChange={setInferText} minHeight={220} />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        loading={deleting}
        title="Delete this endpoint?"
        message={
          <>
            <strong>{endpoint.name || "This endpoint"}</strong> and every scenario registered on it
            will be removed. Callers will start receiving 404 ENDPOINT_NOT_FOUND. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete endpoint"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default EndpointBuilder;
