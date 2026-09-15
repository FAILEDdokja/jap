/**
 * Environment configuration.
 *
 * Single entry point for configuration: every value the app reads is declared,
 * defaulted and validated here with Zod. The rest of the codebase uses the
 * parsed `Env` object — never `process.env` directly. No secrets live in this
 * file; they come from the environment at runtime (see `.env.example`).
 *
 * Phase 4 (hardening) adds a second validation pass: `assertProductionSafety()`
 * runs only when `NODE_ENV=production` and refuses to start the process when a
 * known development default, an unsafe cookie policy, or an unsafe CORS policy
 * is still in place. Development and test keep their convenient local defaults
 * — production fails fast instead of silently degrading
 * (docs/decisions/0001-session-security.md, docs/decisions/0006-cors-policy.md).
 */
import { z } from "zod";

/**
 * Values that ship in `.env.example` / the schema defaults. Any of these in a
 * production environment is a hard boot failure, not a warning.
 */
export const UNSAFE_DEV_DEFAULTS = {
  SESSION_SECRET: [
    "dev-only-change-me-32-chars-minimum-for-session-secret",
    "change-me",
    "changeme",
    "secret",
    "dev",
    "development",
    "test",
  ],
  DATABASE_URL: [
    "postgresql://postgres:postgres@localhost:5432/jap",
    "postgresql://postgres:postgres@127.0.0.1:5432/jap",
  ],
} as const;

/** Minimum entropy we require of a production session secret (bytes as chars). */
export const MIN_PRODUCTION_SESSION_SECRET_LENGTH = 32;

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /** pino level. `silent` disables all log output. */
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  /** Comma-separated exact origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  /** Enable once the API moves to cookie sessions (Phase 3). */
  CORS_CREDENTIALS: z.enum(["true", "false"]).default("false"),

  RATE_LIMIT_ENABLED: z.enum(["true", "false"]).default("true"),
  /** Max requests per IP per window (global baseline). */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** fastify-rate-limit window, e.g. "1 minute". */
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  /**
   * Sensitive-endpoint policy (auth, identity verification). Rationale for the
   * numbers: docs/decisions/0004-rate-limiting.md.
   */
  RATE_LIMIT_AUTH_IP_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_TARGET_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  RATE_LIMIT_ACCOUNT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_ACCOUNT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),

  /** Inbound header honored as the request ID; also echoed on every response. */
  REQUEST_ID_HEADER: z.string().min(1).default("x-request-id"),

  /** PostgreSQL connection string (Prisma + the audit writer). */
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/jap"),

  /** Session cookie name and lifecycle (Phase 3 — authentication). */
  SESSION_COOKIE_NAME: z.string().min(1).default("jap_session"),
  /** Absolute session lifetime — a session dies at this age regardless of use. */
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(8),
  /** Idle timeout: a session unused for this long is revoked. 0 disables. */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(0).max(1440).default(30),
  SESSION_SECURE: z.enum(["true", "false"]).default("false"),
  SESSION_SAMESITE: z.enum(["Lax", "Strict", "None"]).default("Lax"),
  SESSION_SECRET: z.string().min(1).default("dev-only-change-me-32-chars-minimum-for-session-secret"),

  /**
   * Audit persistence backend.
   *   postgres — the append-only `audit_events` table (required in production)
   *   memory   — process-local store for unit tests / DB-less local runs
   */
  AUDIT_STORE: z.enum(["postgres", "memory"]).default("memory"),
  /**
   * Behavior when the audit store is unavailable.
   *   closed — reject the request (503). Default and the production requirement.
   *   open   — continue and emit an error log + metric (never allowed in prod).
   * See docs/decisions/0002-audit-failure-policy.md.
   */
  AUDIT_FAILURE_MODE: z.enum(["closed", "open"]).default("closed"),
  /** Bounded audit write timeout so the clinical path cannot hang (doc 09 §2). */
  AUDIT_WRITE_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(2_000),

  /** Expose the Swagger UI. Off by default in production (unauthenticated docs). */
  DOCS_ENABLED: z.enum(["true", "false"]).optional(),

  /** Expose GET /metrics (Prometheus text format). */
  METRICS_ENABLED: z.enum(["true", "false"]).default("true"),
  /** Optional bearer token required by GET /metrics. Required in production. */
  METRICS_TOKEN: z.string().optional(),

  /** Emit Strict-Transport-Security. Terminating proxy may do this instead. */
  HSTS_ENABLED: z.enum(["true", "false"]).optional(),
  HSTS_MAX_AGE_SECONDS: z.coerce.number().int().min(0).default(15_552_000), // 180 days
});

export interface Env {
  NODE_ENV: "development" | "test" | "production";
  HOST: string;
  PORT: number;
  LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  CORS_ORIGINS: string[];
  CORS_CREDENTIALS: boolean;
  RATE_LIMIT_ENABLED: boolean;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_WINDOW: string;
  RATE_LIMIT_AUTH_IP_MAX: number;
  RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: number;
  RATE_LIMIT_AUTH_TARGET_MAX: number;
  RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS: number;
  RATE_LIMIT_ACCOUNT_MAX: number;
  RATE_LIMIT_ACCOUNT_WINDOW_SECONDS: number;
  REQUEST_ID_HEADER: string;
  DATABASE_URL: string;
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_HOURS: number;
  SESSION_IDLE_MINUTES: number;
  SESSION_SECURE: boolean;
  SESSION_SAMESITE: "Lax" | "Strict" | "None";
  SESSION_SECRET: string;
  AUDIT_STORE: "postgres" | "memory";
  AUDIT_FAILURE_MODE: "closed" | "open";
  AUDIT_WRITE_TIMEOUT_MS: number;
  DOCS_ENABLED: boolean;
  METRICS_ENABLED: boolean;
  METRICS_TOKEN?: string;
  HSTS_ENABLED: boolean;
  HSTS_MAX_AGE_SECONDS: number;
}

/** Thrown when production configuration is unsafe. Message lists every problem. */
export class UnsafeProductionConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(
      `Unsafe production configuration — refusing to start:\n  - ${problems.join("\n  - ")}`,
    );
    this.name = "UnsafeProductionConfigError";
    this.problems = problems;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

function looksLikeLocalDatabase(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(url);
}

/**
 * Production-only safety gate. Never relaxes: every problem found is reported
 * at once so an operator fixes the whole configuration in one pass.
 *
 * Returns the list of problems (empty when safe) so tests can assert on codes
 * without parsing an exception message.
 */
export function productionSafetyProblems(env: Env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];

  // --- Session secret --------------------------------------------------
  const secret = env.SESSION_SECRET;
  if ((UNSAFE_DEV_DEFAULTS.SESSION_SECRET as readonly string[]).includes(secret)) {
    problems.push("SESSION_SECRET is a known development default");
  }
  if (secret.length < MIN_PRODUCTION_SESSION_SECRET_LENGTH) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_PRODUCTION_SESSION_SECRET_LENGTH} characters in production`,
    );
  }
  if (/^(dev|test|local|sample|example|placeholder)/i.test(secret)) {
    problems.push("SESSION_SECRET looks like a placeholder value");
  }
  if (new Set(secret).size < 8) {
    problems.push("SESSION_SECRET has too little variety to be a real secret");
  }

  // --- Cookies ---------------------------------------------------------
  if (!env.SESSION_SECURE) {
    problems.push("SESSION_SECURE must be true in production (HTTPS-only cookies)");
  }
  if (env.SESSION_SAMESITE === "None" && !env.SESSION_SECURE) {
    problems.push("SESSION_SAMESITE=None requires SESSION_SECURE=true");
  }

  // --- CORS ------------------------------------------------------------
  if (env.CORS_ORIGINS.length === 0) {
    problems.push("CORS_ORIGINS must list at least one explicit origin in production");
  }
  if (env.CORS_ORIGINS.includes("*")) {
    problems.push("CORS_ORIGINS must not contain the wildcard '*' in production");
  }
  if (env.CORS_CREDENTIALS && env.CORS_ORIGINS.includes("*")) {
    problems.push("CORS wildcard origin with credentials is forbidden");
  }
  for (const origin of env.CORS_ORIGINS) {
    if (origin === "*") continue;
    if (!/^https?:\/\//i.test(origin)) {
      problems.push(`CORS origin '${origin}' is not an absolute http(s) origin`);
      continue;
    }
    if (origin.endsWith("/")) {
      problems.push(`CORS origin '${origin}' must not have a trailing slash`);
    }
    if (isLoopbackOrigin(origin)) {
      problems.push(`CORS origin '${origin}' is a development loopback origin`);
    } else if (!/^https:\/\//i.test(origin)) {
      problems.push(`CORS origin '${origin}' must use https in production`);
    }
  }

  // --- Database --------------------------------------------------------
  if ((UNSAFE_DEV_DEFAULTS.DATABASE_URL as readonly string[]).includes(env.DATABASE_URL)) {
    problems.push("DATABASE_URL is the local development default");
  } else if (looksLikeLocalDatabase(env.DATABASE_URL)) {
    problems.push("DATABASE_URL points at a loopback database host");
  }

  // --- Audit -----------------------------------------------------------
  if (env.AUDIT_STORE !== "postgres") {
    problems.push("AUDIT_STORE must be 'postgres' in production (audit must be persistent)");
  }
  if (env.AUDIT_FAILURE_MODE !== "closed") {
    problems.push("AUDIT_FAILURE_MODE must be 'closed' in production");
  }

  // --- Surface area ----------------------------------------------------
  if (env.DOCS_ENABLED) {
    problems.push("DOCS_ENABLED must be false in production (set it explicitly to expose /docs)");
  }
  if (env.METRICS_ENABLED && !env.METRICS_TOKEN) {
    problems.push("METRICS_TOKEN is required when METRICS_ENABLED=true in production");
  }
  if (env.RATE_LIMIT_ENABLED === false) {
    problems.push("RATE_LIMIT_ENABLED must be true in production");
  }

  return problems;
}

/** Throwing wrapper around `productionSafetyProblems`. */
export function assertProductionSafety(env: Env): void {
  const problems = productionSafetyProblems(env);
  if (problems.length > 0) throw new UnsafeProductionConfigError(problems);
}

/**
 * Parse and validate configuration. Throws with a per-field report on
 * misconfiguration so the process fails fast at boot instead of limping.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = RawEnvSchema.safeParse(source);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      // Issue paths + messages only — never echo configured values.
      console.error(`[config] ${path}: ${issue.message}`);
    }
    throw new Error("Invalid environment configuration — refusing to start.");
  }

  const raw = result.data;
  const isProduction = raw.NODE_ENV === "production";

  const env: Env = {
    NODE_ENV: raw.NODE_ENV,
    HOST: raw.HOST,
    PORT: raw.PORT,
    LOG_LEVEL: raw.LOG_LEVEL,
    CORS_ORIGINS: raw.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    CORS_CREDENTIALS: raw.CORS_CREDENTIALS === "true",
    RATE_LIMIT_ENABLED: raw.RATE_LIMIT_ENABLED === "true",
    RATE_LIMIT_MAX: raw.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW: raw.RATE_LIMIT_WINDOW,
    RATE_LIMIT_AUTH_IP_MAX: raw.RATE_LIMIT_AUTH_IP_MAX,
    RATE_LIMIT_AUTH_IP_WINDOW_SECONDS: raw.RATE_LIMIT_AUTH_IP_WINDOW_SECONDS,
    RATE_LIMIT_AUTH_TARGET_MAX: raw.RATE_LIMIT_AUTH_TARGET_MAX,
    RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS: raw.RATE_LIMIT_AUTH_TARGET_WINDOW_SECONDS,
    RATE_LIMIT_ACCOUNT_MAX: raw.RATE_LIMIT_ACCOUNT_MAX,
    RATE_LIMIT_ACCOUNT_WINDOW_SECONDS: raw.RATE_LIMIT_ACCOUNT_WINDOW_SECONDS,
    REQUEST_ID_HEADER: raw.REQUEST_ID_HEADER,
    DATABASE_URL: raw.DATABASE_URL,
    SESSION_COOKIE_NAME: raw.SESSION_COOKIE_NAME,
    SESSION_TTL_HOURS: raw.SESSION_TTL_HOURS,
    SESSION_IDLE_MINUTES: raw.SESSION_IDLE_MINUTES,
    SESSION_SECURE: raw.SESSION_SECURE === "true",
    SESSION_SAMESITE: raw.SESSION_SAMESITE,
    SESSION_SECRET: raw.SESSION_SECRET,
    AUDIT_STORE: raw.AUDIT_STORE,
    AUDIT_FAILURE_MODE: raw.AUDIT_FAILURE_MODE,
    AUDIT_WRITE_TIMEOUT_MS: raw.AUDIT_WRITE_TIMEOUT_MS,
    // Docs default: on outside production, off in production unless opted in.
    DOCS_ENABLED: raw.DOCS_ENABLED ? raw.DOCS_ENABLED === "true" : !isProduction,
    METRICS_ENABLED: raw.METRICS_ENABLED === "true",
    METRICS_TOKEN: raw.METRICS_TOKEN,
    // HSTS default: on in production, off elsewhere (plain-http local dev).
    HSTS_ENABLED: raw.HSTS_ENABLED ? raw.HSTS_ENABLED === "true" : isProduction,
    HSTS_MAX_AGE_SECONDS: raw.HSTS_MAX_AGE_SECONDS,
  };

  assertProductionSafety(env);
  return env;
}
