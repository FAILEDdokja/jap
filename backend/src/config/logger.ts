/**
 * Structured logging (pino, via Fastify).
 *
 * - production / development: JSON log lines, sensitive headers redacted.
 * - development only: pretty-printed through pino-pretty (devDependency).
 * - test: logging disabled to keep test output readable.
 */
import type { FastifyServerOptions } from "fastify";
import type { Env } from "./env.js";
import { SERVICE_NAME } from "./meta.js";

export function buildLoggerOptions(env: Env): FastifyServerOptions["logger"] {
  // `silent` and the test environment disable the transport entirely, which is
  // also how a test that exercises production *configuration* keeps its output
  // readable without pretending to be the test environment.
  if (env.NODE_ENV === "test" || env.LOG_LEVEL === "silent") return false;

  const base = {
    level: env.LOG_LEVEL,
    base: { service: SERVICE_NAME },
    // Defence in depth: even if a call site logs a whole request/response, the
    // credential-bearing headers never reach disk (docs/backend/09 §3).
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
        "req.body.identifier",
        "req.body.otp",
        "req.body.password",
      ],
      censor: "[redacted]",
    },
    serializers: {
      req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
    },
  };

  if (env.NODE_ENV === "development") {
    return {
      ...base,
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname,service",
        },
      },
    };
  }

  return base;
}
