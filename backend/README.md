# Jan Arogya Portal — Backend

Node.js + TypeScript REST API for the Jan Arogya Portal.
**Phase 1: foundation** — health probe, configuration, structured logging,
request IDs, centralized errors, CORS, security headers, rate limiting, Zod
validation and OpenAPI documentation.

See [`docs/architecture.md`](../docs/architecture.md) for the full architecture
and migration plan.

## Stack

Fastify · Zod · OpenAPI (`@fastify/swagger` + Swagger UI) · pino logging.
PostgreSQL/Prisma, auth, consent and ABDM integration land in later phases.

## Run it

```bash
npm install
cp .env.example .env      # then adjust if needed
npm run dev               # starts on http://localhost:4000
```

- Health probe: `GET http://localhost:4000/health`
- API docs (Swagger UI): `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs/json`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch mode (tsx) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite (runs against an injected app, no socket) |

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
