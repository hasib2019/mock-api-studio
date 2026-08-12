"use client";

/**
 * Cheat-sheet for the `{{token}}` interpolation understood by every response
 * and error template. `@/lib/template` is browser-safe (it only pulls in
 * `@/lib/ids` and `@/lib/scenario`, both free of node built-ins), so the list
 * comes straight from the single source of truth.
 */

import * as React from "react";

import { CopyButton } from "@/components/ui";
import { TEMPLATE_TOKENS } from "@/lib/template";

export function TokenHelp({ className }: { className?: string }) {
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return TEMPLATE_TOKENS;
    return TEMPLATE_TOKENS.filter(
      (token) =>
        token.token.toLowerCase().includes(needle) ||
        token.description.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] leading-5 text-slate-500">
          Any string inside a response body — values <em>and</em> keys — is scanned for these.
          A string that is exactly one token keeps the resolved value&rsquo;s native JSON type.
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tokens…"
          spellCheck={false}
          aria-label="Filter tokens"
          className="h-8 w-44 shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
        />
      </div>

      <div className="scrollbar-thin max-h-[420px] overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-left">
          <tbody className="divide-y divide-slate-100">
            {rows.map((token) => (
              <tr key={token.token} className="align-top">
                <td className="w-px py-1.5 pr-3 pl-2.5 whitespace-nowrap">
                  <CopyButton value={token.token} label={token.token} className="font-mono" />
                </td>
                <td className="py-2 pr-3 text-[13px] leading-5 text-slate-600">
                  {token.description}
                  <span className="mt-0.5 block font-mono text-[11px] break-all text-slate-400">
                    → {token.example}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-[13px] text-slate-500">
                  No token matches “{query}”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TokenHelp;
