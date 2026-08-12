import { fail, guard, handleError, ok } from "@/lib/http";
import { seedDemoData } from "@/lib/seed";

export const dynamic = "force-dynamic";

/** Installs the demo banking project. Idempotent - calling it twice is a no-op. */
export async function POST(): Promise<Response> {
  const session = await guard();
  if (!session) return fail("Unauthorized", 401);

  try {
    const result = await seedDemoData();
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
