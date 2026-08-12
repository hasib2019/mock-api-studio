import type { NextRequest } from "next/server";

import { fail, guard, handleError, ok } from "@/lib/http";
import { deleteUser, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/users/[userId]">,
): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);
  if (session.role !== "admin") return fail("Only an admin can delete users", 403);

  try {
    const { userId } = await ctx.params;
    const users = await listUsers();
    const target = users.find((user) => user.id === userId);
    if (!target) return fail("User not found", 404);

    const admins = users.filter((user) => user.role === "admin").length;
    if (target.role === "admin" && admins <= 1) {
      return fail("Cannot delete the last admin user.", 409);
    }

    await deleteUser(target.id);
    return ok<{ deleted: true }>({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
