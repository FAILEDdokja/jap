# 0010 — ABDM sandbox → certification → production path

- **Date:** 2026-09-15
- **Status:** Accepted (as a **plan**; no ABDM integration is implemented and no certification has occurred)
- **Owner:** Dhishan / Linus for onboarding and the certification schedule; Backend for the adapter
- **Requirement:** docs/backend/04 §5, docs/backend/10 Phase 2 and Phase 4

## Scope statement

Phase 4 is hardening. It does **not** implement the ABDM identity workflow,
HPR, HFR, or HIE-CM integration. This record is the plan and the architectural
seam, nothing more.

**Jan Arogya Nexus is not ABDM certified. No ABDM sandbox integration has been
built. No production ABDM credentials exist.**

## Decision

### One adapter interface, three environments

A single `AbdmAdapter` interface is the only way the application talks to ABDM.
Environment selection is **configuration**, never a code path:

| Env var | `mock` | `sandbox` | `production` |
| --- | --- | --- | --- |
| `ABDM_MODE` | in-process fake | ABDM sandbox | ABDM production |
| `ABDM_BASE_URL` | unused | sandbox base URL | production base URL |
| `ABDM_CLIENT_ID` / `ABDM_CLIENT_SECRET` | unused | sandbox credentials | production credentials |
| `ABDM_API_VERSION` | pinned | pinned | pinned |

Production cutover is therefore a configuration change plus new credentials —
not a rewrite. This is the property doc 04 §5 asks for, and the reason the
adapter seam must exist before the integration does.

### The ten steps

1. **Sandbox onboarding.** Register at `sandbox.abdm.gov.in`; obtain client id
   and secret. *Owner: Dhishan/Linus. Status: not started.*
2. **API version pinning.** Record the exact ABDM API version and the URL of
   the specification used, in this record, at the time the adapter is written.
   ABDM's APIs change; an unpinned integration breaks silently.
3. **Credentials and secrets.** Sandbox and production credentials live in the
   environment/secrets manager (0005), never in the repository, never in logs.
   Separate credentials per environment; rotation procedure documented with
   them.
4. **Adapter interface.** A narrow, documented TypeScript interface covering
   the flows doc 04 defines: identify (ABHA number / address), OTP confirm,
   and later consent request/fetch and HI exchange. Returns domain results,
   never raw ABDM payloads, so upstream shape changes stop at the adapter.
   Every call is bounded by a timeout with an explicit error state — doc 09 §5
   forbids silent hangs.
5. **Integration tests.** Contract tests against the mock adapter run in CI on
   every commit. Tests against the live sandbox run **out of CI**, on demand,
   because they need real credentials and a live upstream; their results are
   recorded in the phase log. CI must never depend on a third-party sandbox.
6. **Certification requirements.** Obtain and enumerate ABDM's current
   milestone/certification criteria before building, not after. They constrain
   the design (audit content, consent artifacts, care-context linking).
7. **Certification environment.** Certification runs against a deployed
   staging environment with production-shaped configuration — HTTPS, real
   secrets handling, persistent audit, readiness probes — and **synthetic
   patient data only**.
8. **Production credentials.** Issued only after certification is granted.
   Stored in the production secrets store and nowhere else.
9. **Production cutover.** Flip `ABDM_MODE=production` with production
   credentials. Verify against a controlled test identity before general
   availability. The privacy gate (0009) must be satisfied first, because
   production ABDM means real patients.
10. **Rollback / fallback.** `ABDM_MODE=sandbox` (or `mock` in a non-production
    environment) reverts the integration without a deploy. When ABDM is
    unreachable, the adapter surfaces an explicit degraded state — verification
    is unavailable and says so — rather than hanging or silently letting a
    record through unverified. Default-deny is preserved: no ABDM response
    means no grant.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Call ABDM directly from route handlers** | Couples the whole codebase to an upstream API that changes, and makes sandbox↔production a code change rather than configuration. |
| **Separate sandbox and production code paths** | Guarantees the production path is the least-tested one. |
| **Build the full identity workflow now** | Out of scope for Phase 4, and premature before certification requirements are known (step 6). |
| **Depend on the live sandbox in CI** | Makes CI fail for reasons unrelated to the change, and leaks credentials into CI. |

## Status

Steps 1–10 are **all pending**. This record exists so the work is planned and
the seam is preserved, not to imply any of it is done.
