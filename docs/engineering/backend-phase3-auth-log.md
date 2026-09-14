# Implementation Log — Backend Phase 3 (Authentication)

- **Date:** 2026-09-14
- **Task:** Role-scoped authentication + cookie sessions per `docs/backend/03-authentication-and-session.md` and `docs/backend/06-api-contracts.md §1`
- **Status:** Complete for this phase
- **Branch:** `arena/01a0a02c-jap` → PR to `main`

## Scope

Implement the backend-owned authentication boundary that the frontend's
`js/auth/auth-service.js` seam expects, without touching any page component.
This phase ships the **auth API and session cookie**; patient identity (ABDM)
and clinical reads follow in later phases. The frontend's `authenticate({role, identifier})`
call maps 1:1 onto `POST /api/v1/auth/authenticate` via the future adapter
`createApiAuthService`; the legacy `mock-auth.js` is not yet deleted — the
backend is additive.

Out of scope (explicitly deferred, see doc 03 §6/§8 and architecture §5.3):
credential step (`requires-credential` / `verify-credential`), ABDM-backed OTP,
password flows, persistent session store (Redis/Postgres), rate-limit tuning
beyond the global defaults, and removal of Supabase/demo-mode frontend code.

## Done

- **`backend/src/modules/auth/service.ts`** — in-memory demo registry (12
  synthetic accounts across the 6 Prisma roles) with the locked matching rules:
  `normalizeIdentifier` → `toLowerCase().replace(/[\s-]/g, "")` (case/space/dash
  insensitive), multiple aliases per account (HPID/username/mobile; ABHA number/
  address), role-scoped lookup, cross-role rejection as `identifier-not-found`,
  and `role-unavailable` for unknown or unprovisioned roles. First alias per
  account remains the `getDemoIdentifier()` affordance.

- **`backend/src/modules/auth/schemas.ts`** — Zod schemas for request/response
  and OpenAPI. The `AuthenticateResponseSchema` is a discriminated union on
  `status` (`authenticated` | `identifier-not-found` | `role-unavailable` |
  `requires-credential` future) so adapters switch on `status` without mapping
  HTTP codes, per doc 06 §1.

- **`backend/src/modules/auth/routes.ts`** — Fastify routes under
  `/api/v1/auth`:
  - `POST /authenticate` — always 200 for app outcomes; on `authenticated`
    creates an opaque `randomUUID` session, stores it in-memory with
    `SESSION_TTL_HOURS` expiry, and sets `HttpOnly; SameSite=Lax; Path=/`
    cookie (`jap_session`, `Secure` in production). Non-success outcomes are
    200 with no oracle (`identifier-not-found` vs `role-unavailable` only).
  - `GET /session` + alias `GET /me` — re-validates the cookie against the
    server map; 200 `{ user }` when valid, 401 `{ error: { code:
    unauthenticated } }` otherwise (so the frontend can route to
    `#/login/<role>`).
  - `POST /sign-out` — deletes the server session and clears the cookie with
    `Max-Age=0`; idempotent per doc 06.

- **`backend/src/lib/session.ts`** — dependency-free cookie session helpers:
  manual `Cookie`-header parsing, `setSessionCookie`/`clearSessionCookie`,
  in-memory `Map<string, Session>` with expiry eviction, `requireSession()`
  boundary. No `@fastify/cookie` dependency — the header is set directly so
  the phase stays lightweight and testable via `inject()`.

- **`backend/src/config/env.ts` + `backend/.env.example`** — added Phase 3
  session configuration: `SESSION_COOKIE_NAME` (default `jap_session`),
  `SESSION_TTL_HOURS` (default 8), `SESSION_SECURE` (default `false`, true in
  production), `SESSION_SECRET` (reserved for future signed cookies).

- **`backend/src/config/meta.ts`** — updated `API_DESCRIPTION` to Phase 3
  (authentication) and `backend/src/app.ts` to expose an `auth` OpenAPI tag
  and mount `authRoutes` at `/api/v1/auth` alongside `healthRoutes`.

- **`backend/README.md`** — updated from Phase 2 (database) to Phase 3,
  documenting the three auth endpoints, cookie semantics, demo registry, and
  the adapter swap.

- **`backend/tests/auth.test.ts`** — 13 integration tests (Vitest + `inject()`)
  locking the contract: HPID/ABHA authentication + cookie attributes,
  case/space/dash insensitivity, multiple aliases per account, cross-role
  rejection, `role-unavailable` vs `identifier-not-found`, 400 validation,
  session bootstrap via cookie, alias `/me`, 401 without/after expiry/tampering,
  sign-out revocation + clear, idempotent sign-out.

## Decisions worth recording

1. **In-memory sessions for Phase 3.** A `Map<sessionId, Session>` with TTL is
   sufficient for the demo and for `inject()` tests. The `src/lib/session.ts`
   seam is the only place that needs to change to plug Redis/Postgres later;
   routes keep calling `createSession`/`getSession`/`deleteSession`.
2. **Manual cookie handling over `@fastify/cookie`.** Avoids an extra runtime
   dependency in this phase; parsing is a dozen lines and `set-cookie` is
   emitted via `reply.header`. When `Secure` + signed cookies arrive, adopting
   the plugin is a one-line `app.register(cookie)` + helper swap.
3. **All authenticate outcomes are 200.** Follows doc 06's "application
   outcomes, not transport failures" rationale so the frontend's status-switch
   stays trivial. Validation failures (missing fields) remain 400 via the
   centralized error envelope.
4. **No PII in logs.** `authenticate` success logs only `actorId/role/status`;
   the identifier is never logged, matching doc 09 §2.
5. **Demo registry mirrors both legacy mock and seed.** 12 accounts cover all
   6 valid roles; aliases include the legacy `HP-1001`/`12-3456-7891-2345`/`FAC-PH-2201`
   shapes plus seed emails/phones so the login form's role-specific placeholders
   keep working while the richer tenant model is available.

## Verification

- `npm run typecheck` — clean.
- `npm test` — 25 tests (12 existing + 13 auth) pass via `inject()`; no DB
  or network required.
- Manual `curl` probes after `npm run dev` on `:4000` (health + auth flows,
  cookie set/read/clear, 401 branch).
- `GET /docs/json` confirms OpenAPI includes `POST /api/v1/auth/authenticate`,
  `GET /api/v1/auth/session`, `GET /api/v1/auth/me`, `POST /api/v1/auth/sign-out`
  under the `auth` tag.

## Next

Phase 4 per `docs/architecture.md` §5.3: read APIs (organizations, users,
patients list/bundle/timeline/access, audit feed, notifications, platform stats)
plus the frontend `remote-impl` seam and `VITE_DATA_MODE=api` flag — with the
full demo-seed replay moved into `backend/prisma/seed.ts` once the seed shapes
are exercised end-to-end (Phase 2 seeds only the five tenants today).
