# ABDM sandbox → certification → production plan

Phase 4 deliverable for docs/backend/04 §5 and docs/backend/10 Phase 4.
Decision record: `docs/decisions/0010-abdm-certification-path.md`.

> ## No false claims
>
> - **Jan Arogya Nexus is NOT ABDM certified.**
> - **No ABDM integration is implemented.** There is no adapter, no sandbox
>   call, and no OTP flow. `abdm_transactions` and `abdm_identities` are schema
>   placeholders designed in Phase 2.
> - **No ABDM credentials exist** for any environment.
> - **No ABDM milestone has been attempted or passed.**
>
> This document is a plan. Nothing in it has been executed.

Phase 4 is hardening. Building the ABDM identity workflow is explicitly out of
scope; what Phase 4 owes is the *readiness seam* and this plan.

---

## The architectural commitment

One adapter interface. Three environments selected by **configuration**, never
by a code path:

| Variable | mock | sandbox | production |
| --- | --- | --- | --- |
| `ABDM_MODE` | `mock` | `sandbox` | `production` |
| `ABDM_BASE_URL` | — | sandbox base URL | production base URL |
| `ABDM_CLIENT_ID` | — | sandbox id | production id |
| `ABDM_CLIENT_SECRET` | — | sandbox secret | production secret |
| `ABDM_API_VERSION` | pinned | pinned | pinned |

Production cutover is a configuration change plus new credentials. If the
production path ever needs different *code* from the sandbox path, the design
has failed — the least-tested path would be the one facing real patients.

---

## 1. Sandbox onboarding — NOT STARTED

Register at `sandbox.abdm.gov.in`, obtain client credentials, record the
onboarding date and the account owner.

*Owner: Dhishan / Linus. This is an organizational step engineering cannot
perform.*

---

## 2. API version pinning — NOT STARTED

Before writing the adapter, record here:

- the exact ABDM API version integrated against
- the URL and retrieval date of the specification used
- the specific endpoints consumed

ABDM's APIs change. An unpinned integration fails silently and at the worst
moment. The pin belongs in this document **and** in `ABDM_API_VERSION`.

---

## 3. Credentials and secrets — NOT STARTED

- Separate credentials per environment. A sandbox credential must never reach
  production and vice versa.
- Stored in the secrets manager (`docs/operations/deployment.md` §8), injected
  as environment variables. Never in the repository, never in an image, never
  in a log.
- Rotation procedure documented alongside them.
- The configuration validator (`config/env.ts`) will require them when
  `ABDM_MODE != mock`, so a misconfigured environment fails at boot.

---

## 4. Adapter interface — NOT IMPLEMENTED

A narrow, documented interface is the only path to ABDM. Directional shape,
following doc 04:

```ts
interface AbdmAdapter {
  identify(input: { abhaNumber?: string; abhaAddress?: string }):
    Promise<{ status: "otp-required"; requestId: string; maskedAbha: string }
           | { status: "abha-not-recognized" }
           | { status: "upstream-unavailable" }>;

  confirm(input: { requestId: string; otp: string }):
    Promise<{ status: "verified"; abdmRef: string }
           | { status: "otp-invalid" }
           | { status: "otp-expired" }
           | { status: "upstream-unavailable" }>;
}
```

Rules:

- returns **domain results**, never raw ABDM payloads, so an upstream shape
  change stops at the adapter;
- every call is bounded by an explicit timeout with a named degraded state —
  doc 09 §5 forbids silent hangs;
- OTPs are never stored in cleartext, never logged, never audited;
- full ABHA values never leave the adapter boundary; only masked forms and
  opaque references do;
- `upstream-unavailable` is a first-class outcome the UI must handle, not an
  exception that bubbles up as a 500.

---

## 5. Integration tests — NOT IMPLEMENTED

| Test kind | Where | Runs |
| --- | --- | --- |
| Contract tests against the mock adapter | `backend/tests/` | every CI run |
| Live sandbox tests | a separate, credentialed script | **out of CI**, on demand |

CI must never depend on a third-party sandbox: it would fail for reasons
unrelated to the change and would require credentials in CI. Live-sandbox
results are recorded in the phase log instead.

---

## 6. Certification requirements — NOT OBTAINED

Obtain and enumerate ABDM's current milestone/certification criteria **before**
building. They constrain the design — audit event content, consent artifact
shape, care-context linking — and discovering them after the fact means
rework.

---

## 7. Certification environment — NOT PROVISIONED

Certification runs against a deployed **staging** environment with
production-shaped configuration:

- HTTPS, real secrets handling, `NODE_ENV=production`
- persistent PostgreSQL audit, fail-closed
- readiness probes wired
- **synthetic patient data only**

---

## 8. Production credentials — NOT ISSUED

Issued only after certification is granted. Stored in the production secrets
store and nowhere else.

---

## 9. Production cutover — NOT PERFORMED

1. Certification granted (step 6–8 complete).
2. **The privacy gate in `docs/privacy/readiness-checklist.md` §7 is satisfied**
   — production ABDM means real patients, which triggers every DPDP obligation.
3. Set `ABDM_MODE=production` with production credentials.
4. Verify against a controlled test identity before general availability.
5. Watch the `jap_upstream_failures_total` alert (0008) through the first
   window.

---

## 10. Rollback and fallback — DESIGNED, NOT IMPLEMENTED

| Scenario | Response |
| --- | --- |
| Production integration misbehaves | Set `ABDM_MODE=sandbox`; no deploy required. |
| ABDM unreachable | Adapter returns `upstream-unavailable`; the UI shows an explicit "verification unavailable" state. **Default-deny is preserved: no ABDM response means no grant.** Never a hang, never a silent pass. |
| Upstream contract changed | The adapter boundary contains the break; pin (step 2) makes it detectable. |

---

## Status summary

| Step | Status |
| --- | --- |
| 1. Sandbox onboarding | NOT STARTED |
| 2. API version pinning | NOT STARTED |
| 3. Credentials/secrets | NOT STARTED |
| 4. Adapter interface | NOT IMPLEMENTED (designed above) |
| 5. Integration tests | NOT IMPLEMENTED |
| 6. Certification requirements | NOT OBTAINED |
| 7. Certification environment | NOT PROVISIONED |
| 8. Production credentials | NOT ISSUED |
| 9. Production cutover | NOT PERFORMED |
| 10. Rollback/fallback | DESIGNED, NOT IMPLEMENTED |
