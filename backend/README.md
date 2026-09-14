# Jan Arogya Portal — Backend

Node.js + TypeScript REST API for the Jan Arogya Portal.
**Phase 3: authentication** — role-scoped alias resolution (HPID / username /
mobile; ABHA number / address), case/space/dash-insensitive matching,
cross-role rejection, discriminated session contract, and HttpOnly
SameSite=Lax cookie sessions — on top of the Phase 1 foundation and the
Phase 2 PostgreSQL + Prisma data model (24 tables).

See [`docs/architecture.md`](../docs/architecture.md) for the full architecture
and migration plan.

## Stack

Fastify · Zod · OpenAPI (`@fastify/swagger` + Swagger UI) · pino logging ·
PostgreSQL · Prisma · in-memory cookie sessions (Phase 3, pluggable to
Redis/Postgres next). Consent and ABDM **services** land in later phases.

## Run it

```bash
npm install
cp .env.example .env      # then adjust if needed
npm run dev               # starts on http://localhost:4000
```

- Health probe: `GET http://localhost:4000/health`
- Auth (Phase 3): `POST /api/v1/auth/authenticate`, `GET /api/v1/auth/session` (`/me` alias), `POST /api/v1/auth/sign-out` — see `src/modules/auth/`
- API docs (Swagger UI): `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs/json`

## Database (PostgreSQL + Prisma)

The API boots without a database (the client connects lazily; `/health` stays
dependency-free). To use the data layer:

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
| `npm test` | Vitest suite (runs against an injected app, no socket) |
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

Every error is normalized by `src/middleware/error-handler.ts`:

```json
{ "error": { "code": "validation_failed", "message": "…", "requestId": "…" } }
```

Codes: `validation_failed` (400), `not_found` (404), `rate_limited` (429),
`internal_error` (500, opaque by design), `request_error` (other 4xx).

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

The demo registry in `src/modules/auth/service.ts` mirrors `src/data/seed.ts`
and the legacy `frontend/src/js/auth/mock-auth.js` (12 accounts: platform,
hospital admins, doctors, lab, pharmacy, patients with ABHA aliases) and exists
only for demo/CI. Production will swap this registry for a Prisma-backed alias
table without changing the route contract. See `docs/backend/03` and `06 §1` for
the full contract and `docs/engineering/backend-phase3-auth-log.md` for phase
decisions.

## Layout

```
src/
  config/        env.ts (Zod config) · logger.ts (pino) · meta.ts (identity)
  lib/           prisma.ts · session.ts (cookie session store, Phase 3)
  middleware/    error-handler.ts · request-id.ts
  modules/
    health/      GET /health
    auth/        POST /api/v1/auth/authenticate, GET /session|/me, POST /sign-out (Phase 3)
  types/         Fastify module augmentation (app.env)
  app.ts         buildApp() factory (injectable for tests)
  server.ts      bootstrap + graceful shutdown
tests/
  app.test.ts    cross-cutting + auth integration tests via fastify inject()
```
