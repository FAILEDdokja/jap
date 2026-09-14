/**
 * Environment configuration.
 *
 * Single entry point for configuration: every value the app reads is declared,
 * defaulted and validated here with Zod. The rest of the codebase uses the
 * parsed `Env` object — never `process.env` directly. No secrets live in this
 * file; they come from the environment at runtime (see `.env.example`).
 */
import { z } from "zod";

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
  /** Max requests per IP per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** fastify-rate-limit window, e.g. "1 minute". */
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),

  /** Inbound header honored as the request ID; also echoed on every response. */
  REQUEST_ID_HEADER: z.string().min(1).default("x-request-id"),
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
  REQUEST_ID_HEADER: string;
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
  return {
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
    REQUEST_ID_HEADER: raw.REQUEST_ID_HEADER,
  };
}
