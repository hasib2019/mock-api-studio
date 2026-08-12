"use client";

/**
 * Provider-less toasts.
 *
 * `toast(...)` writes into a module-level queue and notifies every mounted
 * `<Toaster/>`. Because the store lives in the module (not in a context), any
 * client component can call it without being wrapped in anything.
 */

import * as React from "react";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const TOAST_TTL_MS = 4000;

let items: ToastItem[] = [];
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastItem[] {
  return items;
}

function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

/** Queue a toast. Auto-dismisses after 4s. */
export function toast(message: string, tone: ToastTone = "info"): void {
  seq += 1;
  const id = seq;
  items = [...items, { id, message, tone }];
  emit();
  timers.set(
    id,
    setTimeout(() => dismiss(id), TOAST_TTL_MS),
  );
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; bar: string }> = {
  success: {
    ring: "ring-emerald-200",
    icon: "bg-emerald-50 text-emerald-600",
    bar: "bg-emerald-500",
  },
  error: { ring: "ring-rose-200", icon: "bg-rose-50 text-rose-600", bar: "bg-rose-500" },
  info: { ring: "ring-slate-200", icon: "bg-indigo-50 text-indigo-600", bar: "bg-indigo-500" },
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path
          d="M4.5 10.5l3.5 3.5 7.5-8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path
          d="M10 6v5m0 3h.01"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M10 9.25V14m0-7.5h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2"
    >
      {list.map((item) => {
        const tone = TONE_STYLES[item.tone];
        return (
          <div
            key={item.id}
            role="status"
            className={`animate-toast-in pointer-events-auto flex w-full items-start gap-2.5 overflow-hidden rounded-xl bg-white p-3 pl-3.5 shadow-lg ring-1 ${tone.ring}`}
          >
            <span className={`mt-px h-4 w-1 shrink-0 rounded-full ${tone.bar}`} aria-hidden="true" />
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone.icon}`}
            >
              <ToastIcon tone={item.tone} />
            </span>
            <p className="min-w-0 flex-1 pt-px text-[13px] leading-5 break-words text-slate-700">
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="-mt-0.5 -mr-0.5 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                <path
                  d="M5.5 5.5l9 9m0-9l-9 9"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
