# 0002 — Audit persistence and failure policy

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Backend (engineering); the fail-closed posture was pre-decided in docs/backend/09 §2
- **Requirement:** docs/backend/09 §2 (Auditability)

## Decision

### 1. Audit is persistent

The in-memory audit store is replaced by the PostgreSQL `audit_events` table.
`AUDIT_STORE=postgres` is **mandatory in production** (the configuration gate
refuses to boot with `memory`). The memory store remains for unit tests and
DB-less local development only.

### 2. Audit is append-only, structurally

- No update or delete method exists anywhere in the application — not on the
  `AuditStore` interface, not in the service, not as an HTTP route.
- PostgreSQL enforces it independently: `BEFORE UPDATE` and `BEFORE DELETE`
  triggers on `audit_events` raise `restrict_violation`. An application bug, a
  stray migration, or a careless `psql` session cannot quietly rewrite history.

### 3. Audit is hash-chained

Each event stores `prev_event_id`, `prev_hash`, and its own SHA-256 `hash` over
a canonical envelope of its metadata fields. `sequence` is a `bigserial`,
giving a monotonic total order. The append is performed inside **one
transaction guarded by a `pg_advisory_xact_lock`**, so concurrent writers
serialize and the chain cannot fork.

### 4. Audit fails CLOSED

If the audit event cannot be persisted within `AUDIT_WRITE_TIMEOUT_MS`
(default 2000 ms), the request is **rejected** with HTTP 503
`audit_unavailable`. The action does not happen.

`AUDIT_FAILURE_MODE=open` exists for local development and is rejected in
production by the configuration gate.

## Rationale for fail-closed

doc 09 §2 already states "fail-closed for writes, decided explicitly". The
implementation adopts it for security *and* clinical writes because:

- an unaudited access to a patient record is indistinguishable, after the fact,
  from an unauthorized one — the audit trail is the only evidence that consent
  and purpose were honoured;
- a patient's future access-history feature (doc 08 §5) is fed by this same
  stream, so a gap is a gap in what we can show the patient about their own
  data;
- the failure is loud and bounded: a 2-second timeout, a 503 with a retry
  message, and a metric/alert — not a hang.

The cost is availability: a database outage stops writes. That is the correct
trade for a health record system, and it is the same outage that would stop the
clinical write itself, since both live in PostgreSQL.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Fail-open with a warning log** | Produces exactly the gap described above, precisely during an incident, which is when the audit trail matters most. |
| **Buffer to disk and replay** | A local spool is another durability story to get right (ordering, corruption, disk full) and would break the hash chain's single-writer invariant. Revisit only if measured availability demands it. |
| **Write audit asynchronously (queue)** | Phase 4 forbids introducing a queue without a proven requirement, and an async writer cannot make the write *transactionally* linked to the action. |
| **Chain in the application without an advisory lock** | Two concurrent requests would read the same tail and fork the chain. Measured and rejected — see the concurrency test. |
| **Compute `sequence` in the application** | Racy for the same reason. `bigserial` + the lock is the database doing what it is good at. |

## What is deliberately NOT stored

OTPs, passwords, session ids/secrets, full ABHA numbers or addresses, and
clinical payloads. `assertNoSensitiveValues()` screens every write and throws
rather than degrading. Client IPs are truncated to a /24 (IPv4) or /48 (IPv6)
and the user agent is reduced to one of three device classes.

## Consequences

- A database outage now returns 503 on audited endpoints instead of succeeding
  silently. This is intended and must be covered by the alerting in 0008.
- The advisory lock serializes audit appends. At the current request volumes
  this is not a bottleneck; if it becomes one, the fix is per-shard chains
  (one chain per organization) — a schema change that needs its own record.
- The chain writer uses parameterized raw SQL rather than the Prisma model API,
  because Prisma cannot express "advisory lock + read tail + insert" as one
  statement sequence with the required guarantees. All values are bound
  parameters; no interpolation.

## Evidence

- Implementation: `backend/src/modules/audit/{store,service,sql,verify,types}.ts`
- Migration: `backend/prisma/migrations/20260915120000_audit_hardening/migration.sql`
- Tests (real PostgreSQL): `backend/tests/audit-postgres.test.ts` — persistence
  across reconnect, UPDATE refused, DELETE refused, chaining, tamper detection,
  25-way concurrent writes, sensitive-value rejection, schema constraints
- Tests (policy): `backend/tests/audit-service.test.ts` — fail-closed, timeout,
  503 end-to-end, integrity verification, no secrets persisted
