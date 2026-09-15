/**
 * Rate-limit policies — Phase 4.3.
 *
 * The global `@fastify/rate-limit` registration in `app.ts` is a per-IP
 * *baseline* against crude floods. It is not sufficient for the endpoints
 * doc 09 §4 calls out (auth, identity, confirm, resend), which need limits on
 * additional dimensions:
 *
 *   ip      — the network the request came from
 *   account — the authenticated principal (an attacker with a valid session
 *             must not be able to grind an endpoint from many IPs)
 *   target  — the *thing being attacked*: the identifier being authenticated
 *             or the ABHA being verified. Hashed, never stored in the clear.
 *
 * A policy may check several dimensions; the first one exhausted wins and
 * yields the *longest* remaining Retry-After of the exhausted dimensions.
 *
 * Implementation: in-process fixed-window counters. That is the honest scope
 * for a single-instance deployment and avoids introducing Redis, which the
 * Phase 4 constraints forbid without a proven requirement. The limitation is
 * documented (docs/decisions/0004-rate-limiting.md §Consequences): with more
 * than one API instance the effective limit multiplies by the instance count,
 * and moving to a shared counter store is the recorded follow-up.
 *
 * Responses are deliberately uninformative: HTTP 429, a stable `rate_limited`
 * code, a `Retry-After` header, and no indication of *which* dimension tripped
 * (that would be an enumeration oracle).
 */
import { createHmac } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { metrics } from "../observability/metrics.js";

export type RateLimitDimension = "ip" | "account" | "target";

export interface DimensionLimit {
  max: number;
  windowSeconds: number;
}

export interface RateLimitPolicy {
  /** Stable name — used as the counter namespace and the metric label. */
  name: string;
  limits: Partial<Record<RateLimitDimension, DimensionLimit>>;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the caller may retry (only when `allowed` is false). */
  retryAfterSeconds: number;
  /** Which dimension tripped — for logs/metrics only, never for the client. */
  dimension?: RateLimitDimension;
}

interface Window {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Window>();

/** Tests only — and a safety valve for a future admin tool. */
export function resetRateLimits(): void {
  counters.clear();
}

function hit(key: string, limit: DimensionLimit, now: number): { exceeded: boolean; retryAfter: number } {
  const window = counters.get(key);
  if (!window || window.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + limit.windowSeconds * 1000 });
    return { exceeded: false, retryAfter: 0 };
  }
  window.count += 1;
  if (window.count > limit.max) {
    return { exceeded: true, retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }
  return { exceeded: false, retryAfter: 0 };
}

/**
 * Hash a verification target (identifier / ABHA) before it becomes a counter
 * key. The rate limiter must never hold a plaintext identifier in memory or in
 * a log, so we key on an HMAC under the session secret (doc 09 §3 — masking
 * everywhere, no full identifiers in logs).
 */
export function targetKey(env: Env, target: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(target.trim().toLowerCase().replace(/[\s-]/g, ""))
    .digest("hex")
    .slice(0, 32);
}

export interface RateLimitInput {
  policy: RateLimitPolicy;
  ip?: string;
  accountId?: string;
  /** Already hashed via `targetKey`. */
  targetHash?: string;
  now?: number;
}

/**
 * Inspect the configured dimensions WITHOUT consuming budget.
 * Used where the counter should only advance on a failed attempt (see
 * `recordFailure`): a legitimate user typing their identifier correctly must
 * not be locked out by their own successful sign-ins.
 */
export function peek(input: RateLimitInput): RateLimitVerdict {
  const now = input.now ?? Date.now();
  const { policy } = input;
  const checks: Array<{ dimension: RateLimitDimension; value?: string; limit?: DimensionLimit }> = [
    { dimension: "ip", value: input.ip, limit: policy.limits.ip },
    { dimension: "account", value: input.accountId, limit: policy.limits.account },
    { dimension: "target", value: input.targetHash, limit: policy.limits.target },
  ];
  for (const check of checks) {
    if (!check.limit || !check.value) continue;
    const window = counters.get(`${policy.name}:${check.dimension}:${check.value}`);
    if (!window || window.resetAt <= now) continue;
    if (window.count >= check.limit.max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
        dimension: check.dimension,
      };
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Charge one unit to a single dimension — used after an attempt is known to
 * have failed, which is what a lockout policy should actually count.
 */
export function recordFailure(
  policy: RateLimitPolicy,
  dimension: RateLimitDimension,
  value: string,
  now = Date.now(),
): void {
  const limit = policy.limits[dimension];
  if (!limit) return;
  hit(`${policy.name}:${dimension}:${value}`, limit, now);
}

/** Consume one unit against every configured dimension. */
export function consume(input: RateLimitInput): RateLimitVerdict {
  const now = input.now ?? Date.now();
  const { policy } = input;

  const checks: Array<{ dimension: RateLimitDimension; value?: string; limit?: DimensionLimit }> = [
    { dimension: "ip", value: input.ip, limit: policy.limits.ip },
    { dimension: "account", value: input.accountId, limit: policy.limits.account },
    { dimension: "target", value: input.targetHash, limit: policy.limits.target },
  ];

  let worst: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0 };

  for (const check of checks) {
    if (!check.limit || !check.value) continue;
    const result = hit(`${policy.name}:${check.dimension}:${check.value}`, check.limit, now);
    if (result.exceeded && result.retryAfter > worst.retryAfterSeconds) {
      worst = { allowed: false, retryAfterSeconds: result.retryAfter, dimension: check.dimension };
    }
  }

  return worst;
}

/**
 * Apply a policy to a request. Returns `true` when the caller should stop
 * (a 429 has been sent), `false` when the handler may continue.
 */
export function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  input: Omit<RateLimitInput, "ip"> & { ip?: string; mode?: "consume" | "peek" },
): boolean {
  const resolved = { ...input, ip: input.ip ?? request.ip };
  const verdict = input.mode === "peek" ? peek(resolved) : consume(resolved);
  if (verdict.allowed) return false;

  metrics.rateLimited.inc({ policy: input.policy.name, dimension: verdict.dimension ?? "unknown" });
  // Log the dimension server-side; the client learns nothing beyond "slow down".
  request.log.warn(
    { requestId: request.id, policy: input.policy.name, dimension: verdict.dimension },
    "rate limit exceeded",
  );

  reply
    .status(429)
    .header("retry-after", String(verdict.retryAfterSeconds))
    .send({
      error: {
        code: "rate_limited",
        message: "Too many requests — please slow down and retry shortly.",
        requestId: request.id,
      },
    });
  return true;
}

/** Policies derived from configuration (values justified in decision 0004). */
export function buildPolicies(env: Env): {
  authentication: RateLimitPolicy;
  patientVerification: RateLimitPolicy;
  authenticatedWrite: RateLimitPolicy;
} {
  return {
    authentication: {
      name: "authentication",
      limits: {
        ip: { max: env.RATE_LIMIT_AUTH_IP_MAX, windowSeconds: env.RATE_LIMIT_AUTH_IP_WINDOW_SECONDS },
        target: {
          max: env.RATE_LIMIT_AUTH_TARGET_MAX,
          windowSeconds: env.RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS,
        },
      },
    },
    patientVerification: {
      name: "patient_verification",
      limits: {
        ip: { max: env.RATE_LIMIT_AUTH_IP_MAX, windowSeconds: env.RATE_LIMIT_AUTH_IP_WINDOW_SECONDS },
        account: {
          max: env.RATE_LIMIT_AUTH_TARGET_MAX,
          windowSeconds: env.RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS,
        },
        target: {
          max: env.RATE_LIMIT_AUTH_TARGET_MAX,
          windowSeconds: env.RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS,
        },
      },
    },
    authenticatedWrite: {
      name: "authenticated_write",
      limits: {
        account: {
          max: env.RATE_LIMIT_ACCOUNT_MAX,
          windowSeconds: env.RATE_LIMIT_ACCOUNT_WINDOW_SECONDS,
        },
      },
    },
  };
}
