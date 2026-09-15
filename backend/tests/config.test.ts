/**
 * Phase 4.1 — production configuration hardening.
 *
 * The property under test: **production cannot silently fall back to a
 * development default.** Every unsafe value must stop the process at boot, and
 * development/test must keep their convenient defaults.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_PRODUCTION_SESSION_SECRET_LENGTH,
  UnsafeProductionConfigError,
  parseEnv,
  productionSafetyProblems,
} from "../src/config/env.js";

/** A configuration that IS safe for production — the baseline to perturb. */
const SAFE_PRODUCTION: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  SESSION_SECRET: "Yb7Qx2Lm9Rt4Wz8Kd3Vn6Hs1Pj5Cg0Fa2Ue",
  SESSION_SECURE: "true",
  SESSION_SAMESITE: "Lax",
  CORS_ORIGINS: "https://portal.example.in",
  CORS_CREDENTIALS: "true",
  DATABASE_URL: "postgresql://api:s3cret@db.internal.example.in:5432/jap",
  AUDIT_STORE: "postgres",
  AUDIT_FAILURE_MODE: "closed",
  DOCS_ENABLED: "false",
  METRICS_ENABLED: "true",
  METRICS_TOKEN: "a-real-metrics-token-value",
};

function production(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...SAFE_PRODUCTION, ...overrides };
}

function problemsFor(overrides: NodeJS.ProcessEnv): string[] {
  try {
    parseEnv(production(overrides));
    return [];
  } catch (error) {
    if (error instanceof UnsafeProductionConfigError) return error.problems;
    throw error;
  }
}

describe("development and test keep safe local defaults", () => {
  it("boots with no configuration at all outside production", () => {
    const env = parseEnv({ NODE_ENV: "test" });
    expect(env.NODE_ENV).toBe("test");
    expect(env.SESSION_SECURE).toBe(false);
    expect(env.AUDIT_STORE).toBe("memory");
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  it("serves docs and skips HSTS outside production", () => {
    const env = parseEnv({ NODE_ENV: "development" });
    expect(env.DOCS_ENABLED).toBe(true);
    expect(env.HSTS_ENABLED).toBe(false);
  });

  it("defaults docs off and HSTS on in production", () => {
    const env = parseEnv(production({ DOCS_ENABLED: undefined }));
    expect(env.DOCS_ENABLED).toBe(false);
    expect(env.HSTS_ENABLED).toBe(true);
  });
});

describe("a fully safe production configuration boots", () => {
  it("accepts the baseline", () => {
    const env = parseEnv(production());
    expect(env.NODE_ENV).toBe("production");
    expect(productionSafetyProblems(env)).toEqual([]);
  });
});

describe("unsafe production defaults are rejected", () => {
  it("rejects the development session secret", () => {
    const problems = problemsFor({
      SESSION_SECRET: "dev-only-change-me-32-chars-minimum-for-session-secret",
    });
    expect(problems).toContain("SESSION_SECRET is a known development default");
  });

  it("rejects a short session secret", () => {
    const problems = problemsFor({ SESSION_SECRET: "tooshort" });
    expect(problems).toContain(
      `SESSION_SECRET must be at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters in production`,
    );
  });

  it("rejects a long but low-entropy session secret", () => {
    const problems = problemsFor({ SESSION_SECRET: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(problems).toContain("SESSION_SECRET has too little variety to be a real secret");
  });

  it("rejects the local development database URL", () => {
    const problems = problemsFor({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/jap",
    });
    expect(problems).toContain("DATABASE_URL is the local development default");
  });

  it("rejects an in-memory audit store", () => {
    const problems = problemsFor({ AUDIT_STORE: "memory" });
    expect(problems).toContain(
      "AUDIT_STORE must be 'postgres' in production (audit must be persistent)",
    );
  });

  it("rejects a fail-open audit policy", () => {
    expect(problemsFor({ AUDIT_FAILURE_MODE: "open" })).toContain(
      "AUDIT_FAILURE_MODE must be 'closed' in production",
    );
  });

  it("rejects disabled rate limiting", () => {
    expect(problemsFor({ RATE_LIMIT_ENABLED: "false" })).toContain(
      "RATE_LIMIT_ENABLED must be true in production",
    );
  });

  it("rejects an unauthenticated metrics endpoint", () => {
    expect(problemsFor({ METRICS_TOKEN: undefined })).toContain(
      "METRICS_TOKEN is required when METRICS_ENABLED=true in production",
    );
  });

  it("rejects publicly exposed API docs", () => {
    expect(problemsFor({ DOCS_ENABLED: "true" })).toContain(
      "DOCS_ENABLED must be false in production (set it explicitly to expose /docs)",
    );
  });

  it("reports every problem at once rather than the first", () => {
    const problems = problemsFor({
      SESSION_SECRET: "dev",
      SESSION_SECURE: "false",
      CORS_ORIGINS: "*",
      AUDIT_STORE: "memory",
    });
    expect(problems.length).toBeGreaterThan(3);
  });

  it("throws a typed error, and the message never echoes the secret", () => {
    const secret = "dev-only-change-me-32-chars-minimum-for-session-secret";
    try {
      parseEnv(production({ SESSION_SECRET: secret }));
      throw new Error("should not boot");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeProductionConfigError);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe("production cookie requirements", () => {
  it("requires Secure cookies", () => {
    expect(problemsFor({ SESSION_SECURE: "false" })).toContain(
      "SESSION_SECURE must be true in production (HTTPS-only cookies)",
    );
  });

  it("requires Secure when SameSite=None", () => {
    const problems = problemsFor({ SESSION_SAMESITE: "None", SESSION_SECURE: "false" });
    expect(problems).toContain("SESSION_SAMESITE=None requires SESSION_SECURE=true");
  });

  it("allows SameSite=Strict and SameSite=None over HTTPS", () => {
    expect(problemsFor({ SESSION_SAMESITE: "Strict" })).toEqual([]);
    expect(problemsFor({ SESSION_SAMESITE: "None" })).toEqual([]);
  });
});

describe("CORS validation", () => {
  it("rejects the wildcard origin", () => {
    expect(problemsFor({ CORS_ORIGINS: "*" })).toContain(
      "CORS_ORIGINS must not contain the wildcard '*' in production",
    );
  });

  it("rejects a wildcard combined with credentials", () => {
    expect(problemsFor({ CORS_ORIGINS: "*", CORS_CREDENTIALS: "true" })).toContain(
      "CORS wildcard origin with credentials is forbidden",
    );
  });

  it("rejects an empty allowlist", () => {
    expect(problemsFor({ CORS_ORIGINS: "" })).toContain(
      "CORS_ORIGINS must list at least one explicit origin in production",
    );
  });

  it("rejects a loopback origin", () => {
    expect(problemsFor({ CORS_ORIGINS: "http://localhost:5173" })).toContain(
      "CORS origin 'http://localhost:5173' is a development loopback origin",
    );
  });

  it("rejects a plain-http origin", () => {
    expect(problemsFor({ CORS_ORIGINS: "http://portal.example.in" })).toContain(
      "CORS origin 'http://portal.example.in' must use https in production",
    );
  });

  it("rejects a non-origin value and a trailing slash", () => {
    expect(problemsFor({ CORS_ORIGINS: "portal.example.in" })).toContain(
      "CORS origin 'portal.example.in' is not an absolute http(s) origin",
    );
    expect(problemsFor({ CORS_ORIGINS: "https://portal.example.in/" })).toContain(
      "CORS origin 'https://portal.example.in/' must not have a trailing slash",
    );
  });

  it("accepts multiple explicit https origins", () => {
    expect(
      problemsFor({ CORS_ORIGINS: "https://portal.example.in, https://staff.example.in" }),
    ).toEqual([]);
  });
});
