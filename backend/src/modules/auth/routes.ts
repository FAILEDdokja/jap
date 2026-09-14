/**
 * Authentication routes — Phase 3.
 *
 * Endpoints (docs/backend/06-api-contracts.md §1):
 *   POST   /api/v1/auth/authenticate   → { status, user? }  (200 for all app outcomes)
 *   GET    /api/v1/auth/session        → { user } | 401
 *   GET    /api/v1/auth/me             → alias for /session (architecture doc)
 *   POST   /api/v1/auth/sign-out       → clears server session + cookie (idempotent)
 *
 * All `authenticate` outcomes are 200 (application-level discriminated union)
 * so the frontend adapter `createApiAuthService` can switch on `status` without
 * mapping HTTP codes. Only transport failures (validation) use 4xx via the
 * centralized error envelope.
 *
 * Session is an HttpOnly, SameSite=Lax cookie (`jap_session`) whose value is
 * an opaque UUID. The authority is the in-memory map in src/lib/session.ts —
 * the cookie is just a bearer reference. Every authenticated call can
 * re-validate via `GET /session`.
 */

import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import {
  authenticate as authenticateService,
} from "./service.js";
import {
  AuthenticateBodySchema,
  AuthenticateResponseSchema,
  SessionResponseSchema,
} from "./schemas.js";
import {
  createSession,
  deleteSession,
  getSessionIdFromRequest,
  getSession,
  setSessionCookie,
  clearSessionCookie,
} from "../../lib/session.js";
import { writeAuditEvent } from "../audit/service.js";

export interface AuthRoutesOptions {
  env: Env;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  // POST /api/v1/auth/authenticate
  app.post(
    "/authenticate",
    {
      schema: {
        tags: ["auth"],
        description:
          "Authenticate an identifier within a role. Returns a discriminated `status` union (always 200) per docs/backend/03 §3 and 06 §1. On success a session cookie is set.",
        body: AuthenticateBodySchema,
        response: {
          200: AuthenticateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { role, identifier } = request.body as { role: string; identifier: string };

      const result = authenticateService({ role, identifier });

      if (result.status === "authenticated") {
        const sessionId = createSession(env, {
          id: result.user.id,
          role: result.user.role,
          name: result.user.name,
          orgId: result.user.orgId,
          patientId: result.user.patientId,
        });
        setSessionCookie(reply, env, sessionId);
        // Audit hook (structured log, no credential): never log identifier/secret.
        request.log.info(
          { actorId: result.user.id, role: result.user.role, status: result.status },
          "auth.authenticate success",
        );
        writeAuditEvent({ actor: result.user, action: "LOGIN", resourceType: "SESSION", resourceId: sessionId, requestId: request.id });
        return reply.status(200).send(result);
      }

      // Non-success outcomes deliberately return 200 with no oracle detail.
      request.log.info(
        { role, status: result.status },
        "auth.authenticate non-success",
      );
      writeAuditEvent({ action: "FAILED_LOGIN", resourceType: "AUTHENTICATION", requestId: request.id, status: "blocked" });
      return reply.status(200).send(result);
    },
  );

  // GET /api/v1/auth/session — bootstrap / refresh (401 if no valid session)
  const sessionHandler = async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    const sessionId = getSessionIdFromRequest(request, env);
    if (!sessionId) {
      return reply.status(401).send({
        error: {
          code: "unauthenticated",
          message: "Sign-in required.",
          requestId: request.id,
        },
      });
    }
    const session = getSession(sessionId);
    if (!session) {
      return reply.status(401).send({
        error: {
          code: "unauthenticated",
          message: "Sign-in session expired or invalid. Please sign in again.",
          requestId: request.id,
        },
      });
    }
    return reply.status(200).send({ user: session.user });
  };

  app.get(
    "/session",
    {
      schema: {
        tags: ["auth"],
        description: "Return the current session user if the `jap_session` cookie is valid, otherwise 401.",
        response: {
          200: SessionResponseSchema,
        },
      },
    },
    sessionHandler,
  );

  // Alias per architecture doc: GET /api/v1/auth/me
  app.get(
    "/me",
    {
      schema: {
        tags: ["auth"],
        description: "Alias for GET /session — returns the current session user.",
        response: {
          200: SessionResponseSchema,
        },
      },
    },
    sessionHandler,
  );

  // POST /api/v1/auth/sign-out — revoke server session + clear cookie (idempotent)
  app.post(
    "/sign-out",
    {
      schema: {
        tags: ["auth"],
        description: "Revoke the server session and clear the session cookie. Idempotent — succeeds even if no session exists.",
      },
    },
    async (request, reply) => {
      const sessionId = getSessionIdFromRequest(request, env);
      if (sessionId) {
        deleteSession(sessionId);
        request.log.info({ sessionId }, "auth.sign-out session revoked");
      }
      clearSessionCookie(reply, env);
      return reply.status(200).send({ status: "signed-out" });
    },
  );
};
