# 0004 — Rate limiting and abuse protection

- **Date:** 2026-09-15
- **Status:** Accepted
- **Owner:** Backend (engineering)
- **Requirement:** docs/backend/09 §4 (Rate limiting)

## Decision

Two layers:

1. **Global baseline** — the existing `@fastify/rate-limit` registration:
   300 requests / IP / minute across the whole API. Catches crude floods.
2. **Policy layer** (`middleware/rate-limit.ts`) — a reusable abstraction with
   three dimensions that sensitive endpoints combine as needed:

| Dimension | What it protects against |
| --- | --- |
| `ip` | a flood or a distributed guess from one network |
| `account` | an authenticated principal grinding an endpoint from many IPs |
| `target` | attacks against one *subject* — an identifier being authenticated, an ABHA being verified — regardless of who is attacking it |

### Configured limits and why

| Policy | Dimension | Limit | Rationale |
| --- | --- | --- | --- |
| `authentication` | ip | 20 / 5 min | A shared clinic NAT can legitimately produce a handful of sign-ins in five minutes (shift change, a ward terminal used by several staff). 20 leaves generous headroom while making a 1000-guess campaign take days. |
| `authentication` | target | 5 / 15 min | Per-identifier lockout. Five wrong attempts is the familiar banking/UIDAI-style threshold — enough for a genuine typo or a forgotten HPID format, low enough that guessing an identifier space is impractical. 15 minutes is long enough to be a real cost and short enough not to require a support call. |
| `patient_verification` | ip / account / target | as above | Verification is the ABDM-facing flow: an attacker enumerating ABHA numbers is attacking *patients*, so the target dimension is the important one. Applied when the adapter ships (Phase 5). |
| `authenticated_write` | account | 120 / min | Two writes per second sustained, per account. Far above any human clinical workflow, low enough to bound a compromised session or a runaway client. |

**The per-target budget is charged on failure only.** A clinician who signs in
correctly ten times in a morning is never locked out; only failed attempts
count toward the lockout. The per-IP budget is charged on every attempt, since
volume alone is the signal there.

### Response shape

HTTP **429**, a `Retry-After` header in seconds, and the stable envelope
`{ error: { code: "rate_limited", message, requestId } }`. The response does
**not** say which dimension tripped, does not echo the identifier, and is
identical whether or not the identifier exists — otherwise the limiter itself
becomes an enumeration oracle.

Verification targets are **HMAC-hashed** (`targetKey()`, keyed on
`SESSION_SECRET`) before becoming a counter key, so no plaintext identifier
ever sits in the limiter's memory or in a log line.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **Global IP limit only** | Useless against a per-account or per-target attack, and punishes shared NATs. Kept as a baseline, not as the answer. |
| **Redis / shared counter store** | Phase 4 forbids speculative infrastructure. Required only when there is more than one API instance — see Consequences. |
| **Sliding-window or token bucket** | Smoother, but fixed windows are simpler to reason about, and the burst a fixed window allows at a boundary (2× the limit) is immaterial at these thresholds. |
| **Exponential backoff lockout** | More punishing for typos with no real gain over a flat 5-per-15-minutes at this scale. |
| **Permanent lockout after N failures** | Creates a denial-of-service against a known clinician's identifier, and a support burden with no on-call to absorb it. |

## Consequences

- Counters are **in-process**. With N API instances the effective limit is N×
  the configured value, and a restart clears them. This is acceptable for the
  current single-instance target (0005) and is the documented trigger for
  introducing a shared counter store: **if the deployment topology becomes
  multi-instance, this decision must be revisited before that rollout.**
- Limits are configuration, not constants, so a deployment can tighten them
  without a release.
- Abuse *alerting* is specified in 0008 (`jap_rate_limited_total`), not here.

## Evidence

- Implementation: `backend/src/middleware/rate-limit.ts`,
  applied in `backend/src/modules/auth/routes.ts`
- Tests: `backend/tests/rate-limit.test.ts` — limit reached, Retry-After,
  independent clients, per-account limits, per-target lockout, successful users
  not locked out, no oracle in the response, metrics emitted, global baseline
