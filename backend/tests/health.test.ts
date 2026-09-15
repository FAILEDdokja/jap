/**
 * Phase 4.5 — liveness and readiness.
 *
 * The critical distinction: liveness must NOT depend on downstream services
 * (or an orchestrator restarts a healthy API whenever the database blips),
 * while readiness MUST, so a load balancer drains the instance instead.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import type { ReadinessCheck } from "../src/modules/health/routes.js";
import { metrics } from "../src/observability/metrics.js";

function envWith(overrides: Partial<Env> = {}): Env {
  return { ...parseEnv({ NODE_ENV: "test" }), LOG_LEVEL: "silent", ...overrides };
}

const okCheck: ReadinessCheck = { name: "database", required: true, probe: async () => {} };
const failingCheck: ReadinessCheck = {
  name: "database",
  required: true,
  probe: async () => {
    throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
  },
};

describe("GET /health — liveness", () => {
  it("returns service identity and uptime", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "ok",
      service: expect.any(String),
      version: expect.any(String),
      environment: "test",
      uptimeSeconds: expect.any(Number),
    });
    await app.close();
  });

  it("stays 200 while a required dependency is DOWN", async () => {
    const app = await buildApp({ readinessChecks: [failingCheck] });
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });

  it("needs no authentication", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    await app.close();
  });
});

describe("GET /health/ready — readiness", () => {
  it("is ready when every required check passes", async () => {
    const app = await buildApp({ readinessChecks: [okCheck] });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
    expect(res.json().checks).toEqual([
      { name: "database", status: "ok", durationMs: expect.any(Number) },
    ]);
    await app.close();
  });

  it("returns 503 not_ready when the database is unavailable", async () => {
    const app = await buildApp({ readinessChecks: [failingCheck] });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe("not_ready");
    expect(res.json().checks[0]).toMatchObject({ name: "database", status: "failed", detail: "unavailable" });
    await app.close();
  });

  it("never leaks the driver error, host or credentials in the response", async () => {
    const app = await buildApp({ readinessChecks: [failingCheck] });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.body).not.toContain("ECONNREFUSED");
    expect(res.body).not.toContain("10.0.0.5");
    expect(res.body).not.toContain("hunter2");
    await app.close();
  });

  it("counts a database readiness failure as a metric", async () => {
    const app = await buildApp({ readinessChecks: [failingCheck] });
    await app.inject({ method: "GET", url: "/health/ready" });
    expect(metrics.databaseFailures.get({ source: "readiness" })).toBe(1);
    await app.close();
  });

  it("stays ready when only an optional dependency is down", async () => {
    const app = await buildApp({
      readinessChecks: [
        okCheck,
        { name: "abdm", required: false, probe: async () => { throw new Error("sandbox down"); } },
      ],
    });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
    expect(res.json().checks.find((c: { name: string }) => c.name === "abdm").status).toBe("failed");
    await app.close();
  });

  it("does not hang on a wedged dependency", async () => {
    const app = await buildApp({
      readinessChecks: [
        { name: "database", required: true, probe: () => new Promise<void>(() => {}) },
      ],
    });
    const started = Date.now();
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    expect(Date.now() - started).toBeLessThan(5_000);
    await app.close();
  });

  it("is ready with no configured dependencies (memory audit store)", async () => {
    const app = await buildApp({ env: envWith({ AUDIT_STORE: "memory" }) });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks).toEqual([]);
    await app.close();
  });
});
