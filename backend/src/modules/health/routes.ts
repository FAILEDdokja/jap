/**
 * Health / metadata module.
 *
 * GET /health        — **liveness**. Answers only "is this process alive and
 *                      able to serve HTTP?". It performs no downstream I/O, by
 *                      design: an orchestrator must not restart a healthy API
 *                      because PostgreSQL is briefly unreachable
 *                      (docs/decisions/0008-observability.md).
 *
 * GET /health/ready  — **readiness**. Validates the dependencies the API needs
 *                      to serve real traffic (PostgreSQL today, the ABDM
 *                      adapter when it exists) and returns 503 when any
 *                      required check fails, so a load balancer drains this
 *                      instance without killing it.
 *
 * Neither endpoint requires authentication — both return service metadata
 * only. Failure details are short codes, never driver messages, so a probe
 * cannot leak connection strings or internal topology.
 */
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../../config/meta.js";
import { metrics } from "../../observability/metrics.js";
import { HealthResponseSchema, ReadinessResponseSchema } from "./schemas.js";

/** A readiness probe for one dependency. */
export interface ReadinessCheck {
  name: string;
  /** Resolve for healthy, reject for unhealthy. Must be fast and side-effect free. */
  probe: () => Promise<void>;
  /** A failing non-required check degrades the report but not the status code. */
  required: boolean;
}

export interface HealthRoutesOptions {
  env: Env;
  checks?: ReadinessCheck[];
}

/** Bound each probe so a wedged dependency cannot hang the probe itself. */
const PROBE_TIMEOUT_MS = 2_000;

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe timed out")), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  instance,
  { env, checks = [] },
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/health",
    {
      schema: {
        tags: ["meta"],
        description:
          "Liveness probe. Returns service identity and uptime; performs no downstream I/O so it never flaps because a dependency is down.",
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: "ok" as const,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["meta"],
        description:
          "Readiness probe. Validates required dependencies (PostgreSQL) and returns 503 when the instance should be drained. Failure details are short codes, never driver messages.",
        response: { 200: ReadinessResponseSchema, 503: ReadinessResponseSchema },
      },
    },
    async (request, reply) => {
      const results = await Promise.all(
        checks.map(async (check) => {
          const started = process.hrtime.bigint();
          try {
            await withTimeout(check.probe(), PROBE_TIMEOUT_MS);
            return {
              name: check.name,
              status: "ok" as const,
              durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
            };
          } catch (error) {
            if (check.name === "database") metrics.databaseFailures.inc({ source: "readiness" });
            // Full error server-side; the response carries a short code only.
            request.log.error({ err: error, check: check.name }, "readiness check failed");
            return {
              name: check.name,
              status: "failed" as const,
              durationMs: Number(process.hrtime.bigint() - started) / 1_000_000,
              detail: "unavailable",
            };
          }
        }),
      );

      const failedRequired = results.some(
        (result, index) => result.status === "failed" && checks[index]?.required === true,
      );

      return reply.status(failedRequired ? 503 : 200).send({
        status: failedRequired ? ("not_ready" as const) : ("ready" as const),
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        environment: env.NODE_ENV,
        timestamp: new Date().toISOString(),
        checks: results.map((result) => ({
          ...result,
          durationMs: Math.round(result.durationMs * 1000) / 1000,
        })),
      });
    },
  );
};
