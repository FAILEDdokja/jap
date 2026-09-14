/**
 * Phase 3 authentication tests.
 *
 * Exercise the locked contract from docs/backend/03 §3–§4 and 06 §1:
 *   - role-scoped alias resolution
 *   - case/space/dash-insensitive matching
 *   - cross-role rejection without oracle
 *   - discriminated { status, user? } envelope (always 200)
 *   - cookie session lifecycle (authenticate → session → sign-out)
 *
 * Runs against an injected Fastify app (no socket, no DB) with NODE_ENV=test
 * so logging is silent and rate limiting defaults apply. The in-memory
 * session store is cleared between tests to keep them isolated.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { clearAllSessions } from "../src/lib/session.js";

function extractSessionCookie(res: { headers: Record<string, unknown> }): string | null {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const first = Array.isArray(raw) ? raw[0] : (raw as string);
  // `jap_session=xxx; Path=/; ...` → return `jap_session=xxx` for Cookie header
  const cookiePair = first.split(";")[0];
  return cookiePair ? cookiePair.trim() : null;
}

beforeEach(() => {
  clearAllSessions();
});

describe("POST /api/v1/auth/authenticate — locked contract", () => {
  it("authenticates a doctor by HPID and sets an HttpOnly session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("authenticated");
    expect(body.user).toMatchObject({ id: "u-aroha", role: "DOCTOR", name: "Dr. Aroha Deshpande" });

    const setCookie = res.headers["set-cookie"] as string | string[] | undefined;
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    expect(cookieStr).toContain("jap_session=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("SameSite=Lax");
    expect(cookieStr).toContain("Path=/");

    await app.close();
  });

  it("matches identifiers case/space/dash-insensitively", async () => {
    const app = await buildApp();
    const variants = ["hp1001", "hp 1001", "HP 1001", "hp-1001", " HP-1001 ", "hP-1001"];
    for (const identifier of variants) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role: "DOCTOR", identifier },
      });
      expect(res.json().status).toBe("authenticated");
    }
    await app.close();
  });

  it("round-trips ABHA number formatted vs bare and address for a patient", async () => {
    const app = await buildApp();
    for (const id of ["23-4567-8912-3401", "23456789123401", " 23 4567 8912 3401 ", "amit.kumar@abdm", "AMIT.KUMAR@ABDM"]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role: "PATIENT", identifier: id },
      });
      expect(res.json().status).toBe("authenticated");
      expect(res.json().user.name).toBe("Amit Kumar");
    }
    // Ensure the legacy mock's Ramesh patient still resolves distinctly
    const ramesh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "PATIENT", identifier: "12-3456-7891-2345" },
    });
    expect(ramesh.json().user.name).toBe("Ramesh Kulkarni");
    await app.close();
  });

  it("rejects cross-role identifiers as identifier-not-found (no oracle)", async () => {
    const app = await buildApp();
    // A valid doctor HPID typed into patient login must NOT authenticate — it's not a hint.
    const cross = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "PATIENT", identifier: "HP-1001" },
    });
    expect(cross.json()).toEqual({ status: "identifier-not-found" });

    const cross2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "23-4567-8912-3401" },
    });
    expect(cross2.json()).toEqual({ status: "identifier-not-found" });
    await app.close();
  });

  it("returns role-unavailable for unknown roles or empty registries", async () => {
    const app = await buildApp();
    for (const role of ["government", "GOVERNMENT", "hospital", "invalid-role", ""]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role, identifier: "anything" },
      });
      // Empty role string is caught by Zod validation (400), not role-unavailable.
      if (role === "") {
        expect(res.statusCode).toBe(400);
      } else {
        expect(res.json()).toEqual({ status: "role-unavailable" });
      }
    }
    await app.close();
  });

  it("returns identifier-not-found for unknown identifiers within a valid role", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-9999" },
    });
    expect(res.json()).toEqual({ status: "identifier-not-found" });
    await app.close();
  });

  it("validates request shape with 400 on missing fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_failed");
    await app.close();
  });

  it("accepts multiple aliases per account (email, username, mobile)", async () => {
    const app = await buildApp();
    const cases: Array<{ identifier: string; expectedName: string }> = [
      { identifier: "aroha.deshpande", expectedName: "Dr. Aroha Deshpande" },
      { identifier: "AROHA.DESHPANDE@NMC.EXAMPLE.IN", expectedName: "Dr. Aroha Deshpande" },
      { identifier: "9823011002", expectedName: "Dr. Aroha Deshpande" },
      { identifier: "98230 11002", expectedName: "Dr. Aroha Deshpande" },
      { identifier: "deepa.iyer@medplus.example.in", expectedName: "Deepa Iyer" },
      { identifier: "PHARM-4001", expectedName: "Deepa Iyer" },
      { identifier: "FAC-PH-2201", expectedName: "Jan Seva Medical Store" },
      { identifier: "janseva.store", expectedName: "Jan Seva Medical Store" },
    ];
    for (const c of cases) {
      const role = c.expectedName === "Deepa Iyer" || c.expectedName === "Jan Seva Medical Store" ? "PHARMACY" : "DOCTOR";
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/authenticate",
        payload: { role, identifier: c.identifier },
      });
      expect(res.json().user.name).toBe(c.expectedName);
    }
    await app.close();
  });
});

describe("GET /api/v1/auth/session + POST /sign-out — cookie boundary", () => {
  it("establishes and re-validates a session via cookie", async () => {
    const app = await buildApp();
    const auth = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    const cookie = extractSessionCookie(auth);
    expect(cookie).toBeTruthy();

    const session = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: cookie! },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user).toMatchObject({ id: "u-aroha", role: "DOCTOR" });

    // Alias /me must behave identically.
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { cookie: cookie! },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ id: "u-aroha" });

    await app.close();
  });

  it("returns 401 when no session cookie is present", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
    await app.close();
  });

  it("returns 401 for a tampered or unknown session id", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: "jap_session=not-a-real-uuid" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("revokes the session on sign-out and clears the cookie", async () => {
    const app = await buildApp();
    const auth = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "PHARMACY", identifier: "deepa.iyer@medplus.example.in" },
    });
    const cookie = extractSessionCookie(auth)!;

    const signOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/sign-out",
      headers: { cookie },
    });
    expect(signOut.statusCode).toBe(200);
    expect(signOut.json().status).toBe("signed-out");
    const cleared = signOut.headers["set-cookie"] as string;
    expect(Array.isArray(cleared) ? cleared[0] : cleared).toContain("Max-Age=0");

    // Session must no longer be valid.
    const after = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
    await app.close();
  });

  it("sign-out is idempotent without a cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/sign-out" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("signed-out");
    await app.close();
  });
});
