import type { Metadata } from "next";
import { redirect } from "next/navigation";

import UsersView, { type PublicUser } from "@/components/UsersView";
import { getSession } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export const metadata: Metadata = {
  title: "Users · Mock API Studio",
};

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const users: PublicUser[] = (await listUsers()).map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  }));

  return (
    <UsersView initialUsers={users} currentUserId={session.sub} currentRole={session.role} />
  );
}
