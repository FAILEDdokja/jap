/**
 * Health / metadata module.
 *
 * GET /health — liveness probe for load balancers, orchestrators and humans.
 * Returns service identity, environment, timestamp and uptime. It intentionally
 * performs no downstream I/O (no DB yet in Phase 1) so it cannot flap for
 * reasons unrelated to the process itself.
 */
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { SERVICE_NAME, SERVICE_VERSION } from "../../config/meta.js";
import { HealthResponseSchema } from "./schemas.js";

export interface HealthRoutesOptions {
  env: Env;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/health",
    {
      schema: {
        tags: ["meta"],
        description:
          "Liveness probe. Returns service identity and uptime; performs no downstream I/O.",
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
};
