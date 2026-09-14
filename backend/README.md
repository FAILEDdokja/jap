# Jan Arogya Portal — Backend

Node.js + TypeScript REST API for the Jan Arogya Portal.
**Phase 2: database** — PostgreSQL + Prisma schema (24 tables: tenancy,
patients, clinical records, coordination, consent/access, audit-with-proofs,
ABDM integration, notifications) on top of the Phase 1 foundation (health probe,
configuration, structured logging, request IDs, centralized errors, CORS,
security headers, rate limiting, Zod validation, OpenAPI).

See [`docs/architecture.md`](../docs/architecture.md) for the full architecture
and migration plan.

## Stack

Fastify · Zod · OpenAPI (`@fastify/swagger` + Swagger UI) · pino logging ·
PostgreSQL · Prisma. Auth, consent and ABDM **services** land in later phases.

## Run it

```bash
npm install
cp .env.example .env      # then adjust if needed
npm run dev               # starts on http://localhost:4000
```

- Health probe: `GET http://localhost:4000/health`
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

## Layout

```
src/
  config/        env.ts (Zod config) · logger.ts (pino) · meta.ts (identity)
  middleware/    error-handler.ts · request-id.ts
  modules/
    health/      GET /health
  types/         Fastify module augmentation (app.env)
  app.ts         buildApp() factory (injectable for tests)
  server.ts      bootstrap + graceful shutdown
tests/
  app.test.ts    integration tests via fastify inject()
```
