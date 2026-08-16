"use client";

import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button, Card, Input, Spinner } from "@/components/ui";
import { authApi } from "@/lib/api-client";

/** Only same-origin, absolute-path redirects are honoured. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    try {
      await authApi.login(username.trim(), password);
      router.replace(safeNext(searchParams.get("next")));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
      setPassword("");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Input
        label="Username"
        name="username"
        autoComplete="username"
        autoFocus
        spellCheck={false}
        placeholder="admin"
        value={username}
        disabled={loading}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        value={password}
        disabled={loading}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 font-mono text-base font-semibold text-white shadow-sm">
            {"{}"}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Mock API Studio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sandbox APIs for the integrations you cannot call in production.
          </p>
        </div>

        <Card>
          <Suspense
            fallback={
              <div className="flex h-52 items-center justify-center">
                <Spinner />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </Card>
      </div>
    </main>
  );
}
