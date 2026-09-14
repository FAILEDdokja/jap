# 04 — Patient Identity and ABDM

How a doctor identifies a patient at the point of care today, the exact
contract the backend must implement, and how the mock maps onto real ABDM
integration. This is the most ABDM-sensitive part of the system — read it
whole.

## 1. The flow (locked)

```
Dashboard → New Patient (#/dashboard/doctor/new-patient) → <patient-intake>
  Step 1: ABHA submitted
    → identifyPatient({abha})
    → { status: "otp-required", requestId, maskedAbha }   → Step 2
    → { status: "abha-not-recognized" }                   → inline error, field stays
  Step 2: OTP submitted (code shown as prototype hint — no message is sent)
    → verifyPatientOtp({requestId, otp})
    → { status: "verified", patientId }                   → jap:patient-identified → #/dashboard/doctor/patient/<id>
    → { status: "otp-invalid" }                           → inline error, retryable, field re-selected
```

Locked properties:

- **Two steps, one view, no intermediate URL.** The step is local UI state.
  Backend implication: the transaction lives server-side, keyed by
  `requestId`. The frontend holds no "patient being verified".
- **Verification is consumable; failure is retryable.** A wrong code leaves
  the verification open (correct a digit, don't restart). A correct code
  consumes it — **a verification can never be reused.**
- **The intake emits only `{ patientId }`.** No ABHA, no demographics cross
  the event boundary. Navigation into patient context is `app.js`'s job.
- **ABHA never appears in any URL.** The patient route uses the opaque record
  id. The backend must never require ABHA in a path/query for record access.

## 2. The identity service contract (locked)

```js
identifyPatient({ abha }) → Promise<
  | { status: "otp-required", requestId: string, maskedAbha: string }
  | { status: "abha-not-recognized" }
>

verifyPatientOtp({ requestId, otp }) → Promise<   // → service.verifyOtp({requestId, otp})
  | { status: "verified", patientId: string }
  | { status: "otp-invalid" }
>

// Dev-only (production implementation omits both; UI adapts):
getDemoAbha() → Promise<string | null>            // "23-4567-8912-3401" today
getDemoOtp({ requestId }) → Promise<string | null> // the generated 6-digit code
```

Design rationale (locked — do not "simplify"):

- `identifyPatient` returns a `requestId`, **not a patient**. A name, age, or
  allergy must not be reachable before verification. Identification hands back
  a masked ABHA and nothing else.
- `verifyPatientOtp` returns a `patientId`, **not a record**. Identification
  is not consent; record access is a separate, audited read (doc 06).
- The open verification is **owned by the implementation** (today an in-memory
  `Map`; in production a server-side transaction store), exactly where a real
  ABDM auth transaction would live.
- Result contracts are **additive** like the auth seam: future states (e.g.
  `otp-expired`, `consent-required`, `abha-migrated`) extend the union without
  rewriting the UI switch.

## 3. ABHA matching and masking rules (locked behavior)

1. **ABHA number and ABHA address both identify.** `23-4567-8912-3401`,
   `23456789123401`, and `amit.kumar@abdm` all reach `p-01`. Backend must
   resolve both forms (ABDM verifies addresses via the PHR/ABHA-address
   services; numbers via ABHA verification).
2. **Matching ignores case, spaces, dashes.** Normalize at comparison;
   store canonical.
3. **Masking: `ABHA •••• <last-4-digits>`.** Only the tail is handed back for
   display. The full ABHA appears in full **only** inside the verified patient
   profile. Backend must apply the same masking in every pre-verification
   response **and** in logs (never log a full ABHA in an identity transaction).
4. **No name before verification.** The pre-verification result contains no
   patient name — verified mechanically (188-check harness). Backend responses
   and error messages must preserve this.

## 4. What the mock deliberately does NOT do (backend must do for real)

| Mock behavior today | Production requirement |
| --- | --- |
| Code generated locally, shown in UI as a "prototype check — no message was sent" hint | Real OTP delivered via **ABDM's verification channels** to the mobile linked to the ABHA. JAP does not build its own SMS-OTP-to-patient system. |
| No expiry | **Decision required:** OTP validity window per ABDM mode; return a distinct `otp-expired` state (additive). |
| No resend | Resend endpoint + policy (cooldown, max resends). |
| No attempt counting / lockout | Attempt limits, verification lockout, abuse monitoring. |
| In-memory `Map`, single process | Persistent transaction store: `requestId → {abhaRef, otpRef/token, attempts, expiresAt, status}`. `requestId`s unguessable, single-use. |
| No consent modeling | Consent scope (see §7) — the biggest known gap. |

Rule of thumb from the brief: never ship a fake guarantee. Each row above is
either implemented for real or explicitly deferred with an accepted decision —
never simulated.

## 5. Mapping the mock to real ABDM (structural guide)

> ABDM APIs evolve. This section maps **concepts**, not frozen endpoint paths.
> The backend team must work from the current official ABDM documentation and
> sandbox, and keep an adapter layer (doc 01, §6) so ABDM-side changes touch
> one module.

| JAP concept | ABDM counterpart |
| --- | --- |
| ABHA number (14 digits) | Ayushman Bharat Health Account number |
| ABHA address (`name@abdm`) | ABHA address (PHR address) — verified via ABHA-address services |
| `identifyPatient` → OTP challenge | ABDM auth-init / verification-request flows (mobile-OTP and Aadhaar-OTP modes exist; mode choice needs a product decision) |
| `requestId` transaction | ABDM transaction id (`txnId`) from auth-init, held server-side |
| `verifyPatientOtp` | ABDM auth-confirm / OTP-verification call |
| `maskedAbha` | JAP-side display masking (ABDM returns full demographics only post-verification — preserve that boundary) |
| `patientId` (opaque JAP record id) | **JAP-internal.** ABDM knows ABHA; JAP maps verified ABHA → internal record. Never expose the mapping pre-verification. |
| Doctor's HPID login | Healthcare Professionals Registry (HPR) verification |
| Facility IDs | Health Facility Registry (HFR) verification |
| Record sharing across providers | Consent Manager / HIE-CM flows, FHIR R4 bundles, HIU/HIP roles (future plane — doc 01, §9) |

Integration path (locked direction, PROPOSAL sequencing):

1. Register on **ABDM sandbox** (`sandbox.abdm.gov.in`), obtain client
   credentials, build the adapter against sandbox + official Swagger docs.
2. Implement ABHA verification (auth-init → confirm) behind
   `setPatientIdentityService`-equivalent server interface.
3. Add HPR verification for doctor auth, HFR for facility auth (doc 07).
4. Complete ABDM certification; cut over adapter config sandbox → production.
5. Consent-manager integration when cross-provider sharing is designed
   (doc 08) — not before.

Useful starting references (verify currency before relying on them):

- ABDM sandbox registration: `https://sandbox.abdm.gov.in`
- ABHA API documentation (official SwaggerHub): search "abdm abha-service" on
  SwaggerHub; ABHA v3 session/token + enrollment/verification APIs
- ABDM integration milestones: M1 (ABHA/identity), M2 (facility/HFR), M3
  (health records/consent/FHIR) — the standard HMIS-integration ladder

## 6. Backend transaction design (PROPOSAL)

```http
POST /api/v1/patient-verifications            { abha }
 → 200 { status: "otp-required", requestId, maskedAbha }
 → 200 { status: "abha-not-recognized" }

POST /api/v1/patient-verifications/:id/confirm   { otp }
 → 200 { status: "verified", patientId }
 → 200 { status: "otp-invalid" }        (attempts left? — needs decision)
 → 200 { status: "otp-expired" }        (additive; frontend handles as new case)
```

Requirements:

- `requestId` (`:id`): cryptographically random, unguessable, single-use,
  bound to the requesting professional's session (a verification opened by Dr.
  A cannot be confirmed by Dr. B).
- Store attempts, expiry, resend count, ABDM `txnId`, and outcome. Audit every
  state transition.
- Rate-limit identify + confirm per session, per ABHA, and per IP.
- `patientId` returned on success must be the **opaque internal record id**
  used in routes — never the ABHA.
- Error responses must not distinguish "ABHA unknown to ABDM" from "ABHA
  known but no JAP record" to the caller beyond `abha-not-recognized` —
  and must never leak which.

## 7. The consent gap (known, not a defect — yet)

The prototype does not model **consent scope**: a verified OTP currently opens
the full record. In ABDM terms, verification (this person is who they claim)
and consent (this professional may see these data for this purpose and period)
are distinct. The backend architecture must leave room for:

- Purpose-of-access declaration on verification (e.g., "care provision").
- Consent artifact capture (ABDM consent-manager flow) before record reads.
- Purpose- and time-bounded access tokens for record APIs.
- Patient-visible access log (who saw my record, when, why) — a future
  patient-dashboard feature.

Do not build the consent plane now (no designed screen needs it), but do not
paint it shut: keep verification transactions, record reads, and audit events
as separate tables/services so consent checks can be inserted between
verification and reads later. Full detail in doc 08, §5 and doc 09, §3.

## 8. Backend checklist (identity + ABDM)

- [ ] ABHA number + address resolution behind an ABDM adapter module
- [ ] Server-side verification transactions (unguessable single-use ids, expiry, attempts, resend)
- [ ] Locked result contract incl. additive future states
- [ ] Masked-ABHA-only pre-verification responses; no names pre-verification
- [ ] Opaque `patientId` on success; no ABHA in URLs or post-verification routes
- [ ] Rate limiting + lockout + abuse monitoring on both endpoints
- [ ] Full audit trail of identity transactions (no full ABHA / no OTP in logs)
- [ ] ABDM sandbox onboarding started; adapter interface defined before first ABDM call
- [ ] Decisions obtained for: OTP mode(s), expiry/resend/lockout policy, consent-scope roadmap
- [ ] Demo affordances (`getDemoAbha`/`getDemoOtp` equivalents) absent in production
