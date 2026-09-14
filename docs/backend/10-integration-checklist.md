# 10 — Integration Checklist

The step-by-step procedure for tying the backend to the frontend. Follow it in
order; each step's verification gates the next.

## Phase 0 — Alignment (before any code)

- [ ] Backend team has read docs 01–09 and the two frontend implementation logs
      (`docs/engineering/login-implementation-log.md`,
      `docs/engineering/patient-identity-implementation-log.md`).
- [ ] All **PROPOSAL** items the backend intends to adopt are listed; all
      **decision required** items are escalated to Dhishan/Linus with options.
- [ ] ABDM sandbox onboarding started (`sandbox.abdm.gov.in`); client
      credentials obtained; official API docs version pinned and linked from
      the backend decision record.
- [ ] Technology choices (language, framework, database, hosting, session
      mechanism) proposed and **accepted as engineering decisions**.
- [ ] Seed fixtures agreed: the 3 prototype records + 3 demo accounts, with
      identical ids/identifiers on both sides (doc 02, §6; doc 05, §2).

## Phase 1 — Auth API + seam swap

- [ ] `POST /api/v1/auth/authenticate` implements the locked contract
      (doc 03, §3; doc 06, §1): `authenticated` / `identifier-not-found` /
      `role-unavailable`, with `{ id, role, name }` user shape.
- [ ] Matching rules reproduced: multi-alias accounts, case/space/dash
      insensitivity, cross-role rejection, non-enumerating outcomes (doc 03, §4).
- [ ] Server sessions: issue on authenticate, validate per request,
      `GET /session` bootstrap, `POST /sign-out` revocation (doc 03, §5).
- [ ] Unprovisioned roles (hospital/lab/government) return `role-unavailable`
      until their identity designs are accepted (doc 03, §6).
- [ ] Rate limiting + audit on all auth endpoints (doc 09, §2, §4).
- [ ] Frontend (frontend team or joint): implement `createApiAuthService`,
      call `setAuthenticationService`, **delete `mock-auth.js`**, confirm no
      credential strings remain in UI files (`grep`).
- [ ] Verify: all six role screens render correct copy; doctor/patient/
      pharmacy demo logins succeed end-to-end through the API; wrong id, empty
      id, cross-role id, and unprovisioned roles produce the locked states; no
      `getDemoIdentifier` in production (no example placeholders); reload on
      `#/dashboard/<role>` restores session from server; tampered/elided
      session redirects to login; sign-out revokes server-side.

## Phase 2 — Identity API (ABDM-backed) + seam swap

- [ ] ABDM adapter module implements ABHA number + address verification via
      sandbox (doc 04, §5); adapter interface stable and documented.
- [ ] `POST /api/v1/patient-verifications` + `…/{id}/confirm` implement the
      locked contract (doc 04, §2; doc 06, §2): `otp-required{requestId,
      maskedAbha}` / `abha-not-recognized` / `verified{patientId}` /
      `otp-invalid` (+ additive `otp-expired` when expiry ships).
- [ ] Transaction store: unguessable single-use ids bound to the requesting
      session; consumable-on-success, retryable-on-failure; expiry + attempts +
      resend per accepted policy (doc 04, §4, §6).
- [ ] Masking + no-name-pre-verification enforced in responses **and logs**
      (doc 04, §3).
- [ ] Real OTP delivery via ABDM channels (no JAP-built patient SMS-OTP).
- [ ] Rate limiting + lockout + audit on identify/confirm/resend.
- [ ] Frontend: implement `createAbdmIdentityService`, call
      `setPatientIdentityService`, **delete `mock-identity.js`**; demo
      affordances absent (no example ABHA, no OTP hint).
- [ ] Verify: formatted/unformatted/`@abdm` ABHAs all verify; unknown ABHA →
      `abha-not-recognized`; wrong OTP → `otp-invalid` and retryable; correct
      OTP → patient route with opaque id; verification single-use; expired OTP
      → `otp-expired` path; no patient name in any pre-verification payload
      (assert on the wire); masked ABHA only; login-account ABHA with no
      record → `abha-not-recognized`.

## Phase 3 — Record + admissions APIs (replace `mock/patients.js` reads)

- [ ] Persistent model per doc 05 (accounts separate from records; opaque ids;
      admission shape; encounter shape; no stored state; no speculative fields).
- [ ] `GET /api/v1/patients/{id}` serves the locked record shape; gated on
      professional session + verification grant; unknown id → 404 with
      "Unable to load patient" semantics; every read audited (doc 06, §3).
- [ ] `GET /api/v1/admissions?status=active` reproduces `activeAdmissions()`
      semantics exactly (filter/row/sort/empty) with accepted scoping
      (doc 05, §5a; doc 07, §5).
- [ ] Derivations (`patientStateOf`, `latestInvestigationResults`) moved
      server-side or re-implemented identically — one decision, documented
      (doc 05, §5).
- [ ] Frontend: record reads go through a patient-store API module;
      `mock/patients.js` retired to fixtures-or-deleted per joint decision.
- [ ] Verify: the three seed records render byte-identical profiles to the
      mock era (identity, safety, markers, state line, history); admitted /
      discharged / outpatient derivation correct; Dashboard shows exactly the
      admitted set; deep link + reload on patient URL works; unknown id shows
      "Unable to load patient" with previous patient gone; sign-out removes
      all patient markup; narrow-viewport layout intact.

## Phase 4 — Hardening and production readiness

- [ ] Non-functional checklist green (doc 09, §9): audit, privacy gate,
      security baseline, observability, deployment, CORS, residency.
- [ ] ABDM certification track planned: sandbox → certification → production
      cutover as adapter config change (doc 04, §5).
- [ ] Frontend asset risks resolved or tracked: Tailwind CDN pinned/vendored,
      emblem self-hosted (doc 02, §8; doc 09, §7).
- [ ] Manual walkthrough passes end-to-end (below), plus the frontend logs'
      walkthroughs re-run against the integrated system.
- [ ] Decision records complete: every adopted PROPOSAL and every resolved
      "decision required" is written down with date and owner.

## Manual walkthrough (reviewer script, integrated system)

Adapted from the frontend logs' walkthroughs; must pass against real APIs:

1. Open the portal → landing page; click **Login** → 6 roles in locked order.
2. **Doctor** → identifier `HP-1001` → (credential step, when it exists) →
   Dashboard shows **Dr. Aroha Deshpande / Healthcare Professional**,
   **New Patient**, and Active Admissions with exactly the admitted seed set.
3. **New Patient** → type garbage → "ABHA not recognized." Enter the seed
   ABHA (number or `@abdm` address) → OTP step: no name, masked ABHA only,
   real code arrives on the linked mobile (sandbox test number in staging).
4. Wrong code → "OTP invalid", retryable. Correct code → URL becomes
   `#/dashboard/doctor/patient/<opaque-id>` (never an ABHA).
5. Profile renders all seven sections in clinical-priority order; "None
   recorded" only where genuinely empty; **Back to Dashboard** returns.
6. Reload on the patient URL → same patient. Edit id to unknown → "Unable to
   load patient", nothing else.
7. Sign out → public landing; server session revoked (replay of the old
   cookie → 401 → login).
8. Repeat sign-in for patient (`12-3456-7891-2345` + credential) and pharmacy
   (`FAC-PH-2201`); hospital/lab/government still honestly unavailable.
9. Audit spot-check: auth attempts, verification lifecycle, and record reads
   all present with actor/purpose/result; no full ABHA, no OTP in any log.
10. Narrow to ~360px: workspace nav reachable, values stack, no sideways scroll.

## Regression guardrails (never break these)

- Auth and identity stay separate seams, endpoints, transactions, audit streams.
- No patient-identifying data before verification — assert on the wire, not
  just in the UI.
- No ABHA in URLs, history, or screenshots — opaque record ids only.
- State derived, never stored — no `status` column, ever.
- Additive statuses only — new backend states must not break the UI switch.
- No demo affordances in production — no example identifiers, no OTP hints.
- Every new capability: default-deny, explicitly granted, audit-logged.
