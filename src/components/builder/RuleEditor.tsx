"use client";

/**
 * The validation rules attached to a single field.
 *
 * Every rule the engine understands is described once in
 * `@/lib/validation/rules`; this editor is driven entirely by that catalog —
 * which rules may be added to the field's type, what argument each takes and
 * how to label it.
 */

import * as React from "react";

import { Badge, Input, Toggle } from "@/components/ui";
import { newRule } from "@/lib/defaults";
import type { FieldType, ValidationRule } from "@/lib/types";
import {
  RULE_BY_ID,
  RULE_GROUP_LABELS,
  rulesForType,
  type RuleGroup,
  type RuleMeta,
} from "@/lib/validation/rules";

/* ------------------------------------------------------------------ *
 * Argument controls
 * ------------------------------------------------------------------ */

function textOf(value: ValidationRule["value"]): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function NumberArg({
  value,
  onChange,
  label,
  placeholder,
  integer,
}: {
  value: ValidationRule["value"];
  onChange: (next: number | undefined) => void;
  label: string;
  placeholder?: string;
  integer: boolean;
}) {
  const [text, setText] = React.useState(() => textOf(value));

  return (
    <Input
      label={label}
      value={text}
      inputMode={integer ? "numeric" : "decimal"}
      placeholder={placeholder ?? (integer ? "10" : "0")}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const parsed = Number(next);
        if (!next.trim() || !Number.isFinite(parsed)) {
          onChange(undefined);
          return;
        }
        onChange(integer ? Math.trunc(parsed) : parsed);
      }}
    />
  );
}

function ListArg({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: ValidationRule["value"];
  onChange: (next: string[]) => void;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = React.useState(() => textOf(value));

  return (
    <Input
      label={label}
      value={text}
      mono
      spellCheck={false}
      placeholder={placeholder ?? "A, B, C"}
      hint="Comma separated"
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(
          next
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
        );
      }}
    />
  );
}

function RuleArgControls({
  rule,
  meta,
  onChange,
}: {
  rule: ValidationRule;
  meta: RuleMeta;
  onChange: (patch: Partial<ValidationRule>) => void;
}) {
  const label = meta.argLabel ?? "Value";

  switch (meta.argType) {
    case "none":
      return null;

    case "number":
    case "integer":
      return (
        <NumberArg
          label={label}
          value={rule.value}
          placeholder={meta.argPlaceholder}
          integer={meta.argType === "integer"}
          onChange={(next) => onChange({ value: next })}
        />
      );

    case "list":
      return (
        <ListArg
          label={label}
          value={rule.value}
          placeholder={meta.argPlaceholder}
          onChange={(next) => onChange({ value: next })}
        />
      );

    case "textPair":
      return (
        <>
          <Input
            label={label}
            mono
            spellCheck={false}
            placeholder={meta.argPlaceholder}
            value={textOf(rule.value)}
            onChange={(event) => onChange({ value: event.target.value })}
          />
          <Input
            label={meta.arg2Label ?? "Value"}
            spellCheck={false}
            placeholder="OTHER"
            value={rule.value2 === undefined || rule.value2 === null ? "" : String(rule.value2)}
            onChange={(event) => onChange({ value2: event.target.value })}
          />
        </>
      );

    default:
      return (
        <Input
          label={label}
          mono={meta.argType === "regex" || meta.argType === "field" || meta.id === "custom"}
          spellCheck={false}
          placeholder={meta.argPlaceholder}
          value={textOf(rule.value)}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      );
  }
}

/* ------------------------------------------------------------------ *
 * A single configured rule
 * ------------------------------------------------------------------ */

function RuleRow({
  rule,
  fieldType,
  onChange,
  onRemove,
}: {
  rule: ValidationRule;
  fieldType: FieldType;
  onChange: (next: ValidationRule) => void;
  onRemove: () => void;
}) {
  const meta: RuleMeta | undefined = RULE_BY_ID[rule.rule];
  const patch = (next: Partial<ValidationRule>) => onChange({ ...rule, ...next });

  if (!meta) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
        <span className="font-mono text-[13px] text-amber-800">
          Unknown rule “{rule.rule}”
        </span>
        <RemoveButton onClick={onRemove} label="rule" />
      </div>
    );
  }

  const applicable = meta.appliesTo.includes(fieldType);
  const hasArg = meta.argType !== "none";

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-slate-800">{meta.label}</span>
          <Badge tone="gray">{RULE_GROUP_LABELS[meta.group]}</Badge>
          {applicable ? null : (
            <Badge tone="amber">not valid for {fieldType}</Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle
            size="sm"
            checked={rule.enabled}
            onChange={(checked) => patch({ enabled: checked })}
            label={<span className="text-[12px] text-slate-500">Enabled</span>}
          />
          <RemoveButton onClick={onRemove} label={meta.label} />
        </div>
      </div>

      <div className={hasArg ? "mt-2.5 grid gap-3 sm:grid-cols-2" : "mt-2.5"}>
        {hasArg ? <RuleArgControls rule={rule} meta={meta} onChange={patch} /> : null}
        <Input
          label="Custom message"
          placeholder={meta.defaultMessage}
          value={rule.message ?? ""}
          onChange={(event) => patch({ message: event.target.value || undefined })}
        />
      </div>

      {meta.hint ? <p className="mt-2 text-xs leading-4 text-slate-500">{meta.hint}</p> : null}
    </div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Remove ${label}`}
      aria-label={`Remove ${label}`}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path
          d="M4.5 6h11m-8.5 0V4.75A1.25 1.25 0 018.75 3.5h2.5A1.25 1.25 0 0112.5 4.75V6m1.75 0l-.5 9a1.5 1.5 0 01-1.5 1.4H7.75a1.5 1.5 0 01-1.5-1.4l-.5-9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The list + the grouped "add rule" picker
 * ------------------------------------------------------------------ */

export function RuleEditor({
  fieldType,
  rules,
  onChange,
}: {
  fieldType: FieldType;
  rules: ValidationRule[];
  onChange: (next: ValidationRule[]) => void;
}) {
  const groups = React.useMemo(() => {
    const buckets = new Map<RuleGroup, RuleMeta[]>();
    for (const meta of rulesForType(fieldType)) {
      const bucket = buckets.get(meta.group);
      if (bucket) bucket.push(meta);
      else buckets.set(meta.group, [meta]);
    }
    return Array.from(buckets.entries());
  }, [fieldType]);

  function addRule(id: string) {
    const meta: RuleMeta | undefined = RULE_BY_ID[id];
    if (!meta) return;
    const seed: ValidationRule["value"] = meta.argType === "list" ? [] : undefined;
    onChange([...rules, newRule(meta.id, seed)]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-slate-700">
          Validation rules
          {rules.length ? (
            <span className="ml-1.5 font-normal text-slate-400">({rules.length})</span>
          ) : null}
        </p>

        <div className="relative">
          <select
            value=""
            aria-label="Add a validation rule"
            onChange={(event) => {
              const id = event.target.value;
              if (id) addRule(id);
              event.target.value = "";
            }}
            className="h-8 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white pr-8 pl-2.5 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          >
            <option value="">+ Add rule…</option>
            {groups.map(([group, metas]) => (
              <optgroup key={group} label={RULE_GROUP_LABELS[group]}>
                {metas.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {meta.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M5.5 8l4.5 4.5L14.5 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[13px] text-slate-500">
          No rules yet — presence and type are always checked.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              fieldType={fieldType}
              onChange={(next) => onChange(rules.map((r) => (r.id === rule.id ? next : r)))}
              onRemove={() => onChange(rules.filter((r) => r.id !== rule.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default RuleEditor;
