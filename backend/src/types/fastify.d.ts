/**
 * Fastify module augmentation.
 *
 * `app.env` carries the parsed, validated configuration (config/env.ts) so
 * plugins and routes never read `process.env` directly.
 */
import type { Env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }
}
