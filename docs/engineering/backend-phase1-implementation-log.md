# Implementation Log — Backend Phase 1 (Foundation)

- **Date:** 2026-09-14
- **Task:** Stand up the JAP backend application per `docs/architecture.md` §3–§5
- **Status:** Complete for this phase

## Scope

Phase 1 as narrowed by the current implementation brief: the backend
**foundation** — application skeleton, `GET /health`, and every cross-cutting
concern. Prisma/PostgreSQL, auth, seed data and feature modules are
deliberately **not** part of this phase; they follow in later increments.

## Done

- `backend/` — standalone Node 20+ / TypeScript (strict, ESM, NodeNext) app.
  Fastify 5 application factory (`buildApp()`) separated from the bootstrap
  (`server.ts`) so tests inject requests without sockets; graceful shutdown on
  SIGINT/SIGTERM.
- `GET /health` — liveness probe returning service identity, environment,
  timestamp, uptime. No downstream I/O, so it cannot flap for reasons
  unrelated to the process.
- **Environment configuration** — `src/config/env.ts`: one Zod-validated
  `Env` object, fail-fast boot with per-field reports. No code reads
  `process.env` elsewhere. `.env.example` provided; `.env` gitignored.
  No secrets in the repo.
- **Structured logging** — pino via Fastify: JSON in prod, pretty in dev,
  silent in tests; `authorization`/`cookie` headers redacted; minimal request
  serializer (id, method, url, remoteAddress — no PII).
- **Request IDs** — inbound `x-request-id` honored, UUIDv4 minted otherwise;
  ID attached to every log line and echoed on every response.
- **Centralized error handling** — `src/middleware/error-handler.ts`: one
  envelope `{ error: { code, message, requestId, details? } }` for all paths:
  `validation_failed` 400, `not_found` 404, `rate_limited` 429,
  `internal_error` 500 (logged server-side, opaque to caller — verified the
  thrown message does not leak).
- **CORS** — exact-origin allowlist from env; disallowed origins receive no
  `access-control-allow-origin`. Credentials off until cookie sessions land.
- **Security headers** — `@fastify/helmet`. CSP disabled for the bundled
  Swagger UI (documented in code); revisit when `/docs` is disabled in prod.
- **Rate limiting** — `@fastify/rate-limit`, per-IP, env-configured max/window,
  `x-ratelimit-*` headers, 429 through the standard envelope.
- **Zod validation** — `fastify-type-provider-zod` validator + serializer
  compilers; route schemas are the single source of truth for runtime checks
  and OpenAPI.
- **OpenAPI documentation** — `@fastify/swagger` (3.0.3) + Swagger UI at
  `/docs`, JSON at `/docs/json`.
- **Tests** — 12 Vitest integration tests via `inject()`: health, request-id
  echo/generation, 404/400/500 envelopes, 429 after limit, helmet headers,
  CORS allow/deny, OpenAPI contents. All pass.

## Verified

- `npm run typecheck` — clean.
- `npm test` — 12/12 pass.
- `npm run build` → `node dist/server.js` — boots on `0.0.0.0:4000`; `/health`,
  `/docs`, `/docs/json` live-checked with curl (bodies above in the phase
  summary); security headers and CORS behavior confirmed on the wire.

## Files

```
backend/
  package.json · tsconfig.json · .env.example · README.md
  src/config/      env.ts · logger.ts · meta.ts
  src/middleware/  error-handler.ts · request-id.ts
  src/modules/health/ routes.ts · schemas.ts
  src/types/       fastify.d.ts        (app.env augmentation)
  src/app.ts · src/server.ts
  tests/app.test.ts
```

## Decisions worth recording

1. **Zod v4 `.default()` semantics.** `.default()` after `.transform()` now
   expects the *output* type (v3 accepted the input type). `parseEnv`
   therefore parses raw strings/enums/numbers and converts booleans and the
   origin list explicitly afterwards.
2. **Error handler receives `unknown`** under the Zod type provider; the
   handler is typed `setErrorHandler<FastifyError>` and narrows defensively
   (`instanceof ZodError`, `.validation`, `statusCode`).
3. **Rate-limit option naming** differs by major version; this app pins
   `@fastify/rate-limit@11` which uses `addHeaders` (not `addHeadersOnDeny`).
4. **`trustProxy: true`** — the API runs behind platform/load-balancer
   proxies; real client IPs matter for rate limiting.

## Next

Phase 2 per `docs/architecture.md`: Prisma schema + migration, seed replaying
`src/data/seed.ts` 1:1, auth module (demo personas), then read APIs and the
frontend `remote-impl` seam.
