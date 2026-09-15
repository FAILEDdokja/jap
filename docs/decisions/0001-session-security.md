# 0001 — Session security model

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Backend (engineering decision; no product input required)
- **Requirement:** docs/backend/03 §5, docs/backend/09 §4 (Sessions)

## Decision

Sessions stay **server-side and opaque**, with the following properties:

| Property | Value | Where |
| --- | --- | --- |
| Cookie name | `jap_session` (configurable) | `SESSION_COOKIE_NAME` |
| Cookie value | 256-bit CSPRNG random, base64url, carries no user data | `lib/session.ts` `mintSessionId()` |
| `HttpOnly` | always | `buildSessionCookie()` |
| `Secure` | `SESSION_SECURE`; **mandatory in production** | `config/env.ts` production gate |
| `SameSite` | `Lax` by default, configurable to `Strict`/`None` | `SESSION_SAMESITE` |
| `Path` | `/` | — |
| `Max-Age` | equals the absolute TTL | — |
| Absolute expiry | 8 hours (`SESSION_TTL_HOURS`) | never extended by use |
| Idle expiry | 30 minutes (`SESSION_IDLE_MINUTES`, 0 disables) | refreshed on each request |
| Revocation | server-side; sign-out deletes the record, so the cookie is instantly worthless | `deleteSession()` |
| Per-account revocation | `revokeSessionsForUser()` | for future role/credential changes |
| Fixation resistance | any session id the caller already presents is **destroyed** at authentication and a fresh id minted | `rotateOnAuthentication()` |

The cookie is a *bearer reference*, never the authority. Every request
re-validates against the server-side record, so expiry and revocation are
immediate rather than eventual.

### Why these numbers

- **8-hour absolute** matches a clinical shift: a doctor should not have to
  re-authenticate mid-shift, and a session should not outlive the shift it was
  created for.
- **30-minute idle** is the common ceiling for shared clinical workstations: a
  ward terminal left unattended must not stay authenticated. It is short enough
  to matter and long enough not to interrupt a consultation.

Both are configuration, so a deployment can tighten them without a code change.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Signed/encrypted stateless cookie (JWT-style)** | Cannot be revoked before expiry. Sign-out would be cosmetic, which is unacceptable for a shared clinical terminal, and doc 09 §4 explicitly requires server-side revocation. |
| **Signed cookie over the opaque id** | Adds no security here: the id is already unguessable and validated against a server record, so a forged signature buys nothing an attacker does not already lack. `SESSION_SECRET` is retained for the rate limiter's target HMAC and for future signed artifacts. |
| **Redis-backed session store** | Phase 4 forbids speculative infrastructure. The current deployment is a single API process. See Consequences. |
| **`SameSite=Strict` by default** | Would break the top-level navigation flows the frontend uses (landing → login → dashboard) with no CSRF benefit that `Lax` does not already give for the state-changing POSTs. Left configurable. |
| **No idle timeout** | Rejected: doc 09 §4 requires "idle + absolute expiry". |

## Consequences

- The session store is **in process memory**. Restarting the API signs everyone
  out, and running more than one API instance requires sticky sessions.
  Accepted for now because the deployment target is a single instance
  (see 0005). Moving the store to PostgreSQL is a change confined to
  `lib/session.ts`; the route layer calls the same functions.
- `SESSION_SECURE=true` requires HTTPS end-to-end. The production configuration
  gate refuses to boot without it, which means a misconfigured TLS terminator
  fails loudly at deploy time rather than silently issuing cookies over plain
  HTTP.
- `SameSite=Lax` plus a cookie-only session means a cross-site POST cannot
  carry the session; no separate CSRF token is required for the current API
  shape. If a future endpoint needs `SameSite=None` (embedded contexts), a CSRF
  token becomes mandatory and needs its own record.

## Evidence

- Implementation: `backend/src/lib/session.ts`, `backend/src/config/env.ts`
- Tests: `backend/tests/security.test.ts` (cookie attributes, absolute expiry,
  idle expiry, revocation, replay rejection, fixation resistance),
  `backend/tests/config.test.ts` (production cookie requirements)
