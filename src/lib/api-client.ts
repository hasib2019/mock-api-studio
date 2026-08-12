/**
 * Browser-side client for the studio admin API.
 * Safe to import from `"use client"` components — no node built-ins here.
 */

import type {
  ApiResponse,
  EndpointDef,
  EndpointInput,
  FieldDef,
  IssueLocation,
  ProjectDef,
  ProjectInput,
  RequestLog,
  StudioUser,
  UserRole,
  ValidationIssue,
} from "@/lib/types";

export class ApiError extends Error {
  status: number;
  issues?: ValidationIssue[];

  constructor(message: string, status: number, issues?: ValidationIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

export async function api<T>(
  path: string,
  init: (Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit | null }) = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.ok !== true) {
    const message =
      payload && payload.ok === false ? payload.error : `Request failed (${res.status})`;
    const issues = payload && payload.ok === false ? payload.issues : undefined;
    throw new ApiError(message, res.status, issues);
  }

  return payload.data;
}

export interface StudioStats {
  projects: number;
  endpoints: number;
  enabledEndpoints: number;
  logs: {
    total: number;
    last24h: number;
    failed24h: number;
    byOutcome: Record<string, number>;
  };
}

export interface LogFilter {
  projectId?: string;
  endpointId?: string;
  outcome?: string;
  limit?: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const adminApi = {
  /* projects */
  listProjects: () => api<ProjectDef[]>("/api/admin/projects"),
  getProject: (id: string) =>
    api<{ project: ProjectDef; endpoints: EndpointDef[] }>(`/api/admin/projects/${id}`),
  createProject: (input: Partial<ProjectInput>) =>
    api<ProjectDef>("/api/admin/projects", { method: "POST", json: input }),
  updateProject: (id: string, patch: Partial<ProjectDef>) =>
    api<ProjectDef>(`/api/admin/projects/${id}`, { method: "PUT", json: patch }),
  deleteProject: (id: string) =>
    api<{ deleted: true }>(`/api/admin/projects/${id}`, { method: "DELETE" }),

  /* endpoints */
  listEndpoints: (projectId?: string) =>
    api<EndpointDef[]>(`/api/admin/endpoints${qs({ projectId })}`),
  getEndpoint: (id: string) => api<EndpointDef>(`/api/admin/endpoints/${id}`),
  createEndpoint: (input: EndpointInput) =>
    api<EndpointDef>("/api/admin/endpoints", { method: "POST", json: input }),
  updateEndpoint: (id: string, patch: Partial<EndpointDef>) =>
    api<EndpointDef>(`/api/admin/endpoints/${id}`, { method: "PUT", json: patch }),
  deleteEndpoint: (id: string) =>
    api<{ deleted: true }>(`/api/admin/endpoints/${id}`, { method: "DELETE" }),
  duplicateEndpoint: (id: string) =>
    api<EndpointDef>(`/api/admin/endpoints/${id}/duplicate`, { method: "POST" }),

  /* logs */
  listLogs: (filter: LogFilter = {}) => api<RequestLog[]>(`/api/admin/logs${qs({ ...filter })}`),
  clearLogs: (filter: Pick<LogFilter, "projectId" | "endpointId"> = {}) =>
    api<{ cleared: number }>(`/api/admin/logs${qs({ ...filter })}`, { method: "DELETE" }),

  /* tools */
  stats: () => api<StudioStats>("/api/admin/stats"),
  inferSchema: (sample: unknown, location: IssueLocation = "body") =>
    api<FieldDef[]>("/api/admin/infer-schema", {
      method: "POST",
      json: { sample, location },
    }),
  seedDemo: () =>
    api<{ projects: number; endpoints: number }>("/api/admin/seed", { method: "POST" }),
  importData: (data: unknown) =>
    api<{ projects: number; endpoints: number }>("/api/admin/import", {
      method: "POST",
      json: { data },
    }),

  /* users */
  listUsers: () => api<Omit<StudioUser, "passwordHash">[]>("/api/admin/users"),
  createUser: (input: { username: string; name: string; password: string; role: UserRole }) =>
    api<Omit<StudioUser, "passwordHash">>("/api/admin/users", { method: "POST", json: input }),
  deleteUser: (id: string) =>
    api<{ deleted: true }>(`/api/admin/users/${id}`, { method: "DELETE" }),
};

export const authApi = {
  login: (username: string, password: string) =>
    api<{ username: string; name: string; role: UserRole }>("/api/auth/login", {
      method: "POST",
      json: { username, password },
    }),
  logout: () => api<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => api<{ username: string; name: string; role: UserRole }>("/api/auth/me"),
};
