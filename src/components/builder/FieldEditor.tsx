"use client";

/**
 * One registered payload key — plus, when the key is an object (or an array of
 * objects), the keys nested inside it.
 *
 * `FieldList` owns add / update / remove for a level; `FieldEditor` owns a
 * single row and recurses through `FieldList` for its children.
 */

import * as React from "react";

import { RuleEditor } from "@/components/builder/RuleEditor";
import { Badge, Button, Checkbox, Input, Select } from "@/components/ui";
import { newField } from "@/lib/defaults";
import { FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/types";

/** How deep the recursive editor is allowed to go (top level counts as 1). */
export const MAX_FIELD_DEPTH = 5;

const TYPE_LABELS: Record<FieldType, string> = {
  string: "String",
  number: "Number",
  integer: "Integer",
  boolean: "Boolean",
  object: "Object",
  array: "Array",
  any: "Any",
};

const TYPE_OPTIONS = FIELD_TYPES.map((type) => ({ value: type, label: TYPE_LABELS[type] }));

const ITEM_TYPE_OPTIONS = FIELD_TYPES.filter((type) => type !== "array").map((type) => ({
  value: type,
  label: `of ${TYPE_LABELS[type].toLowerCase()}`,
}));

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as ReadonlyArray<string>).includes(value);
}

/** `example` / `defaultValue` are free-form JSON — render them as editable text. */
export function valueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** …and back, interpreted through the field's declared type. */
export function textToValue(text: string, type: FieldType): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  switch (type) {
    case "number":
    case "integer": {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : trimmed;
    }
    case "boolean": {
      const lower = trimmed.toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") return true;
      if (lower === "false" || lower === "0" || lower === "no") return false;
      return trimmed;
    }
    case "object":
    case "array":
    case "any":
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return trimmed;
      }
    default:
      return text;
  }
}

/** True when the field carries a nested structure the editor can descend into. */
export function hasChildren(field: FieldDef): boolean {
  return field.type === "object" || (field.type === "array" && field.itemType === "object");
}

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 5.5l4.5 4.5L8 14.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M4.5 6h11m-8.5 0V4.75A1.25 1.25 0 018.75 3.5h2.5A1.25 1.25 0 0112.5 4.75V6m1.75 0l-.5 9a1.5 1.5 0 01-1.5 1.4H7.75a1.5 1.5 0 01-1.5-1.4l-.5-9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path d="M10 4.75v10.5M4.75 10h10.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * A single field row
 * ------------------------------------------------------------------ */

export function FieldEditor({
  field,
  depth,
  errors,
  onChange,
  onRemove,
}: {
  field: FieldDef;
  depth: number;
  errors?: Record<string, string>;
  onChange: (next: FieldDef) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [exampleText, setExampleText] = React.useState(() => valueToText(field.example));
  const [defaultText, setDefaultText] = React.useState(() => valueToText(field.defaultValue));

  const nested = hasChildren(field);
  const canNest = depth + 1 < MAX_FIELD_DEPTH;
  const ruleCount = field.rules.length;
  const error = errors?.[field.id];

  function patch(next: Partial<FieldDef>) {
    onChange({ ...field, ...next });
  }

  function changeType(type: FieldType) {
    onChange({
      ...field,
      type,
      itemType: type === "array" ? (field.itemType ?? "string") : undefined,
      children: type === "object" || type === "array" ? field.children : [],
      example: textToValue(exampleText, type),
      defaultValue: textToValue(defaultText, type),
    });
  }

  return (
    <div
      className={`rounded-lg border bg-white ${
        error ? "border-rose-300" : "border-slate-200"
      } shadow-sm`}
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${field.name || "field"}` : `Expand ${field.name || "field"}`}
          title="Description, default value and rules"
          className="inline-flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <IconChevron open={open} />
        </button>

        <div className="min-w-36 flex-[2]">
          <Input
            mono
            spellCheck={false}
            placeholder="fieldName"
            aria-label="Field name"
            value={field.name}
            error={error}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>

        <div className="w-28 shrink-0">
          <Select
            aria-label="Field type"
            value={field.type}
            options={TYPE_OPTIONS}
            onChange={(event) => {
              const next = event.target.value;
              if (isFieldType(next)) changeType(next);
            }}
          />
        </div>

        {field.type === "array" ? (
          <div className="w-32 shrink-0">
            <Select
              aria-label="Array item type"
              value={field.itemType ?? "string"}
              options={ITEM_TYPE_OPTIONS}
              onChange={(event) => {
                const next = event.target.value;
                if (isFieldType(next)) patch({ itemType: next });
              }}
            />
          </div>
        ) : null}

        <div className="min-w-28 flex-1">
          <Input
            spellCheck={false}
            placeholder="example"
            aria-label="Example value"
            mono
            value={exampleText}
            onChange={(event) => {
              setExampleText(event.target.value);
              patch({ example: textToValue(event.target.value, field.type) });
            }}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2 pl-1">
          <Checkbox
            checked={field.required}
            aria-label="Required"
            onChange={(event) => patch({ required: event.target.checked })}
            label={<span className="text-[12px] text-slate-600">Required</span>}
          />
          {ruleCount > 0 && !open ? (
            <Badge tone="indigo">
              {ruleCount} rule{ruleCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            title="Remove field"
            aria-label={`Remove ${field.name || "field"}`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <IconTrash />
          </button>
        </div>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Label"
              placeholder="Account number"
              value={field.label ?? ""}
              onChange={(event) => patch({ label: event.target.value || undefined })}
            />
            <Input
              label="Description"
              placeholder="Shown in the generated docs"
              value={field.description ?? ""}
              onChange={(event) => patch({ description: event.target.value || undefined })}
            />
            <Input
              label="Default value"
              hint="Injected when the caller omits an optional key"
              mono
              spellCheck={false}
              value={defaultText}
              onChange={(event) => {
                setDefaultText(event.target.value);
                patch({ defaultValue: textToValue(event.target.value, field.type) });
              }}
            />
          </div>

          <RuleEditor
            fieldType={field.type}
            rules={field.rules}
            onChange={(rules) => patch({ rules })}
          />
        </div>
      ) : null}

      {nested ? (
        <div className="border-t border-slate-100 bg-slate-50/40 px-3 py-3">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-slate-500 uppercase">
            {field.type === "array" ? "Item properties" : "Properties"}
          </p>
          {canNest ? (
            <div className="border-l-2 border-slate-200 pl-3">
              <FieldList
                fields={field.children}
                depth={depth + 1}
                errors={errors}
                onChange={(children) => patch({ children })}
                emptyLabel="No nested keys yet."
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
              Nesting is capped at {MAX_FIELD_DEPTH} levels — model anything deeper as its own
              endpoint or validate it with a custom rule.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A level of fields
 * ------------------------------------------------------------------ */

export function FieldList({
  fields,
  onChange,
  depth = 0,
  errors,
  addLabel = "Add field",
  emptyLabel = "No fields registered — every key is accepted as-is.",
}: {
  fields: FieldDef[];
  onChange: (next: FieldDef[]) => void;
  depth?: number;
  errors?: Record<string, string>;
  addLabel?: string;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-[13px] text-slate-500">
          {emptyLabel}
        </p>
      ) : (
        fields.map((field) => (
          <FieldEditor
            key={field.id}
            field={field}
            depth={depth}
            errors={errors}
            onChange={(next) => onChange(fields.map((f) => (f.id === field.id ? next : f)))}
            onRemove={() => onChange(fields.filter((f) => f.id !== field.id))}
          />
        ))
      )}

      <Button variant="secondary" size="sm" onClick={() => onChange([...fields, newField()])}>
        <IconPlus />
        {addLabel}
      </Button>
    </div>
  );
}

export default FieldEditor;
