"use client";

/**
 * One "when …" row of a response scenario.
 *
 * The plain-English summary underneath is produced by `describeCondition` so
 * the builder and the runtime always agree on what a condition means.
 */

import * as React from "react";

import { Select } from "@/components/ui";
import { describeCondition } from "@/lib/scenario";
import {
  CONDITION_OPERATORS,
  CONDITION_SOURCES,
  type Condition,
  type ConditionOperator,
  type ConditionSource,
} from "@/lib/types";

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "greater or equal",
  lt: "less than",
  lte: "less or equal",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  regex: "matches regex",
  in: "one of",
  notIn: "not one of",
  exists: "is present",
  notExists: "is missing",
  empty: "is empty",
  notEmpty: "is not empty",
};

const UNARY_OPERATORS: ReadonlyArray<ConditionOperator> = [
  "exists",
  "notExists",
  "empty",
  "notEmpty",
];

const LIST_OPERATORS: ReadonlyArray<ConditionOperator> = ["in", "notIn"];

const SOURCE_OPTIONS = CONDITION_SOURCES.map((source) => ({ value: source, label: source }));

const OPERATOR_OPTIONS = CONDITION_OPERATORS.map((operator) => ({
  value: operator,
  label: OPERATOR_LABELS[operator],
}));

const CONTROL =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none";

function isSource(value: string): value is ConditionSource {
  return (CONDITION_SOURCES as ReadonlyArray<string>).includes(value);
}

function isOperator(value: string): value is ConditionOperator {
  return (CONDITION_OPERATORS as ReadonlyArray<string>).includes(value);
}

function valueToText(value: Condition["value"]): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}) {
  const unary = UNARY_OPERATORS.includes(condition.operator);
  const listed = LIST_OPERATORS.includes(condition.operator);

  const [valueText, setValueText] = React.useState(() => valueToText(condition.value));

  function commitValue(text: string) {
    setValueText(text);
    if (listed) {
      const items = text
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      onChange({ ...condition, value: items });
      return;
    }
    onChange({ ...condition, value: text });
  }

  function changeOperator(next: ConditionOperator) {
    const nowListed = LIST_OPERATORS.includes(next);
    if (nowListed) {
      const items = valueText
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      onChange({ ...condition, operator: next, value: items });
      return;
    }
    onChange({ ...condition, operator: next, value: valueText });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-24 shrink-0">
          <Select
            aria-label="Condition source"
            value={condition.source}
            options={SOURCE_OPTIONS}
            onChange={(event) => {
              const next = event.target.value;
              if (isSource(next)) onChange({ ...condition, source: next });
            }}
          />
        </div>

        <input
          value={condition.path}
          onChange={(event) => onChange({ ...condition, path: event.target.value })}
          placeholder="amount"
          spellCheck={false}
          aria-label="Condition path"
          className={`${CONTROL} min-w-32 flex-1 font-mono`}
        />

        <div className="w-40 shrink-0">
          <Select
            aria-label="Condition operator"
            value={condition.operator}
            options={OPERATOR_OPTIONS}
            onChange={(event) => {
              const next = event.target.value;
              if (isOperator(next)) changeOperator(next);
            }}
          />
        </div>

        {unary ? null : (
          <input
            value={valueText}
            onChange={(event) => commitValue(event.target.value)}
            placeholder={listed ? "A, B, C" : "50000"}
            spellCheck={false}
            aria-label="Condition value"
            className={`${CONTROL} min-w-28 flex-1 font-mono`}
          />
        )}

        <button
          type="button"
          onClick={onRemove}
          title="Remove condition"
          aria-label="Remove condition"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
            <path
              d="M4.5 6h11m-8.5 0V4.75A1.25 1.25 0 018.75 3.5h2.5A1.25 1.25 0 0112.5 4.75V6m1.75 0l-.5 9a1.5 1.5 0 01-1.5 1.4H7.75a1.5 1.5 0 01-1.5-1.4l-.5-9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <p className="mt-1.5 font-mono text-[11px] leading-4 break-words text-slate-500">
        when {describeCondition(condition)}
      </p>
    </div>
  );
}

export default ConditionEditor;
