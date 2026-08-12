import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Badge, CodeBlock } from "@/components/ui";
import { TEMPLATE_TOKENS } from "@/lib/template";
import { CONDITION_OPERATORS } from "@/lib/types";
import { RULE_CATALOG, RULE_GROUP_LABELS } from "@/lib/validation/rules";
import type { RuleGroup, RuleMeta } from "@/lib/validation/rules";

export const metadata: Metadata = {
  title: "Documentation · Mock API Studio",
};

/* ------------------------------------------------------------------ *
 * Static samples used by the worked example
 * ------------------------------------------------------------------ */

const URL_ANATOMY = `origin           http://localhost:3000
fixed prefix     /api/mock
project slug     /npsb
endpoint path    /accounts/:accountNumber/transfer
---------------------------------------------------------------
registered as    http://localhost:3000/api/mock/npsb/accounts/:accountNumber/transfer
called as        http://localhost:3000/api/mock/npsb/accounts/1234567890/transfer`;

const ERROR_ENVELOPE_TEMPLATE = `{
  "status": 422,
  "headers": {},
  "body": {
    "status": "FAILED",
    "responseCode": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "errorCount": "{{errorCount}}",
    "errors": "{{errors}}",
    "requestId": "{{uuid}}",
    "timestamp": "{{now}}"
  }
}`;

const ERROR_ENVELOPE_RENDERED = `HTTP/1.1 422 Unprocessable Entity
content-type: application/json
x-mock-endpoint-id: ep_9f31c0
x-mock-scenario: validation-error
x-mock-duration-ms: 4

{
  "status": "FAILED",
  "responseCode": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "errorCount": 2,
  "errors": [
    {
      "field": "amount",
      "message": "amount may not exceed 500000 BDT per NPSB transfer",
      "rule": "max"
    },
    {
      "field": "beneficiary.accountNumber",
      "message": "beneficiary.accountNumber must be exactly 13 characters",
      "rule": "exactLength"
    }
  ],
  "requestId": "1f8c4c1a-6a2b-4c7d-9c1e-0f5b7a2d3e44",
  "timestamp": "2026-08-12T09:30:00.000Z"
}`;

const AUTH_SAMPLES = `# apiKey  — header name and secret are configured on the endpoint
curl -H "x-api-key: sandbox-key-9f31" ...

# bearer  — Authorization: Bearer <token>
curl -H "authorization: Bearer sandbox-token-4c7d" ...

# basic   — Authorization: Basic base64(username:password)
curl -u npsb-sandbox:s3cret ...

# none    — no credential is checked, the request goes straight to validation`;

const EXAMPLE_FIELDS = `[
  {
    "id": "f_amount",
    "name": "amount",
    "label": "Transfer amount",
    "type": "number",
    "required": true,
    "description": "Amount in BDT, maximum two decimals.",
    "example": 12500.5,
    "rules": [
      { "id": "r_min", "rule": "min", "value": 10, "enabled": true },
      {
        "id": "r_max",
        "rule": "max",
        "value": 500000,
        "message": "{field} may not exceed {arg} BDT per NPSB transfer",
        "enabled": true
      },
      { "id": "r_dec", "rule": "maxDecimals", "value": 2, "enabled": true }
    ],
    "children": []
  },
  {
    "id": "f_currency",
    "name": "currency",
    "type": "string",
    "required": false,
    "defaultValue": "BDT",
    "example": "BDT",
    "rules": [{ "id": "r_enum", "rule": "enum", "value": ["BDT"], "enabled": true }],
    "children": []
  },
  {
    "id": "f_beneficiary",
    "name": "beneficiary",
    "type": "object",
    "required": true,
    "rules": [],
    "children": [
      {
        "id": "f_ben_name",
        "name": "name",
        "type": "string",
        "required": true,
        "example": "Rahim Uddin",
        "rules": [
          { "id": "r_len", "rule": "minLength", "value": 3, "enabled": true },
          { "id": "r_alpha", "rule": "alpha", "enabled": true }
        ],
        "children": []
      },
      {
        "id": "f_ben_acc",
        "name": "accountNumber",
        "type": "string",
        "required": true,
        "example": "1234567890123",
        "rules": [
          { "id": "r_exact", "rule": "exactLength", "value": 13, "enabled": true },
          { "id": "r_num", "rule": "numericString", "enabled": true }
        ],
        "children": []
      },
      {
        "id": "f_ben_bank",
        "name": "bankCode",
        "type": "string",
        "required": true,
        "example": "DBBL",
        "rules": [
          {
            "id": "r_bank",
            "rule": "enum",
            "value": ["DBBL", "BRAC", "CITY", "EBL", "IBBL"],
            "enabled": true
          }
        ],
        "children": []
      }
    ]
  },
  {
    "id": "f_remarks",
    "name": "remarks",
    "type": "string",
    "required": false,
    "example": "Salary August",
    "rules": [{ "id": "r_rem", "rule": "maxLength", "value": 120, "enabled": true }],
    "children": []
  }
]`;

const EXAMPLE_SCENARIO = `{
  "id": "s_success",
  "name": "Accepted",
  "isDefault": true,
  "enabled": true,
  "conditions": [],
  "status": 200,
  "headers": { "x-npsb-channel": "SANDBOX" },
  "delayMs": 250,
  "body": {
    "status": "SUCCESS",
    "responseCode": "0000",
    "message": "Transfer accepted",
    "data": {
      "transactionId": "NPSB{{randomDigits(10)}}",
      "debitAccount": "{{path.accountNumber}}",
      "creditAccount": "{{body.beneficiary.accountNumber}}",
      "beneficiaryName": "{{body.beneficiary.name}}",
      "amount": "{{body.amount}}",
      "currency": "{{body.currency || \\"BDT\\"}}",
      "remarks": "{{body.remarks || \\"N/A\\"}}",
      "postedAt": "{{now}}"
    },
    "requestId": "{{uuid}}",
    "timestamp": "{{now}}"
  }
}`;

const EXAMPLE_LIMIT_SCENARIO = `{
  "id": "s_limit",
  "name": "Daily limit exceeded",
  "isDefault": false,
  "enabled": true,
  "conditions": [
    { "id": "c1", "source": "body", "path": "amount", "operator": "gt", "value": 50000 }
  ],
  "status": 200,
  "headers": {},
  "delayMs": 0,
  "body": {
    "status": "FAILED",
    "responseCode": "NPSB_LIMIT_EXCEEDED",
    "message": "Amount {{body.amount}} exceeds the per-transaction NPSB limit",
    "requestId": "{{uuid}}",
    "timestamp": "{{now}}"
  }
}`;

const VALID_REQUEST = `curl -X POST \\
  "http://localhost:3000/api/mock/npsb/accounts/1234567890/transfer" \\
  -H "content-type: application/json" \\
  -H "x-api-key: sandbox-key-9f31" \\
  -d '{
  "amount": 12500.5,
  "beneficiary": {
    "name": "Rahim Uddin",
    "accountNumber": "1234567890123",
    "bankCode": "DBBL"
  },
  "remarks": "Salary August"
}'`;

const VALID_RESPONSE = `HTTP/1.1 200 OK
content-type: application/json
x-npsb-channel: SANDBOX
x-mock-endpoint-id: ep_9f31c0
x-mock-scenario: Accepted
x-mock-duration-ms: 254

{
  "status": "SUCCESS",
  "responseCode": "0000",
  "message": "Transfer accepted",
  "data": {
    "transactionId": "NPSB4820395617",
    "debitAccount": "1234567890",
    "creditAccount": "1234567890123",
    "beneficiaryName": "Rahim Uddin",
    "amount": 12500.5,
    "currency": "BDT",
    "remarks": "Salary August",
    "postedAt": "2026-08-12T09:30:00.000Z"
  },
  "requestId": "8c2f1b90-5d33-42ae-9a71-6b0d2c9e4f10",
  "timestamp": "2026-08-12T09:30:00.000Z"
}`;

const INVALID_REQUEST = `curl -X POST \\
  "http://localhost:3000/api/mock/npsb/accounts/1234567890/transfer" \\
  -H "content-type: application/json" \\
  -H "x-api-key: sandbox-key-9f31" \\
  -d '{
  "amount": 900000,
  "beneficiary": {
    "name": "Rahim Uddin",
    "accountNumber": "12345",
    "bankCode": "DBBL"
  }
}'`;

const COERCION_SAMPLE = `GET /api/mock/npsb/statement?page=2&includePending=true

registered query fields
  page            integer   ->  "2"    becomes the number 2
  includePending  boolean   ->  "true" becomes the boolean true

a value that cannot be coerced produces a type issue:
  page=abc        ->  { "field": "page", "rule": "type", "message": "page must be an integer" }`;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function argumentText(rule: RuleMeta): string {
  switch (rule.argType) {
    case "none":
      return "no argument";
    case "textPair":
      return `${rule.argLabel ?? "value"} + ${rule.arg2Label ?? "value"}`;
    case "list":
      return `${rule.argLabel ?? "values"} (comma separated list)`;
    default:
      return `${rule.argLabel ?? "value"} (${rule.argType})`;
  }
}

const GROUP_ORDER = Object.keys(RULE_GROUP_LABELS) as RuleGroup[];

const TOC = [
  { id: "overview", label: "What this studio is" },
  { id: "flow", label: "The three-step flow" },
  { id: "url", label: "How the mock URL is composed" },
  { id: "auth", label: "Endpoint authentication" },
  { id: "rules", label: "Validation rule catalog" },
  { id: "tokens", label: "Response templating tokens" },
  { id: "scenarios", label: "Scenario matching order" },
  { id: "errors", label: "The error envelope" },
  { id: "example", label: "End-to-end example" },
];

function SectionCard({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-200 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {intro ? <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{intro}</p> : null}
      </header>
      <div className="space-y-4 px-5 py-4 text-[13.5px] leading-6 text-slate-700">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[12px] font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-slate-900">{title}</p>
        <div className="mt-1 space-y-2">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function DocsPage() {
  return (
    <div className="max-w-4xl space-y-6 pb-10">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Documentation</h1>
        <p className="mt-1 text-[13px] leading-5 text-slate-500">
          The complete manual for Mock API Studio: register an endpoint, describe the payload it
          accepts, decide what it answers, then point your application at the generated URL.
        </p>
      </header>

      <nav className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          On this page
        </p>
        <ol className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
          {TOC.map((item, index) => (
            <li key={item.id} className="flex gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[11.5px] text-slate-400">
                {index + 1}
              </span>
              <a href={`#${item.id}`} className="text-indigo-700 hover:underline">
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ------------------------------ overview ------------------------------ */}
      <SectionCard
        id="overview"
        title="What this studio is, and why it exists"
        intro="A self-hosted stand-in for the external APIs the bank integrates with."
      >
        <p>
          The systems our applications must talk to — NPSB, BEFTN, RTGS, NID verification, the
          mobile financial service gateways — only exist in production. There is no vendor sandbox
          we can hit from a laptop, no way to replay a failure on demand, and no safe way to test
          the unhappy paths. Development stalls waiting for a partner, and integration bugs surface
          late, in UAT, where they are expensive.
        </p>
        <p>
          Mock API Studio closes that gap. A developer registers the contract of the partner
          endpoint here: its path, the credentials it expects, every field of the payload with the
          exact validation the partner performs, and the set of responses it can return. The studio
          then serves that contract at a real HTTP URL. Your application points at it and behaves
          exactly as it will against production, including the error handling.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <span className="font-medium text-slate-900">No database.</span> Everything is JSON
            under <code className="font-mono text-[12.5px]">data/</code>, so a mock definition can
            be committed, reviewed and shared like any other artefact.
          </li>
          <li>
            <span className="font-medium text-slate-900">Faithful validation.</span> The same rule
            engine that the builder UI configures runs on every incoming request, so a payload that
            passes here is a payload the partner will accept.
          </li>
          <li>
            <span className="font-medium text-slate-900">Deterministic failures.</span> Limit
            breaches, insufficient balance, timeouts and downstream outages are all reproducible on
            demand through conditional scenarios and artificial latency.
          </li>
          <li>
            <span className="font-medium text-slate-900">Full visibility.</span> Every call is
            logged with its request, its validation issues and the response that was served.
          </li>
        </ul>
      </SectionCard>

      {/* -------------------------------- flow -------------------------------- */}
      <SectionCard
        id="flow"
        title="The three-step flow"
        intro="Register the endpoint, define the payload validation, define the response scenarios."
      >
        <div className="space-y-4">
          <Step n={1} title="Register the endpoint">
            <p>
              Inside a project, create an endpoint with a method and a path. The path may contain
              parameters written as <code className="font-mono text-[12.5px]">:name</code>, for
              example <code className="font-mono text-[12.5px]">/accounts/:accountNumber/transfer</code>
              . Choose the authentication the partner enforces, an optional global latency, and
              whether the endpoint is enabled. A disabled endpoint answers{" "}
              <code className="font-mono text-[12.5px]">503 ENDPOINT_DISABLED</code>, which is
              itself a useful failure to test against.
            </p>
          </Step>

          <Step n={2} title="Define the payload validation">
            <p>
              Register every key the caller may send, in the body, the query string and the
              headers. A field has a type, a required flag, an example used to seed the try-it
              console, an optional default applied when the caller omits it, and any number of
              rules from the catalog below. Objects and arrays of objects nest, so a field like{" "}
              <code className="font-mono text-[12.5px]">beneficiary.accountNumber</code> is
              validated at its real depth and reported at its real path.
            </p>
            <p>
              Two switches shape the whole request: <em>allow unknown fields</em> decides whether an
              unregistered key is rejected, and <em>validation mode</em> decides whether the engine
              collects every issue or stops at the first one. Query and header values always arrive
              as strings, so the engine coerces them before the rules run.
            </p>
            <CodeBlock code={COERCION_SAMPLE} maxHeight={260} />
          </Step>

          <Step n={3} title="Define the response scenarios">
            <p>
              A scenario is a status code, a set of headers, a JSON body template and an optional
              delay. Attach conditions to it and it only answers when they all pass, which is how
              one endpoint serves success, limit-exceeded, account-not-found and downstream-timeout
              from a single registration. Mark one scenario as the default so there is always
              something to fall back on. Inside the body, any string may contain{" "}
              <code className="font-mono text-[12.5px]">{"{{tokens}}"}</code> that echo the request
              back or generate values.
            </p>
          </Step>
        </div>

        <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[12.5px] text-indigo-900">
          The runtime pipeline follows the same order: resolve the route, check the endpoint is
          enabled, verify the credentials, parse the body, validate it, match a scenario, apply the
          delay, render the template, then log the call.
        </p>
      </SectionCard>

      {/* --------------------------------- url --------------------------------- */}
      <SectionCard
        id="url"
        title="How the mock URL is composed"
        intro="Project slug plus endpoint path, under the fixed /api/mock prefix."
      >
        <p>
          Every mock lives at{" "}
          <code className="font-mono text-[12.5px] text-slate-900">
            {"{origin}"}/api/mock/{"{project-slug}"}
            {"{endpoint-path}"}
          </code>
          . The origin is wherever the studio is running, the slug identifies the project, and the
          rest is the endpoint path exactly as registered.
        </p>
        <CodeBlock code={URL_ANATOMY} maxHeight={260} />
        <ul className="ml-4 list-disc space-y-1">
          <li>
            A <code className="font-mono text-[12.5px]">:param</code> segment matches any single
            segment and is captured. Captured values are available to templates as{" "}
            <code className="font-mono text-[12.5px]">{"{{path.accountNumber}}"}</code> and to
            conditions as source <code className="font-mono text-[12.5px]">path</code>.
          </li>
          <li>
            A trailing <code className="font-mono text-[12.5px]">*</code> matches the remainder of
            the URL, useful for proxy-style endpoints.
          </li>
          <li>
            When two endpoints could match, the exact static path always wins over the
            parameterised one.
          </li>
          <li>
            Method and path together must be unique inside a project; the same path with a
            different method is a different endpoint.
          </li>
          <li>
            Every response carries permissive CORS headers, so a browser application can call the
            sandbox directly, plus{" "}
            <code className="font-mono text-[12.5px]">x-mock-endpoint-id</code>,{" "}
            <code className="font-mono text-[12.5px]">x-mock-scenario</code> and{" "}
            <code className="font-mono text-[12.5px]">x-mock-duration-ms</code> for debugging.
          </li>
        </ul>
      </SectionCard>

      {/* -------------------------------- auth -------------------------------- */}
      <SectionCard
        id="auth"
        title="Endpoint authentication"
        intro="Four options, matched before the payload is even parsed."
      >
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Configured with</th>
                <th className="px-3 py-2">The caller sends</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-2">
                  <Badge tone="gray">none</Badge>
                </td>
                <td className="px-3 py-2 text-slate-600">nothing</td>
                <td className="px-3 py-2 text-slate-600">nothing, every caller is accepted</td>
              </tr>
              <tr>
                <td className="px-3 py-2">
                  <Badge tone="indigo">apiKey</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                  headerName + token
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                  x-api-key: sandbox-key-9f31
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">
                  <Badge tone="indigo">bearer</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">token</td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                  authorization: Bearer sandbox-token-4c7d
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2">
                  <Badge tone="indigo">basic</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                  username + password
                </td>
                <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                  authorization: Basic base64(user:pass)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock code={AUTH_SAMPLES} maxHeight={220} />
        <p>
          A failed check never reaches validation: the endpoint renders its auth error template,
          which defaults to <code className="font-mono text-[12.5px]">401 UNAUTHORIZED</code>, and
          the call is logged with the outcome{" "}
          <code className="font-mono text-[12.5px]">auth_failed</code>. The try-it console can fill
          the configured credentials into the header editor for you.
        </p>
      </SectionCard>

      {/* -------------------------------- rules -------------------------------- */}
      <SectionCard
        id="rules"
        title={`Validation rule catalog (${RULE_CATALOG.length} rules)`}
        intro="Every rule the engine understands, with the argument it takes and the message it produces when no custom message is set."
      >
        <p>
          A rule only runs when the field is present, except for the presence rules, which decide
          whether a missing field is an error at all. Messages support the placeholders{" "}
          <code className="font-mono text-[12.5px]">{"{field}"}</code>,{" "}
          <code className="font-mono text-[12.5px]">{"{value}"}</code>,{" "}
          <code className="font-mono text-[12.5px]">{"{arg}"}</code> and{" "}
          <code className="font-mono text-[12.5px]">{"{arg2}"}</code>, so a custom message stays
          accurate when the argument changes.
        </p>

        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Argument</th>
                <th className="px-3 py-2">Default message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {GROUP_ORDER.map((group) => {
                const rules = RULE_CATALOG.filter((rule) => rule.group === group);
                return rules.map((rule, index) => (
                  <tr key={rule.id} className="align-top">
                    {index === 0 ? (
                      <td
                        rowSpan={rules.length}
                        className="border-r border-slate-100 bg-slate-50/60 px-3 py-2 font-medium text-slate-700"
                      >
                        {RULE_GROUP_LABELS[group]}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <code className="font-mono font-semibold text-slate-900">{rule.id}</code>
                      <span className="block text-[11.5px] text-slate-500">{rule.label}</span>
                      {rule.hint ? (
                        <span className="mt-0.5 block text-[11.5px] text-slate-400">
                          {rule.hint}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{argumentText(rule)}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-slate-700">
                      {rule.defaultMessage}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>

        <p>
          Beyond the catalog the engine emits four built-in issues:{" "}
          <code className="font-mono text-[12.5px]">required</code> for a missing mandatory field,{" "}
          <code className="font-mono text-[12.5px]">type</code> when a value cannot be coerced to
          the declared type, <code className="font-mono text-[12.5px]">unknownField</code> when
          unknown keys are rejected, and <code className="font-mono text-[12.5px]">json</code> when
          the request body is not parseable at all. Header fields are matched case-insensitively
          and never produce unknown-field issues, because proxies and browsers add headers of their
          own.
        </p>
      </SectionCard>

      {/* ------------------------------- tokens ------------------------------- */}
      <SectionCard
        id="tokens"
        title={`Response templating tokens (${TEMPLATE_TOKENS.length})`}
        intro="Any string inside a scenario body, a scenario header or an error template may contain these."
      >
        <p>
          If the whole string is exactly one token, the resolved value keeps its native JSON type —{" "}
          <code className="font-mono text-[12.5px]">{'"{{body.amount}}"'}</code> renders the number{" "}
          <code className="font-mono text-[12.5px]">12500.5</code>, not the text. Mixed strings
          always render as text. A token that cannot be resolved becomes an empty string inside a
          mixed string, or <code className="font-mono text-[12.5px]">null</code> when it was the
          whole string, so a raw <code className="font-mono text-[12.5px]">{"{{"}</code> never
          leaks into a response. Object keys are templated too.
        </p>

        <div className="scrollbar-thin overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="bg-slate-50 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">What it renders</th>
                <th className="px-3 py-2">Example output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TEMPLATE_TOKENS.map((token) => (
                <tr key={token.token}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap text-indigo-700">
                    {token.token}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{token.description}</td>
                  <td className="px-3 py-2 font-mono break-all text-slate-700">{token.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ------------------------------ scenarios ------------------------------ */}
      <SectionCard
        id="scenarios"
        title="Conditional scenarios and the matching order"
        intro="One endpoint, many answers — the first scenario whose conditions all pass wins."
      >
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>Disabled scenarios are ignored entirely.</li>
          <li>
            The remaining scenarios are evaluated <span className="font-medium">in array order</span>
            , top to bottom, exactly as they appear in the builder. Reorder them to change
            precedence.
          </li>
          <li>
            Within a scenario every condition must pass; they are combined with AND. A scenario
            with no conditions always passes, which is why an unconditional scenario placed at the
            top would shadow everything below it.
          </li>
          <li>The first scenario that passes is served.</li>
          <li>
            If none pass, the scenario flagged as default is served. If there is no default, the
            first enabled scenario is used. If the endpoint has no enabled scenario at all, the
            runtime answers with an empty success.
          </li>
        </ol>

        <p>
          A condition reads a value out of{" "}
          <code className="font-mono text-[12.5px]">body</code>,{" "}
          <code className="font-mono text-[12.5px]">query</code>,{" "}
          <code className="font-mono text-[12.5px]">headers</code> or{" "}
          <code className="font-mono text-[12.5px]">path</code> using a dot path such as{" "}
          <code className="font-mono text-[12.5px]">beneficiary.accountNumber</code> or{" "}
          <code className="font-mono text-[12.5px]">items[0].amount</code>, and compares it with one
          of these operators:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPERATORS.map((operator) => (
            <code
              key={operator}
              className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-700"
            >
              {operator}
            </code>
          ))}
        </div>
        <p>
          Comparisons are deliberately loose: when both sides look numeric they are compared as
          numbers, otherwise as strings. The values a condition sees are the coerced ones, after
          defaults have been applied, so a query parameter registered as an integer is compared as
          an integer.
        </p>
        <CodeBlock code={EXAMPLE_LIMIT_SCENARIO} copyable maxHeight={340} />
      </SectionCard>

      {/* -------------------------------- errors -------------------------------- */}
      <SectionCard
        id="errors"
        title="The error envelope"
        intro="One template per endpoint for validation failures, one for auth failures."
      >
        <p>
          Both envelopes are ordinary response templates: a status, headers and a JSON body. The
          validation envelope additionally sees the issues that were collected, through the tokens{" "}
          <code className="font-mono text-[12.5px]">{"{{errors}}"}</code>,{" "}
          <code className="font-mono text-[12.5px]">{"{{errorCount}}"}</code> and{" "}
          <code className="font-mono text-[12.5px]">{"{{firstError.field}}"}</code>. Shape it to
          match whatever the real partner returns, so your error handling is exercised properly.
        </p>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            The registered template
          </p>
          <CodeBlock code={ERROR_ENVELOPE_TEMPLATE} copyable maxHeight={300} />
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            What the caller receives
          </p>
          <CodeBlock code={ERROR_ENVELOPE_RENDERED} copyable maxHeight={420} />
        </div>
        <p>
          Each entry of <code className="font-mono text-[12.5px]">errors</code> carries the field
          path, the rendered message and the rule that produced it. The same array is stored on the
          request log, so a failure can be reviewed later on the Request logs screen.
        </p>
      </SectionCard>

      {/* ------------------------------- example ------------------------------- */}
      <SectionCard
        id="example"
        title="End-to-end example: an NPSB fund transfer"
        intro="Project npsb, endpoint POST /accounts/:accountNumber/transfer, apiKey auth."
      >
        <p>
          The endpoint below models a real inter-bank transfer: an amount with a limit and two
          decimal places, a nested beneficiary whose account number is exactly thirteen digits, a
          bank code restricted to a list, and optional remarks. The currency defaults to BDT when
          the caller omits it.
        </p>

        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            1. The registered request body
          </p>
          <CodeBlock code={EXAMPLE_FIELDS} copyable maxHeight={420} />
        </div>

        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            2. The default success scenario
          </p>
          <CodeBlock code={EXAMPLE_SCENARIO} copyable maxHeight={420} />
        </div>

        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            3. A valid request
          </p>
          <CodeBlock code={VALID_REQUEST} copyable maxHeight={320} />
          <p className="mt-2 mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            and the response it gets
          </p>
          <CodeBlock code={VALID_RESPONSE} copyable maxHeight={420} />
          <p className="mt-2">
            Note what the tokens did: the path parameter became{" "}
            <code className="font-mono text-[12.5px]">debitAccount</code>,{" "}
            <code className="font-mono text-[12.5px]">amount</code> stayed a number because the
            whole string was a single token, the omitted currency fell back to the registered
            default, and the response was held back by the scenario delay of 250 ms.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            4. An invalid request
          </p>
          <CodeBlock code={INVALID_REQUEST} copyable maxHeight={320} />
          <p className="mt-2 mb-1.5 text-[12px] font-semibold tracking-wide text-slate-500 uppercase">
            and the 422 validation envelope
          </p>
          <CodeBlock code={ERROR_ENVELOPE_RENDERED} copyable maxHeight={420} />
          <p className="mt-2">
            The amount broke the <code className="font-mono text-[12.5px]">max</code> rule and used
            the custom message registered on it; the beneficiary account number broke{" "}
            <code className="font-mono text-[12.5px]">exactLength</code> and was reported at its
            nested path. Because the endpoint collects every issue, both came back in one response
            — switch the endpoint to fail-fast mode and only the first would.
          </p>
        </div>

        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
          Open the endpoint and use the try-it console to run both of these from the browser. It
          pre-fills the body from the registered examples, fills in the API key for you, and can
          copy the whole call as a cURL command for bash or for Windows cmd.
        </p>
      </SectionCard>
    </div>
  );
}
