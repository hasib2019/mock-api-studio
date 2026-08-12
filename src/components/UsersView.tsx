"use client";

/**
 * Studio users — the people who sign in to this tool, not the mock callers.
 *
 * Members get a read-only list; admins can add and remove accounts. Nobody can
 * delete the account they are signed in with.
 */

import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  SectionHeader,
  Select,
} from "@/components/ui";
import { adminApi } from "@/lib/api-client";
import type { StudioUser, UserRole } from "@/lib/types";

export type PublicUser = Omit<StudioUser, "passwordHash">;

const ROLE_OPTIONS = [
  { value: "member", label: "Member — read and edit mocks" },
  { value: "admin", label: "Admin — everything, plus user management" },
];

function formatDate(ts: string): string {
  return ts.length >= 10 ? ts.slice(0, 10) : ts;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export interface UsersViewProps {
  initialUsers: PublicUser[];
  currentUserId: string;
  currentRole: UserRole;
}

export function UsersView({ initialUsers, currentUserId, currentRole }: UsersViewProps) {
  const isAdmin = currentRole === "admin";

  const [users, setUsers] = React.useState<PublicUser[]>(initialUsers);
  const [addOpen, setAddOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("member");
  const [pendingDelete, setPendingDelete] = React.useState<PublicUser | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function refresh() {
    try {
      setUsers(await adminApi.listUsers());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reload the user list", "error");
    }
  }

  function openAdd() {
    setName("");
    setUsername("");
    setPassword("");
    setRole("member");
    setFormError(null);
    setAddOpen(true);
  }

  async function createUser() {
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setFormError("A username is required.");
      return;
    }
    if (password.length < 8) {
      setFormError("The password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const created = await adminApi.createUser({
        username: trimmedUsername,
        name: trimmedName || trimmedUsername,
        password,
        role,
      });
      toast(`Added ${created.username}`, "success");
      setAddOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create the user.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser() {
    const target = pendingDelete;
    if (!target || deleting) return;

    setDeleting(true);
    try {
      await adminApi.deleteUser(target.id);
      toast(`Removed ${target.username}`, "success");
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete the user", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Users"
        description="Accounts that can sign in to Mock API Studio."
        actions={
          isAdmin ? (
            <Button size="sm" onClick={openAdd}>
              Add user
            </Button>
          ) : null
        }
      />

      {!isAdmin ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-500">
          You are signed in as a member, so this list is read-only. Ask an administrator to add or
          remove accounts.
        </p>
      ) : null}

      {users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="At least one administrator account is needed to sign in."
          action={
            isAdmin ? (
              <Button size="sm" onClick={openAdd}>
                Add user
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Created</th>
                  {isAdmin ? <th className="px-4 py-2.5 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const isSelf = user.id === currentUserId;
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-700">
                            {initials(user.name || user.username)}
                          </span>
                          <span className="font-medium text-slate-900">{user.name}</span>
                          {isSelf ? <Badge tone="blue">you</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{user.username}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={user.role === "admin" ? "indigo" : "gray"}>{user.role}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-500">
                        {formatDate(user.createdAt)}
                      </td>
                      {isAdmin ? (
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            title={
                              isSelf ? "You cannot delete the account you are signed in with" : undefined
                            }
                            onClick={() => setPendingDelete(user)}
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          >
                            Delete
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => (saving ? undefined : setAddOpen(false))}
        title="Add user"
        description="The account can sign in immediately with the password you set here."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void createUser()} loading={saving}>
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Full name"
            placeholder="Rahim Uddin"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Username"
            mono
            required
            placeholder="rahim.uddin"
            hint="3 to 32 characters: letters, digits, dot, dash or underscore."
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            hint="At least 8 characters. Stored as a pbkdf2-sha512 digest."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) =>
              setRole(event.target.value === "admin" ? "admin" : "member")
            }
          />
          {formError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
              {formError}
            </p>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete user"
        message={
          pendingDelete
            ? `${pendingDelete.name} (${pendingDelete.username}) will no longer be able to sign in. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete user"
        loading={deleting}
        onConfirm={() => void deleteUser()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default UsersView;
