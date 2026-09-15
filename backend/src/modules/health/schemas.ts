/**
 * Schemas for the health/metadata module.
 *
 * These Zod schemas are the single source of truth for both runtime
 * validation/serialization AND the generated OpenAPI document (via
 * fastify-type-provider-zod's jsonSchemaTransform).
 */
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** One dependency's readiness result. `detail` is a short, non-sensitive code. */
export const ReadinessCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "failed", "skipped"]),
  durationMs: z.number(),
  detail: z.string().optional(),
});

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.string(),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string().datetime(),
  checks: z.array(ReadinessCheckSchema),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;
