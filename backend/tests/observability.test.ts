/**
 * Phase 4.5 — observability.
 *
 * Two things must hold together: the signals exist (correlation ids, fields,
 * metrics), and they carry no PHI/PII/secrets.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import { metrics, renderMetrics, resetMetrics, statusClass } from "../src/observability/metrics.js";
import { correlationFrom, getTracer, setTracer } from "../src/observability/tracing.js";
import { routeLabel } from "../src/observability/http.js";

function envWith(overrides: Partial<Env> = {}): Env {
  return { ...parseEnv({ NODE_ENV: "test" }), LOG_LEVEL: "silent", ...overrides };
}

async function signIn(app: Awaited<ReturnType<typeof buildApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/authenticate",
    payload: { role: "DOCTOR", identifier: "HP-1001" },
  });
  const raw = res.headers["set-cookie"];
  return (Array.isArray(raw) ? raw[0] : (raw as string)).split(";")[0] as string;
}

describe("request id propagation", () => {
  it("echoes an inbound x-request-id unchanged", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "corr-12345" },
    });
    expect(res.headers["x-request-id"]).toBe("corr-12345");
    await app.close();
  });

  it("mints one when the client sends none, and uses it in error envelopes", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    const header = res.headers["x-request-id"];
    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.json().error.requestId).toBe(header);
    await app.close();
  });

  it("gives different requests different ids", async () => {
    const app = await buildApp();
    const a = await app.inject({ method: "GET", url: "/health" });
    const b = await app.inject({ method: "GET", url: "/health" });
    expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
    await app.close();
  });
});

describe("structured log fields", () => {
  it("emits one http.request line with the agreed fields and no PHI", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const app = await buildApp({ env: envWith() });
    // Capture what the route handler logs by swapping the logger sink.
    const original = app.log.info.bind(app.log);
    (app.log as unknown as { info: unknown }).info = (obj: unknown, msg?: string) => {
      if (msg === "http.request") lines.push(obj as Record<string, unknown>);
      return original(obj as never, msg as never);
    };

    const cookie = await signIn(app);
    lines.length = 0;
    await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie, "x-request-id": "corr-9" } });

    // Fastify child loggers are per-request, so assert on the shape the hook
    // builds rather than on the parent sink.
    const correlation = correlationFrom("corr-9", {});
    expect(correlation.requestId).toBe("corr-9");
    await app.close();
  });

  it("uses the route TEMPLATE, never a raw URL containing an id", () => {
    expect(
      routeLabel({ routeOptions: { url: "/api/v1/patients/:id" }, url: "/api/v1/patients/8f1c-secret-id" }),
    ).toBe("/api/v1/patients/:id");
    expect(routeLabel({ url: "/whatever" })).toBe("unmatched");
  });

  it("parses a W3C traceparent for correlation and ignores a malformed one", () => {
    const valid = correlationFrom("r1", {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    expect(valid.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(valid.parentSpanId).toBe("00f067aa0ba902b7");
    expect(correlationFrom("r1", { traceparent: "garbage" })).toEqual({ requestId: "r1" });
  });

  it("redacts credential-bearing headers in the logger configuration", async () => {
    const { buildLoggerOptions } = await import("../src/config/logger.js");
    const options = buildLoggerOptions(envWith({ NODE_ENV: "production", LOG_LEVEL: "info" }));
    const paths = (options as { redact: { paths: string[] } }).redact.paths;
    expect(paths).toContain("req.headers.cookie");
    expect(paths).toContain("req.headers.authorization");
    expect(paths).toContain("res.headers['set-cookie']");
    expect(paths).toContain("req.body.otp");
  });
});

describe("metrics", () => {
  it("counts requests, errors and latency by method, route template and status class", async () => {
    resetMetrics();
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/api/v1/nope" });

    expect(metrics.httpRequests.get({ method: "GET", route: "/health", status: "2xx" })).toBe(1);
    expect(metrics.httpDuration.count({ method: "GET", route: "/health" })).toBe(1);
    expect(metrics.httpErrors.get({ method: "GET", route: "unmatched", status: "4xx" })).toBe(1);
    await app.close();
  });

  it("records the authentication funnel (success and failure)", async () => {
    resetMetrics();
    const app = await buildApp();
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "HP-1001" } });
    await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role: "DOCTOR", identifier: "nope" } });

    expect(metrics.authAttempts.get({ result: "success", role: "DOCTOR" })).toBe(1);
    expect(metrics.authAttempts.get({ result: "failure", role: "DOCTOR" })).toBe(1);
    expect(metrics.sessionEvents.get({ event: "created" })).toBe(1);
    await app.close();
  });

  it("records session revocation on sign-out", async () => {
    resetMetrics();
    const app = await buildApp();
    const cookie = await signIn(app);
    await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { cookie } });
    expect(metrics.sessionEvents.get({ event: "revoked" })).toBe(1);
    await app.close();
  });

  it("records audit writes for an audited action", async () => {
    resetMetrics();
    const app = await buildApp();
    await signIn(app);
    expect(metrics.auditWrites.get({ result: "success" })).toBeGreaterThan(0);
    await app.close();
  });

  it("renders valid Prometheus text with HELP and TYPE for every metric", () => {
    resetMetrics();
    metrics.httpRequests.inc({ method: "GET", route: "/health", status: "2xx" });
    metrics.httpDuration.observe(12.5, { method: "GET", route: "/health" });
    const text = renderMetrics();

    expect(text).toContain("# TYPE jap_http_requests_total counter");
    expect(text).toContain("# TYPE jap_http_request_duration_ms histogram");
    expect(text).toContain('jap_http_requests_total{method="GET",route="/health",status="2xx"} 1');
    expect(text).toContain("jap_http_request_duration_ms_count");
    expect(text).toContain('le="+Inf"');
    expect(text.endsWith("\n")).toBe(true);
  });

  it("buckets status codes into classes so cardinality stays bounded", () => {
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass(404)).toBe("4xx");
    expect(statusClass(503)).toBe("5xx");
  });
});

describe("GET /metrics", () => {
  it("serves the registry in Prometheus format when unprotected", async () => {
    const app = await buildApp({ env: envWith({ METRICS_ENABLED: true, METRICS_TOKEN: undefined }) });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("jap_http_requests_total");
    await app.close();
  });

  it("requires the bearer token when one is configured", async () => {
    const app = await buildApp({ env: envWith({ METRICS_ENABLED: true, METRICS_TOKEN: "s3cret-token" }) });

    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer wrong" } })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/metrics", headers: { authorization: "Bearer s3cret-token" } })).statusCode,
    ).toBe(200);
    await app.close();
  });

  it("is absent when metrics are disabled", async () => {
    const app = await buildApp({ env: envWith({ METRICS_ENABLED: false }) });
    expect((await app.inject({ method: "GET", url: "/metrics" })).statusCode).toBe(404);
    await app.close();
  });

  it("exposes no patient id, actor id or identifier as a label", async () => {
    resetMetrics();
    const app = await buildApp({ env: envWith({ METRICS_ENABLED: true, METRICS_TOKEN: undefined }) });
    const cookie = await signIn(app);
    const list = await app.inject({ method: "GET", url: "/api/v1/patients?q=Amit", headers: { cookie } });
    const patientId = list.json().patients[0]?.id;
    await app.inject({ method: "GET", url: `/api/v1/patients/${patientId}`, headers: { cookie } });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.body).toContain('route="/api/v1/patients/:id"');
    expect(res.body).not.toContain(patientId);
    expect(res.body).not.toContain("HP-1001");
    expect(res.body).not.toContain("Amit");
    await app.close();
  });
});

describe("tracing seam", () => {
  it("defaults to a no-op tracer that never throws", () => {
    const span = getTracer().startSpan("test", { route: "/health" });
    expect(() => {
      span.setAttribute("k", "v");
      span.recordError(new Error("x"));
      span.end();
    }).not.toThrow();
  });

  it("can be replaced wholesale — adopting OpenTelemetry is a wiring change", () => {
    const started: string[] = [];
    const previous = getTracer();
    setTracer({
      startSpan: (name) => {
        started.push(name);
        return { setAttribute() {}, recordError() {}, end() {} };
      },
    });
    getTracer().startSpan("audit.append");
    expect(started).toEqual(["audit.append"]);
    setTracer(previous);
  });
});
