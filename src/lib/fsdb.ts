/**
 * Low level JSON file helpers.
 *
 * Server only: this module touches `node:fs`, so it must never be imported
 * (directly or transitively) from a `"use client"` component.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { DATA_DIR, ENDPOINTS_DIR, LOGS_DIR, PROJECTS_DIR } from "@/lib/paths";

/**
 * Windows occasionally refuses the final rename while an indexer or antivirus
 * still holds a handle on the destination, so retry a few times before giving up.
 */
const RENAME_ATTEMPTS = 5;
const RENAME_BACKOFF_MS = 20;
const RETRYABLE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates `data/`, `data/projects/`, `data/endpoints/` and `data/logs/` if missing.
 *
 * On a read-only deploy (e.g. Vercel) `mkdir` fails even for a directory that
 * already exists - the mount rejects the write syscall before it can report
 * EEXIST. Falling back to `stat` lets reads keep working there as long as the
 * directory shipped with the deployment; only a genuinely missing directory
 * that cannot be created is a hard failure.
 */
export async function ensureDataDirs(): Promise<void> {
  for (const dir of [DATA_DIR, PROJECTS_DIR, ENDPOINTS_DIR, LOGS_DIR]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat?.isDirectory()) throw error;
    }
  }
}

/** Reads and parses a JSON file; a missing or corrupt file yields `fallback`. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
  const trimmed = text.charCodeAt(0) === 0xfeff ? text.slice(1).trim() : text.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

/**
 * Atomic write: serialise into `<file>.tmp`, then rename over the target so a
 * reader never observes a half-written file. Pretty printed with 2 spaces to
 * keep the data folder readable and diffable.
 */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const json = JSON.stringify(value === undefined ? null : value, null, 2) ?? "null";
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${json}\n`, "utf8");

  let lastError: unknown;
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (error) {
      lastError = error;
      const code = errorCode(error);
      if (code === undefined || !RETRYABLE_CODES.has(code)) break;
      await wait(RENAME_BACKOFF_MS * (attempt + 1));
    }
  }

  await removeFile(tmp);
  throw lastError instanceof Error ? lastError : new Error(`Failed to write ${file}`);
}

/** Deletes a file; a missing file is not an error. */
export async function removeFile(file: string): Promise<void> {
  try {
    await fs.unlink(file);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return;
    throw error;
  }
}

/** Absolute paths of every `*.json` file directly inside `dir`, sorted by name. */
export async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => path.join(dir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * In-process mutex. Every task queued under the same key runs after the
 * previous one settled, so a read-modify-write pair can never interleave with
 * another writer inside this process.
 */
const chains = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
