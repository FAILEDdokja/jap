# Phase 4 — Manual Walkthrough Results

Executed against a **live stack** in the development sandbox on 2026-09-15.

| Component | What was actually running |
| --- | --- |
| Database | Real PostgreSQL 16 (embedded distribution), port `55999`, database `jap`, all 7 repo migrations applied in order |
| Backend | `backend/` Fastify API on port `4000`, `AUDIT_STORE=postgres`, `AUDIT_FAILURE_MODE=closed`, `CORS_CREDENTIALS=true` |
| Frontend | Production build (`npm run build`) served by `vite preview` on port `5173` |

Two environment facts constrain this walkthrough and are stated up front rather
than papered over:

1. **`prisma generate` cannot run in this sandbox.** The Prisma engine download
   from `binaries.prisma.sh` fails at the TLS layer. The audit store therefore
   ran through its `pg`-driver path (`configureAuditStore()` owning its own
   `pg.Pool`), which executes the *same* parameterized SQL as the Prisma path.
   This is a sandbox limitation, not a design choice — see
   `docs/decisions/0002-audit-failure-policy.md` and `backend/src/lib/prisma.ts`.
2. **No headless browser is installed** (no Playwright/Puppeteer/Chromium).
   Steps that require rendering and clicking were verified by serving the real
   production build over HTTP and by reading the responsible source, and are
   marked **VERIFIED (non-visual)** rather than claimed as a visual pass.

Legend: **PASS** = observed directly · **VERIFIED (non-visual)** = verified
without a rendering browser · **BLOCKED BY PHASE X** = depends on work outside
Phase 4.

---

## Step 1 — Frontend loads with no external asset requests

**PASS.**

```
index.html                                  HTTP 200  text/html
/assets/index-D92hU6Dz.js                   HTTP 200  text/javascript
/assets/react-C7bUi44F.js                   HTTP 200  text/javascript
/assets/vendor-CLfVjLQu.js                  HTTP 200  text/javascript
/assets/inter-latin-wght-normal-Dx4kXJAl.woff2  HTTP 200  font/woff2
```

The served HTML contains **zero** `<link>`/`<script>` tags pointing at any
`https://` origin. The only textual occurrence of `fonts.googleapis.com` is the
HTML comment that documents which domains the page deliberately no longer loads.
Inter is self-hosted and served from the app's own origin, so a strict CSP with
no `font-src`/`style-src` CDN allowances holds. Enforced in CI by the
`frontend` job (`docs/decisions/0011-frontend-assets.md`).

## Step 2 — `/health` liveness and `/health/ready` readiness

**PASS.**

- `GET /health` → `{"status":"ok",...}` — process liveness only, no dependency checks.
- `GET /health/ready` → HTTP 200, `checks: [{ name: "database", status: "ok", durationMs: 11.7 }]`.

Readiness genuinely reaches the database; with the database stopped it fails
rather than reporting a cached "ok". This is the distinction a load balancer
needs (`docs/decisions/0008-observability.md`).

## Step 3 — Sign in as a provisioned role; inspect the session cookie

**PASS.** `DOCTOR` / `HP-1001`:

```
Set-Cookie: jap_session=<opaque-random>; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800
```

Opaque server-side session handle — not a JWT, no PII, no role encoded in the
cookie value. `HttpOnly` blocks script access; `SameSite=Lax` blocks cross-site
form CSRF. `Secure` is added when `NODE_ENV=production`
(`docs/decisions/0001-session-security.md`).

## Step 4 — Unprovisioned role returns the honest locked state

**PASS.** `{"role":"LAB","identifier":"HP-1001"}` → `{"status":"identifier-not-found"}`.

The same identifier that authenticates as `DOCTOR` does not authenticate as
`LAB`. The response is the non-enumerating locked state from doc 03 §6 — no
fabricated success, and no oracle distinguishing "role not provisioned" from
"identifier wrong".

## Step 5 — Patient identifiers are opaque; identities are masked

**PASS.** The patient id in every URL and payload is an opaque UUID
(`00000000-0000-4000-8000-000000000257`) — not an ABHA number, phone, or any
other real-world identifier, so it is safe in logs, referrers, and history.

Identity values come back masked only:

```
"ABHA •••• 3401"
"••••@abdm"
```

No raw ABHA number appears in any response body.

## Step 6 — Default-deny authorization

**PASS.**

- `POST /api/v1/access/evaluate` (purpose `TREATMENT`, `OBSERVATION`, no consent
  on file) → `{"allowed":false,"reason":"no_consent","consentId":null}`.
- Unauthenticated patient read → HTTP 401.
- `GET /api/v1/audit/integrity` as `DOCTOR` → **HTTP 403**; as `SUPER_ADMIN` → 200.

Access is denied unless a rule grants it, and the denial names its reason
without leaking whether the record exists.

## Step 7 — Audit trail records the attempts

**PASS.** Sequences 1–6 present, including the denial:

```
seq | action         | resourceType | status  | purpose   | sourceIp       | deviceClass
  6 | ACCESS_DENIED  | OBSERVATION  | blocked | TREATMENT | 127.0.0.0/24   | automation
```

Source IP is truncated to a /24 and the device is reduced to a coarse class, so
the trail is forensically useful without becoming a per-user tracker
(`docs/decisions/0009-privacy-and-real-data-gate.md`). No OTPs, passwords,
session secrets, full ABHA numbers, or clinical payloads are stored.

## Step 8 — The audit table is append-only at the database level

**PASS.** Enforced by triggers, not merely by application code:

```
UPDATE audit_events ... -> ERROR: audit_events is append-only: UPDATE is not permitted
DELETE FROM audit_events -> ERROR: audit_events is append-only: DELETE is not permitted
```

A compromised application credential still cannot rewrite history. CI's
`database` job asserts both triggers exist after `migrate deploy`.

## Step 9 — Hash-chain integrity verification

**PASS.** `GET /api/v1/audit/integrity` as `SUPER_ADMIN`:

```json
{"ok":true,"checked":7,"firstSequence":1,"lastSequence":7,"issues":[]}
```

Tamper detection is covered by `backend/tests/audit-postgres.test.ts`, which
disables the triggers to simulate a privileged attacker, mutates a row, and
asserts the verifier reports the break.

## Step 10 — Sign-out revokes the session server-side

**PASS.** Sign-out → `{"status":"signed-out"}` plus a cleared cookie
(`Max-Age=0`, 1970 expiry). **Replaying the captured pre-logout cookie → HTTP
401 `unauthenticated`**, which proves revocation is server-side rather than a
cookie deletion the client could decline. A `LOGOUT` audit event is written.

## Step 11 — Rate limiting returns 429 with `Retry-After`

**PASS.** Eight failed authentication attempts:

```
HTTP/1.1 429
retry-after: 900
access-control-expose-headers: x-request-id, retry-after
{"error":{"code":"rate_limited",...}}
```

The header is CORS-exposed, so a browser client can actually read it. The
counter is keyed on the account/target dimension, so one attacker cannot lock
out unrelated users (`docs/decisions/0004-rate-limiting.md`).

## Step 12 — Metrics and security headers leak nothing

**PASS.**

```
jap_auth_attempts_total{result="success",role="DOCTOR"} 1
jap_auth_attempts_total{result="failure",role="DOCTOR"} 5
jap_session_events_total{event="created"} 2
jap_session_events_total{event="revoked"} 1
jap_audit_writes_total{result="success"} 10
jap_rate_limited_total{dimension="target",policy="authentication"} 3
```

Grepping `/metrics` for the patient UUID and for `HP-1001` returns **0
occurrences** — label cardinality is bounded and no identifier reaches a metric
label. Security headers on every response:

```
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
x-request-id: <uuid>
```

`no-referrer` matters specifically because it stops a patient URL from escaping
to any third party.

## Step 13 — Production build serves correctly

**PASS.** The build served by `vite preview` returned HTTP 200 with correct MIME
types for the HTML entry, all three JS chunks, the CSS bundle, and the
self-hosted woff2 (see Step 1). Hashed filenames permit immutable caching.
`npm run typecheck` and `npm run build` both pass and are gated in CI.

---

## Steps verified without a rendering browser

### Narrow-viewport (360px) layout

**VERIFIED (non-visual).** No headless browser is available, so this was checked
statically against the source:

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` is present.
- 97 responsive breakpoint utilities (`sm:`/`md:`/`lg:`/`xl:`) — the layout is mobile-first.
- Only two hard pixel values exist, and neither can overflow: `DataTable` uses
  `min-w-[640px]` **inside** a `scroll-slim overflow-x-auto` wrapper (wide tables
  scroll horizontally instead of bursting the viewport), and `AppShell` uses
  `max-w-[1200px]` (a cap, not a fixed width) with `px-4` gutters.
- Every file containing a `<table>` also contains an `overflow-x-auto` wrapper.

A human visual confirmation at 360px is still worth doing before any release;
this check establishes that no fixed-width element *can* overflow.

### Session persistence across a page reload

**VERIFIED (non-visual).** In API mode `AuthProvider` re-bootstraps on mount by
calling `getSession()` against the server and treats a 401 as "signed out"
rather than an error (`src/auth/AuthContext.tsx`). The server side of this is
proven live: `GET /session` with the cookie returns the user, and after sign-out
the same cookie returns 401 (Steps 3 and 10). The `localStorage` key holds only
a demo-persona user id — never a credential or a session token.

---

## Blocked steps

### ABHA verification flow

**BLOCKED BY PHASE 5 (ABDM identity integration).** Phase 4 is hardening only;
the full ABHA verification workflow is explicitly out of scope. What exists
today is the *seam*: environment keys are defined and validated, and the
masking/audit/consent surfaces that a real verification would feed are in place
and tested. The sandbox credentials themselves are a DECISION REQUIRED item
recorded in `docs/decisions/0010-abdm-certification-path.md`.

### OTP issuance and verification

**BLOCKED BY PHASE 5 (ABDM identity integration).** No OTP is issued, stored, or
verified anywhere in this codebase, and Phase 4 deliberately did not invent one.
The privacy rule that will govern it is already written down — OTPs are on the
never-log, never-audit list (`docs/privacy/readiness-checklist.md`).

---

## Defect found and fixed during this walkthrough

The in-memory patient store was only ever seeded from test setup, so a running
dev server returned `patients: []` while the whole test suite passed. Fixed by
invoking `resetPatientStore()` at module load in
`backend/src/modules/patients/store.ts`. This is exactly the class of bug a
manual walkthrough exists to catch.

## Honest limitations of this walkthrough

- Run against **synthetic data only**. No real patient data was used at any point.
- Executed in a development sandbox, **not** a production environment. Nothing
  here constitutes a production deployment, ABDM certification, a DPDP
  compliance determination, or a penetration test.
- The Prisma client path was exercised by unit tests and type-checking, not by
  this live run (see the note at the top).
