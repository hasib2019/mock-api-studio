/**
 * Studio users - the humans who sign in to Mock API Studio.
 *
 * Server only: this module reads and writes the `studio_users` table (see
 * `@/lib/db`). Never import it from a `"use client"` component.
 */

import crypto from "node:crypto";

import { ensureSchema, isUniqueViolation, query } from "@/lib/db";
import { withLock } from "@/lib/lock";
import { newId } from "@/lib/ids";
import type { StudioUser, UserRole } from "@/lib/types";

const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_DIGEST = "sha512";
const SALT_BYTES = 16;

/** Every write to the users table goes through this lock key. */
const USERS_LOCK = "users";

const MIN_PASSWORD_LENGTH = 6;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Fixed salt used to burn the same CPU time when a username does not exist. */
const TIMING_SALT = Buffer.alloc(SALT_BYTES, 0x5a);

/* ------------------------------------------------------------------ *
 * Password hashing
 * ------------------------------------------------------------------ */

/** pbkdf2-sha512 digest stored as `saltHex:hashHex`. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST,
  );
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator <= 0 || separator === stored.length - 1) return false;

  const saltHex = stored.slice(0, separator);
  const hashHex = stored.slice(separator + 1);
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== PBKDF2_KEY_LENGTH) return false;

  const actual = crypto.pbkdf2Sync(
    password,
    Buffer.from(saltHex, "hex"),
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST,
  );
  return crypto.timingSafeEqual(actual, expected);
}

/** Keeps an unknown username as slow as a wrong password. */
function burnHashingTime(password: string): void {
  crypto.pbkdf2Sync(
    password,
    TIMING_SALT,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_LENGTH,
    PBKDF2_DIGEST,
  );
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

function isStudioUser(value: unknown): value is StudioUser {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.username === "string" &&
    typeof record.name === "string" &&
    (record.role === "admin" || record.role === "member") &&
    typeof record.passwordHash === "string" &&
    typeof record.createdAt === "string"
  );
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function sortUsers(users: StudioUser[]): StudioUser[] {
  return [...users].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.username.localeCompare(b.username),
  );
}

async function readUsers(): Promise<StudioUser[]> {
  await ensureSchema();
  const rows = await query<{ data: unknown }>("SELECT data FROM studio_users");
  return rows.map((row) => row.data).filter(isStudioUser);
}

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

/** Flips once the table is known to hold at least one user. */
let seeded = false;

/**
 * Creates the first admin user on first run. Cheap enough to call on every
 * request, and locked so concurrent boots cannot race.
 */
export async function ensureSeedUser(): Promise<void> {
  if (seeded) return;
  await withLock(USERS_LOCK, async () => {
    if (seeded) return;

    const existing = await readUsers();
    if (existing.length > 0) {
      seeded = true;
      return;
    }

    const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin") || "admin";
    const password = process.env.ADMIN_PASSWORD || "Era@1234!!";
    const admin: StudioUser = {
      id: newId("us"),
      username,
      name: "Administrator",
      role: "admin",
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    try {
      await query("INSERT INTO studio_users (id, username, data) VALUES ($1, $2, $3)", [
        admin.id,
        admin.username,
        JSON.stringify(admin),
      ]);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    seeded = true;
  });
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export async function listUsers(): Promise<StudioUser[]> {
  return sortUsers(await readUsers());
}

export async function getUserByUsername(u: string): Promise<StudioUser | null> {
  const wanted = normalizeUsername(u ?? "");
  if (!wanted) return null;
  await ensureSchema();
  const rows = await query<{ data: unknown }>(
    "SELECT data FROM studio_users WHERE username = $1",
    [wanted],
  );
  return isStudioUser(rows[0]?.data) ? rows[0].data : null;
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

export async function createUser(input: {
  username: string;
  name: string;
  password: string;
  role: UserRole;
}): Promise<StudioUser> {
  const username = normalizeUsername(input.username ?? "");
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error(
      "Username must be 3-32 characters long and may contain letters, digits, dot, dash or underscore.",
    );
  }
  if (typeof input.password !== "string" || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (input.role !== "admin" && input.role !== "member") {
    throw new Error("Role must be admin or member.");
  }

  const name = (input.name ?? "").trim() || username;
  const passwordHash = hashPassword(input.password);

  return withLock(USERS_LOCK, async () => {
    const existing = await getUserByUsername(username);
    if (existing) {
      throw new Error(`Username "${username}" is already taken.`);
    }
    const user: StudioUser = {
      id: newId("us"),
      username,
      name,
      role: input.role,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    try {
      await query("INSERT INTO studio_users (id, username, data) VALUES ($1, $2, $3)", [
        user.id,
        user.username,
        JSON.stringify(user),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error(`Username "${username}" is already taken.`);
      }
      throw error;
    }
    seeded = true;
    return user;
  });
}

export async function deleteUser(id: string): Promise<void> {
  await withLock(USERS_LOCK, async () => {
    const users = await readUsers();
    const target = users.find((user) => user.id === id);
    if (!target) throw new Error("User not found.");
    if (
      target.role === "admin" &&
      users.filter((user) => user.role === "admin").length <= 1
    ) {
      throw new Error("Cannot delete the last admin user.");
    }
    await query("DELETE FROM studio_users WHERE id = $1", [id]);
  });
}

export async function setPassword(id: string, password: string): Promise<void> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const passwordHash = hashPassword(password);
  await withLock(USERS_LOCK, async () => {
    const users = await readUsers();
    const current = users.find((user) => user.id === id);
    if (!current) throw new Error("User not found.");
    const next: StudioUser = { ...current, passwordHash };
    await query("UPDATE studio_users SET data = $2 WHERE id = $1", [id, JSON.stringify(next)]);
  });
}

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<StudioUser | null> {
  if (typeof username !== "string" || typeof password !== "string" || password === "") {
    return null;
  }
  const user = await getUserByUsername(username);
  if (!user) {
    burnHashingTime(password);
    return null;
  }
  return verifyPassword(password, user.passwordHash) ? user : null;
}
