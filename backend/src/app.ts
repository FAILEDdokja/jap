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
import { parseEnv, type Env } from "./config/env.js";
import { buildLoggerOptions } from "./config/logger.js";
import { API_DESCRIPTION, API_TITLE, SERVICE_VERSION } from "./config/meta.js";
import { registerErrorHandler } from "./middleware/error-handler.js";
import { registerRequestId } from "./middleware/request-id.js";
import { healthRoutes, type ReadinessCheck } from "./modules/health/routes.js";
import { observabilityRoutes } from "./modules/observability/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { patientRoutes } from "./modules/patients/routes.js";
import { careRoutes } from "./modules/care/routes.js";
import { consentRoutes } from "./modules/consents/routes.js";
import { accessRoutes } from "./modules/access/routes.js";
import { auditRoutes } from "./modules/audit/routes.js";
import { configureAuditPolicy, configureAuditStore, getAuditStore } from "./modules/audit/service.js";
import { registerObservability } from "./observability/http.js";

export interface BuildAppOptions {
  /** Override the parsed configuration (tests). */
  env?: Env;
  /** Extra readiness dependencies (tests inject a failing DB probe). */
  readinessChecks?: ReadinessCheck[];
  /** Database client for the Postgres audit store. */
  databaseClient?: unknown;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const env = options.env ?? parseEnv();

  // Audit wiring must happen before any route can write an event.
  configureAuditPolicy(env);
  configureAuditStore(env, options.databaseClient);

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

  // Security headers.
  //
  // CSP: the bundled Swagger UI needs inline scripts/styles, so CSP is
  // disabled only while /docs is served. In production /docs is off by default
  // (`DOCS_ENABLED`), so a real CSP applies. `frame-ancestors 'none'` and
  // `default-src 'none'` are right for a JSON API — it renders no HTML of its
  // own once the docs UI is gone.
  //
  // HSTS: emitted when `HSTS_ENABLED` (default: on in production). If TLS is
  // terminated by a proxy that already sets HSTS, set HSTS_ENABLED=false to
  // avoid a duplicate header (docs/decisions/0005-deployment-and-residency.md).
  await app.register(helmet, {
    contentSecurityPolicy: env.DOCS_ENABLED
      ? false
      : {
          directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
          },
        },
    hsts: env.HSTS_ENABLED
      ? { maxAge: env.HSTS_MAX_AGE_SECONDS, includeSubDomains: true, preload: false }
      : false,
    // The API is never framed and never sniffed.
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
  });

  // CORS: an explicit allowlist, never a wildcard, and never a reflected
  // origin. `parseEnv` refuses to boot production with '*', a loopback origin,
  // or a non-https origin (docs/decisions/0006-cors-policy.md).
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: env.CORS_CREDENTIALS,
    // Only the headers the browser client actually sends/reads.
    allowedHeaders: ["content-type", env.REQUEST_ID_HEADER],
    exposedHeaders: [env.REQUEST_ID_HEADER, "retry-after"],
    maxAge: 600,
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
  registerObservability(app, env);
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
        { name: "patients", description: "Patient records and external identity mapping (Phase 4 — docs/backend/04, 05, 06 §3)" },
        { name: "care", description: "Encounters, append-only clinical records, and longitudinal timelines (Phase 5)" },
        { name: "consents", description: "Purpose- and period-scoped patient consent workflow (Phase 6)" },
        { name: "access", description: "Server-owned role, organization, purpose, consent, and record-type authorization (Phase 7)" },
        { name: "audit", description: "Append-only, hash-chained records of sensitive actions (Phase 8)" },
      ],
    },
    transform: jsonSchemaTransform,
  });
  // The Swagger UI is unauthenticated and inlines scripts; it is off in
  // production unless an operator sets DOCS_ENABLED=true deliberately.
  if (env.DOCS_ENABLED) {
    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  // Readiness dependencies. The audit store doubles as the database probe:
  // if the audit log cannot be reached the instance cannot serve safely,
  // because every clinical write is fail-closed on audit.
  const readinessChecks: ReadinessCheck[] =
    options.readinessChecks ??
    (env.AUDIT_STORE === "postgres"
      ? [{ name: "database", required: true, probe: () => getAuditStore().ping() }]
      : []);

  await app.register(healthRoutes, { env, checks: readinessChecks });
  if (env.METRICS_ENABLED) await app.register(observabilityRoutes, { env });
  await app.register(authRoutes, { prefix: "/api/v1/auth", env });
  await app.register(patientRoutes, { prefix: "/api/v1/patients", env });
  await app.register(careRoutes, { prefix: "/api/v1", env });
  await app.register(consentRoutes, { prefix: "/api/v1/consents", env });
  await app.register(accessRoutes, { prefix: "/api/v1/access", env });
  await app.register(auditRoutes, { prefix: "/api/v1", env });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
