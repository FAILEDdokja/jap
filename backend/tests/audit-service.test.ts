/**
 * Phase 4.2 — audit service behaviour that does not need PostgreSQL:
 * the outage policy (fail-closed), the write timeout, provenance reduction,
 * sensitive-value screening, and the integrity verifier's tamper detection.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { parseEnv, type Env } from "../src/config/env.js";
import {
  AuditUnavailableError,
  configureAuditPolicy,
  getAuditStore,
  resetAuditStore,
  setAuditStore,
  verifyAuditIntegrity,
  writeAuditEvent,
} from "../src/modules/audit/service.js";
import { MemoryAuditStore, type AuditStore } from "../src/modules/audit/store.js";
import { verifyAuditChain } from "../src/modules/audit/verify.js";
import {
  deviceClassOf,
  hashEvent,
  truncateIp,
  SensitiveAuditValueError,
  assertNoSensitiveValues,
} from "../src/modules/audit/types.js";
import { metrics } from "../src/observability/metrics.js";

function envWith(overrides: Partial<Env> = {}): Env {
  return { ...parseEnv({ NODE_ENV: "test" }), LOG_LEVEL: "silent", ...overrides };
}

/** A store whose writes always fail — stands in for a database outage. */
const brokenStore: AuditStore = {
  kind: "memory",
  append: async () => {
    throw new Error("connection terminated unexpectedly");
  },
  list: async () => ({ events: [], total: 0, limit: 50, offset: 0 }),
  chain: async () => [],
  ping: async () => {
    throw new Error("down");
  },
};

const event = {
  action: "VIEW_RECORD",
  resourceType: "PATIENT",
  resourceId: "p-1",
  actor: { id: "u-1", name: "Doc", role: "DOCTOR", orgId: "org-1" },
};

beforeEach(() => {
  resetAuditStore();
  configureAuditPolicy(envWith());
});

describe("audit outage policy", () => {
  it("fails closed by default: the write rejects with a typed 503 error", async () => {
    configureAuditPolicy(envWith({ AUDIT_FAILURE_MODE: "closed" }));
    setAuditStore(brokenStore);

    await expect(writeAuditEvent(event)).rejects.toBeInstanceOf(AuditUnavailableError);
    const error = await writeAuditEvent(event).catch((e) => e as AuditUnavailableError);
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe("audit_unavailable");
    resetAuditStore();
  });

  it("counts a failed write as a metric in either mode", async () => {
    configureAuditPolicy(envWith({ AUDIT_FAILURE_MODE: "open" }));
    setAuditStore(brokenStore);
    await writeAuditEvent(event);
    expect(metrics.auditWrites.get({ result: "failure" })).toBe(1);
    resetAuditStore();
  });

  it("fail-open returns null instead of throwing (development only)", async () => {
    configureAuditPolicy(envWith({ AUDIT_FAILURE_MODE: "open" }));
    setAuditStore(brokenStore);
    await expect(writeAuditEvent(event)).resolves.toBeNull();
    resetAuditStore();
  });

  it("bounds the write so a wedged store cannot hang the clinical path", async () => {
    configureAuditPolicy(envWith({ AUDIT_WRITE_TIMEOUT_MS: 100 }));
    setAuditStore({
      ...brokenStore,
      append: () => new Promise(() => {}),
    });

    const started = Date.now();
    await expect(writeAuditEvent(event)).rejects.toBeInstanceOf(AuditUnavailableError);
    expect(Date.now() - started).toBeLessThan(2_000);
    resetAuditStore();
  });

  it("refuses the audited action end-to-end with 503 and a stable code", async () => {
    const app = await buildApp({ env: envWith() });
    setAuditStore(brokenStore);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("audit_unavailable");
    expect(res.body).not.toContain("connection terminated");
    resetAuditStore();
    await app.close();
  });
});

describe("append-only API surface", () => {
  it("the store interface exposes no mutator", () => {
    const store = getAuditStore() as unknown as Record<string, unknown>;
    expect(store.update).toBeUndefined();
    expect(store.delete).toBeUndefined();
    expect(store.remove).toBeUndefined();
  });

  it("exposes no audit write/update/delete HTTP route", async () => {
    const app = await buildApp();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await app.inject({ method, url: "/api/v1/audit" });
      expect(res.statusCode).toBe(404);
    }
    await app.close();
  });

  it("chains successive writes and keeps a monotonic sequence", async () => {
    await writeAuditEvent({ ...event, action: "LOGIN", resourceType: "SESSION" });
    await writeAuditEvent(event);
    await writeAuditEvent({ ...event, action: "CREATE_RECORD" });

    const report = await verifyAuditIntegrity();
    expect(report).toMatchObject({ ok: true, checked: 3, firstSequence: 1, lastSequence: 3 });
  });

  it("keeps the chain intact when writes are issued concurrently", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => writeAuditEvent({ ...event, resourceId: `p-${i}` })),
    );
    const chain = await getAuditStore().chain();
    expect(chain.map((e) => e.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(verifyAuditChain(chain).ok).toBe(true);
  });
});

describe("integrity verification detects tampering", () => {
  async function chainOfThree() {
    const store = new MemoryAuditStore();
    setAuditStore(store);
    await writeAuditEvent({ ...event, action: "LOGIN", resourceType: "SESSION" });
    await writeAuditEvent(event);
    await writeAuditEvent({ ...event, action: "CREATE_RECORD" });
    return store.chain();
  }

  it("passes a clean chain", async () => {
    expect(verifyAuditChain(await chainOfThree()).ok).toBe(true);
  });

  it("detects changed event data", async () => {
    const chain = await chainOfThree();
    chain[1]!.action = "ACCESS_ALLOWED";
    const report = verifyAuditChain(chain);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.kind)).toContain("hash_mismatch");
  });

  it("detects a broken previous-event linkage", async () => {
    const chain = await chainOfThree();
    chain[2]!.prevEventId = chain[0]!.id;
    const report = verifyAuditChain(chain);
    expect(report.issues.map((i) => i.kind)).toContain("broken_link");
  });

  it("detects a tampered prevHash even when the id still matches", async () => {
    const chain = await chainOfThree();
    chain[2]!.prevHash = "0".repeat(64);
    expect(verifyAuditChain(chain).ok).toBe(false);
  });

  it("detects a sequence gap", async () => {
    const chain = await chainOfThree();
    const report = verifyAuditChain([chain[0]!, chain[2]!]);
    expect(report.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["sequence_gap", "broken_link"]),
    );
  });

  it("detects duplicated and out-of-order sequences", async () => {
    const chain = await chainOfThree();
    expect(verifyAuditChain([chain[0]!, chain[1]!, chain[1]!]).issues.map((i) => i.kind)).toContain(
      "duplicate_sequence",
    );
    expect(verifyAuditChain([chain[2]!, chain[1]!]).issues.map((i) => i.kind)).toContain("out_of_order");
  });

  it("reports the offending event id so an incident can be scoped", async () => {
    const chain = await chainOfThree();
    chain[1]!.purpose = "RESEARCH";
    const report = verifyAuditChain(chain);
    expect(report.issues[0]!.eventId).toBe(chain[1]!.id);
  });

  it("re-hashing a modified event does NOT rescue the chain (the link still breaks)", async () => {
    const chain = await chainOfThree();
    chain[1]!.action = "ACCESS_ALLOWED";
    const { hash, ...draft } = chain[1]!;
    chain[1]!.hash = hashEvent(draft);

    const report = verifyAuditChain(chain);
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.kind)).toContain("broken_link");
  });
});

describe("integrity endpoint authorization", () => {
  it("requires a session", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/v1/audit/integrity" })).statusCode).toBe(401);
    await app.close();
  });

  it("is default-deny for a clinician and allowed for SUPER_ADMIN", async () => {
    const app = await buildApp();
    const signIn = async (role: string, identifier: string) => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/authenticate", payload: { role, identifier } });
      const raw = res.headers["set-cookie"];
      return (Array.isArray(raw) ? raw[0] : (raw as string)).split(";")[0] as string;
    };

    const doctor = await signIn("DOCTOR", "HP-1001");
    const denied = await app.inject({ method: "GET", url: "/api/v1/audit/integrity", headers: { cookie: doctor } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("forbidden");

    const admin = await signIn("SUPER_ADMIN", "SUPER-001");
    const allowed = await app.inject({ method: "GET", url: "/api/v1/audit/integrity", headers: { cookie: admin } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ ok: true, checked: expect.any(Number) });
    await app.close();
  });
});

describe("sensitive values never reach the audit store", () => {
  it("rejects a full ABHA number in either form", () => {
    expect(() => assertNoSensitiveValues({ resourceId: "12345678912345" })).toThrow(SensitiveAuditValueError);
    expect(() => assertNoSensitiveValues({ resourceId: "12-3456-7891-2345" })).toThrow(SensitiveAuditValueError);
  });

  it("rejects an ABHA address", () => {
    expect(() => assertNoSensitiveValues({ resourceId: "amit@abdm" })).toThrow(SensitiveAuditValueError);
  });

  it("rejects credential keywords", () => {
    for (const value of ["otp 123456", "password reset", "bearer eyJhbG", "session secret"]) {
      expect(() => assertNoSensitiveValues({ purpose: value })).toThrow(SensitiveAuditValueError);
    }
  });

  it("allows opaque uuids and ordinary action names", () => {
    expect(() =>
      assertNoSensitiveValues({
        resourceId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        action: "VIEW_RECORD",
        resourceType: "PATIENT",
        purpose: "TREATMENT",
      }),
    ).not.toThrow();
  });

  it("does not persist the session id when a user signs in", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
    });
    const raw = res.headers["set-cookie"];
    const sessionId = (Array.isArray(raw) ? raw[0] : (raw as string)).split(";")[0]!.split("=")[1]!;

    const chain = await getAuditStore().chain();
    const login = chain.find((e) => e.action === "LOGIN")!;
    expect(login.resourceId).toBeNull();
    expect(JSON.stringify(chain)).not.toContain(decodeURIComponent(sessionId));
    await app.close();
  });

  it("does not persist the identifier of a failed sign-in", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "not-a-real-identifier" },
    });
    const chain = await getAuditStore().chain();
    expect(chain.some((e) => e.action === "FAILED_LOGIN" && e.status === "blocked")).toBe(true);
    expect(JSON.stringify(chain)).not.toContain("not-a-real-identifier");
    await app.close();
  });
});

describe("provenance is reduced before storage", () => {
  it("truncates IPv4 to a /24 and IPv6 to a /48", () => {
    expect(truncateIp("203.0.113.57")).toBe("203.0.113.0/24");
    expect(truncateIp("2001:db8:1234:5678::1")).toBe("2001:db8:1234::/48");
    expect(truncateIp(undefined)).toBeNull();
    expect(truncateIp("not-an-ip")).toBeNull();
  });

  it("reduces the user agent to a coarse class", () => {
    expect(deviceClassOf("Mozilla/5.0 (iPhone)")).toBe("mobile");
    expect(deviceClassOf("curl/8.4.0")).toBe("automation");
    expect(deviceClassOf("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
    expect(deviceClassOf(undefined)).toBeNull();
  });

  it("stores only the reduced forms on a real audited request", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/authenticate",
      payload: { role: "DOCTOR", identifier: "HP-1001" },
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120" },
      remoteAddress: "203.0.113.57",
    });
    const [login] = await getAuditStore().chain();
    expect(login!.sourceIp).toBe("203.0.113.0/24");
    expect(login!.deviceClass).toBe("desktop");
    expect(login!.sourceIp).not.toBe("203.0.113.57");
    await app.close();
  });
});
