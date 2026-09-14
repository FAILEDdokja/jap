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
import { REDACTED, redactUrl } from "../src/config/logger.js";
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

describe("Authentication boundary contract", () => {
  it("declares the statuses it actually returns (400 on authenticate, 401 on session/me)", async () => {
    const app = await buildApp();
    const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    const statuses = (path: string, op: string) =>
      Object.keys(spec.paths[path][op].responses).sort();

    // App outcomes are always 200 with a `status` union; only body validation is 400.
    expect(statuses("/api/v1/auth/authenticate", "post")).toEqual(["200", "400"]);
    expect(statuses("/api/v1/auth/session", "get")).toEqual(["200", "401"]);
    expect(statuses("/api/v1/auth/me", "get")).toEqual(["200", "401"]);
    await app.close();
  });

  it("returns the declared 401 envelope from /session when unauthenticated", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    // Declaring the schema makes Fastify serialize through it — assert nothing
    // the caller relies on was stripped.
    expect(body.error).toMatchObject({
      code: "unauthenticated",
      message: expect.any(String),
      requestId: expect.any(String),
    });
    await app.close();
  });
});

describe("Request-line PHI redaction", () => {
  // Logging is disabled under NODE_ENV=test, so the serializer cannot be
  // observed through an injected request — these pin the function it uses.
  it("masks person-identifying query values and keeps operational ones", () => {
    expect(redactUrl("/api/v1/patients?q=iqbal")).toBe(`/api/v1/patients?q=${REDACTED}`);
    expect(redactUrl("/api/v1/patients?limit=5&offset=0")).toBe("/api/v1/patients?limit=5&offset=0");
    expect(redactUrl("/api/v1/patients?q=amit&state=registered")).toBe(
      `/api/v1/patients?q=${REDACTED}&state=registered`,
    );
    expect(redactUrl("/api/v1/patients?status=provisional&orgId=org-nmc")).toBe(
      "/api/v1/patients?status=provisional&orgId=org-nmc",
    );
    expect(redactUrl("/health")).toBe("/health");
    expect(redactUrl("/api/v1/patients?")).toBe("/api/v1/patients?");
    // Key matching is case-insensitive; the caller's casing is preserved.
    expect(redactUrl("/api/v1/patients?Q=Amit%20Kumar")).toBe(`/api/v1/patients?Q=${REDACTED}`);
    expect(redactUrl("/api/v1/patients?identifier=23456789123401")).toBe(
      `/api/v1/patients?identifier=${REDACTED}`,
    );
  });

  it("masks a parameter nobody listed (the allowlist fails closed)", () => {
    // The obvious design — a list of sensitive keys — leaks the first
    // person-identifying parameter a future endpoint adds.
    expect(redactUrl("/api/v1/patients?patientName=Amit&limit=5")).toBe(
      `/api/v1/patients?patientName=${REDACTED}&limit=5`,
    );
    expect(redactUrl("/api/v1/patients?dob=1991-03-14")).toBe(`/api/v1/patients?dob=${REDACTED}`);
    expect(redactUrl("/api/v1/patients?newThing")).toBe(`/api/v1/patients?newThing=${REDACTED}`);
    // A malformed escape must not become a reason to log the value.
    expect(redactUrl("/api/v1/patients?q=%E0%A4%A")).toBe(`/api/v1/patients?q=${REDACTED}`);
  });

  it("leaves no search term or identifier value behind", () => {
    const secrets = ["iqbal", "Amit Kumar", "Amit+Kumar", "23456789123401", "amit.kumar@abdm"];
    const urls = [
      "/api/v1/patients?q=iqbal",
      "/api/v1/patients?q=Amit+Kumar&limit=10",
      "/api/v1/patients?search=amit.kumar%40abdm",
      "/api/v1/patients?abhaNumber=23456789123401&state=abha_linked",
    ];
    for (const url of urls) {
      const out = redactUrl(url);
      for (const secret of secrets) {
        expect(out, `${url} → ${out}`).not.toContain(secret);
      }
    }
  });

  it("does not echo the query string back in a 404", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/nope?q=Amit+Kumar" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe("Route GET /api/v1/nope not found.");
    await app.close();
  });
});
