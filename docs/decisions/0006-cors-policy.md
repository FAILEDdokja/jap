# 0006 — CORS policy

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Backend (engineering)
- **Requirement:** docs/backend/09 §7 (CORS)

## Decision

- **Explicit allowlist only.** `CORS_ORIGINS` is a comma-separated list of
  exact origins. The API never reflects an arbitrary `Origin` header back and
  never uses `*`.
- **Credentials are enabled** (`CORS_CREDENTIALS=true` in any cookie-session
  deployment) because the session is a cookie. A wildcard origin with
  credentials is forbidden by the spec and by the configuration gate.
- **Production validation** (`config/env.ts`) refuses to boot if the allowlist:
  is empty; contains `*`; contains a loopback origin (`localhost`, `127.0.0.1`,
  `[::1]`); contains a non-`https` origin; contains a value that is not an
  absolute origin; or contains a trailing slash (a common misconfiguration that
  silently never matches).
- **Headers are narrowed**: `allowedHeaders` is `content-type` plus the request
  id header; `exposedHeaders` is the request id header plus `retry-after`, so
  the browser client can read its correlation id and honour backoff.
- Preflight is cached for 600 seconds.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Wildcard `*`** | Incompatible with cookie credentials, and would let any site call the API with the user's session. |
| **Reflecting the `Origin` header** | Equivalent to a wildcard with credentials — the classic misconfiguration. |
| **Regex/suffix matching (`*.example.in`)** | One typo or one subdomain takeover extends trust to an attacker. Exact origins are cheap to maintain at this scale. |
| **Same-origin only (proxy the API under the frontend host)** | Genuinely the strongest option and worth revisiting when hosting is chosen (0005). Not assumed here because the hosting decision is still open. |

## Consequences

- Adding a frontend origin (a new environment, a custom domain) is a
  configuration change plus a restart, not a code change.
- A misconfigured origin fails at boot with a named problem, not at runtime
  with an opaque browser CORS error.
- The allowlist must be kept in step with the environments defined in 0005.

## Evidence

- Implementation: `backend/src/app.ts` (cors registration),
  `backend/src/config/env.ts` (`productionSafetyProblems`)
- Tests: `backend/tests/config.test.ts` — wildcard rejected, wildcard+credentials
  rejected, empty allowlist rejected, loopback rejected, plain-http rejected,
  malformed/trailing-slash rejected, multiple https origins accepted
