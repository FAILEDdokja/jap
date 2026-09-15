/**
 * Per-request observability — Phase 4.5.
 *
 * Emits one structured completion log line and the HTTP metric family for
 * every request. The field set is fixed so log queries and dashboards stay
 * stable:
 *
 *   requestId, traceId?, method, route, status, durationMs, actorId?, role?,
 *   orgId?
 *
 * PHI/PII discipline (docs/backend/09 §3, §5):
 *   - `route` is the Fastify **route template** (`/api/v1/patients/:id`), never
 *     the raw URL — raw URLs carry opaque patient ids and query strings
 *   - `actorId` / `orgId` are internal opaque ids, logged only when a session
 *     exists; patient ids, names, ABHA values, OTPs, cookies and request
 *     bodies are never logged here
 *   - the logger's redaction list (config/logger.ts) is the second line of
 *     defence for headers
 */
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { requireSession } from "../lib/session.js";
import { metrics, statusClass } from "./metrics.js";
import { correlationFrom } from "./tracing.js";

declare module "fastify" {
  interface FastifyRequest {
    /** High-resolution start time, set by the observability hook. */
    startedAt?: bigint;
  }
}

/** Route template for metrics/logs; falls back to a constant, never the raw URL. */
export function routeLabel(request: {
  routeOptions?: { url?: string };
  url: string;
}): string {
  return request.routeOptions?.url ?? "unmatched";
}

export function registerObservability(app: FastifyInstance, env: Env): void {
  app.addHook("onRequest", async (request) => {
    request.startedAt = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (request, reply) => {
    const durationMs = request.startedAt
      ? Number(process.hrtime.bigint() - request.startedAt) / 1_000_000
      : reply.elapsedTime;

    const route = routeLabel(request);
    const status = reply.statusCode;
    const labels = { method: request.method, route, status: statusClass(status) };

    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(durationMs, { method: request.method, route });
    if (status >= 400) metrics.httpErrors.inc(labels);

    // Actor context, only when a valid session is present. Reading the session
    // here does not extend it beyond what the request already did.
    let actor: { actorId: string; role: string; orgId?: string } | undefined;
    try {
      const session = requireSession(request, env);
      if (session) {
        actor = { actorId: session.user.id, role: session.user.role, orgId: session.user.orgId };
      }
    } catch {
      /* never let observability break a response */
    }

    const correlation = correlationFrom(String(request.id), request.headers as Record<string, unknown>);

    request.log.info(
      {
        requestId: correlation.requestId,
        ...(correlation.traceId ? { traceId: correlation.traceId } : {}),
        method: request.method,
        route,
        status,
        durationMs: Math.round(durationMs * 1000) / 1000,
        ...(actor ?? {}),
      },
      "http.request",
    );
  });
}
