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
