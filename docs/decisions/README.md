# Decision records

Engineering decision records (ADRs) for Jan Arogya Nexus, started in Phase 4 to
close the gap doc 09 §6 and doc 02 §8 flagged ("don't repeat the missing-ADR
problem").

## Rules

1. Every **PROPOSAL → accepted** conversion and every resolved
   **decision required** item gets a record here, with a date and an owner.
2. A "decision required" item is **never** silently converted into an arbitrary
   implementation choice. If the team has not decided, the record stays in
   status `DECISION REQUIRED` and lists the options, the default the code
   currently applies (if any), and what it would take to decide.
3. A record is immutable once `Accepted`. Changing a decision means a new
   record that supersedes the old one, with both linked.

## Statuses

| Status | Meaning |
| --- | --- |
| `Accepted` | Decided and implemented. Code and tests exist. |
| `Accepted (provisional)` | Decided by engineering for now; needs product/legal sign-off to become final. The record says exactly what sign-off is missing. |
| `DECISION REQUIRED` | Not decided. Escalated to the named owner. Code either has no behaviour here, or has a fail-safe default the record names explicitly. |
| `Superseded` | Replaced by a later record. |

## Index

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-session-security.md) | Session security model | Accepted |
| [0002](0002-audit-failure-policy.md) | Audit persistence and failure policy | Accepted |
| [0003](0003-audit-retention.md) | Audit retention | DECISION REQUIRED |
| [0004](0004-rate-limiting.md) | Rate limiting and abuse protection | Accepted |
| [0005](0005-deployment-and-residency.md) | Deployment topology and data residency | DECISION REQUIRED |
| [0006](0006-cors-policy.md) | CORS policy | Accepted |
| [0007](0007-backup-rpo-rto.md) | Backup, restore, RPO and RTO | DECISION REQUIRED |
| [0008](0008-observability.md) | Observability | Accepted |
| [0009](0009-privacy-and-real-data-gate.md) | Privacy and the real-patient-data gate | Accepted (provisional) |
| [0010](0010-abdm-certification-path.md) | ABDM sandbox → certification → production | Accepted (plan only) |
| [0011](0011-frontend-assets.md) | Frontend runtime assets | Accepted |

## Owners

The frontend logs and docs 08/10 name **Dhishan** and **Linus** as the owners of
product/sequencing decisions. Records below that need a non-engineering decision
are addressed to them. Where no owner is known the record says
`Owner: UNASSIGNED` rather than inventing one.
