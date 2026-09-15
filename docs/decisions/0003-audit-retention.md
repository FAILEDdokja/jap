# 0003 — Audit retention

- **Date:** 2026-09-15
- **Status:** **DECISION REQUIRED**
- **Owner:** Dhishan / Linus, with legal review (DPDP Act 2023 §8, ABDM HDM Policy)
- **Requirement:** docs/backend/09 §2 ("retention policy by decision")

## The decision that is required

**How long are audit events retained, and what happens at the end of that
period?**

This is not an engineering choice. It is a conflict between two legal
obligations that only a legal/product review can resolve:

- **Retain longer:** audit evidence of who accessed a health record, needed for
  breach investigation, grievance redressal, and any ABDM/regulatory audit.
- **Retain shorter:** DPDP Act storage limitation — personal data (including
  the access metadata that reveals *that* a person was treated somewhere) must
  not be kept longer than the purpose requires.

## Options

| Option | Retention | Notes |
| --- | --- | --- |
| A | 1 year, hard delete | Minimises exposure. Probably too short for a health-record dispute, which can surface years later. |
| B | 7 years, hard delete | Aligns with common Indian medical-records retention practice (often cited as 3 years for outpatient, longer for medico-legal). Needs legal confirmation that it applies to *access logs* and not only to the records themselves. |
| C | 7 years, then de-identify rather than delete | Keeps the chain's integrity and the aggregate security signal while dropping the actor/patient references. Preserves hash-chain verifiability only if the de-identification is modelled as a documented, audited chain event — extra design work. |
| D | Indefinite | Simplest technically, hardest to defend under DPDP storage limitation. Not recommended. |

## What the code does TODAY, pending the decision

**Nothing is deleted.** There is no retention job, no TTL, and no delete path —
`audit_events` is append-only and grows without bound. This is the fail-safe
default: it cannot destroy evidence before the decision is made, and it is the
only option that is reversible in both directions.

This default is **explicitly not a decision**. It is recorded here so that
"we never deleted anything" is a known, chosen state rather than an oversight.

## Constraints any chosen option must respect

1. **Deletion breaks the hash chain.** Removing a row creates a sequence gap
   and a broken link, which the verifier reports as tampering — correctly, from
   its point of view. Any retention job must therefore:
   - run as a privileged, out-of-band operation that explicitly disables the
     append-only triggers (they block `DELETE` by design);
   - record a *tombstone* event in the chain describing the range removed, its
     boundary hashes, and the authority for the deletion;
   - teach the verifier to treat a documented tombstone range as a legitimate
     discontinuity rather than tampering.
2. **Partitioning first.** Before any volume-based policy, `audit_events`
   should be range-partitioned by `ts`, so expiry is a `DETACH PARTITION`
   rather than a mass `DELETE`. Cheaper, and it keeps the live chain intact.
3. **The retention clock is per-event**, keyed on `ts`, not on the patient's
   record lifecycle — an audit event about a deleted patient must still be
   explainable.

## Next step

Engineering cannot proceed. Escalated to Dhishan/Linus with the options above.
Decision needed **before** the first real patient record is stored (see 0009),
because from that moment the retention clock is running on real personal data.
