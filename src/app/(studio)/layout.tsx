import { AppShell } from "@/components/AppShell";
import { requireSession } from "@/lib/auth";

/**
 * Authenticated shell. Every studio screen renders inside it; an unauthenticated
 * visitor is bounced to /login by `requireSession()`.
 */
export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  return (
    <AppShell
      user={{ username: session.username, name: session.name, role: session.role }}
    >
      {children}
    </AppShell>
  );
}
