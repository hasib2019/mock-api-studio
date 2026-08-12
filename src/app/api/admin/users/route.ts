import type { NextRequest } from "next/server";

import { fail, guard, handleError, isRecord, ok, readJsonBody } from "@/lib/http";
import { StoreError } from "@/lib/store";
import { createUser, ensureSeedUser, getUserByUsername, listUsers } from "@/lib/users";
import type { StudioUser, UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type PublicUser = Omit<StudioUser, "passwordHash">;

/** The password digest never leaves the server. */
function publicUser(user: StudioUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function GET(): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    await ensureSeedUser();
    const users = await listUsers();
    return ok(users.map(publicUser));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);
  if (session.role !== "admin") return fail("Only an admin can create users", 403);

  try {
    const raw = await readJsonBody<unknown>(request);
    if (!isRecord(raw)) return fail("Request body must be a JSON object", 400);

    const username = typeof raw.username === "string" ? raw.username.trim().toLowerCase() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const password = typeof raw.password === "string" ? raw.password : "";
    const role: UserRole = raw.role === "admin" ? "admin" : "member";

    if (!username) return fail("Username is required", 400);
    if (!password) return fail("Password is required", 400);
    if (raw.role !== undefined && raw.role !== "admin" && raw.role !== "member") {
      return fail('Role must be "admin" or "member"', 400);
    }
    if (await getUserByUsername(username)) {
      return fail(`Username "${username}" is already taken.`, 409);
    }

    let created: StudioUser;
    try {
      created = await createUser({ username, name: name || username, password, role });
    } catch (e) {
      // users.ts rejects weak passwords and malformed usernames with plain Errors.
      throw new StoreError(e instanceof Error ? e.message : "Could not create the user", 400);
    }

    return ok(publicUser(created), 201);
  } catch (e) {
    return handleError(e);
  }
}
