"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { ApiError, authApi } from "@/lib/api-client";

interface ShellUser {
  username: string;
  name: string;
  role: string;
}

type IconProps = { className?: string };

function IconDashboard({ className = "h-4.5 w-4.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="3" width="6" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="12.5" width="6" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="10" width="6" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconProjects({ className = "h-4.5 w-4.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.75 6.25a1.5 1.5 0 011.5-1.5h2.9c.4 0 .78.16 1.06.44l1.06 1.06h6.48a1.5 1.5 0 011.5 1.5v6.5a1.5 1.5 0 01-1.5 1.5H4.25a1.5 1.5 0 01-1.5-1.5v-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLogs({ className = "h-4.5 w-4.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.25 5.5h13.5M3.25 10h13.5M3.25 14.5h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="14.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconDocs({ className = "h-4.5 w-4.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 4.75A1.5 1.5 0 015.5 3.25H10v13.5H5.5A1.5 1.5 0 014 15.25v-10.5zM10 3.25h4.5A1.5 1.5 0 0116 4.75v10.5a1.5 1.5 0 01-1.5 1.5H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers({ className = "h-4.5 w-4.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <circle cx="8" cy="7.25" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.75 16.25c0-2.35 2.35-4.25 5.25-4.25s5.25 1.9 5.25 4.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13.5 5.05a2.75 2.75 0 010 4.4M15 12.4c1.5.65 2.5 1.95 2.5 3.35"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSignOut({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M12.5 6.25V4.75a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5H11a1.5 1.5 0 001.5-1.5v-1.5M8.75 10h8m0 0l-2.5-2.5M16.75 10l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProductMark() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
        <path
          d="M8.5 6.5L4 12l4.5 5.5M15.5 6.5L20 12l-4.5 5.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.4 4.75l-2.8 14.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </span>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: (props: IconProps) => React.ReactElement;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: IconDashboard },
  { href: "/projects", label: "Projects", icon: IconProjects },
  { href: "/logs", label: "Request Logs", icon: IconLogs },
  { href: "/docs", label: "Docs", icon: IconDocs },
  { href: "/users", label: "Users", icon: IconUsers },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authApi.logout();
    } catch (err) {
      setSigningOut(false);
      toast(err instanceof ApiError ? err.message : "Could not sign out", "error");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <ProductMark />
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-4 font-semibold text-slate-900">
              Mock API Studio
            </p>
            <p className="truncate text-[11px] leading-4 text-slate-500">Sandbox control plane</p>
          </div>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 pt-1 pb-4">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 ${
                    active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-500"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 px-1 py-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              {initials(user.name || user.username)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-4 font-medium text-slate-900">
                {user.name || user.username}
              </p>
              <p className="truncate text-[11px] leading-4 text-slate-500 capitalize">{user.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? (
              <Spinner className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <IconSignOut className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="pl-60">
        <main className="min-h-screen bg-slate-50">
          <div className="mx-auto w-full max-w-[1440px] px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
