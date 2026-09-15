# 0009 — Privacy posture and the real-patient-data gate

- **Date:** 2026-09-15
- **Status:** Accepted (provisional — engineering controls only; legal review NOT performed)
- **Owner:** Dhishan / Linus for the gate; external counsel for the legal review
- **Requirement:** docs/backend/09 §3, docs/backend/10 Phase 4

## The gate

**The system stays in synthetic-data mode. No real patient data may be stored
until the review in `docs/privacy/readiness-checklist.md` is completed and
signed off.**

This is a hard gate, not an aspiration. Every patient record currently in the
system is a seed fixture (doc 05 §2). The moment a real record is stored, the
DPDP Act's obligations attach — including a retention clock that 0003 has not
yet set.

## What engineering has decided and built

| Control | Decision |
| --- | --- |
| **Data minimization** | Endpoints return what a designed screen reads (doc 05 §7). No speculative fields. |
| **Opaque identifiers** | Patient references are UUIDs. No ABHA in URLs, logs, metrics or audit records. |
| **Masking pre-authorization** | Identity responses return masked values only; full identifiers stay server-side. |
| **Audit minimization** | The audit record is metadata only. `assertNoSensitiveValues()` rejects any write containing a full ABHA, an ABHA address, or a credential keyword. |
| **Provenance reduction** | Client IPs are truncated to /24 (IPv4) or /48 (IPv6); user agents are reduced to three device classes. Enough for anomaly detection, not enough to be a tracker. |
| **Logging minimization** | Fixed field set; route templates not raw URLs; credential headers and body fields redacted. No clinical content, ever. |
| **Metrics minimization** | Only low-cardinality server-chosen labels. No identifiers. |
| **No registry cloning** | ABDM registry data is referenced and its verification outcome recorded — never copied (doc 07 §3). |
| **Purpose limitation** | Access decisions carry an explicit `purpose`, recorded on the audit event alongside the authorizing grant. |
| **Default-deny authorization** | Preserved from Phase 7; the integrity endpoint added in Phase 4 is SUPER_ADMIN-only. |
| **Deletion** | Not implemented. Deliberate: a deletion path built before the retention decision (0003) would be a guess with irreversible consequences. |

## What is explicitly NOT done

- **No DPDP Act 2023 legal review has been performed.** Nothing in this
  repository constitutes legal advice or a compliance claim.
- **No ABDM Health Data Management Policy conformance assessment** has been
  performed.
- **No Data Protection Impact Assessment**, no data inventory signed off by a
  data fiduciary, no grievance-redressal process, no breach-notification
  runbook with named responsibilities.
- **No penetration test.**

The honest statement is: *technical controls are prepared for privacy and legal
review.* Not: *the system is compliant.*

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Start with real data in a limited pilot** | The retention decision (0003) is open and the legal review has not happened. A pilot is still real personal data. |
| **Claim compliance on the strength of the controls** | False, and the kind of claim that destroys trust in public infrastructure. Controls are necessary, not sufficient — compliance is a legal determination. |
| **Defer the controls until the review** | Wrong order: the review needs something concrete to review. Building the controls first is what makes the review possible. |

## Evidence

- Checklist: `docs/privacy/readiness-checklist.md`
- Implementation: `backend/src/modules/audit/types.ts` (screening, truncation),
  `backend/src/config/logger.ts` (redaction),
  `backend/src/observability/metrics.ts` (label discipline)
- Tests: `backend/tests/audit-service.test.ts` (sensitive-value rejection,
  provenance reduction), `backend/tests/observability.test.ts` (no identifiers
  in metrics)
