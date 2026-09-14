# Implementation Log — Backend Phase 2 (Database)

- **Date:** 2026-09-14
- **Task:** PostgreSQL + Prisma data model per `docs/architecture.md` §4.3 and
  the brief's Phase 2 (database) list.
- **Status:** Complete for this phase

## Scope

Define the persistent data model for the Jan Arogya Portal on PostgreSQL via
Prisma: every tenant-sensitive entity, its foreign keys, and the indexes that
the read/write API phases will rely on. This phase ships the **schema and
migration**; the service layer, read APIs, and the frontend `remote-impl` seam
are the following phases and are untouched here.

## Done

- **`prisma/schema.prisma`** — 24 models + 24 enums, mapped to snake_case
  tables, covering every entity in the brief (plus `care_tasks`, the one
  current frontend domain entity the brief's "at least" list omits):

  | Table | Purpose |
  | --- | --- |
  | `organizations` | Tenant root (hospital / lab / pharmacy / platform), HFR facility id |
  | `users` | Accounts (authN), role, primary tenant, optional patient link |
  | `organization_members` | Many-to-many user ↔ org with org-scoped role |
  | `patients` | Demographic records (no credentials, no ABHA inline) |
  | `patient_identities` | ABHA number / address + verification state |
  | `encounters` | Care episodes (OPD/IPD/Emergency/Teleconsult) |
  | `clinical_records` | Allergies / conditions / medications / notes / vitals / observations |
  | `diagnoses` | Coded problem list (status, clinician attribution) |
  | `prescriptions` + `prescription_items` | Medication orders + line items |
  | `lab_orders` + `lab_results` | Order (ordering→performing tenant) + structured results |
  | `procedures` | Clinical procedures |
  | `consents` | JAP consent request/decision (scope + ABDM hiTypes + expiry) |
  | `consent_records` | ABDM consent-manager artifact references |
  | `access_requests` + `access_decisions` | Cross-tenant access gate + decisions |
  | `audit_events` | Append-only, hash-chained audit trail |
  | `audit_proofs` | Blockchain/merkle anchoring proofs |
  | `abdm_transactions` | Server-side ABDM transactions (identify/OTP/consent/HI) |
  | `abdm_identities` | ABDM registry references (ABHA / HPID / facility) |
  | `care_contexts` | HIP care-context references for record exchange |
  | `notifications` | Audience-scoped in-app notifications |
  | `care_tasks` | Cross-org coordination tasks (created ↔ assigned tenant) |

- **UUIDv4 everywhere.** `@id @default(uuid()) @db.Uuid` → `gen_random_uuid()`.
  No auto-increment, sequential, or ABHA-derived ids (doc 05 §2/§6). The single
  exception is `audit_events.sequence` (`BIGSERIAL`), the monotonic total-order
  counter for the hash chain.

- **Tenant association.** Every tenant-sensitive table carries an
  `organization_id` FK (owning/registering tenant). Multi-tenant FKs are
  explicit where two orgs are involved (`lab_orders.ordered_by_org_id` vs
  `performing_org_id`; `consents.requesting_org_id`).

- **Foreign keys.** `ON UPDATE CASCADE` throughout; `ON DELETE` is a deliberate
  per-relation choice (documented in the schema header):
  - `Restrict` on all references to `organizations` (a tenant is never silently
    deleted while referenced).
  - `Cascade` for child rows that exist only inside a patient's chart.
  - `SetNull` for audit/transaction/access rows that must outlive the patient,
    backed by denormalized name snapshots (`actor_name`, `clinician_name`, …).

- **Indexes.** Unique constraints (tenant code, email, identity
  `(type, value)`, consent `(org, reference_number)`, request ids, chain
  links) plus covering indexes for the hot paths, notably
  `consents(patient_id, requesting_org_id, status)` for `evaluateAccess`'s
  "newest active consent" lookup, `audit_events(action / resource / ts / actor /
  org / patient)`, and audience/read-state indexes on `notifications`.

- **`prisma/migrations/20260914000000_init/migration.sql`** — the full init DDL
  (enums → tables → indexes → FKs), authored to mirror `schema.prisma` exactly,
  plus `migration_lock.toml`.

- **Wiring.** `docker-compose.yml` (Postgres 16), `DATABASE_URL` added to
  `src/config/env.ts` (Zod-validated, defaults to compose credentials) and
  `.env.example`, a `src/lib/prisma.ts` singleton (`$disconnect` on shutdown in
  `server.ts`), an idempotent `prisma/seed.ts` (the five demo tenants), and
  npm scripts (`prisma:generate`, `db:migrate`, `db:deploy`, `db:seed`,
  `db:studio`, `db:up`, `db:down`).

## Verified

- Schema **validated and formatted** with the Prisma WASM schema engine
  (`@prisma/prisma-schema-wasm` @ the 6.19.3 engine commit) — `validate` clean,
  `get_datamodel` resolves 24 models / 24 enums with all relations wired.
- `npm run typecheck` — clean.
- `npm test` — 12/12 pass (unchanged from Phase 1).
- Note: `prisma generate` / `migrate dev` were **not** runnable in this
  sandbox — the environment blocks `binaries.prisma.sh` (native engine
  download). The schema was therefore verified via the WASM engine, and the
  migration SQL was authored by hand against the validated datamodel. On a
  normal machine, run `npm run db:up && npm run db:migrate` to apply it.

## Files

```
backend/
  prisma/
    schema.prisma                                      # source of truth
    migrations/20260914000000_init/migration.sql       # init DDL
    migrations/migration_lock.toml
    seed.ts                                            # baseline demo tenants
  docker-compose.yml                                   # Postgres 16
  .env.example · src/config/env.ts                     # + DATABASE_URL
  src/lib/prisma.ts                                    # client singleton
  src/server.ts                                        # $disconnect on shutdown
  package.json                                         # prisma dep + scripts
```

## Decisions worth recording

1. **`clinical_records` as a kind-discriminated table.** Allergies, chronic
   conditions, current medications, notes, vitals and observations share one
   shape (patient + org + optional encounter + `kind` + free-text `detail` +
   `jsonb data`). This mirrors the frontend's distinct *lists* without a
   speculative per-list table, and preserves the "recorded none vs never
   asked" distinction (doc 05 §1.5) via row-set presence. `diagnoses` remains a
   separate coded problem list.
2. **Consent is two tables.** `consents` = the JAP consent request/decision
   (drives `evaluateAccess`); `consent_records` = the ABDM consent-manager
   artifact (references + lifecycle only, never a registry shadow copy —
   doc 07 §3). Same split for access: `access_requests` (the ask) +
   `access_decisions` (the resolved outcome with coded reason).
3. **Audit hash chain lives in the row.** `prev_event_id` (unique self-FK) +
   `hash` + `sequence` give a tamper-evident chain whose merkle root is the
   only thing `audit_proofs` anchors on-chain. Records stay off-chain.
4. **Clinical dates vs timestamps.** `dob`, encounter `date`, `ordered_on`,
   `as_of`, `issued_on`, `expires_on` etc. are `DATE`; audit `ts`, `expires_at`,
   `verified_at`, `anchored_at` are `TIMESTAMPTZ` (doc 09 §1).
5. **Attribution carried ahead of the read.** `clinician_id` on encounters /
   diagnoses / procedures / prescriptions is nullable (`SetNull`, with a
   denormalized name snapshot) so the History milestone can read it without a
   migration, matching doc 05 §4 / doc 08 §3.

## Next

Phase 2 read APIs + the frontend `remote-impl` seam (per `docs/architecture.md`
§5.3): organizations, users, patients (list/identity/bundle/timeline/access),
audit feed, notifications, platform stats — with the full demo-seed replay of
`src/data/seed.ts` moved into `backend/prisma/seed.ts` once the seed shapes are
exercised end-to-end.
