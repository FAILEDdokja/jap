# 06 — API Contracts

Endpoint-by-endpoint specification for what the backend should ship to satisfy
the current frontend. Paths, methods, and envelopes are **PROPOSAL** (the
frontend constrains *shapes and statuses*, not URLs — the adapter functions
`createApiAuthService`/`createAbdmIdentityService` translate). Everything
marked **locked** describes frontend behavior the API must accommodate.

Conventions used below (PROPOSAL, adopt-or-replace as one decision):

- Base: `/api/v1`; JSON everywhere; UTF-8.
- Auth: session cookie (HTTP-only, Secure, SameSite=Lax/Strict) — see doc 03, §5.
- Success envelope for seam calls mirrors the frontend discriminated union
  (`{ status, ... }`) so adapters stay trivial.
- Errors: HTTP status + `{ error: { code, message } }` with safe, displayable
  messages; 401 = session missing/expired (frontend routes to login);
  403 = authenticated but not permitted; 404 = unknown id (no existence oracle
  beyond what the seam contract allows); 422 = validation failure;
  429 = rate-limited.

## 1. Authentication (serves `auth-service.js`)

### `POST /api/v1/auth/authenticate` (PROPOSAL path)

Request (locked shape — the seam calls `authenticate({ role, identifier })`):

```json
{ "role": "doctor", "identifier": "HP-1001" }
```

Responses (locked statuses):

```json
// 200 — authenticated
{ "status": "authenticated", "user": { "id": "hp-1001", "role": "doctor", "name": "Dr. Aroha Deshpande" } }

// 200 — identifier-not-found (no account matches WITHIN that role)
{ "status": "identifier-not-found" }

// 200 — role-unavailable (role valid but no usable auth, or role invalid)
{ "status": "role-unavailable" }

// 200 — requires-credential (FUTURE, additive; doc 03, §8)
{ "status": "requires-credential", "requestId": "auth-…", "methods": ["otp"], "maskedContact": "•••••6781" }
```

Why 200 for non-success: these are **application outcomes**, not transport
failures — the UI switches on `status`. (Alternative PROPOSAL: 404/503
mapping; but then the adapter must map codes back to statuses. Either works —
decide once.)

Locked server rules: role-scoped alias resolution; case/space/dash-insensitive
matching; cross-role rejection; non-enumerating outcomes (doc 03, §4).

### `POST /api/v1/auth/verify-credential` (FUTURE — with credential milestone)

```json
// request
{ "requestId": "auth-…", "otp": "482913" }
// responses
{ "status": "authenticated", "user": { "id": "…", "role": "…", "name": "…" } }
{ "status": "credential-invalid" }
{ "status": "credential-expired" }
```

### `GET /api/v1/auth/session` (PROPOSAL — bootstrap/refresh)

```json
// 200 with valid session
{ "user": { "id": "hp-1001", "role": "doctor", "name": "Dr. Aroha Deshpande" } }
// 401 without
{ "error": { "code": "unauthenticated", "message": "Sign-in required." } }
```

Needed so a reload on `#/dashboard/<role>` can restore the session from the
server instead of trusting `sessionStorage` alone.

### `POST /api/v1/auth/sign-out` (PROPOSAL)

Revokes the server session; frontend clears `sessionStorage` and routes home.
Must be idempotent (succeed even if the session already expired).

## 2. Patient identity verification (serves `identity-service.js`)

### `POST /api/v1/patient-verifications` (PROPOSAL path)

Request (locked shape — `identifyPatient({ abha })`):

```json
{ "abha": "23-4567-8912-3401" }
```

Accepts ABHA number (formatted or bare digits) or ABHA address. Requires the
professional's authenticated session.

Responses (locked statuses):

```json
// 200 — verification opened; doctor proceeds to OTP step
{ "status": "otp-required", "requestId": "pv_…", "maskedAbha": "ABHA •••• 3401" }

// 200 — no match
{ "status": "abha-not-recognized" }

// 200 — FUTURE additive states (doc 04):
{ "status": "otp-expired", "requestId": "pv_…" }
{ "status": "consent-required", "requestId": "pv_…", "consentRequest": { "purpose": "care-provision", "…": "…" } }
```

Locked: pre-verification response contains **no name, no demographics** —
masked ABHA only.

### `POST /api/v1/patient-verifications/{requestId}/confirm` (PROPOSAL path)

Request (locked shape — `verifyOtp({ requestId, otp })`):

```json
{ "otp": "482913" }
```

Responses (locked statuses):

```json
// 200 — verified; frontend navigates to #/dashboard/doctor/patient/<patientId>
{ "status": "verified", "patientId": "p-01" }

// 200 — wrong code (or unknown/consumed requestId — same response)
{ "status": "otp-invalid" }

// 200 — FUTURE additive:
{ "status": "otp-expired" }
```

Locked: wrong code leaves the verification open (retryable); correct code
consumes it (single-use; re-confirm returns `otp-invalid`). `patientId` is the
**opaque internal record id**, never the ABHA.

### `POST /api/v1/patient-verifications/{requestId}/resend` (FUTURE)

Resend policy (cooldown, max count) needs a product decision. Response reuses
`otp-required` shape or a dedicated status — decide with the milestone.

### What production must NEVER expose

`getDemoAbha` / `getDemoOtp` equivalents. No endpoint may return a live OTP or
an example ABHA. The frontend capability-checks these methods and adapts.

## 3. Patient records (serves `mock/patients.js` reads)

### `GET /api/v1/patients/{id}` (PROPOSAL path)

- `{id}` is the opaque record id from the verified response / route.
- Requires: authenticated professional session **+ a fresh verification
  grant** for this patient (PROPOSAL: verification issues a short-lived,
  purpose-bound grant token the record read consumes — the seam that consent
  later slots into; needs a decision, doc 04, §7).
- Response: the locked record shape from doc 05, §2–§4 (full JSON record).
- Unknown id → 404 with the frontend's "Unable to load patient" semantics
  (no patient data, no leakage about which ids exist — opaque ids make
  enumeration infeasible).
- Every read is audit-logged: actor, patient ref, purpose/grant, timestamp
  (doc 09, §2).

### `GET /api/v1/admissions?status=active` (PROPOSAL path)

Serves the Dashboard's Active Admissions table (replaces `activeAdmissions()`):

```json
{
  "admissions": [
    { "id": "p-01", "name": "Amit Kumar", "ward": "Ward B", "bed": "Bed 3", "admittedOn": "2026-09-07" }
  ]
}
```

Locked semantics: only currently-admitted patients; rows from record
admission facts (doc 05, §5a); ward-then-(numeric)-bed sort; empty result =
" No active admissions", not null rows. Scope: today's frontend shows all
admissions to the signed-in doctor — per-facility/per-doctor scoping is a
**decision required** (doc 07, §5) before this endpoint is final.

## 4. Future endpoints (designed with their milestones — doc 08)

| Milestone | Endpoints (sketch, PROPOSAL) |
| --- | --- |
| Encounter | `POST /patients/{id}/encounters` (reason/assessment/disposition/prescription/investigations); disposition writes admission/`dischargedOn` transactionally; `GET /patients/{id}/encounters` |
| Admissions | Facility/ward/bed roster reads; linkable admission rows (row → patient route, same verification-grant rule); admit/transfer/discharge writes via encounter disposition |
| History (doctor) | `GET /doctors/me/encounters?sort=-date` — needs `clinicianId` attribution (added then) |
| Consent plane | Consent-request/artifact/grant endpoints aligned to ABDM HIE-CM; record reads gated on grants |
| Pharmacy / Lab / Hospital / Government dashboards | Role APIs per their future designs — not sketched here (no invention) |

## 5. Cross-cutting API requirements

| Requirement | Detail |
| --- | --- |
| Versioning | `/api/v1` prefix; additive status values never break old clients (UI switches on `status` with defaults) |
| Idempotency | Verification-confirm and all future clinical writes need idempotency keys (retries must not double-create) |
| Rate limiting | Strict on authenticate, identify, confirm (per session + per target + per IP); 429 with `Retry-After` |
| Validation | Reject malformed ABHA/OTP shapes with 422 **without** indicating whether a value exists |
| No PII in URLs | ABHA never in path/query; OTP never in query; ids opaque (doc 09, §4) |
| No PII in logs | Mask ABHA; never log OTPs, session tokens, or full demographics at info level |
| Timeouts | Upstream ABDM calls bounded; frontend has no spinners today — slow calls need a UX decision, not silent hangs |
| CORS | Static origin ↔ API origin policy explicit and minimal (doc 09, §7) |
| Audit | Every auth/identity/record call emits an audit event (doc 09, §2) |

## 6. Adapter sketch (what the frontend change looks like)

For orientation only — the frontend team makes this change when the backend
is ready:

```js
// auth-service.js — one line + delete mock-auth.js
setAuthenticationService(createApiAuthService(fetch));
// createApiAuthService maps authenticate()/getDemoIdentifier() onto §1 endpoints;
// getDemoIdentifier is simply absent.

// identity-service.js — one line + delete mock-identity.js
setPatientIdentityService(createAbdmIdentityService(fetch));
// createAbdmIdentityService maps identifyPatient()/verifyOtp() onto §2 endpoints;
// getDemoAbha/getDemoOtp are simply absent.

// mock/patients.js reads → record API (§3) behind a small patient-store module;
// derivations (patientStateOf/activeAdmissions/latestInvestigationResults) move
// server-side or are re-implemented identically — decide once (doc 05, §5).
```

If the backend preserves the locked shapes and statuses, this is the **entire**
frontend diff. Any backend proposal that forces UI logic changes beyond the
adapters should be challenged.
