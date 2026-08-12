"use client";

/**
 * Mock API Studio — UI kit.
 *
 * One light theme: slate neutrals, indigo primary, compact developer-tool
 * density. Every icon here is a hand-written inline SVG so the app ships with
 * zero icon dependencies.
 */

import * as React from "react";
import { toast } from "@/components/toast";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */

type IconProps = { className?: string };

function IconChevronDown({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M5.5 8l4.5 4.5L14.5 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClose({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M5.5 5.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <rect x="7.25" y="7.25" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.75 4.75h-8a1 1 0 00-1 1v8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCheck({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4.5 10.5l3.5 3.5 7.5-8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path d="M10 4.75v10.5M4.75 10h10.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4.75 6.25h10.5M8.25 4.5h3.5M6.5 6.25l.6 8.1a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWand({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M4 16l7.5-7.5M13 4l.7 1.8L15.5 6.5l-1.8.7L13 9l-.7-1.8L10.5 6.5l1.8-.7L13 4zM16.5 11l.45 1.15 1.15.45-1.15.45L16.5 14.2l-.45-1.15-1.15-.45 1.15-.45L16.5 11z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInbox({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.5 13.5h4l1.2 2.2h6.6l1.2-2.2h4M3.5 13.5l2.4-6.6a2 2 0 011.9-1.4h8.4a2 2 0 011.9 1.4l2.4 6.6v3.6a2 2 0 01-2 2H5.5a2 2 0 01-2-2v-3.6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Spinner
 * ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("animate-spin", className ?? "h-4 w-4")}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" className="opacity-25" />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Button
 * ------------------------------------------------------------------ */

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-indigo-600 bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 hover:border-indigo-500 active:bg-indigo-700 focus-visible:outline-indigo-600",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus-visible:outline-indigo-600",
  outline:
    "border border-slate-300 bg-transparent text-slate-700 hover:border-slate-400 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-indigo-600",
  ghost:
    "border border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 focus-visible:outline-indigo-600",
  danger:
    "border border-rose-600 bg-rose-600 text-white shadow-sm hover:bg-rose-500 hover:border-rose-500 active:bg-rose-700 focus-visible:outline-rose-600",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */

const CONTROL_BASE =
  "block w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
const CONTROL_OK =
  "border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
const CONTROL_ERR =
  "border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20";
const CONTROL_MONO = "font-mono text-[13px]";

function FieldLabel({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label?: React.ReactNode;
  required?: boolean;
}) {
  if (!label) return null;
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] leading-4 font-medium text-slate-700"
    >
      {label}
      {required ? (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldFoot({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: React.ReactNode;
  error?: string;
}) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 flex items-start gap-1 text-xs leading-4 text-rose-600">
        <svg viewBox="0 0 20 20" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 6.25v4.5m0 2.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>{error}</span>
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-xs leading-4 text-slate-500">
        {hint}
      </p>
    );
  }
  return null;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, mono, className, id, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  const descId = `${controlId}-desc`;
  const described = error || hint ? descId : undefined;

  return (
    <div className="w-full">
      <FieldLabel htmlFor={controlId} label={label} required={rest.required} />
      <input
        id={controlId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={cx(
          CONTROL_BASE,
          "h-9 py-1.5",
          error ? CONTROL_ERR : CONTROL_OK,
          mono && CONTROL_MONO,
          className,
        )}
        {...rest}
      />
      <FieldFoot id={descId} hint={hint} error={error} />
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  mono?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, mono, className, id, rows = 4, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  const descId = `${controlId}-desc`;
  const described = error || hint ? descId : undefined;

  return (
    <div className="w-full">
      <FieldLabel htmlFor={controlId} label={label} required={rest.required} />
      <textarea
        id={controlId}
        ref={ref}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={cx(
          CONTROL_BASE,
          "scrollbar-thin resize-y py-2 leading-relaxed",
          error ? CONTROL_ERR : CONTROL_OK,
          mono && CONTROL_MONO,
          className,
        )}
        {...rest}
      />
      <FieldFoot id={descId} hint={hint} error={error} />
    </div>
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  mono?: boolean;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, mono, options, className, id, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  const descId = `${controlId}-desc`;
  const described = error || hint ? descId : undefined;

  return (
    <div className="w-full">
      <FieldLabel htmlFor={controlId} label={label} required={rest.required} />
      <div className="relative">
        <select
          id={controlId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={cx(
            CONTROL_BASE,
            "h-9 cursor-pointer appearance-none py-1.5 pr-8",
            error ? CONTROL_ERR : CONTROL_OK,
            mono && CONTROL_MONO,
            className,
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
          <IconChevronDown />
        </span>
      </div>
      <FieldFoot id={descId} hint={hint} error={error} />
    </div>
  );
});

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, id, disabled, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? autoId;

  return (
    <label
      htmlFor={controlId}
      className={cx(
        "inline-flex items-center gap-2 text-sm select-none",
        disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700",
      )}
    >
      <input
        id={controlId}
        ref={ref}
        type="checkbox"
        disabled={disabled}
        className={cx(
          "h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-indigo-600 accent-indigo-600 shadow-sm",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...rest}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  size = "md",
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const small = size === "sm";
  return (
    <label
      className={cx(
        "inline-flex items-center gap-2 text-sm select-none",
        disabled ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-slate-700",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
          "disabled:cursor-not-allowed disabled:opacity-60",
          small ? "h-4.5 w-8" : "h-5 w-9",
          checked ? "bg-indigo-600" : "bg-slate-300",
        )}
      >
        <span
          className={cx(
            "pointer-events-none inline-block transform rounded-full bg-white shadow-sm transition-transform",
            small ? "h-3.5 w-3.5" : "h-4 w-4",
            checked
              ? small
                ? "translate-x-4"
                : "translate-x-4.5"
              : "translate-x-0.5",
          )}
        />
      </button>
      {label ? <span>{label}</span> : null}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({
  title,
  description,
  actions,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cx(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            {title ? (
              <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx("px-5 py-4", bodyClassName)}>{children}</div>
      {footer ? (
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-[13px] leading-5 text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <IconInbox />}
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-[13px] leading-5 text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */

export type BadgeTone = "gray" | "green" | "red" | "amber" | "blue" | "purple" | "indigo";

const BADGE_TONES: Record<BadgeTone, string> = {
  gray: "bg-slate-100 text-slate-600 ring-slate-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const METHOD_TONES: Record<string, string> = {
  GET: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  POST: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  PUT: "bg-amber-50 text-amber-700 ring-amber-200",
  PATCH: "bg-violet-50 text-violet-700 ring-violet-200",
  DELETE: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  const upper = (method || "").toUpperCase();
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-4 font-semibold tracking-wide ring-1 ring-inset",
        METHOD_TONES[upper] ?? "bg-slate-100 text-slate-600 ring-slate-200",
        className,
      )}
    >
      {upper || "—"}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: number; className?: string }) {
  const tone =
    status >= 500
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : status >= 400
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : status >= 300
          ? "bg-blue-50 text-blue-700 ring-blue-200"
          : status >= 200
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] leading-4 font-semibold ring-1 ring-inset",
        tone,
        className,
      )}
    >
      {Number.isFinite(status) ? status : "—"}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cx("scrollbar-thin overflow-x-auto border-b border-slate-200", className)}>
      <nav className="flex min-w-max items-center gap-1" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={cx(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-600",
                selected
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge !== "" ? (
                <span
                  className={cx(
                    "inline-flex min-w-4.5 items-center justify-center rounded-full px-1.5 py-px text-[11px] leading-4 font-semibold",
                    selected ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600",
                  )}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Modal + confirm
 * ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  children?: React.ReactNode;
}) {
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "animate-modal-in my-auto flex max-h-[calc(100vh-4rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-0.5 -mr-1 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <IconClose />
          </button>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600",
          )}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M10 6.5v4m0 3h.01"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </span>
        <div className="pt-1 text-[13px] leading-5 text-slate-600">{message}</div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Code + clipboard
 * ------------------------------------------------------------------ */

async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleCopy() {
    const ok = await writeClipboard(value);
    if (!ok) {
      toast("Could not access the clipboard", "error");
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : `Copy${label ? ` ${label}` : ""}`}
      aria-label={label ? `Copy ${label}` : "Copy to clipboard"}
      className={cx(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-medium text-slate-600 shadow-sm transition-colors",
        "hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600",
        className,
      )}
    >
      {copied ? (
        <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
      {label ?? (copied ? "Copied" : null)}
    </button>
  );
}

export function CodeBlock({
  code,
  className,
  copyable,
  maxHeight,
}: {
  code: string;
  className?: string;
  copyable?: boolean;
  maxHeight?: number;
}) {
  return (
    <div className={cx("group relative", className)}>
      {copyable ? (
        <div className="absolute top-2.5 right-2.5 z-10 opacity-80 transition-opacity group-hover:opacity-100">
          <CopyButton value={code} />
        </div>
      ) : null}
      <pre
        style={maxHeight ? { maxHeight } : undefined}
        className={cx(
          "scrollbar-dark overflow-x-auto rounded-xl bg-slate-900 px-4 py-3.5 font-mono text-[12.5px] leading-[1.65] text-slate-100",
          maxHeight ? "overflow-y-auto" : null,
          copyable ? "pr-14" : null,
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * JSON editor
 * ------------------------------------------------------------------ */

export function JsonEditor({
  value,
  onChange,
  error,
  minHeight = 180,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  minHeight?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const parseError = React.useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed) as unknown;
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON";
    }
  }, [value]);

  const empty = value.trim().length === 0;
  const shown = error ?? parseError;

  function format() {
    try {
      onChange(JSON.stringify(JSON.parse(value) as unknown, null, 2));
    } catch {
      toast("Cannot format — the JSON is not valid", "error");
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-2 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 px-2.5 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          <span
            className={cx(
              "h-1.5 w-1.5 rounded-full",
              empty ? "bg-slate-300" : parseError ? "bg-rose-500" : "bg-emerald-500",
            )}
            aria-hidden="true"
          />
          {empty ? "Empty" : parseError ? "Invalid JSON" : "Valid JSON"}
        </span>
        <button
          type="button"
          onClick={format}
          disabled={disabled || empty || Boolean(parseError)}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
        >
          <IconWand className="h-3 w-3" />
          Format
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{ minHeight }}
        className={cx(
          "scrollbar-thin block w-full resize-y rounded-b-lg border bg-white px-3 py-2.5 font-mono text-[13px] leading-[1.6] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
          shown
            ? "border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
            : "border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
        )}
      />
      {shown ? (
        <p className="mt-1.5 font-mono text-xs leading-4 break-words text-rose-600">{shown}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Key / value editor
 * ------------------------------------------------------------------ */

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `kv_${rowSeq}`;
}

function toRows(record: Record<string, string> | undefined): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({
    id: nextRowId(),
    key,
    value,
  }));
}

function toRecord(rows: KeyValueRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) record[key] = row.value;
  }
  return record;
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "name",
  valuePlaceholder = "value",
  addLabel = "Add row",
  disabled,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = React.useState<KeyValueRow[]>(() => toRows(value));
  const emitted = React.useRef<string>(JSON.stringify(value ?? {}));

  React.useEffect(() => {
    const incoming = JSON.stringify(value ?? {});
    if (incoming === emitted.current) return;
    emitted.current = incoming;
    setRows(toRows(value));
  }, [value]);

  function commit(next: KeyValueRow[]) {
    setRows(next);
    const record = toRecord(next);
    emitted.current = JSON.stringify(record);
    onChange(record);
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[13px] text-slate-500">
          No entries yet.
        </p>
      ) : null}

      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <input
            value={row.key}
            disabled={disabled}
            placeholder={keyPlaceholder}
            spellCheck={false}
            aria-label={`${keyPlaceholder} ${index + 1}`}
            onChange={(event) =>
              commit(rows.map((r) => (r.id === row.id ? { ...r, key: event.target.value } : r)))
            }
            className={cx(CONTROL_BASE, CONTROL_OK, CONTROL_MONO, "h-9 shrink-0 grow-0 basis-2/5 py-1.5")}
          />
          <input
            value={row.value}
            disabled={disabled}
            placeholder={valuePlaceholder}
            spellCheck={false}
            aria-label={`${valuePlaceholder} ${index + 1}`}
            onChange={(event) =>
              commit(rows.map((r) => (r.id === row.id ? { ...r, value: event.target.value } : r)))
            }
            className={cx(CONTROL_BASE, CONTROL_OK, CONTROL_MONO, "h-9 min-w-0 flex-1 py-1.5")}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => commit(rows.filter((r) => r.id !== row.id))}
            aria-label={`Remove ${row.key || "row"}`}
            title="Remove"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => commit([...rows, { id: nextRowId(), key: "", value: "" }])}
      >
        <IconPlus />
        {addLabel}
      </Button>
    </div>
  );
}
