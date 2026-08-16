/**
 * The registry: projects and endpoints, one row per record in Postgres
 * (`projects`, `endpoints` - see `@/lib/db`).
 *
 * Server only (touches `pg`). Files on disk (imported/exported JSON) are
 * still treated as untrusted, hand-editable input - see the `hydrate*`
 * functions below.
 */

import { ensureSchema, isUniqueViolation, query } from "@/lib/db";
import { withLock } from "@/lib/lock";
import { PROJECT_COLORS, newEndpoint, newProject } from "@/lib/defaults";
import { newId, normalizePath, slugify } from "@/lib/ids";
import { HTTP_METHODS } from "@/lib/types";
import type {
  Condition,
  EndpointDef,
  EndpointInput,
  ErrorTemplate,
  FieldDef,
  HttpMethod,
  ProjectDef,
  ProjectInput,
  RequestSpec,
  ResponseScenario,
  ValidationRule,
} from "@/lib/types";

export class StoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

/* ------------------------------------------------------------------ *
 * Plumbing
 * ------------------------------------------------------------------ */

const PROJECTS_LOCK = "store:projects";
const ENDPOINTS_LOCK = "store:endpoints";
/** Record ids double as a natural key elsewhere (exports, urls), so keep them boring. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function validId(id: string): string | null {
  return ID_PATTERN.test(id) ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function headerMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function stripUndefined<T extends object>(patch: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as T;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  const json = JSON.stringify(value);
  return json === undefined ? value : (JSON.parse(json) as T);
}

function methodOrNull(value: unknown): HttpMethod | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return HTTP_METHODS.find((method) => method === upper) ?? null;
}

function parseMethod(value: unknown, fallback: HttpMethod): HttpMethod {
  if (value === undefined || value === null || value === "") return fallback;
  const method = methodOrNull(value);
  if (!method) throw new StoreError(`Unsupported HTTP method "${String(value)}"`, 400);
  return method;
}

function requireText(value: unknown, label: string): string {
  const text = str(value).trim();
  if (!text) throw new StoreError(`${label} is required`, 400);
  return text;
}

/* ------------------------------------------------------------------ *
 * Hydration - rows are hand editable (import, direct SQL), so treat them as
 * untrusted the same way the old file-backed store treated JSON files.
 * ------------------------------------------------------------------ */

function hydrateProject(raw: unknown): ProjectDef | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id).trim();
  if (!id) return null;
  const now = new Date().toISOString();
  return {
    id,
    name: str(raw.name, id),
    slug: slugify(str(raw.slug, id)),
    description: str(raw.description),
    defaultHeaders: headerMap(raw.defaultHeaders),
    color: str(raw.color).trim() || PROJECT_COLORS[0],
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

function hydrateEndpoint(raw: unknown): EndpointDef | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id).trim();
  const projectId = str(raw.projectId).trim();
  if (!id || !projectId) return null;

  const base = newEndpoint(projectId, { ...(raw as unknown as Partial<EndpointDef>), id });
  return {
    ...base,
    method: methodOrNull(base.method) ?? "POST",
    path: normalizePath(base.path),
    auth: isRecord(base.auth) ? base.auth : { type: "none" },
    request: {
      ...base.request,
      body: asArray<FieldDef>(base.request.body),
      query: asArray<FieldDef>(base.request.query),
      headers: asArray<FieldDef>(base.request.headers),
    },
    scenarios: asArray<ResponseScenario>(base.scenarios),
    tags: asArray<string>(base.tags),
  };
}

/* ------------------------------------------------------------------ *
 * Bulk readers
 * ------------------------------------------------------------------ */

async function readAllProjects(): Promise<ProjectDef[]> {
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM projects");
  return rows.map((row) => hydrateProject(row.data)).filter((p): p is ProjectDef => p !== null);
}

async function readAllEndpoints(): Promise<EndpointDef[]> {
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM endpoints");
  return rows.map((row) => hydrateEndpoint(row.data)).filter((e): e is EndpointDef => e !== null);
}

function methodRank(method: HttpMethod): number {
  const index = HTTP_METHODS.indexOf(method);
  return index === -1 ? HTTP_METHODS.length : index;
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export async function listProjects(): Promise<ProjectDef[]> {
  const projects = await readAllProjects();
  return projects.sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));
}

export async function getProject(id: string): Promise<ProjectDef | null> {
  const recordId = validId(str(id).trim());
  if (!recordId) return null;
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM projects WHERE id = $1", [
    recordId,
  ]);
  return rows[0] ? hydrateProject(rows[0].data) : null;
}

export async function getProjectBySlug(slug: string): Promise<ProjectDef | null> {
  const wanted = slugify(str(slug));
  if (!wanted) return null;
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM projects WHERE slug = $1", [
    wanted,
  ]);
  return rows[0] ? hydrateProject(rows[0].data) : null;
}

export async function createProject(input: ProjectInput): Promise<ProjectDef> {
  return withLock(PROJECTS_LOCK, async () => {
    const name = requireText(input.name, "Project name");
    const slug = slugify(str(input.slug).trim() || name);
    if (!slug) throw new StoreError("Project slug is required", 400);

    const existing = await readAllProjects();
    if (existing.some((project) => project.slug === slug)) {
      throw new StoreError(`A project with the slug "${slug}" already exists`, 409);
    }

    const id = str(input.id).trim() || newId("pr");
    const recordId = validId(id);
    if (!recordId) throw new StoreError("Invalid project id", 400);
    if (existing.some((project) => project.id === recordId)) {
      throw new StoreError(`Project "${recordId}" already exists`, 409);
    }

    const now = new Date().toISOString();
    const project = newProject({
      ...input,
      id: recordId,
      name,
      slug,
      description: str(input.description),
      defaultHeaders: headerMap(input.defaultHeaders),
      color: str(input.color).trim() || PROJECT_COLORS[existing.length % PROJECT_COLORS.length],
      createdAt: now,
      updatedAt: now,
    });

    try {
      await query("INSERT INTO projects (id, slug, data) VALUES ($1, $2, $3)", [
        project.id,
        project.slug,
        JSON.stringify(project),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StoreError(`A project with the slug "${slug}" already exists`, 409);
      }
      throw error;
    }
    return project;
  });
}

export async function updateProject(id: string, patch: Partial<ProjectDef>): Promise<ProjectDef> {
  return withLock(PROJECTS_LOCK, async () => {
    const recordId = validId(str(id).trim());
    const current = recordId ? await getProject(recordId) : null;
    if (!recordId || !current) throw new StoreError("Project not found", 404);

    const clean = stripUndefined(patch);
    const name = "name" in clean ? requireText(clean.name, "Project name") : current.name;

    let slug = current.slug;
    if ("slug" in clean) {
      slug = slugify(str(clean.slug));
      if (!slug) throw new StoreError("Project slug is required", 400);
    }
    if (slug !== current.slug) {
      const existing = await readAllProjects();
      if (existing.some((project) => project.id !== current.id && project.slug === slug)) {
        throw new StoreError(`A project with the slug "${slug}" already exists`, 409);
      }
    }

    const next: ProjectDef = {
      ...current,
      ...clean,
      id: current.id,
      name,
      slug,
      defaultHeaders:
        "defaultHeaders" in clean ? headerMap(clean.defaultHeaders) : current.defaultHeaders,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await query("UPDATE projects SET slug = $2, data = $3 WHERE id = $1", [
        next.id,
        next.slug,
        JSON.stringify(next),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StoreError(`A project with the slug "${slug}" already exists`, 409);
      }
      throw error;
    }
    return next;
  });
}

/** Deletes the project and every endpoint that belongs to it (FK cascade). */
export async function deleteProject(id: string): Promise<void> {
  await withLock(PROJECTS_LOCK, async () => {
    const recordId = validId(str(id).trim());
    const current = recordId ? await getProject(recordId) : null;
    if (!recordId || !current) throw new StoreError("Project not found", 404);

    await withLock(ENDPOINTS_LOCK, async () => {
      await query("DELETE FROM projects WHERE id = $1", [recordId]);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export async function listEndpoints(projectId?: string): Promise<EndpointDef[]> {
  const endpoints = await readAllEndpoints();
  const wanted = str(projectId).trim();
  const filtered = wanted
    ? endpoints.filter((endpoint) => endpoint.projectId === wanted)
    : endpoints;
  return filtered.sort(
    (a, b) => a.path.localeCompare(b.path) || methodRank(a.method) - methodRank(b.method),
  );
}

export async function getEndpoint(id: string): Promise<EndpointDef | null> {
  const recordId = validId(str(id).trim());
  if (!recordId) return null;
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM endpoints WHERE id = $1", [
    recordId,
  ]);
  return rows[0] ? hydrateEndpoint(rows[0].data) : null;
}

export async function createEndpoint(input: EndpointInput): Promise<EndpointDef> {
  const projectId = requireText(input.projectId, "Project id");
  const project = await getProject(projectId);
  if (!project) throw new StoreError(`Project "${projectId}" not found`, 404);

  return withLock(ENDPOINTS_LOCK, async () => {
    const method = parseMethod(input.method, "POST");
    const endpointPath = normalizePath(str(input.path));
    const existing = await readAllEndpoints();

    if (
      existing.some(
        (endpoint) =>
          endpoint.projectId === project.id &&
          endpoint.method === method &&
          endpoint.path === endpointPath,
      )
    ) {
      throw new StoreError(`${method} ${endpointPath} is already registered in this project`, 409);
    }

    const id = str(input.id).trim() || newId("ep");
    const recordId = validId(id);
    if (!recordId) throw new StoreError("Invalid endpoint id", 400);
    if (existing.some((endpoint) => endpoint.id === recordId)) {
      throw new StoreError(`Endpoint "${recordId}" already exists`, 409);
    }

    const now = new Date().toISOString();
    const endpoint = newEndpoint(project.id, {
      ...input,
      id: recordId,
      name: str(input.name).trim() || "Untitled endpoint",
      method,
      path: endpointPath,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await query(
        "INSERT INTO endpoints (id, project_id, method, path, data) VALUES ($1, $2, $3, $4, $5)",
        [endpoint.id, endpoint.projectId, endpoint.method, endpoint.path, JSON.stringify(endpoint)],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StoreError(
          `${method} ${endpointPath} is already registered in this project`,
          409,
        );
      }
      throw error;
    }
    return endpoint;
  });
}

export async function updateEndpoint(
  id: string,
  patch: Partial<EndpointDef>,
): Promise<EndpointDef> {
  return withLock(ENDPOINTS_LOCK, async () => {
    const recordId = validId(str(id).trim());
    const current = recordId ? await getEndpoint(recordId) : null;
    if (!recordId || !current) throw new StoreError("Endpoint not found", 404);

    const clean = stripUndefined(patch);
    const projectId =
      "projectId" in clean ? requireText(clean.projectId, "Project id") : current.projectId;
    if (projectId !== current.projectId && !(await getProject(projectId))) {
      throw new StoreError(`Project "${projectId}" not found`, 404);
    }

    const method = "method" in clean ? parseMethod(clean.method, current.method) : current.method;
    const endpointPath = "path" in clean ? normalizePath(str(clean.path)) : current.path;
    const name = "name" in clean ? str(clean.name).trim() || current.name : current.name;

    if (
      method !== current.method ||
      endpointPath !== current.path ||
      projectId !== current.projectId
    ) {
      const existing = await readAllEndpoints();
      if (
        existing.some(
          (endpoint) =>
            endpoint.id !== current.id &&
            endpoint.projectId === projectId &&
            endpoint.method === method &&
            endpoint.path === endpointPath,
        )
      ) {
        throw new StoreError(
          `${method} ${endpointPath} is already registered in this project`,
          409,
        );
      }
    }

    const next: EndpointDef = {
      ...current,
      ...clean,
      id: current.id,
      projectId,
      name,
      method,
      path: endpointPath,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await query(
        "UPDATE endpoints SET project_id = $2, method = $3, path = $4, data = $5 WHERE id = $1",
        [next.id, next.projectId, next.method, next.path, JSON.stringify(next)],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StoreError(
          `${method} ${endpointPath} is already registered in this project`,
          409,
        );
      }
      throw error;
    }
    return next;
  });
}

export async function deleteEndpoint(id: string): Promise<void> {
  await withLock(ENDPOINTS_LOCK, async () => {
    const recordId = validId(str(id).trim());
    const current = recordId ? await getEndpoint(recordId) : null;
    if (!recordId || !current) throw new StoreError("Endpoint not found", 404);
    await query("DELETE FROM endpoints WHERE id = $1", [recordId]);
  });
}

/* ------------------------------------------------------------------ *
 * Duplication - every nested row gets a fresh id
 * ------------------------------------------------------------------ */

function cloneRule(rule: ValidationRule): ValidationRule {
  return {
    ...rule,
    id: newId("r"),
    value: Array.isArray(rule.value) ? [...rule.value] : rule.value,
  };
}

function cloneField(field: FieldDef): FieldDef {
  return {
    ...field,
    id: newId("f"),
    example: cloneJson(field.example),
    defaultValue: cloneJson(field.defaultValue),
    rules: asArray<ValidationRule>(field.rules).map(cloneRule),
    children: asArray<FieldDef>(field.children).map(cloneField),
  };
}

function cloneRequestSpec(spec: RequestSpec): RequestSpec {
  return {
    ...spec,
    body: asArray<FieldDef>(spec.body).map(cloneField),
    query: asArray<FieldDef>(spec.query).map(cloneField),
    headers: asArray<FieldDef>(spec.headers).map(cloneField),
  };
}

function cloneCondition(condition: Condition): Condition {
  return {
    ...condition,
    id: newId("c"),
    value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
  };
}

function cloneScenario(scenario: ResponseScenario): ResponseScenario {
  return {
    ...scenario,
    id: newId("s"),
    conditions: asArray<Condition>(scenario.conditions).map(cloneCondition),
    headers: { ...scenario.headers },
    body: cloneJson(scenario.body),
  };
}

function cloneErrorTemplate(template: ErrorTemplate): ErrorTemplate {
  return {
    status: template.status,
    headers: { ...template.headers },
    body: cloneJson(template.body),
  };
}

export async function duplicateEndpoint(id: string): Promise<EndpointDef> {
  return withLock(ENDPOINTS_LOCK, async () => {
    const recordId = validId(str(id).trim());
    const source = recordId ? await getEndpoint(recordId) : null;
    if (!recordId || !source) throw new StoreError("Endpoint not found", 404);

    const existing = await readAllEndpoints();
    const taken = new Set(
      existing
        .filter(
          (endpoint) => endpoint.projectId === source.projectId && endpoint.method === source.method,
        )
        .map((endpoint) => endpoint.path),
    );

    let copyPath = normalizePath(`${source.path}-copy`);
    for (let suffix = 2; taken.has(copyPath); suffix++) {
      copyPath = normalizePath(`${source.path}-copy-${suffix}`);
    }

    const copyId = newId("ep");
    const now = new Date().toISOString();
    const copy: EndpointDef = {
      ...source,
      id: copyId,
      name: `${source.name} (copy)`,
      path: copyPath,
      auth: { ...source.auth },
      request: cloneRequestSpec(source.request),
      scenarios: asArray<ResponseScenario>(source.scenarios).map(cloneScenario),
      validationError: cloneErrorTemplate(source.validationError),
      authError: cloneErrorTemplate(source.authError),
      tags: [...source.tags],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await query(
        "INSERT INTO endpoints (id, project_id, method, path, data) VALUES ($1, $2, $3, $4, $5)",
        [copy.id, copy.projectId, copy.method, copy.path, JSON.stringify(copy)],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new StoreError("Could not allocate a unique path for the copy", 409);
      }
      throw error;
    }
    return copy;
  });
}
