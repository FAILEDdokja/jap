/**
 * GET /metrics — Prometheus text exposition.
 *
 * Not part of `/api/v1`: this is an operational endpoint, not a product API,
 * so it is deliberately unversioned and excluded from the OpenAPI document.
 *
 * Access control: when `METRICS_TOKEN` is set (mandatory in production —
 * `parseEnv` refuses to boot otherwise) a matching `Authorization: Bearer`
 * header is required. The comparison is constant-time. Metric labels are
 * low-cardinality server-chosen values only, so the body carries no PHI even
 * when it is reachable (docs/decisions/0008-observability.md).
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import type { Env } from "../../config/env.js";
import { renderMetrics } from "../../observability/metrics.js";

export interface ObservabilityRoutesOptions {
  env: Env;
}

function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const observabilityRoutes: FastifyPluginAsync<ObservabilityRoutesOptions> = async (
  app,
  { env },
) => {
  app.get("/metrics", { schema: { hide: true } }, async (request, reply) => {
    if (env.METRICS_TOKEN) {
      const header = request.headers.authorization;
      const provided = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
      if (!provided || !tokenMatches(env.METRICS_TOKEN, provided)) {
        return reply.status(401).send({
          error: { code: "unauthenticated", message: "Metrics token required.", requestId: request.id },
        });
      }
    }
    return reply
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(renderMetrics());
  });
};
