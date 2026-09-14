/**
 * Phase 1 foundation tests.
 *
 * These run against an injected Fastify app (no socket) with NODE_ENV=test so
 * logging is silent. They lock in the cross-cutting contracts: health probe,
 * request IDs, error envelope (404/400/429/500), security headers, CORS
 * allowlist, rate limiting, and the OpenAPI document.
 */
import { z } from "zod";
import { buildApp, type App } from "../src/app.js";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns ok with service identity and timing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("jan-arogya-api");
    expect(typeof body.version).toBe("string");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
    await app.close();
  });
});

describe("request IDs", () => {
  it("echoes an inbound x-request-id header", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "trace-abc-123" },
    });
    expect(res.headers["x-request-id"]).toBe("trace-abc-123");
    await app.close();
  });

  it("generates a request id when none is supplied", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect((res.headers["x-request-id"] as string).length).toBeGreaterThan(0);
    await app.close();
  });
});

describe("error envelope", () => {
  it("returns not_found for unknown routes", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
    expect(typeof body.error.requestId).toBe("string");
    await app.close();
  });

  it("returns validation_failed for a bad body", async () => {
    const app = await buildApp();
    app.post(
      "/__test/echo",
      {
        schema: {
          body: z.object({ name: z.string().min(1), age: z.number().int().nonnegative() }),
        },
      },
      async (req) => req.body,
    );

    const bad = await app.inject({
      method: "POST",
      url: "/__test/echo",
      payload: { name: "", age: -3 },
    });
    expect(bad.statusCode).toBe(400);
    const body = bad.json();
    expect(body.error.code).toBe("validation_failed");
    expect(typeof body.error.requestId).toBe("string");
    // NODE_ENV=test exposes validation details.
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(body.error.details.length).toBeGreaterThan(0);

    const good = await app.inject({
      method: "POST",
      url: "/__test/echo",
      payload: { name: "Aroha", age: 34 },
    });
    expect(good.statusCode).toBe(200);
    expect(good.json()).toEqual({ name: "Aroha", age: 34 });
    await app.close();
  });

  it("returns an opaque internal_error for thrown exceptions", async () => {
    const app = await buildApp();
    app.get("/__test/boom", async () => {
      throw new Error("secret internal detail");
    });
    const res = await app.inject({ method: "GET", url: "/__test/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe("internal_error");
    // Must NOT leak the thrown message to the caller.
    expect(body.error.message).not.toContain("secret internal detail");
    await app.close();
  });
});

describe("security headers (helmet)", () => {
  it("sets baseline security headers", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-request-id"]).toBeDefined();
    await app.close();
  });
});

describe("CORS", () => {
  it("allows a configured origin", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5173" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });

  it("does not reflect a disallowed origin", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });
});

describe("rate limiting", () => {
  it("returns rate_limited after the configured maximum", async () => {
    process.env.RATE_LIMIT_MAX = "2";
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/health" });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(typeof body.error.requestId).toBe("string");
    await app.close();
    delete process.env.RATE_LIMIT_MAX;
  });
});

describe("OpenAPI documentation", () => {
  it("serves the OpenAPI JSON with the health route", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("Jan Arogya Portal API");
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/health"].get).toBeDefined();
    await app.close();
  });

  it("serves the Swagger UI", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/docs/" });
    // Swagger UI may serve 200 or a redirect to the canonical path.
    expect([200, 302]).toContain(res.statusCode);
    await app.close();
  });
});
