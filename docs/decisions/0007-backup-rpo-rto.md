# 0007 — Backup, restore, RPO and RTO

- **Date:** 2026-09-15
- **Status:** **DECISION REQUIRED** (targets proposed, not accepted)
- **Owner:** Dhishan / Linus — RPO/RTO are business decisions, not engineering ones
- **Requirement:** docs/backend/09 §4 (Backups), §5

## The decision that is required

**How much data may we lose (RPO), and how long may we be down (RTO)?**

These are business/clinical risk decisions with direct cost consequences, so
engineering proposes and the product owner decides.

### Proposed targets

| Target | Proposal | What it costs | What it buys |
| --- | --- | --- | --- |
| **RPO — 5 minutes** | Continuous WAL archiving / point-in-time recovery, retained 30 days | The PITR tier of a managed Postgres, i.e. continuous WAL shipping rather than nightly dumps | At most five minutes of clinical writes lost. A day's loss would mean a ward re-entering a day of records from memory — not acceptable for a health record. |
| **RTO — 4 hours** | Documented restore runbook, rehearsed quarterly | A quarterly restore rehearsal (half a day of engineering time) | The service is back within one clinical shift. Sub-hour RTO needs a warm standby and roughly doubles the database cost — propose only if the product owner judges a multi-hour outage unacceptable. |

Both numbers are **proposals**. Until they are accepted, the repository must not
claim an RPO or an RTO.

## What is decided regardless of the numbers

1. **Backups are encrypted at rest**, with a key not stored alongside them.
2. **Backups live in the India region** (0005), same as the primary.
3. **Backups are tested.** An untested backup is not a backup. The restore
   rehearsal is a scheduled, recorded exercise:
   - restore the most recent backup into a scratch database;
   - apply the repository's migrations and confirm the schema matches;
   - run the audit integrity verifier (`GET /api/v1/audit/integrity`, or
     `verifyAuditChain` offline) against the restored data and require `ok: true`
     — the hash chain makes "did this restore silently lose or corrupt rows?"
     an answerable question rather than a hope;
   - record the wall-clock time taken; that measurement is the real RTO, and if
     it exceeds the accepted target the target or the architecture must change.
4. **Restore procedure is written down before it is needed**, in the runbook
   below, not improvised during an incident.
5. **Migration safety** (from 0005): backward-compatible migrations, applied
   separately from the application release, so a rollback never requires a
   database restore.

## Restore runbook (skeleton — completed once the provider is chosen)

1. Declare the incident; stop writes by scaling the API to zero (readiness will
   already be failing if the database is gone).
2. Provision a new database instance in the **India region**.
3. Restore to the chosen point in time (for corruption: the last known-good
   moment *before* the corrupting event; for loss: the latest available).
4. Apply any migrations the restored snapshot predates.
5. Run the audit chain verifier; investigate before proceeding if it reports
   issues.
6. Repoint `DATABASE_URL`, restart the API, confirm `GET /health/ready` is 200.
7. Restore traffic. Record actual data loss and actual downtime, and compare
   them against the accepted RPO/RTO.

## Not yet possible

The provider-specific backup configuration, the actual PITR window, and a
rehearsed restore **cannot be produced in this phase** because no provider is
selected (0005) and no production database exists. Claiming a tested restore
here would be false.

What Phase 4 does deliver toward this: the audit hash chain gives restore
verification a real integrity check, and the migration discipline makes
rollback not depend on a restore.
