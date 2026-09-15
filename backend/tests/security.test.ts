/**
 * Phase 4.4 — security baseline regression tests.
 *
 * These assert the behaviours doc 09 §4 requires, against the real app:
 * cookie attributes, session expiry (absolute + idle), revocation and replay,
 * fixation resistance, security headers, and production error sanitization.
 */
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import {
  buildSessionCookie,
  clearAllSessions,
  createSession,
  getSession,
  readSession,
  revokeSessionsForUser,
  rotateOnAuthentication,
  sessionStore,
} from "../src/lib/session.js";

/**
 * A test env. `LOG_LEVEL: "silent"` keeps output readable even when a case
 * overrides NODE_ENV to "production" to exercise production *behaviour*.
 */
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
  const header = Array.isArray(raw) ? raw[0] : (raw as string);
  return { res, header, cookie: header.split(";")[0] as string };
}

describe("session cookie attributes", () => {
  it("is HttpOnly, Path=/, SameSite and Max-Age bounded", async () => {
    const app = await buildApp();
    const { header } = await signIn(app);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=Lax");
    expect(header).toMatch(/Max-Age=\d+/);
    await app.close();
  });

  it("omits Secure in local development and sets it when SESSION_SECURE=true", () => {
    expect(buildSessionCookie(envWith({ SESSION_SECURE: false }), "abc")).not.toContain("Secure");
    const secure = buildSessionCookie(envWith({ SESSION_SECURE: true }), "abc");
    expect(secure).toContain("Secure");
    expect(secure).toContain("HttpOnly");
  });

  it("honours SESSION_SAMESITE", () => {
    expect(buildSessionCookie(envWith({ SESSION_SAMESITE: "Strict" }), "abc")).toContain(
      "SameSite=Strict",
    );
  });

  it("carries an opaque, high-entropy id — no user data, not a guessable uuid v4 counter", async () => {
    const app = await buildApp();
    const { cookie } = await signIn(app);
    const value = decodeURIComponent(cookie.split("=").slice(1).join("="));
    expect(value.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(value).not.toContain("HP-1001");
    expect(value).not.toContain("aroha");
    await app.close();
  });

  it("clears the cookie with the same attributes on sign-out", async () => {
    const app = await buildApp();
    const { cookie } = await signIn(app);
    const out = await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { cookie } });
    const raw = out.headers["set-cookie"];
    const header = Array.isArray(raw) ? raw[0] : (raw as string);
    expect(header).toContain("Max-Age=0");
    expect(header).toContain("HttpOnly");
    await app.close();
  });
});

describe("session expiry", () => {
  it("rejects a session past its absolute expiry", () => {
    clearAllSessions();
    const env = envWith({ SESSION_TTL_HOURS: 8, SESSION_IDLE_MINUTES: 0 });
    const id = createSession(env, { id: "u-1", role: "DOCTOR", name: "Doc" });

    const session = sessionStore.get(id)!;
    session.expiresAt = new Date(Date.now() - 1_000);

    expect(readSession(id, env)).toEqual({ rejection: "expired" });
    expect(sessionStore.has(id)).toBe(false);
  });

  it("rejects a session idle for longer than SESSION_IDLE_MINUTES", () => {
    clearAllSessions();
    const env = envWith({ SESSION_IDLE_MINUTES: 30 });
    const id = createSession(env, { id: "u-1", role: "DOCTOR", name: "Doc" });

    sessionStore.get(id)!.lastSeenAt = new Date(Date.now() - 31 * 60 * 1000);

    expect(readSession(id, env)).toEqual({ rejection: "idle" });
    expect(sessionStore.has(id)).toBe(false);
  });

  it("refreshes the idle clock on use but never extends the absolute expiry", () => {
    clearAllSessions();
    const env = envWith({ SESSION_IDLE_MINUTES: 30 });
    const id = createSession(env, { id: "u-1", role: "DOCTOR", name: "Doc" });
    const absolute = sessionStore.get(id)!.expiresAt.getTime();

    sessionStore.get(id)!.lastSeenAt = new Date(Date.now() - 10 * 60 * 1000);
    expect(getSession(id, env)).not.toBeNull();

    const after = sessionStore.get(id)!;
    expect(after.expiresAt.getTime()).toBe(absolute);
    expect(Date.now() - after.lastSeenAt.getTime()).toBeLessThan(1_000);
  });

  it("reports 'unknown' for an id that was never issued", () => {
    clearAllSessions();
    expect(readSession("never-issued", envWith())).toEqual({ rejection: "unknown" });
  });
});

describe("session revocation and replay", () => {
  it("rejects a replayed cookie after sign-out", async () => {
    const app = await buildApp();
    const { cookie } = await signIn(app);

    expect((await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie } })).statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/api/v1/auth/sign-out", headers: { cookie } });

    const replay = await app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { cookie } });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe("unauthenticated");
    await app.close();
  });

  it("revokes every session belonging to one account", () => {
    clearAllSessions();
    const env = envWith();
    createSession(env, { id: "u-1", role: "DOCTOR", name: "Doc" });
    createSession(env, { id: "u-1", role: "DOCTOR", name: "Doc" });
    createSession(env, { id: "u-2", role: "DOCTOR", name: "Other" });

    expect(revokeSessionsForUser("u-1")).toBe(2);
    expect(sessionStore.size).toBe(1);
  });

  it("rejects a forged session id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: "jap_session=forged-value-that-was-never-issued" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("session fixation resistance", () => {
  it("mints a new id and destroys the caller's pre-existing session on authentication", () => {
    clearAllSessions();
    const env = envWith();
    const planted = createSession(env, { id: "attacker", role: "DOCTOR", name: "A" });

    const request = { headers: { cookie: `jap_session=${planted}` } } as never;
    const issued = rotateOnAuthentication(request, env, { id: "u-1", role: "DOCTOR", name: "Victim" });

    expect(issued).not.toBe(planted);
    expect(sessionStore.has(planted)).toBe(false);
    expect(sessionStore.get(issued)!.user.id).toBe("u-1");
  });

  it("issues a different cookie on every sign-in through the API", async () => {
    const app = await buildApp();
    const first = await signIn(app);
    const second = await signIn(app);
    expect(first.cookie).not.toBe(second.cookie);
    await app.close();
  });

  it("does not adopt a client-supplied session id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      headers: { cookie: "jap_session=attacker-chosen-id" },
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    const raw = res.headers["set-cookie"];
    const header = Array.isArray(raw) ? raw[0] : (raw as string);
    expect(header).not.toContain("attacker-chosen-id");
    await app.close();
  });
});

describe("security headers", () => {
  it("sets the standard hardening headers", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    await app.close();
  });

  it("omits HSTS outside production and emits it when enabled", async () => {
    const plain = await buildApp();
    expect((await plain.inject({ method: "GET", url: "/health" })).headers["strict-transport-security"]).toBeUndefined();
    await plain.close();

    const hardened = await buildApp({ env: envWith({ HSTS_ENABLED: true, HSTS_MAX_AGE_SECONDS: 15552000 }) });
    const res = await hardened.inject({ method: "GET", url: "/health" });
    expect(res.headers["strict-transport-security"]).toContain("max-age=15552000");
    await hardened.close();
  });

  it("applies a real CSP once the docs UI is disabled", async () => {
    const app = await buildApp({ env: envWith({ DOCS_ENABLED: false }) });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    await app.close();
  });

  it("does not serve the Swagger UI when docs are disabled", async () => {
    const app = await buildApp({ env: envWith({ DOCS_ENABLED: false }) });
    expect((await app.inject({ method: "GET", url: "/docs" })).statusCode).toBe(404);
    await app.close();
  });
});

describe("production error sanitization", () => {
  /** A route that throws the kind of error a driver would. */
  async function appThatThrows(env: Env) {
    const app = await buildApp({ env });
    app.get("/boom", async () => {
      throw new Error('relation "patients" does not exist at character 42');
    });
    const clientError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      statusCode: 400,
    });
    app.get("/client-boom", async () => {
      throw clientError;
    });
    await app.ready();
    return app;
  }

  it("never leaks an internal 500 message or a stack trace", async () => {
    const app = await appThatThrows(envWith());
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: {
        code: "internal_error",
        message: "Something went wrong on our side.",
        requestId: expect.any(String),
      },
    });
    expect(res.body).not.toContain("relation");
    expect(res.body).not.toContain("at character");
    expect(res.body).not.toContain("stack");
    await app.close();
  });

  it("replaces 4xx driver messages with a generic one in production", async () => {
    const app = await appThatThrows(envWith({ NODE_ENV: "production" }));
    const res = await app.inject({ method: "GET", url: "/client-boom" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("The request could not be processed.");
    expect(res.body).not.toContain("unique constraint");
    await app.close();
  });

  it("omits validation details in production but keeps them in development", async () => {
    const dev = await buildApp({ env: envWith({ NODE_ENV: "development" }) });
    const devRes = await dev.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: {} });
    expect(devRes.statusCode).toBe(400);
    expect(devRes.json().error.details).toBeDefined();
    await dev.close();

    const prod = await buildApp({ env: envWith({ NODE_ENV: "production" }) });
    const prodRes = await prod.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: {} });
    expect(prodRes.statusCode).toBe(400);
    expect(prodRes.json().error.details).toBeUndefined();
    await prod.close();
  });

  it("returns a stable envelope with a requestId for unknown routes", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: "not_found", requestId: expect.any(String) });
    await app.close();
  });
});

describe("credential and secret hygiene", () => {
  it("never echoes the submitted identifier back on a failed sign-in", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "not-a-real-identifier" },
    });
    expect(res.body).not.toContain("not-a-real-identifier");
    await app.close();
  });

  it("gives the same non-oracle outcome for an unknown id and a cross-role id", async () => {
    const app = await buildApp();
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "zz-0000" },
    });
    expect(unknown.json().status).toBe("identifier-not-found");
    expect(unknown.json().user).toBeUndefined();
    await app.close();
  });
});
