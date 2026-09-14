# Jan Arogya Portal — Backend

Node.js + TypeScript REST API for the Jan Arogya Portal.

**Phase 4: patients + authorization** — the patient identity registry
(`/api/v1/patients`) on top of a server-enforced RBAC and tenant-isolation
layer, built on the Phase 3 authentication boundary, the Phase 2 PostgreSQL +
Prisma data model (24 tables) and the Phase 1 foundation.

See [`docs/architecture.md`](../docs/architecture.md) for the full architecture
and migration plan, and `docs/engineering/backend-phase4-patients-log.md` for
this phase's decisions.

## Stack

Fastify · Zod · OpenAPI (`@fastify/swagger` + Swagger UI) · pino logging ·
PostgreSQL · Prisma · in-memory cookie sessions (Phase 3, pluggable to
Redis/Postgres next). The ABDM adapter and the consent **plane** land in later
phases; the seams they plug into are already in place (`ConsentLookup`,
`patient.verify_identity`).

## Run it

```bash
npm install
cp .env.example .env      # then adjust if needed
npm run dev               # starts on http://localhost:4000
```

- Health probe: `GET http://localhost:4000/health`
- Auth (Phase 3): `POST /api/v1/auth/authenticate`, `GET /api/v1/auth/session` (`/me` alias), `POST /api/v1/auth/sign-out` — see `src/modules/auth/`
- Patients (Phase 4): `POST|GET /api/v1/patients`, `GET|PATCH /api/v1/patients/{id}` — see `src/modules/patients/`
- Consents (Phase 6): `POST|GET /api/v1/consents`, `GET /api/v1/consents/{id}`, `POST …/{id}/approve|reject|revoke` — the patient decides, nobody else
- Care (Phase 6): `GET|POST /api/v1/patients/{id}/encounters`, `GET|POST …/records` — append-only clinical records
- Access (Phase 7): `POST /api/v1/access/evaluate` — purpose- and record-type-scoped sharing decision
- Audit: `GET /api/v1/audit`, `GET /api/v1/patients/{id}/audit` — the hash-chained trail
- API docs (Swagger UI): `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs/json`

## Database (PostgreSQL + Prisma)

The API boots without a database: the client connects lazily, `/health` stays
dependency-free, and the auth/patient demo stores are in-memory so CI needs no
Postgres. It also boots without the *generated* client — `prisma generate`
downloads an engine binary, so it fails on an offline machine; `src/lib/prisma.ts`
then leaves `prisma` null, the server logs why once, and every current route
(health, auth, patients) keeps working. Code that needs the data layer calls
`requirePrisma()` for a single actionable error.

To use the data layer:

```bash
npm run db:up            # start Postgres via docker-compose (port 5432)
npm run db:migrate       # apply prisma/migrations against DATABASE_URL
npm run prisma:generate  # (re)generate the typed Prisma client
npm run db:seed          # idempotent baseline: the five demo tenants
npm run db:studio        # browse data at http://localhost:5555
```

`schema.prisma` is the single source of truth; `prisma/migrations/` is the
checked-in migration history (regenerate with `npm run db:migrate` after a
schema change). `DATABASE_URL` is Zod-validated in `src/config/env.ts` and
defaults to the docker-compose credentials.

### Data model at a glance

- **Tenancy** — `organizations` (hospital/lab/pharmacy/platform) is the tenant
  root; `users` + `organization_members` model accounts and per-org roles.
  Every tenant-sensitive table carries an `organization_id` FK.
- **Patients & records** — `patients` (demographics) + `patient_identities`
  (ABHA number/address), `encounters`, `clinical_records` (allergies /
  conditions / medications / notes / vitals), `diagnoses`, `prescriptions`
  (+`prescription_items`), `lab_orders` + `lab_results`, `procedures`.
- **Consent & access** — `consents` (the JAP consent request/decision) +
  `consent_records` (ABDM consent-manager artifact), `access_requests` +
  `access_decisions` (the cross-tenant access gate).
- **Integrity** — `audit_events` (append-only, hash-chained) + `audit_proofs`
  (blockchain/merkle anchors).
- **ABDM** — `abdm_transactions` (server-side OTP/consent/HI transactions),
  `abdm_identities` (ABHA/HPID/facility references), `care_contexts` (HIP
  record references).
- **`notifications`** — audience-scoped (user / org / role).
- **`care_tasks`** — cross-org coordination tasks (the frontend `CareTask`).

All ids are UUIDv4. Clinical dates are `DATE`; audit/moment timestamps are
`TIMESTAMPTZ`. See `prisma/schema.prisma` for the full, commented model.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch mode (tsx) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (runs against an injected app, no socket, no DB) |
| `npm run db:up` / `db:down` | Start / stop Postgres (docker-compose) |
| `npm run db:migrate` | `prisma migrate dev` (apply + create migrations) |
| `npm run db:deploy` | `prisma migrate deploy` (apply, no drift check) |
| `npm run prisma:generate` | (Re)generate the Prisma client |
| `npm run db:seed` | Idempotent baseline seed (demo tenants) |
| `npm run db:studio` | Prisma Studio data browser |

## Configuration

All configuration flows through `src/config/env.ts` (Zod-validated, fail-fast).
Copy `.env.example` → `.env`. Never commit `.env` or real secrets — it is
gitignored and reviewed as such.

## Error envelope

Every error is normalized by `src/middleware/error-handler.ts`, and every route
declares the error statuses it can return (`src/middleware/error-schemas.ts`),
so the OpenAPI document shows the real failure contract:

```json
{ "error": { "code": "validation_failed", "message": "…", "requestId": "…" } }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `validation_failed` | body/params/query failed the Zod schema |
| 400 | `invalid_transition` | lifecycle rule refused (e.g. `registered` without dob) |
| 401 | `unauthenticated` | no session, or an expired/revoked/forged one |
| 403 | `forbidden` | authenticated but not permitted — carries `reason`, and `capability` (role denial) or `access` (record denial) |
| 404 | `not_found` | unknown route or unknown opaque id (no existence oracle) |
| 404 | `identity_not_found` | no such identifier on that patient record |
| 409 | `identity_conflict` | a canonical identifier is already linked to a record |
| 429 | `rate_limited` | rate limit exceeded |
| 500 | `internal_error` | unexpected failure (logged server-side, opaque by design) |

## Authentication (Phase 3)

`POST /api/v1/auth/authenticate` accepts `{ role, identifier }` and returns the
locked discriminated union `{ status: "authenticated", user } | { status:
"identifier-not-found" } | { status: "role-unavailable" }` (always 200 for app
outcomes; validation failures are 400 via the standard error envelope). Matching
ignores case/spaces/dashes, is role-scoped, and rejects cross-role hits without
an oracle. On success the response sets an `HttpOnly; SameSite=Lax` cookie
(`jap_session`) whose value is an opaque server-side UUID — the browser never
sees the session contents. `GET /api/v1/auth/session` (alias `/me`) re-validates
the cookie and returns `{ user }` or 401; `POST /api/v1/auth/sign-out` revokes
the server session and clears the cookie (idempotent).

A session carries `{ id, role, name, orgId?, patientId? }`. `orgId` is the
tenant every scoped query is built from; `patientId` is the record a PATIENT
account owns (`users.patient_id`) and is the only way the `self` access rule can
be enforced without trusting a client-supplied id.

The demo registry in `src/modules/auth/service.ts` mirrors `src/data/seed.ts`
and the legacy `frontend/src/js/auth/mock-auth.js` (12 accounts: platform,
hospital admins, doctors, lab, pharmacy, patients with ABHA aliases) and exists
only for demo/CI. Production will swap this registry for a Prisma-backed alias
table without changing the route contract. See `docs/backend/03` and `06 §1`.

## Patients (Phase 4)

| Endpoint | Capability | Notes |
| --- | --- | --- |
| `POST /api/v1/patients` | `patient.register` | Creates in the caller's own tenant (never a body `orgId`). ABHA optional; declared identifiers are stored **unverified**. |
| `GET /api/v1/patients` | `patient.search` | Scoped list: own tenant + patients with a consent artifact for it. Filters `q`, `orgId`, `state`, `status`, `limit`, `offset`. |
| `GET /api/v1/patients/{id}` | `patient.read` | `{ patient, access }`; 403 + `AccessDecision` when sealed, 404 when unknown. |
| `PATCH /api/v1/patients/{id}` | `patient.update` (+ per field) | Demographics, `status: "registered"` promotion, `addIdentity`, `markIdentityVerified`. Owning tenant only. |

Identity rules (`docs/backend/04`):

- The JAP patient id is an opaque UUIDv4. **No ABHA ever appears in a path,
  query, log line or audit row.**
- External identifiers live only in `patient_identities` — the `patients` row
  has no ABHA column. Values are canonicalized (bare 14 digits; lowercase
  address), unique per `(type, value)` platform-wide, and returned **masked**
  (`ABHA •••• 3401`, `••••@abdm`).
- Verification state is server-owned. A client may *declare* an identifier; it
  can never assert `verified`. Only `markIdentityVerified` (in production, the
  ABDM adapter after a doc 04 §6 confirm) flips it.
- `state` is derived, never stored: `provisional` | `registered` | `abha_linked`
  (the last one means "at least one ABHA identity is verified").
- **ABHA is never mandatory.** A patient can be created with a name only,
  promoted to `registered`, read, updated and discharged with no identifier at
  all. ABHA is not authentication (that is the session) and not consent (that is
  a consent artifact) — the three mechanisms never substitute for each other.

## Authorization (Phase 4) — RBAC + tenant isolation

Enforced server-side in the order `docs/architecture.md` §4.1 fixes. Frontend
guards are UX only; nothing here trusts them.

```
1  session        src/lib/session.ts        who are you?            → 401
2  role           src/lib/permissions.ts    may your role do this?  → 403 role_not_permitted
3  relationship   src/services/access-service.ts   same tenant?     → 403 + AccessDecision
4  consent        src/services/consent-view.ts     active artifact? → 403 + AccessDecision
                 (an adapter over src/modules/consents — the plane owns consent state)
5  audit          src/modules/audit         every allow AND deny    → hash-chained rows
```

**Layer 2 — capability matrix** (`src/lib/permissions.ts`, default-deny; mirrors
the frontend's `CAN` in `src/auth/roles.ts`, which the unit tests assert
capability-for-capability):

| Capability | PATIENT | DOCTOR | HOSPITAL_ADMIN | LAB | PHARMACY | SUPER_ADMIN |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `patient.register` | — | ✅ | ✅ | — | — | — |
| `patient.read` / `patient.search` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patient.update` | — | ✅ | ✅ | — | — | — |
| `patient.link_identity` | — | ✅ | ✅ | — | — | — |
| `patient.verify_identity` | — | ✅ | — | — | — | — |

Read/search is granted broadly **because the scope is what narrows it**: the
capability says "this role may query the registry", Layers 3–4 decide which rows
exist for this caller. Granting a capability never grants a record.

**Layers 3–4 — the access decision** reproduces `evaluateAccess` from
`src/data/store.ts` exactly (architecture §2.5), so the API and the demo
frontend answer identically:

1. `SUPER_ADMIN` → allowed, `platform` (read-only oversight, still audited)
2. `PATIENT` → own record only, `self` (a patient account with no record reaches nothing)
3. same tenant as the record's owner → allowed, `same_tenant`
4. otherwise the newest consent artifact for (patient, actor's tenant): active
   (`approved` + unexpired) → `consent_active`; else denied with
   `consent_pending` / `consent_expired` / `consent_revoked` / `consent_denied` /
   `no_consent`
5. an actor with no tenant is denied — fail closed

Tenant isolation in practice:

- **Writes belong to the owning tenant.** A consent opens a *read*; it never
  opens an edit of another tenant's registry row (`cross_tenant_write`). This is
  what keeps JAP out of the business of holding one facility's records for
  another (architecture §4.2).
- **Out-of-scope records are absent, not just sealed.** A record in another
  tenant with no consent artifact is not listed, not counted in `total`, and not
  matched by `q` — the registry must not become a national patient directory
  (`docs/backend/08` §4).
- **Sealed rows.** Where the caller's tenant *has* an artifact that is not
  active, the list returns a stub: `{ sealed: true, id, orgId, access }`. No
  name, no dob, no contact, no identifiers. The tenant learns the state of its
  own request and nothing about the person. Sealed stubs are dropped as soon as
  a content filter (`q`, `state`, `status`) is present, so a filter cannot be
  used to profile a record the caller cannot read.
- **403 vs 404.** Unknown id → 404; known-but-inaccessible → 403 with the
  decision (the sealed view the parity checklist requires). That distinction is
  safe only because ids are opaque UUIDv4 — there is no id space to enumerate.

**Layer 5 — audit.** Every decision, allow and deny, writes an append-only
entry through the one writer the API has (`src/modules/audit`), mirroring the
`audit_events` columns: `sequence`, actor snapshot, `organizationId`, `action`,
`resourceType`/`resourceId`, `patientId`, `status`, `reason`, `capability`,
`authorizationId`, `requestId`. Denied reads, refused writes, role denials and
even unauthenticated attempts are all recorded; a 404 probe is recorded too,
because that is what enumeration looks like. Entries carry ids and reasons only —
no name, no dob, no identifier value, and no search term. `reason` and
`capability` are inside the hashed envelope, so rewriting *why* an access was
granted breaks the chain instead of quietly succeeding.

The log sinks are held to the same rule. Fastify logs `req.url` on every request,
query string included, so `?q=iqbal` would leak a fragment of a patient's name no
matter how careful the handlers are; `config/logger.ts` therefore masks every
query value except an allowlist of operational parameters (`limit`, `offset`,
`status`, `state`, `orgId`, sorting). The allowlist is the point: a new parameter
is silent until someone decides it belongs in a log, instead of leaking until
someone remembers to list it.

The hash chain (`prevEventId`/`hash` over a canonical envelope) is implemented;
external anchoring proofs (`audit_proofs`) belong to the audit-integrity
milestone. The store is in-memory, so the chain is lossy-on-restart — a real
guarantee needs the durable table, and the module says so rather than implying
otherwise.

## Layout

```
src/
  config/        env.ts (Zod config) · logger.ts (pino) · meta.ts (identity)
  lib/           prisma.ts · session.ts (cookie sessions)
                 roles.ts (role registry, mirrors frontend/src/js/roles.js)
                 permissions.ts (Layer 2 capability matrix, default-deny)
                 demo-ids.ts (shared synthetic ids for the demo stores)
  middleware/    error-handler.ts · error-schemas.ts · request-id.ts
                 rbac.ts (guard: session → capability → denial reporting)
  services/      access-service.ts (Layers 3/4: evaluateAccess, write scope, visibility)
                 access-schemas.ts (AccessDecision as an API contract)
                 consent-view.ts (the ConsentLookup seam: projects modules/consents
                                  into the §2.5 vocabulary and seeds the demo artifacts)
  modules/
    health/      GET /health
    auth/        POST /api/v1/auth/authenticate, GET /session|/me, POST /sign-out
    patients/    routes.ts · schemas.ts · service.ts · store.ts
    consents/    the consent plane: request → patient decision → expiry → revocation
    care/        encounters + append-only clinical records
    access/      POST /api/v1/access/evaluate (purpose/record-type scoped decision)
    audit/       the hash-chained trail (Layer 5) + its read routes
  types/         Fastify module augmentation (app.env, request.actor)
  app.ts         buildApp() factory (injectable for tests)
  server.ts      bootstrap + graceful shutdown
tests/
  app.test.ts             cross-cutting contracts (health, envelope, CORS, rate limit, OpenAPI, log redaction)
  bootstrap.test.ts       boot state: the registry is populated on import, identities do not collide
  auth.test.ts            Phase 3 authentication + sessions
  patients.test.ts        Phase 4 record contract (ABHA optional, masking, lifecycle)
  rbac.test.ts            authorization layers as units (matrix, decisions, audit)
  patients-authz.test.ts  the same endpoints driven by every role, across tenants
  consents.test.ts        Phase 6 consent workflow (only the patient decides)
  care.test.ts            Phase 6 encounters + append-only records
  access.test.ts          Phase 7 evaluate: the canonical reason vocabulary
  audit.test.ts           the trail's hash chain
```

Each module folder follows the same shape: `routes.ts` (Fastify plugin) ·
`schemas.ts` (Zod, driving both validation and OpenAPI) · `service.ts` (logic) ·
`store.ts` (persistence seam).
