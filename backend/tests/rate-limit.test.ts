/**
 * Phase 4.3 — rate limiting and abuse protection.
 *
 * Covers the policy abstraction directly (dimensions, windows, Retry-After)
 * and its application to the authentication endpoint through the real app.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import {
  buildPolicies,
  consume,
  peek,
  recordFailure,
  resetRateLimits,
  targetKey,
  type RateLimitPolicy,
} from "../src/middleware/rate-limit.js";
import { metrics } from "../src/observability/metrics.js";

function envWith(overrides: Partial<Env> = {}): Env {
  return { ...parseEnv({ NODE_ENV: "test" }), LOG_LEVEL: "silent", ...overrides };
}

const policy: RateLimitPolicy = {
  name: "test_policy",
  limits: {
    ip: { max: 3, windowSeconds: 60 },
    account: { max: 2, windowSeconds: 30 },
    target: { max: 2, windowSeconds: 900 },
  },
};

describe("rate-limit policy abstraction", () => {
  it("allows up to the limit, then rejects", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i += 1) {
      expect(consume({ policy, ip: "203.0.113.5" }).allowed).toBe(true);
    }
    expect(consume({ policy, ip: "203.0.113.5" }).allowed).toBe(false);
  });

  it("reports a positive Retry-After bounded by the window", () => {
    resetRateLimits();
    for (let i = 0; i < 4; i += 1) consume({ policy, ip: "203.0.113.5" });
    const verdict = consume({ policy, ip: "203.0.113.5" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps independent clients independent", () => {
    resetRateLimits();
    for (let i = 0; i < 4; i += 1) consume({ policy, ip: "203.0.113.5" });
    expect(consume({ policy, ip: "203.0.113.5" }).allowed).toBe(false);
    expect(consume({ policy, ip: "198.51.100.9" }).allowed).toBe(true);
  });

  it("limits per authenticated account independently of the IP", () => {
    resetRateLimits();
    expect(consume({ policy, accountId: "u-1", ip: "203.0.113.5" }).allowed).toBe(true);
    expect(consume({ policy, accountId: "u-1", ip: "198.51.100.9" }).allowed).toBe(true);
    // Third attempt from a third network still hits the per-account limit.
    const verdict = consume({ policy, accountId: "u-1", ip: "192.0.2.7" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.dimension).toBe("account");
  });

  it("limits per verification target independently of the account", () => {
    resetRateLimits();
    const target = "hashed-target";
    consume({ policy, targetHash: target, accountId: "u-1" });
    consume({ policy, targetHash: target, accountId: "u-2" });
    const verdict = consume({ policy, targetHash: target, accountId: "u-3" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.dimension).toBe("target");
  });

  it("resets when the window rolls over", () => {
    resetRateLimits();
    const t0 = Date.now();
    for (let i = 0; i < 4; i += 1) consume({ policy, ip: "203.0.113.5", now: t0 });
    expect(consume({ policy, ip: "203.0.113.5", now: t0 }).allowed).toBe(false);
    expect(consume({ policy, ip: "203.0.113.5", now: t0 + 61_000 }).allowed).toBe(true);
  });

  it("peek does not consume budget; recordFailure does", () => {
    resetRateLimits();
    for (let i = 0; i < 10; i += 1) expect(peek({ policy, targetHash: "t" }).allowed).toBe(true);
    recordFailure(policy, "target", "t");
    recordFailure(policy, "target", "t");
    expect(peek({ policy, targetHash: "t" }).allowed).toBe(false);
  });

  it("hashes the verification target — the limiter never holds plaintext", () => {
    const env = envWith();
    const hash = targetKey(env, "12-3456-7891-2345");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
    expect(hash).not.toContain("3456");
    // Display formatting must not create a separate bucket.
    expect(targetKey(env, "12 3456 7891 2345")).toBe(hash);
    expect(targetKey(env, "1234567891 2345")).toBe(hash);
  });

  it("derives policies from configuration rather than hard-coded constants", () => {
    const policies = buildPolicies(envWith({ RATE_LIMIT_AUTH_IP_MAX: 7, RATE_LIMIT_AUTH_TARGET_MAX: 2 }));
    expect(policies.authentication.limits.ip?.max).toBe(7);
    expect(policies.authentication.limits.target?.max).toBe(2);
  });
});

describe("authentication endpoint limits", () => {
  it("returns 429 with Retry-After and a stable code once the per-IP budget is gone", async () => {
    const app = await buildApp({ env: envWith({ RATE_LIMIT_AUTH_IP_MAX: 3 }) });

    for (let i = 0; i < 3; i += 1) {
      const ok = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role: "DOCTOR", identifier: "HP-1001" },
      });
      expect(ok.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("rate_limited");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    await app.close();
  });

  it("leaks nothing about which dimension tripped or whether the identifier exists", async () => {
    const app = await buildApp({ env: envWith({ RATE_LIMIT_AUTH_IP_MAX: 1 }) });
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } });
    const limited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.body).not.toContain("HP-1001");
    expect(limited.body).not.toMatch(/ip|account|target|dimension/i);
    expect(Object.keys(limited.json().error).sort()).toEqual(["code", "message", "requestId"]);
    await app.close();
  });

  it("locks a repeatedly-failing identifier without locking a successful one", async () => {
    const app = await buildApp({
      env: envWith({ RATE_LIMIT_AUTH_IP_MAX: 100, RATE_LIMIT_AUTH_TARGET_MAX: 2 }),
    });

    for (let i = 0; i < 2; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role: "DOCTOR", identifier: "wrong-id" },
      });
      expect(res.json().status).toBe("identifier-not-found");
    }

    const locked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "wrong-id" },
    });
    expect(locked.statusCode).toBe(429);

    // A different, valid identifier is unaffected: this is a target lockout,
    // not a global one.
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it("does not lock a user who signs in successfully many times", async () => {
    const app = await buildApp({
      env: envWith({ RATE_LIMIT_AUTH_IP_MAX: 100, RATE_LIMIT_AUTH_TARGET_MAX: 2 }),
    });
    for (let i = 0; i < 6; i += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role: "DOCTOR", identifier: "HP-1001" },
      });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });

  it("counts rejections as a metric with a policy label", async () => {
    const app = await buildApp({ env: envWith({ RATE_LIMIT_AUTH_IP_MAX: 1 }) });
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } });
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } });
    expect(metrics.rateLimited.get({ policy: "authentication", dimension: "ip" })).toBe(1);
    await app.close();
  });

  it("still applies the global per-IP baseline to ordinary endpoints", async () => {
    const app = await buildApp({ env: envWith({ RATE_LIMIT_MAX: 2, RATE_LIMIT_WINDOW: "1 minute" }) });
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/health" });
    const limited = await app.inject({ method: "GET", url: "/health" });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("rate_limited");
    expect(limited.headers["retry-after"]).toBeDefined();
    await app.close();
  });
});
