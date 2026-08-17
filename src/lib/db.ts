/**
 * Postgres connection pool + schema bootstrap.
 *
 * Server only: this module touches `pg`, so it must never be imported
 * (directly or transitively) from a `"use client"` component.
 */

import { Pool, type PoolConfig, type QueryResultRow } from "pg";

declare global {
  var __mockApiStudioPgPool: Pool | undefined;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Picks the connection target. `DB_ENV=local` uses the discrete
 * `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_SSL` variables (a
 * LAN/on-prem Postgres); anything else falls back to a connection string -
 * `DATABASE_URL`, then `POSTGRES_URL`, then `PRISMA_DATABASE_URL` - which is
 * how every hosted provider (Vercel Postgres/Neon, Supabase, Prisma
 * Postgres, RDS) hands out credentials.
 */
function buildPoolConfig(): PoolConfig {
  if ((env("DB_ENV") ?? "").toLowerCase() === "local") {
    const host = env("DB_HOST");
    const database = env("DB_NAME");
    const user = env("DB_USER");
    if (!host || !database || !user) {
      throw new Error(
        "DB_ENV=local requires DB_HOST, DB_NAME and DB_USER to be set (see .env.example).",
      );
    }
    return {
      host,
      port: Number(env("DB_PORT") ?? "5432"),
      database,
      user,
      password: env("DB_PASSWORD"),
      ssl: env("DB_SSL") === "true" ? { rejectUnauthorized: false } : undefined,
      max: 5,
    };
  }

  const connectionString = env("DATABASE_URL") ?? env("POSTGRES_URL") ?? env("PRISMA_DATABASE_URL");
  if (!connectionString) {
    throw new Error(
      "No database configured. Set DATABASE_URL (or POSTGRES_URL / PRISMA_DATABASE_URL), " +
        "or set DB_ENV=local plus DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (see .env.example).",
    );
  }
  // Hosted Postgres (Neon, Supabase, Prisma Postgres, RDS, ...) requires TLS;
  // opt out with `?sslmode=disable` in the connection string otherwise.
  const ssl = /sslmode=disable/i.test(connectionString) ? undefined : { rejectUnauthorized: false };
  return { connectionString, ssl, max: 5 };
}

const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/i;

/** The Postgres schema every studio table lives in - `public` unless overridden. */
function resolveSchemaName(): string {
  const raw = env("DB_SCHEMA");
  if (!raw) return "public";
  if (!SCHEMA_NAME_PATTERN.test(raw)) {
    throw new Error(`DB_SCHEMA "${raw}" is not a valid Postgres identifier.`);
  }
  return raw;
}

function createPool(): Pool {
  const pool = new Pool(buildPoolConfig());
  const schema = resolveSchemaName();
  if (schema !== "public") {
    // Runs once per physical connection, before the pool hands it to any
    // caller, so every query on that connection sees the right search_path -
    // this keeps the studio's tables out of whatever else lives in the
    // database (e.g. a shared production schema) without qualifying every
    // query by hand.
    pool.on("connect", (client) => {
      client.query(`SET search_path TO "${schema}", public`).catch((error: unknown) => {
        console.error(`Failed to set search_path to "${schema}":`, error);
      });
    });
  }
  return pool;
}

/** Cached on `globalThis` so Next.js dev's hot reload does not leak a new pool per edit. */
function getPool(): Pool {
  if (!globalThis.__mockApiStudioPgPool) {
    globalThis.__mockApiStudioPgPool = createPool();
  }
  return globalThis.__mockApiStudioPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await getPool().query<T>(text, params);
  return rows;
}

/** Postgres error code for a violated UNIQUE/PRIMARY KEY constraint. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * One statement per call - `pg` only allows multiple semicolon-separated
 * statements in a single query under the simple protocol, which parameters
 * would opt out of, so schema setup stays one `CREATE` per round trip.
 */
function schemaStatements(schema: string): string[] {
  const statements: string[] = [];
  if (schema !== "public") {
    statements.push(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  }
  statements.push(
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      data JSONB NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS endpoints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      data JSONB NOT NULL,
      UNIQUE (project_id, method, path)
    )`,
    `CREATE INDEX IF NOT EXISTS endpoints_project_id_idx ON endpoints (project_id)`,
    `CREATE TABLE IF NOT EXISTS studio_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      data JSONB NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL,
      project_id TEXT,
      endpoint_id TEXT,
      outcome TEXT,
      data JSONB NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS request_logs_ts_idx ON request_logs (ts DESC)`,
    `CREATE INDEX IF NOT EXISTS request_logs_project_id_idx ON request_logs (project_id)`,
    `CREATE INDEX IF NOT EXISTS request_logs_endpoint_id_idx ON request_logs (endpoint_id)`,
  );
  return statements;
}

let schemaReady: Promise<void> | null = null;

/**
 * Creates the schema (if any) and every table/index used by the studio; safe to call repeatedly.
 *
 * Set `DB_SCHEMA_READY=1` once the tables exist (i.e. after the first deploy)
 * to skip the bootstrap entirely. On serverless every cold start otherwise
 * pays ~10 sequential round trips re-asserting `CREATE ... IF NOT EXISTS`.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const ready = (env("DB_SCHEMA_READY") ?? "").toLowerCase();
    if (ready === "1" || ready === "true") {
      schemaReady = Promise.resolve();
      return schemaReady;
    }
    schemaReady = (async () => {
      const pool = getPool();
      for (const statement of schemaStatements(resolveSchemaName())) {
        await pool.query(statement);
      }
    })().catch((error: unknown) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
