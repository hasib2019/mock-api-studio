"use client";

/**
 * One registered response.
 *
 * Scenarios are evaluated top to bottom: the first enabled one whose
 * conditions all pass wins, and a scenario with no conditions always passes —
 * which is why a non-default scenario without conditions gets a warning badge.
 */

import * as React from "react";

import { ConditionEditor } from "@/components/builder/ConditionEditor";
import {
  Badge,
  Button,
  Input,
  JsonEditor,
  KeyValueEditor,
  Select,
  StatusBadge,
  Textarea,
  Toggle,
} from "@/components/ui";
import { newCondition } from "@/lib/defaults";
import type { Condition, ResponseScenario } from "@/lib/types";

const STATUS_PRESETS = [
  { value: "200", label: "200 OK" },
  { value: "201", label: "201 Created" },
  { value: "202", label: "202 Accepted" },
  { value: "400", label: "400 Bad Request" },
  { value: "401", label: "401 Unauthorized" },
  { value: "403", label: "403 Forbidden" },
  { value: "404", label: "404 Not Found" },
  { value: "409", label: "409 Conflict" },
  { value: "422", label: "422 Unprocessable" },
  { value: "429", label: "429 Too Many Requests" },
  { value: "500", label: "500 Server Error" },
  { value: "503", label: "503 Unavailable" },
];

function toInt(text: string, fallback: number): number {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return fallback;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function IconArrow({ up }: { up: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 ${up ? "" : "rotate-180"}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 15.5V5m0 0L5.5 9.5M10 5l4.5 4.5"
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

function IconButton({
  onClick,
  disabled,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          : "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

export function ScenarioEditor({
  scenario,
  index,
  total,
  bodyText,
  error,
  onChange,
  onBodyTextChange,
  onMakeDefault,
  onMove,
  onRemove,
}: {
  scenario: ResponseScenario;
  index: number;
  total: number;
  bodyText: string;
  error?: string;
  onChange: (next: ResponseScenario) => void;
  onBodyTextChange: (text: string) => void;
  onMakeDefault: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const patch = (next: Partial<ResponseScenario>) => onChange({ ...scenario, ...next });
  const shadowing = !scenario.isDefault && scenario.conditions.length === 0;

  function updateCondition(next: Condition) {
    patch({ conditions: scenario.conditions.map((c) => (c.id === next.id ? next : c)) });
  }

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        error ? "border-rose-300" : scenario.enabled ? "border-slate-200" : "border-slate-200/70"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 font-mono text-[11px] font-semibold text-slate-600">
          {index + 1}
        </span>

        <div className="min-w-40 flex-1">
          <Input
            aria-label="Scenario name"
            placeholder="Insufficient balance"
            value={scenario.name}
            error={error}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>

        <StatusBadge status={scenario.status} />
        {scenario.isDefault ? <Badge tone="indigo">Default</Badge> : null}
        {scenario.enabled ? null : <Badge tone="gray">Disabled</Badge>}
        {shadowing ? <Badge tone="amber">Always matches</Badge> : null}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <IconButton title="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <IconArrow up />
          </IconButton>
          <IconButton
            title="Move down"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
          >
            <IconArrow up={false} />
          </IconButton>
          <IconButton title="Delete scenario" onClick={onRemove} danger>
            <IconTrash />
          </IconButton>
        </div>
      </header>

      <div className="space-y-4 px-3 py-3.5">
        {shadowing ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-800">
            This scenario has no conditions, so it matches every request and hides every scenario
            below it. Add a condition or mark it as the default.
          </p>
        ) : null}

        <Textarea
          label="Description"
          rows={2}
          placeholder="What this response represents — shown in the generated docs."
          value={scenario.description ?? ""}
          onChange={(event) => patch({ description: event.target.value || undefined })}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            value={STATUS_PRESETS.some((p) => p.value === String(scenario.status))
              ? String(scenario.status)
              : "custom"}
            options={[...STATUS_PRESETS, { value: "custom", label: "Custom…" }]}
            onChange={(event) => {
              const next = event.target.value;
              if (next !== "custom") patch({ status: toInt(next, scenario.status) });
            }}
          />
          <Input
            label="Status code"
            inputMode="numeric"
            value={String(scenario.status)}
            onChange={(event) => patch({ status: toInt(event.target.value, 0) })}
          />
          <Input
            label="Extra delay (ms)"
            inputMode="numeric"
            placeholder="0"
            hint="Added on top of the endpoint delay"
            value={scenario.delayMs === 0 ? "" : String(scenario.delayMs)}
            onChange={(event) => patch({ delayMs: toInt(event.target.value, 0) })}
          />
          <div className="flex flex-col justify-center gap-2 pt-1">
            <Toggle
              checked={scenario.isDefault}
              onChange={(checked) => {
                if (checked) onMakeDefault();
                else patch({ isDefault: false });
              }}
              label="Default response"
            />
            <Toggle
              checked={scenario.enabled}
              onChange={(checked) => patch({ enabled: checked })}
              label="Enabled"
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Response headers</p>
          <KeyValueEditor
            value={scenario.headers}
            onChange={(headers) => patch({ headers })}
            keyPlaceholder="x-reference-id"
            valuePlaceholder="{{uuid}}"
            addLabel="Add header"
          />
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-slate-700">
              Match conditions
              <span className="ml-1.5 font-normal text-slate-400">
                {scenario.conditions.length === 0
                  ? "— matches everything"
                  : `— all ${scenario.conditions.length} must pass`}
              </span>
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => patch({ conditions: [...scenario.conditions, newCondition()] })}
            >
              <IconPlus />
              Add condition
            </Button>
          </div>

          {scenario.conditions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-[13px] text-slate-500">
              No conditions — this scenario is picked whenever it is reached.
            </p>
          ) : (
            <div className="space-y-2">
              {scenario.conditions.map((condition) => (
                <ConditionEditor
                  key={condition.id}
                  condition={condition}
                  onChange={updateCondition}
                  onRemove={() =>
                    patch({
                      conditions: scenario.conditions.filter((c) => c.id !== condition.id),
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">
            Response body
            <span className="ml-1.5 font-normal text-slate-400">
              — strings may contain {"{{tokens}}"}
            </span>
          </p>
          <JsonEditor value={bodyText} onChange={onBodyTextChange} minHeight={180} />
        </div>
      </div>
    </section>
  );
}

export default ScenarioEditor;
