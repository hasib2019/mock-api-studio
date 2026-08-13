/**
 * Request log for the mock runtime.
 *
 * A single `data/logs/requests.json` array, newest first, pruned to
 * LOG_RETENTION on every append. Server only (touches `node:fs`).
 */

import fs from "node:fs/promises";
import path from "node:path";

import { ensureDataDirs, readJson, withLock, writeJson } from "@/lib/fsdb";
import { newId } from "@/lib/ids";
import { LOGS_DIR, LOG_RETENTION } from "@/lib/paths";
import type { LogOutcome, RequestLog } from "@/lib/types";

const LOGS_FILE = path.join(LOGS_DIR, "requests.json");
const LOGS_LOCK = "logs:requests";
/** Bodies larger than this are stored as a stub so the log file stays small. */
const MAX_BODY_BYTES = 20 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const OUTCOMES: LogOutcome[] = [
  "matched",
  "validation_failed",
  "auth_failed",
  "not_found",
  "disabled",
];

interface LogsCache {
  mtimeMs: number;
  size: number;
  value: RequestLog[];
}

let cached: LogsCache | null = null;
let dirsReady: Promise<void> | null = null;

/**
 * Best-effort directory setup. On a read-only deploy this can never succeed,
 * but `readJson`/`listJsonFiles` already fall back gracefully on their own,
 * so a failure here must not block a read. `writeJson` creates its own
 * parent directory right before writing regardless, so swallowing the error
 * here does not hide a real failure from an actual write attempt.
 */
function ready(): Promise<void> {
  if (!dirsReady) {
    dirsReady = ensureDataDirs().catch(() => undefined);
  }
  return dirsReady;
}

function retention(): number {
  return Number.isFinite(LOG_RETENTION) && LOG_RETENTION > 0 ? Math.floor(LOG_RETENTION) : 500;
}

async function statSafe(file: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const stat = await fs.stat(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

function isLog(value: unknown): value is RequestLog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as { id?: unknown; ts?: unknown };
  return typeof record.id === "string" && typeof record.ts === "string";
}

/** Reads the whole log, reusing the parsed array while the file is untouched. */
async function readAll(): Promise<RequestLog[]> {
  await ready();
  const stat = await statSafe(LOGS_FILE);
  if (!stat) {
    cached = null;
    return [];
  }
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value;

  const raw = await readJson<unknown>(LOGS_FILE, []);
  const list: unknown[] = Array.isArray(raw) ? raw : [];
  const value = list.filter(isLog);
  cached = { mtimeMs: stat.mtimeMs, size: stat.size, value };
  return value;
}

async function writeAll(list: RequestLog[]): Promise<void> {
  await writeJson(LOGS_FILE, list);
  const stat = await statSafe(LOGS_FILE);
  cached = stat ? { mtimeMs: stat.mtimeMs, size: stat.size, value: list } : null;
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
 * Appends one entry. Logging must never break a mock response, so every error
 * (a locked file, a full disk, ...) is swallowed.
 */
export async function appendLog(entry: RequestLog): Promise<void> {
  try {
    await withLock(LOGS_LOCK, async () => {
      const list = await readAll();
      const next = [normalizeEntry(entry), ...list];
      const max = retention();
      if (next.length > max) next.length = max;
      await writeAll(next);
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
  const list = await readAll();
  const matched = list.filter((log) => {
    if (filter.projectId && log.projectId !== filter.projectId) return false;
    if (filter.endpointId && log.endpointId !== filter.endpointId) return false;
    if (filter.outcome && log.outcome !== filter.outcome) return false;
    return true;
  });

  const sorted = matched.slice().sort((a, b) => b.ts.localeCompare(a.ts));
  const limit =
    typeof filter.limit === "number" && Number.isFinite(filter.limit) && filter.limit > 0
      ? Math.floor(filter.limit)
      : sorted.length;
  return sorted.slice(0, limit);
}

/** Removes matching entries (everything when no filter is given); returns how many went. */
export async function clearLogs(
  filter: { projectId?: string; endpointId?: string } = {},
): Promise<number> {
  return withLock(LOGS_LOCK, async () => {
    const list = await readAll();
    if (!filter.projectId && !filter.endpointId) {
      await writeAll([]);
      return list.length;
    }

    const kept = list.filter((log) => {
      const projectMatches = filter.projectId ? log.projectId === filter.projectId : true;
      const endpointMatches = filter.endpointId ? log.endpointId === filter.endpointId : true;
      return !(projectMatches && endpointMatches);
    });

    const removed = list.length - kept.length;
    if (removed > 0) await writeAll(kept);
    return removed;
  });
}

export async function logStats(): Promise<{
  total: number;
  last24h: number;
  failed24h: number;
  byOutcome: Record<string, number>;
}> {
  const list = await readAll();
  const since = Date.now() - DAY_MS;
  const byOutcome: Record<string, number> = {};
  for (const outcome of OUTCOMES) byOutcome[outcome] = 0;

  let last24h = 0;
  let failed24h = 0;

  for (const log of list) {
    const outcome = typeof log.outcome === "string" ? log.outcome : "matched";
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;

    const at = Date.parse(log.ts);
    if (Number.isFinite(at) && at >= since) {
      last24h += 1;
      if (outcome !== "matched") failed24h += 1;
    }
  }

  return { total: list.length, last24h, failed24h, byOutcome };
}
