/**
 * Fastify application factory.
 *
 * `buildApp()` constructs and configures the Fastify instance but does NOT
 * listen — that separation lets tests `inject()` requests against a fully
 * configured app with no open socket.
 *
 * Cross-cutting concerns registered here (order matters):
 *   1. Zod validator/serializer compilers   (request validation + OpenAPI)
 *   2. helmet                               (security headers)
 *   3. CORS                                 (origin allowlist)
 *   4. rate limiting                        (per-IP)
 *   5. request-id echo hook
 *   6. centralized error handler + not-found handler
 *   7. OpenAPI (swagger) + Swagger UI at /docs
 *   8. feature modules (health)
 */
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { parseEnv } from "./config/env.js";
import { buildLoggerOptions } from "./config/logger.js";
import { API_DESCRIPTION, API_TITLE, SERVICE_VERSION } from "./config/meta.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerRequestId } from "./middleware/request-id.js";
import { healthRoutes } from "./modules/health/routes.js";
import { authRoutes } from "./modules/auth/routes.js";

export async function buildApp() {
  const env = parseEnv();

  const app = Fastify({
    logger: buildLoggerOptions(env),
    // The API sits behind a proxy (platform preview, load balancer); trust
    // X-Forwarded-For so rate limiting and logs see the real client IP.
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
    genReqId: (req) => {
      const header = req.headers[env.REQUEST_ID_HEADER];
      return typeof header === "string" && header.length > 0 ? header : randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.decorate("env", env);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Security headers. CSP is disabled because the bundled Swagger UI needs
  // inline scripts/styles; revisit when /docs is disabled in production.
  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: env.CORS_CREDENTIALS,
  });

  if (env.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
      addHeaders: {
        "x-ratelimit-limit": true,
        "x-ratelimit-remaining": true,
        "x-ratelimit-reset": true,
      },
    });
  }

  registerRequestId(app, env.REQUEST_ID_HEADER);
  registerErrorHandler(app, { exposeDetails: env.NODE_ENV !== "production" });

  await app.register(swagger, {
    openapi: {
      info: {
        title: API_TITLE,
        description: API_DESCRIPTION,
        version: SERVICE_VERSION,
      },
      tags: [
        { name: "meta", description: "Service metadata and probes" },
        { name: "auth", description: "Authentication and session (Phase 3 — docs/backend/03, 06 §1)" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  await app.register(healthRoutes, { env });
  await app.register(authRoutes, { prefix: "/api/v1/auth", env });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
