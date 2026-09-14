/**
 * Fastify module augmentation.
 *
 * `app.env` carries the parsed, validated configuration (config/env.ts) so
 * plugins and routes never read `process.env` directly.
 *
 * `request.actor` is the resolved principal set by the RBAC guard
 * (middleware/rbac.ts) once a request has passed Layer 1 (session) and Layer 2
 * (capability). Handlers read it instead of re-parsing the cookie, so there is
 * exactly one place that turns a session into an `Actor`.
 */
import type { Env } from "../config/env.js";
import type { Actor } from "../services/access-service.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
  }

  interface FastifyRequest {
    /** Present only after `requireCapability(...)` has admitted the request. */
    actor?: Actor;
  }
}
