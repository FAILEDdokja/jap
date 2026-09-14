/**
 * Structured logging (pino, via Fastify).
 *
 * - production / development: JSON log lines, sensitive headers redacted.
 * - development only: pretty-printed through pino-pretty (devDependency).
 * - test: logging disabled to keep test output readable.
 *
 * PHI in the request line. Fastify logs `req.url` on every request, which
 * includes the query string — so a search term (`?q=iqbal`) reached the log
 * even though no handler logged it, and a search term is usually part of a
 * patient's name (docs/backend/09 §2, §4: never log names or search terms).
 * `redactUrl` therefore masks every query value except the operational
 * parameters a log line is actually for (`limit`, `offset`, `status`, …),
 * leaving the path — and the fact that a search happened — intact.
 */
import type { FastifyServerOptions } from "fastify";
import type { Env } from "./env.js";
import { SERVICE_NAME } from "./meta.js";

/**
 * Query keys whose values are safe to write to a log: pagination, sorting and
 * the enumerated filters. Everything else is masked.
 *
 * This is an allowlist on purpose. The obvious alternative — a list of
 * "sensitive" keys — fails open: the first endpoint that takes a person-
 * identifying parameter nobody thought to list leaks it into every log line.
 * Masking the unknown means a new parameter is silent until someone decides it
 * is operational. All entries are lowercase; keys are matched
 * case-insensitively and the caller's casing is preserved in the output.
 */
export const LOGGABLE_QUERY_KEYS: readonly string[] = [
  "limit",
  "offset",
  "page",
  "pagesize",
  "state",
  "status",
  "orgid",
  "sort",
  "order",
  "direction",
  "inclusesealed",
];

/** Redaction marker, matching pino's `redact.censor`. */
export const REDACTED = "[redacted]";

/**
 * Mask person-identifying query values out of a request URL, keeping the path
 * and the operational parameters. Exported (and unit-tested) because logging is
 * disabled under `NODE_ENV=test`, so no integration test can observe it.
 */
export function redactUrl(url: string): string {
  const cut = url.indexOf("?");
  if (cut === -1) return url;

  const path = url.slice(0, cut);
  const query = url.slice(cut + 1);
  if (!query) return url;

  let redacted = false;
  const kept = query
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const key = eq === -1 ? pair : pair.slice(0, eq);
      let name = key;
      try {
        name = decodeURIComponent(key);
      } catch {
        // A malformed escape is not a reason to log the value.
      }
      if (LOGGABLE_QUERY_KEYS.includes(name.toLowerCase())) return pair;
      redacted = true;
      // Keep the key — a log line should still show that a search happened —
      // and drop the value, escapes and all.
      return `${key}=${REDACTED}`;
    })
    .join("&");

  return redacted ? `${path}?${kept}` : url;
}

export function buildLoggerOptions(env: Env): FastifyServerOptions["logger"] {
  if (env.NODE_ENV === "test") return false;

  const base = {
    level: env.LOG_LEVEL,
    base: { service: SERVICE_NAME },
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: REDACTED,
    },
    serializers: {
      req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
        id: req.id,
        method: req.method,
        url: redactUrl(req.url),
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
