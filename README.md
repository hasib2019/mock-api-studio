# Mock API Studio

A self-hosted sandbox for the APIs you are not allowed to call yet.

Register an endpoint, describe the request payload and its validation rules, register one or
more response scenarios — and you immediately have a working HTTP endpoint that behaves like
the real thing: it rejects bad payloads with a proper error envelope, echoes your data back
through templates, and switches responses based on what you send.

Everything is stored in Postgres - point `DATABASE_URL` at any standard instance (Vercel
Postgres/Neon, Supabase, RDS, or a local one) and the studio creates its own tables on first
use. No accounts beyond the studio's own users, no other external dependencies.

---

## সংক্ষেপে (Banglish summary)

Bank-er onek API (NPSB, BEFTN, RTGS, NID verification, bKash) shudhu production-e ache.
Development ba testing-er shomoy team-er kache kono kaaj-korar moto endpoint thake na.

Ei tool diye apni nijei ekta **nokol (mock) API** banaben — teen ta step-e:

1. **Endpoint** banan — method + path + auth (jemon `POST /fund-transfer`).
2. **Request payload** define korun — kon field lagbe, kon field required, ar tar
   **validation rule** ki (13 digit account, amount min 10 max 500000, mobile regex, ityadi).
3. **Response scenario** banan — success-er JSON, ar shorto (condition) diye alada alada
   failure response (jemon `amount > 100000` hole `TXN_LIMIT_EXCEEDED`).

Er por `http://localhost:3000/api/mock/<project-slug>/<path>` e call korle asol API-r moto
kaaj korbe: bhul payload dile 422 error list, thik payload dile registered response.
Shob definition Postgres-e (`DATABASE_URL`) thake; team-er shathe share korte hole project
page theke **Export** kore JSON file pathan, ba onno instance-e **Import** korun. Login:
`admin` / `Era@1234!!`.

---

## Contents

- [What it solves](#what-it-solves)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Register an API in three steps](#register-an-api-in-three-steps)
- [The mock URL](#the-mock-url)
- [Worked example: fund transfer](#worked-example-fund-transfer)
- [Validation rule reference](#validation-rule-reference)
- [Response templating tokens](#response-templating-tokens)
- [Conditional scenarios](#conditional-scenarios)
- [Where the data lives and how to share it](#where-the-data-lives-and-how-to-share-it)
- [Admin API reference](#admin-api-reference)
- [Request logs](#request-logs)
- [Deployment](#deployment)
- [Project layout](#project-layout)

---

## What it solves

Integration work on banking rails has a chicken-and-egg problem: the counterparty API only
exists in production, UAT access takes weeks, and the sandbox that finally arrives cannot
reproduce the failure cases you actually need to handle — limit exceeded, insufficient
balance, NID mismatch, wrong OTP, timeouts.

Mock API Studio gives every team a stand-in they control:

| Problem | What the studio gives you |
| --- | --- |
| No endpoint to develop against | A live URL in under a minute, no code and no deployment |
| Need to test *bad* requests | A real validation engine: 40 rules, cross-field checks, custom expressions |
| Need to test failure branches | Conditional scenarios — same endpoint, different response per payload |
| Contract keeps changing | Edit the schema in the UI; the URL and the responses update instantly |
| Front-end waiting on back-end | Front-end codes against the mock while the core team builds the real one |
| QA needs reproducible cases | Fixed trigger values (`amount > 100000`, `otp = 000000`) always produce the same branch |
| Sharing with the team | Definitions are JSON files — commit them, or export/import them |

It is deliberately **not** a business simulator. It does not keep balances or move money; it
returns the response you registered, with your request data interpolated into it.

---

## Quick start

Requirements: **Node.js 20.9+** (22 LTS recommended), npm, and a **Postgres database**
(a free Neon/Supabase project or a local instance both work). Windows, macOS and Linux all
work.

```bash
git clone <your-repo-url> mock-api-studio
cd mock-api-studio
npm install
cp .env.example .env.local        # PowerShell: Copy-Item .env.example .env.local
# edit .env.local and set DATABASE_URL to your Postgres connection string
npm run dev
```

Open <http://localhost:3000>. You will land on the login page. Tables are created
automatically on first use — nothing to migrate for a fresh database.

**Default login: `admin` / `Era@1234!!`.**

The account is created on the first run from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (see below)
and stored — password hashed with PBKDF2-SHA512 — in the `studio_users` table. Change the
password from the **Users** page before anyone else can reach the host.

Then run the **Load demo data** action in the studio (or `POST /api/admin/seed`). It installs
the **Core Banking Sandbox** project with six ready-made endpoints:

| Endpoint | Shows off |
| --- | --- |
| `POST /fund-transfer` | Nested objects, cross-field rules, money rules, API-key auth, 3 scenarios |
| `GET /accounts/:accountNumber/balance` | Path parameters, optional query field, a 404 scenario |
| `POST /customer/nid-verify` | A custom expression rule, date format + minimum age, bearer auth |
| `POST /otp/send` | Regex on a mobile number, a default value, a 429 throttle scenario |
| `POST /otp/verify` | Exact length + digits-only OTP, a wrong-OTP branch |
| `GET /transactions` | Query validation, coercion and defaults, a paginated envelope |

Seeding is idempotent — running it twice does not duplicate anything.

Production build:

```bash
npm run build
npm start
```

Useful checks: `npm run lint`, `npm run typecheck`.

---

## Environment variables

Copy `.env.example` to `.env.local` and edit. Every value has a sane default for local work.

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | *(required, unless `DB_ENV=local`)* | Postgres connection string. Projects, endpoints, users and logs all live here — see [Where the data lives](#where-the-data-lives-and-how-to-share-it). `POSTGRES_URL` / `PRISMA_DATABASE_URL` work as aliases, in that order, for hosts that hand out one of those names instead. |
| `DB_ENV` | *(unset)* | Set to `local` to connect with the discrete `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_SSL` variables instead of a connection string — handy for a LAN/on-prem Postgres. Anything else uses `DATABASE_URL` et al. |
| `DB_SCHEMA` | `public` | Puts every studio table in this schema instead of `public` — use it when the database is shared with another app. |
| `SESSION_SECRET` | built-in dev secret | HMAC key for the `mas_session` cookie (12 h TTL). **Set this in production** — otherwise the app falls back to a public development secret and warns on boot. Changing it signs everyone out. |
| `ADMIN_USERNAME` | `admin` | Username of the first studio user, created only when the `studio_users` table is empty. |
| `ADMIN_PASSWORD` | `Era@1234!!` | Password of that first user. Ignored once the user exists — change it from the Users page. |
| `MOCK_LOG_RETENTION` | `500` | How many request logs to keep. Oldest entries are pruned on write. |

Generate a secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

---

## Register an API in three steps

The whole product is these three screens. The walkthrough below builds the seeded
`POST /fund-transfer` endpoint from scratch, so you can follow along and compare.

### Step 1 — Create a project

**Projects → New project.**

A project is a namespace; its **slug** becomes the first segment of every mock URL.

| Field | Example | Notes |
| --- | --- | --- |
| Name | `Core Banking Sandbox` | Free text, shown everywhere in the UI |
| Slug | `core-banking` | Auto-derived from the name; `a-z 0-9 -` only |
| Description | `NPSB / CASA stand-in for integration work` | Optional |
| Default headers | `x-sandbox: core-banking` | Merged into **every** response of the project |
| Colour | indigo | Only a visual marker in lists |

Everything under this project now lives at `/api/mock/core-banking/...`.

### Step 2 — Register the endpoint and its request schema

**Open the project → New endpoint.**

First the identity of the endpoint:

| Field | Example |
| --- | --- |
| Name | `Fund Transfer` |
| Method | `POST` |
| Path | `/fund-transfer` (parameters are written `:name`, e.g. `/accounts/:accountNumber/balance`) |
| Auth | `API key` · header `x-api-key` · value `sandbox-demo-key` |
| Enabled | on (a disabled endpoint answers `503 ENDPOINT_DISABLED`) |
| Delay | `0` ms (artificial latency, added to the scenario delay) |

Then the payload contract, on the **Request** tab. There are three field lists — **body**,
**query** and **headers** — plus two switches:

- **Allow unknown fields** — off means any key you did not register is reported as
  `unknownField`. (Headers are exempt: browsers and proxies add their own.)
- **Validation mode** — `collectAll` reports every problem at once (default), `failFast`
  stops at the first one.

Add the fields. Each one has a name, a type (`string`, `number`, `integer`, `boolean`,
`object`, `array`, `any`), a *required* flag, an optional description, an example, an optional
default value, and a list of rules:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `fromAccount` | string | yes | exact length `13`, digits only |
| `toAccount` | string | yes | exact length `13`, digits only, differs from field `fromAccount` |
| `amount` | number | yes | min `10`, max `500000`, max decimals `2` |
| `currency` | string | yes | one of `BDT, USD` |
| `purpose` | string | yes | one of `SALARY, BILL, PERSONAL, BUSINESS` |
| `remarks` | string | no | max length `120` |
| `beneficiary` | object | yes | children: `name` (min length 3), `mobile` (pattern `^01[3-9]\d{8}$`), `bankCode` (exact length 6) |

…and one header field: `x-request-id`, string, required, rule **UUID**.

Objects nest as deeply as you like; for an `array` field you pick the item type, and if the
items are objects you describe their properties the same way. Issues in arrays are reported
as `items[0].amount`.

Two shortcuts worth knowing:

- **Infer schema from JSON** — paste a sample payload and the field list is generated for you;
  then add the rules.
- **Duplicate endpoint** — clone a similar endpoint and edit the differences.

### Step 3 — Register the response scenarios

On the **Response** tab, add one scenario per outcome. A scenario has a name, a status code,
optional headers, an optional delay, a JSON body template, and a list of conditions.

Order matters: the **first enabled scenario whose conditions all match** wins. A scenario with
no conditions always matches. If nothing matches, the one flagged **Default** is used.

For the fund transfer, in this order:

1. **Limit exceeded** — condition `body.amount > 100000` → `200` with
   `"responseCode": "TXN_LIMIT_EXCEEDED"` (banks usually return HTTP 200 with a failure code —
   you can register whatever your counterparty actually does).
2. **Insufficient balance** — condition `body.fromAccount = 1010000000001` → `200` with
   `"responseCode": "INSUFFICIENT_BALANCE"`.
3. **Success** — no conditions, marked **Default** →

```json
{
  "status": "SUCCESS",
  "responseCode": "TXN_SUCCESS",
  "message": "Fund transfer completed successfully",
  "data": {
    "transactionId": "{{randomDigits(12)}}",
    "fromAccount": "{{body.fromAccount}}",
    "toAccount": "{{body.toAccount}}",
    "amount": "{{body.amount}}",
    "currency": "{{body.currency}}",
    "remarks": "{{body.remarks || \"N/A\"}}",
    "processedAt": "{{now}}"
  },
  "requestId": "{{headers.x-request-id}}",
  "timestamp": "{{now}}"
}
```

The two error envelopes — **validation error** (422 by default) and **auth error** (401) — are
templates too, editable on the same screen, so the sandbox can mirror your bank's house error
format exactly.

Save. The endpoint is live — the endpoint page shows its full mock URL with a copy button, and
the next section fires a real request at it.

---

## The mock URL

```
http(s)://<host>/api/mock/<projectSlug><endpointPath>
```

```
POST http://localhost:3000/api/mock/core-banking/fund-transfer
GET  http://localhost:3000/api/mock/core-banking/accounts/1010000000002/balance?currency=BDT
```

- Path parameters are declared as `:name` and captured for conditions and templates
  (`{{path.accountNumber}}`). A trailing `*` matches the rest of the path.
- Static segments beat parameterised ones when both could match.
- Every method is served: `GET POST PUT PATCH DELETE HEAD OPTIONS`.
- **Mock endpoints are public** — no studio login is needed, only the auth *you* registered on
  the endpoint. That is the point: your app, Postman and your CI can all call them.
- CORS is permissive (`Access-Control-Allow-Origin: *`, `OPTIONS` answers preflight), so
  browser front-ends can call the sandbox directly.

Auth modes you can register per endpoint:

| Mode | The caller must send |
| --- | --- |
| `none` | nothing |
| `apiKey` | your header, e.g. `x-api-key: sandbox-demo-key` |
| `bearer` | `Authorization: Bearer sandbox-demo-token` |
| `basic` | `Authorization: Basic base64(username:password)` |

Every response also carries diagnostics:

| Header | Meaning |
| --- | --- |
| `x-mock-endpoint-id` | Which registered endpoint answered |
| `x-mock-scenario` | Which scenario matched |
| `x-mock-duration-ms` | How long the mock took (including the artificial delay) |

The request pipeline, in order: **route match → enabled? → auth → parse body → validate →
match scenario → delay → render template → log**.

---

## Worked example: fund transfer

Both examples run against the seeded demo project. Start the app, load the demo data, and
paste them into a terminal.

### A valid request

```bash
curl -i -X POST http://localhost:3000/api/mock/core-banking/fund-transfer \
  -H "content-type: application/json" \
  -H "x-api-key: sandbox-demo-key" \
  -H "x-request-id: 6f9619ff-8b86-d011-b42d-00cf4fc964ff" \
  -d '{
    "fromAccount": "1010000000002",
    "toAccount": "2020000000009",
    "amount": 12500.50,
    "currency": "BDT",
    "purpose": "SALARY",
    "remarks": "August salary",
    "beneficiary": {
      "name": "Rahim Uddin",
      "mobile": "01712345678",
      "bankCode": "BRAKBD"
    }
  }'
```

```http
HTTP/1.1 200 OK
content-type: application/json
x-mock-scenario: Success
x-mock-duration-ms: 3
```

```json
{
  "status": "SUCCESS",
  "responseCode": "TXN_SUCCESS",
  "message": "Fund transfer completed successfully",
  "data": {
    "transactionId": "401439249732",
    "referenceNo": "NPSB84422056",
    "fromAccount": "1010000000002",
    "toAccount": "2020000000009",
    "beneficiaryName": "Rahim Uddin",
    "amount": 12500.5,
    "currency": "BDT",
    "charge": 0,
    "purpose": "SALARY",
    "remarks": "August salary",
    "settlementStatus": "SETTLED",
    "processedAt": "2026-08-12T12:41:56.841Z"
  },
  "requestId": "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
  "timestamp": "2026-08-12T12:41:56.841Z"
}
```

Note `"amount": 12500.5` — a number, not a string. A template that is exactly one token keeps
the original JSON type.

### An invalid request

Same account on both sides, an amount below the minimum with three decimals, an unsupported
currency, and no `beneficiary`:

```bash
curl -i -X POST http://localhost:3000/api/mock/core-banking/fund-transfer \
  -H "content-type: application/json" \
  -H "x-api-key: sandbox-demo-key" \
  -H "x-request-id: 6f9619ff-8b86-d011-b42d-00cf4fc964ff" \
  -d '{
    "fromAccount": "1010000000002",
    "toAccount": "1010000000002",
    "amount": 5.555,
    "currency": "EUR",
    "purpose": "SALARY"
  }'
```

```json
HTTP/1.1 422 Unprocessable Entity

{
  "status": "FAILED",
  "responseCode": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "errorCount": 5,
  "errors": [
    { "field": "toAccount", "message": "toAccount must be different from fromAccount", "rule": "notEqualsField" },
    { "field": "amount", "message": "amount must be at least 10.00", "rule": "min" },
    { "field": "amount", "message": "amount may have at most 2 decimal places", "rule": "maxDecimals" },
    { "field": "currency", "message": "currency must be one of: BDT, USD", "rule": "enum" },
    { "field": "beneficiary", "message": "Beneficiary is required", "rule": "required" }
  ],
  "requestId": "c31e8964-6343-452f-ac92-e84bd6c37411",
  "timestamp": "2026-08-12T12:44:57.276Z"
}
```

Every message is the one registered on the rule — change it in the UI and this changes with it.

More things to try on the demo project:

```bash
# a scenario branch: over the limit
curl -s -X POST http://localhost:3000/api/mock/core-banking/fund-transfer \
  -H "content-type: application/json" -H "x-api-key: sandbox-demo-key" \
  -H "x-request-id: 6f9619ff-8b86-d011-b42d-00cf4fc964ff" \
  -d '{"fromAccount":"1010000000002","toAccount":"2020000000009","amount":250000,"currency":"BDT","purpose":"BUSINESS","beneficiary":{"name":"Rahim Uddin","mobile":"01712345678","bankCode":"BRAKBD"}}'
# -> TXN_LIMIT_EXCEEDED

# wrong API key -> the registered auth-error template, HTTP 401
curl -s -X POST http://localhost:3000/api/mock/core-banking/fund-transfer \
  -H "content-type: application/json" -H "x-api-key: nope" -d '{}'

# path + query, no auth
curl -s "http://localhost:3000/api/mock/core-banking/accounts/1010000000002/balance?currency=BDT"
curl -s "http://localhost:3000/api/mock/core-banking/accounts/0000000000000/balance"   # -> 404 ACCOUNT_NOT_FOUND

# query coercion: "2" arrives as the number 2, page/limit default to 1/20
curl -s -H "x-api-key: sandbox-demo-key" "http://localhost:3000/api/mock/core-banking/transactions?page=2&limit=5"
curl -s -H "x-api-key: sandbox-demo-key" "http://localhost:3000/api/mock/core-banking/transactions?page=abc"
```

> **Windows note.** In PowerShell, `curl` is an alias for `Invoke-WebRequest`. Use `curl.exe`
> and put the JSON body in single quotes, or export the ready-made Postman collection from the
> project page and run the requests from there.

---

## Validation rule reference

Rules are attached per field and run in order, after the presence check and the type check.
An optional field that is absent skips its rules entirely (a `defaultValue` is injected
instead). Query and header values arrive as strings and are coerced first, so `?page=2`
satisfies an `integer` field and `"true"` satisfies a `boolean` one.

Placeholders usable in a custom message: `{field}`, `{value}`, `{arg}`, `{arg2}`.

**Presence**

| Rule | Argument | Meaning |
| --- | --- | --- |
| `requiredIf` | other field + value | Required only when another field equals a value |
| `requiredUnless` | other field + value | Required unless another field equals a value |

**Text** (`string`)

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `minLength` | integer | `3` | At least N characters |
| `maxLength` | integer | `120` | At most N characters |
| `exactLength` | integer | `13` | Exactly N characters — account numbers, SWIFT/branch codes |
| `pattern` | regex | `^01[3-9]\d{8}$` | Must match the regular expression |
| `email` | — | | Valid email address |
| `url` | — | | Valid URL |
| `uuid` | — | | Valid UUID |
| `alpha` | — | | Letters only |
| `alphanumeric` | — | | Letters and digits only |
| `numericString` | — | | Digits only (keeps leading zeros, unlike a number field) |
| `startsWith` | text | `BD` | Prefix check |
| `endsWith` | text | `-BD` | Suffix check |
| `noWhitespace` | — | | No spaces or tabs anywhere |
| `lowercase` | — | | Must already be lowercase |
| `uppercase` | — | | Must already be uppercase |

**Number** (`number`, `integer`)

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `min` | number | `10` | `value >= arg` |
| `max` | number | `500000` | `value <= arg` |
| `greaterThan` | number | `0` | `value > arg` |
| `lessThan` | number | `1000000` | `value < arg` |
| `positive` | — | | Greater than zero |
| `negative` | — | | Less than zero |
| `multipleOf` | number | `100` | Step check — denominations, lot sizes |
| `maxDecimals` | integer | `2` | At most N decimal places — money |

**Choice** (scalars)

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `enum` | list | `SAVINGS, CURRENT, SND` | Must be one of the listed values |
| `notIn` | list | `TEST, DUMMY` | Must not be one of the listed values |

**Date & time** (`string`)

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `date` | — | | Any parseable date |
| `dateFormat` | format | `YYYY-MM-DD` | Must match the format (`YYYY MM DD HH mm ss`) |
| `before` | date or `today` | `today` | Must be earlier |
| `after` | date or `today` | `2020-01-01` | Must be later |
| `minAge` | integer | `18` | Reads the field as a date of birth |

**Array**

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `minItems` | integer | `1` | At least N items |
| `maxItems` | integer | `10` | At most N items |
| `uniqueItems` | — | | No duplicates |

**Cross-field**

| Rule | Argument | Example | Meaning |
| --- | --- | --- | --- |
| `equalsField` | field path | `confirmAccountNumber` | Must equal another field |
| `notEqualsField` | field path | `fromAccount` | Must differ from another field |
| `gtField` | field path | `minAmount` | Numerically greater than another field |
| `ltField` | field path | `maxAmount` | Numerically smaller than another field |

The argument is a dot path resolved against the same payload, e.g. `beneficiary.bankCode`.

**Custom**

| Rule | Argument | Example |
| --- | --- | --- |
| `custom` | JS boolean expression | `value.length === 10 \|\| value.length === 13 \|\| value.length === 17` |

The expression receives `value`, `body`, `query` and `headers`. It is evaluated in a
try/catch — a throw counts as a failure — and a malformed rule is skipped rather than
breaking the request. Keep it to a one-line predicate.

---

## Response templating tokens

Any string inside a scenario body, an error template, a scenario header — even an object
**key** — may contain `{{tokens}}`.

**Type preservation:** if the string is *exactly* one token, the resolved value keeps its JSON
type (`"{{body.amount}}"` → `12500.5`, `"{{query.page}}"` → `2`, an object stays an object).
Mixed strings (`"Txn {{uuid}} accepted"`) always render as strings. An unresolvable token
becomes `null` (whole string) or an empty string (mixed) — never a literal `{{...}}`.

| Token | Renders |
| --- | --- |
| `{{body.amount}}` | A body value, native type kept |
| `{{body.customer.name}}` | Nested via dot path |
| `{{body.items[0].id}}` | Array index |
| `{{query.page}}` | A query value (after coercion) |
| `{{headers.x-request-id}}` | A request header, matched case-insensitively |
| `{{path.accountNumber}}` | A `:param` captured from the path |
| `{{body.remarks \|\| "N/A"}}` | Fallback when missing/empty (quoted literal) |
| `{{body.channel \|\| none}}` | Bare `none`/`null` renders JSON `null` |
| `{{uuid}}` | Random UUID v4 |
| `{{now}}` | Current time, ISO 8601 |
| `{{now:date}}` | `2026-08-12` |
| `{{now:time}}` | `09:30:00` |
| `{{now:unix}}` | Unix seconds (number) |
| `{{timestamp}}` | Unix milliseconds (number) |
| `{{randomInt(1,999)}}` | Random whole number, inclusive bounds |
| `{{randomDecimal(1000,900000,2)}}` | Random decimal with N places (number) |
| `{{randomString(8)}}` | Random alphanumeric string |
| `{{randomDigits(12)}}` | Random digits — reference numbers, OTPs |
| `{{pick("A","B","C")}}` | One of the listed values at random |
| `{{meta.method}}` `{{meta.path}}` `{{meta.endpoint}}` | Request metadata |

Only inside the **validation error** template:

| Token | Renders |
| --- | --- |
| `{{errors}}` | The full array of `{ field, message, rule }` |
| `{{errorCount}}` | How many issues were found (number) |
| `{{firstError.field}}` · `{{firstError.message}}` · `{{firstError.rule}}` | The first issue |

The **Docs** page in the app carries the same cheat-sheet, always in sync with the build.

---

## Conditional scenarios

A condition is `<source>.<path> <operator> <value>`, where source is `body`, `query`,
`headers` or `path`. All conditions of a scenario must pass (AND); combine alternatives by
adding another scenario.

| Operator | Matches when |
| --- | --- |
| `eq` / `neq` | Equal / not equal (numeric when both sides look numeric, otherwise string) |
| `gt` / `gte` / `lt` / `lte` | Numeric comparison |
| `contains` / `notContains` | Substring |
| `startsWith` / `endsWith` | Prefix / suffix |
| `regex` | Regular expression match |
| `in` / `notIn` | Value is (not) in a comma-separated list |
| `exists` / `notExists` | The key is present / absent |
| `empty` / `notEmpty` | Empty string, empty array or null / the opposite |

Matching order:

1. Disabled scenarios are ignored.
2. The remaining ones are evaluated **top to bottom**; the first whose conditions all pass wins.
3. If none match, the **Default** scenario answers; if there is none, the first enabled one does.

Because conditions run on the *coerced* payload, `query.page > 1` works even though the caller
sent the string `"2"`.

Typical set for a payment endpoint:

| Scenario | Condition | Response |
| --- | --- | --- |
| Limit exceeded | `body.amount > 100000` | `TXN_LIMIT_EXCEEDED` |
| Insufficient balance | `body.fromAccount eq 1010000000001` | `INSUFFICIENT_BALANCE` |
| Beneficiary bank down | `body.beneficiary.bankCode eq DOWNBD` | `502` + `BANK_UNREACHABLE` |
| Timeout drill | `headers.x-simulate eq timeout` | delay `30000` ms |
| Success | *(default)* | `TXN_SUCCESS` |

---

## Where the data lives and how to share it

Everything lives in Postgres, in tables the studio creates itself on first use:

```
projects        one row per project        (id, slug, data jsonb)
endpoints       one row per endpoint        (id, project_id, method, path, data jsonb)
studio_users    studio users                (id, username, data jsonb - passwords are PBKDF2 hashes)
request_logs    recent request logs         (id, ts, project_id, endpoint_id, outcome, data jsonb)
```

`data` holds the full record (fields, rules, scenarios, templates, ...); the plain columns
next to it just exist for uniqueness and lookups. Endpoints cascade-delete with their project.
Request logs are pruned to `MOCK_LOG_RETENTION` on every write. Set `DB_SCHEMA` to keep these
tables in their own schema instead of `public` if the database is shared with another app.

Migrating from an older, file-based install? Point your database env vars at the new database
(see [Environment variables](#environment-variables)) and run `npm run migrate:data` once — it
copies `data/projects`, `data/endpoints` and `data/users.json` in, and is safe to re-run.

**Sharing with the team — export / import**

From a project page, **Export** downloads a single file:

| Format | Use it for |
| --- | --- |
| `json` | A full backup of the project. Import it into another studio instance verbatim. |
| `openapi` | An OpenAPI 3.1 document: request schemas from your fields and rules, the default scenario as the 200 example, the validation template as the 422 example, and a security scheme matching the endpoint auth. Feed it to Swagger UI, Redoc or a client generator. |
| `postman` | A Postman v2.1 collection with one request per endpoint, sample bodies built from your field examples, a `{{baseUrl}}` variable and the auth pre-filled. |

```bash
curl -b cookies.txt -o core-banking.json \
  "http://localhost:3000/api/admin/export/<projectId>?format=json"
```

**Import** takes the `json` export back (either the file as-is or wrapped as `{ "data": ... }`)
and recreates the project with fresh ids. If the slug is already taken it becomes
`core-banking-2`, so importing into the same instance is a safe way to fork a project.

---

## Admin API reference

Everything the UI does is a call to these routes. They all answer
`{ "ok": true, "data": ... }` or `{ "ok": false, "error": "...", "issues": [...] }` and all
require the `mas_session` cookie (sign in first — `POST /api/auth/login`).

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{ username, password }` → sets the session cookie |
| `POST` | `/api/auth/logout` | Clears the cookie |
| `GET` | `/api/auth/me` | The current session, or 401 |
| `GET` `POST` | `/api/admin/projects` | List / create projects |
| `GET` `PUT` `DELETE` | `/api/admin/projects/{projectId}` | Read (with its endpoints) / update / delete (cascades) |
| `GET` `POST` | `/api/admin/endpoints` | List (`?projectId=`) / create |
| `GET` `PUT` `DELETE` | `/api/admin/endpoints/{endpointId}` | Read / update / delete |
| `POST` | `/api/admin/endpoints/{endpointId}/duplicate` | Clone an endpoint |
| `GET` `DELETE` | `/api/admin/logs` | Recent logs (`?projectId=&endpointId=&outcome=&limit=`) / clear |
| `GET` | `/api/admin/stats` | Dashboard counters |
| `POST` | `/api/admin/infer-schema` | `{ sample, location }` → a generated field list |
| `GET` `POST` | `/api/admin/users` | List / create studio users |
| `DELETE` | `/api/admin/users/{userId}` | Delete a user (never the last admin) |
| `GET` | `/api/admin/export/{projectId}?format=json\|openapi\|postman` | Download a project |
| `POST` | `/api/admin/import` | `{ data }` → `{ projects, endpoints }` |
| `POST` | `/api/admin/seed` | Install the demo banking project (idempotent) |

Example — script the seeding of a fresh instance:

```bash
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"Era@1234!!"}'

curl -b cookies.txt -X POST http://localhost:3000/api/admin/seed
# {"ok":true,"data":{"projects":1,"endpoints":6}}
```

---

## Request logs

Every call to a mock endpoint is recorded: timestamp, method, URL, matched endpoint and
scenario, status, duration, the request headers/query/body, the response body and any
validation issues. The **Request Logs** page filters by project, endpoint and outcome
(`matched`, `validation_failed`, `auth_failed`, `not_found`, `disabled`) — it is usually the
fastest way to find out why your integration got a 422.

Bodies larger than 20 KB are truncated, only the newest `MOCK_LOG_RETENTION` entries are kept,
and logging never interferes with the response.

---

## Deployment

```bash
npm ci
npm run build
npm start          # port 3000; `npm start -- -p 8080` to change it
```

Checklist for a shared/staging host — including a serverless one like Vercel, where the
filesystem is read-only and every write to plain files would fail:

1. **Set `SESSION_SECRET`** to a long random value. Without it the app signs sessions with a
   public development secret.
2. **Provision Postgres and set `DATABASE_URL`.** Vercel Postgres/Neon, Supabase and RDS all
   work — see [Where the data lives](#where-the-data-lives-and-how-to-share-it). Tables are
   created automatically on first use.
3. **Change the admin password** after the first login (or set `ADMIN_PASSWORD` before the
   first start, so the seeded user never has a known password).
4. Serve it over **HTTPS** behind your reverse proxy (or Vercel's own TLS) — the session
   cookie is `httpOnly`, `sameSite=lax` and `secure` in production, so plain HTTP will not
   keep you signed in.
5. Remember the sandbox is a *stand-in*: it holds no real data and no real money, but the
   payloads in its logs may still contain customer-like data. Keep it on the internal network.

---

## Project layout

```
src/
  app/
    (studio)/            dashboard, projects, endpoint builder, logs, users, docs
    api/admin/*          the admin API used by the UI
    api/auth/*           login / logout / me
    api/mock/[...slug]/  the mock runtime - validate, match, render, log
    login/               sign-in page
  components/            UI building blocks + toasts
  lib/
    types.ts             every domain type (single source of truth)
    store.ts             projects + endpoints in Postgres
    db.ts                connection pool + schema bootstrap
    lock.ts              in-process mutex used to serialise writes
    validation/          the rule catalog and the validation engine
    template.ts          {{token}} rendering
    scenario.ts          condition evaluation and scenario matching
    matcher.ts           project slug + path matching
    seed.ts              the demo banking project
    export.ts            studio JSON / OpenAPI / Postman exporters
    auth.ts users.ts     studio sessions and accounts
    logs.ts              request log storage
  proxy.ts               guards the studio routes (Next.js 16 middleware)
scripts/
  migrate-file-data-to-postgres.mjs   one-time import from an older file-based install
```

Built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS v4, plus `pg` for
Postgres access. Validation, templating, hashing and id generation are all hand-rolled.
