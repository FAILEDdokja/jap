# 09 — Non-Functional Requirements

Reliability, correctness, auditability, maintainability, accessibility,
security, and long-term sustainability — the brief's engineering values —
translated into backend requirements. As public digital infrastructure, these
are not stretch goals; they are the job.

## 1. Correctness

- **No fake guarantees.** The frontend mocks omit expiry/resend/lockout/spinners
  rather than simulate them. The backend implements each behavior for real or
  defers it with an accepted decision — never a stub that looks real.
- **Derivations are single-sourced.** Patient state, admissions feed, and
  health markers compute from the same facts with identical semantics on every
  surface (doc 05, §5). If both client and server derive, property-test them
  against each other.
- **Transactional integrity.** Encounter creation + disposition-driven
  admission writes are atomic. Bed occupancy invariants hold at the database
  level. Money-adjacent and consent-adjacent writes are idempotent.
- **Date handling.** Clinical dates (DOB, encounter dates, admitted/discharged)
  are calendar dates without timezones. Timestamps (audit, session expiry) are
  UTC with explicit zone. Never mix the two.

## 2. Auditability

Every security- or clinically-relevant action emits an **append-only audit
event**:

| Field | Notes |
| --- | --- |
| `at` | UTC timestamp, server-clock |
| `actor` | account id + role (+ facility/department context when it exists) |
| `action` | e.g. `auth.attempt/success/failure`, `identity.identify/confirm/expire`, `record.read`, `encounter.create`, `consent.grant/revoke` |
| `object_type` / `object_ref` | opaque refs (record id, verification id) — never ABHA, never OTP |
| `purpose` / `grant_ref` | which authorization covered this (verification/consent grant) |
| `result` | allowed/denied + reason code |
| `source` | IP / device class (for anomaly detection, not for display) |

Rules: audit store is append-only (no updates/deletes, retention policy by
decision); audit writes never block the clinical path longer than a bounded
timeout (decide: fail-closed vs fail-open on audit outage — **fail-closed for
writes, decided explicitly**); patient-visible access history is a future
feature fed by this same stream (doc 08, §5).

## 3. Privacy and compliance

- **DPDP Act, 2023** (India's data-protection law) and the **ABDM Health Data
  Management Policy** govern personal and health data. Backend owns: lawful
  basis + purpose limitation per flow, consent capture/evidence, retention and
  deletion, breach notification readiness, grievance-redressal data support.
  Get legal/product review of the data lifecycle before storing real patient
  data — this is a decision gate, not paperwork.
- **Data minimization.** Collect and return only what a designed screen reads
  (doc 05, §7). Full-record reads return the full record because the profile
  displays it — a scoped future screen gets a scoped endpoint, not the same
  dump.
- **Masking everywhere pre-authorization.** Masked ABHA in identity responses
  (doc 04, §3); masked contacts in auth responses; no full identifiers in
  errors, URLs, or logs.
- **De-identification for government/aggregate use.** Programme reporting
  works on aggregates; row-level identifiable access needs explicit purpose +
  consent design (doc 07, §2, §5).
- **No ABDM registry cloning.** References + verification outcomes only
  (doc 07, §3).

## 4. Security

| Area | Requirement |
| --- | --- |
| Sessions | HTTP-only + Secure + SameSite cookies (or equivalent token discipline); idle + absolute expiry; server-side revocation; session fixation resistance |
| Credentials | Any future password/secret storage uses a modern KDF (argon2/bcrypt/scrypt); OTPs are short-lived, single-use, rate-limited, never logged |
| Rate limiting | Auth, identity, confirm, resend endpoints: per-account, per-target, per-IP limits; 429 + `Retry-After`; abuse alerting |
| Injection | Parameterized queries / ORM discipline; strict input validation; output encoding; no dynamic code from user input |
| Secrets | ABDM client secrets, session keys, DB credentials in a secrets manager — never in code, logs, or the repo |
| Transport | TLS 1.2+ everywhere; HSTS on API + hosting; no mixed-content calls from the frontend |
| Headers | Security headers on API responses; no stack traces or internal details in error payloads |
| Dependencies | Pinned, scanned, updated on a cadence (contrast: today's unpinned Tailwind CDN — doc 02, §8 — must not be repeated server-side) |
| Backups | Encrypted, tested restores, documented RPO/RTO (values need decisions) |

## 5. Reliability and operations

- **Availability thinking from the start.** Health endpoints, graceful
  degradation when ABDM sandbox/production is unreachable (explicit error
  states, not hangs), bounded upstream timeouts with retry budgets.
- **No silent hangs.** The frontend currently has no loading spinners; slow
  backend calls need agreed UX (timeout → message → retry), not indefinite
  waits. Decide per endpoint class.
- **Observability.** Structured logs (no PII), metrics (latency, error rates,
  auth/verification funnels, ABDM upstream health), alerting on abuse and
  outage signals. Trace verification transactions end-to-end (requestId
  correlation).
- **Change discipline.** API versioning (`/api/v1`); additive-only status
  values; migration-tested schema changes; seed data (the 3 prototype records)
  in dev/staging for cross-team verification.

## 6. Maintainability and sustainability

- **Boring technology, well documented.** Framework/language choice belongs to
  an accepted engineering decision — optimize for readability, hiring, and
  10-year maintenance, not novelty.
- **Mirror the seam discipline.** ABDM adapter, auth service, record service
  as separable modules with stable internal interfaces — the backend analogue
  of `auth-service.js` / `identity-service.js`.
- **Docs live with decisions.** Keep an engineering decision record for
  backend choices (mechanism, expiry values, scoping policies). The repo's
  existing logs are the model; don't repeat the missing-ADR problem (doc 02, §8).
- **Stay lightweight.** No speculative infrastructure (queues, caches,
  microservices) until a milestone's load or shape demands it. One reviewable
  increment at a time, per the charter.

## 7. Deployment and hosting

- Frontend is static (any file host/CDN); backend is the API origin. Decide
  hosting, regions/data-residency (health data stays in India — legal gate),
  and environments (dev/staging/prod + ABDM sandbox wiring per environment).
- **CORS:** explicit allowlist of the frontend origin(s); credentials enabled
  only for session cookie flow; no wildcard with credentials.
- Hash routing means **no SPA-fallback rewrites** are needed — but confirm
  the static host serves `index.html` at `/` with correct MIME types for
  modules (`.js` as `text/javascript`).
- Serve currently-hotlinked assets (national emblem) from project hosting;
  pin or vendor the Tailwind CDN before any public deployment (doc 02, §8).

## 8. Accessibility and inclusion (backend's share)

- API messages that surface in the UI must be short, adjacent-safe,
  non-alarming, and terminology-locked (ABHA Number, HPID, Facility ID —
  doc 03, §2). Provide stable error **codes** so the frontend can render
  localized copy later.
- Keep payloads small and calls few: low-bandwidth and low-end devices are
  first-class citizens. Prefer one record read over N+1 chatty calls.
- Time/date formats: ISO on the wire; frontend localizes for display.

## 9. Backend checklist (non-functional)

- [ ] Audit event model implemented append-only from the first endpoint
- [ ] Privacy review gate passed before real patient data is stored
- [ ] Security baseline (§4) implemented and reviewed
- [ ] Observability (logs/metrics/alerts/traces) in place for auth + identity paths
- [ ] Deployment topology + data residency + CORS decided and documented
- [ ] Frontend asset risks (CDN pinning, emblem hosting) tracked to resolution
- [ ] Decision records started for all PROPOSAL→accepted conversions in this set
