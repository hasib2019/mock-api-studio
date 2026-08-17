/**
 * Request log for the mock runtime.
 *
 * Rows in the `request_logs` table (see `@/lib/db`), newest first, pruned to
 * `LOG_RETENTION` on every append. Server only (touches `pg`).
 */

import { ensureSchema, query } from "@/lib/db";
import { withLock } from "@/lib/lock";
import { newId } from "@/lib/ids";
import type { LogOutcome, RequestLog } from "@/lib/types";

const LOGS_LOCK = "logs:requests";
/** Bodies larger than this are stored as a stub so the log table stays small. */
const MAX_BODY_BYTES = 20 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const OUTCOMES: LogOutcome[] = [
  "matched",
  "validation_failed",
  "auth_failed",
  "not_found",
  "disabled",
];

/** How many request logs to keep (oldest pruned first). */
const LOG_RETENTION = Number(process.env.MOCK_LOG_RETENTION ?? 500);

function retention(): number {
  return Number.isFinite(LOG_RETENTION) && LOG_RETENTION > 0 ? Math.floor(LOG_RETENTION) : 500;
}

function isLog(value: unknown): value is RequestLog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as { id?: unknown; ts?: unknown };
  return typeof record.id === "string" && typeof record.ts === "string";
}

/** Oversized payloads are replaced by `{ truncated: true, bytes }`. */
function limitBody(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return { truncated: true, bytes: 0 };
  }
  if (json === undefined) return null;
  const bytes = Buffer.byteLength(json, "utf8");
  return bytes > MAX_BODY_BYTES ? { truncated: true, bytes } : value;
}

function stringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function normalizeEntry(entry: RequestLog): RequestLog {
  return {
    ...entry,
    id: typeof entry.id === "string" && entry.id ? entry.id : newId("log"),
    ts: typeof entry.ts === "string" && entry.ts ? entry.ts : new Date().toISOString(),
    requestHeaders: stringMap(entry.requestHeaders),
    requestQuery: stringMap(entry.requestQuery),
    requestBody: limitBody(entry.requestBody),
    responseBody: limitBody(entry.responseBody),
    issues: Array.isArray(entry.issues) ? entry.issues : [],
  };
}

/**
 * Appends one entry and prunes anything past the retention window. Logging
 * must never break a mock response, so every error (lock contention, a
 * dropped connection, ...) is swallowed.
 */
export async function appendLog(entry: RequestLog): Promise<void> {
  try {
    await withLock(LOGS_LOCK, async () => {
      await ensureSchema();
      const normalized = normalizeEntry(entry);
      await query(
        `INSERT INTO request_logs (id, ts, project_id, endpoint_id, outcome, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          normalized.id,
          normalized.ts,
          normalized.projectId ?? null,
          normalized.endpointId ?? null,
          normalized.outcome ?? null,
          JSON.stringify(normalized),
        ],
      );
      await query(
        `DELETE FROM request_logs WHERE id IN (
           SELECT id FROM request_logs ORDER BY ts DESC OFFSET $1
         )`,
        [retention()],
      );
    });
  } catch {
    /* logging is best effort */
  }
}

export async function listLogs(
  filter: {
    projectId?: string;
    endpointId?: string;
    outcome?: string;
    limit?: number;
  } = {},
): Promise<RequestLog[]> {
  await ensureSchema();

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) {
    params.push(filter.projectId);
    clauses.push(`project_id = $${params.length}`);
  }
  if (filter.endpointId) {
    params.push(filter.endpointId);
    clauses.push(`endpoint_id = $${params.length}`);
  }
  if (filter.outcome) {
    params.push(filter.outcome);
    clauses.push(`outcome = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  let limitClause = "";
  if (typeof filter.limit === "number" && Number.isFinite(filter.limit) && filter.limit > 0) {
    params.push(Math.floor(filter.limit));
    limitClause = `LIMIT $${params.length}`;
  }

  const rows = await query<{ data: unknown }>(
    `SELECT data FROM request_logs ${where} ORDER BY ts DESC ${limitClause}`,
    params,
  );
  return rows.map((row) => row.data).filter(isLog);
}

/** Removes matching entries (everything when no filter is given); returns how many went. */
export async function clearLogs(
  filter: { projectId?: string; endpointId?: string } = {},
): Promise<number> {
  return withLock(LOGS_LOCK, async () => {
    await ensureSchema();

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.projectId) {
      params.push(filter.projectId);
      clauses.push(`project_id = $${params.length}`);
    }
    if (filter.endpointId) {
      params.push(filter.endpointId);
      clauses.push(`endpoint_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const rows = await query<{ id: string }>(
      `DELETE FROM request_logs ${where} RETURNING id`,
      params,
    );
    return rows.length;
  });
}

export async function logStats(): Promise<{
  total: number;
  last24h: number;
  failed24h: number;
  byOutcome: Record<string, number>;
}> {
  await ensureSchema();
  // Aggregate in SQL - pulling every row's JSONB (bodies included) just to
  // count it shipped megabytes across the wire on each dashboard load.
  const rows = await query<{ outcome: string; total: number; last24h: number }>(
    `SELECT COALESCE(outcome, 'matched') AS outcome,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ts >= $1)::int AS last24h
     FROM request_logs
     GROUP BY 1`,
    [new Date(Date.now() - DAY_MS).toISOString()],
  );

  const byOutcome: Record<string, number> = {};
  for (const outcome of OUTCOMES) byOutcome[outcome] = 0;

  let total = 0;
  let last24h = 0;
  let failed24h = 0;

  for (const row of rows) {
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + row.total;
    total += row.total;
    last24h += row.last24h;
    if (row.outcome !== "matched") failed24h += row.last24h;
  }

  return { total, last24h, failed24h, byOutcome };
}
