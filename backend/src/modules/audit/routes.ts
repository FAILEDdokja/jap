/**
 * Audit read APIs.
 *
 * There is intentionally **no write, update or delete endpoint**. Audit events
 * are produced only as a side effect of the actions they describe; exposing a
 * writer would let a caller forge history, and exposing a mutator would break
 * the append-only guarantee the whole chain rests on.
 *
 * `GET /api/v1/audit/integrity` recomputes the chain and reports tampering. It
 * is restricted to SUPER_ADMIN: the report is an operational/security artifact,
 * not clinical data.
 */
import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import { listAuditEvents, verifyAuditIntegrity } from "./service.js";
import {
  AuditErrorResponseSchema,
  AuditIntegrityResponseSchema,
  AuditListQuerySchema,
  AuditListResponseSchema,
} from "./schemas.js";

export interface AuditRoutesOptions {
  env: Env;
}

const PatientParams = z.object({ patientId: z.string().uuid() });

function unauthenticated(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .status(401)
    .send({ error: { code: "unauthenticated", message: "Sign-in required.", requestId: request.id } });
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/audit",
    {
      schema: {
        tags: ["audit"],
        querystring: AuditListQuerySchema,
        response: { 200: AuditListResponseSchema, 401: AuditErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!requireSession(request, env)) return unauthenticated(request, reply);
      return reply.send(await listAuditEvents(request.query));
    },
  );

  app.get(
    "/audit/integrity",
    {
      schema: {
        tags: ["audit"],
        description:
          "Recompute the audit hash chain and report tampering (changed events, broken links, sequence gaps). Read-only; never repairs. SUPER_ADMIN only.",
        response: {
          200: AuditIntegrityResponseSchema,
          401: AuditErrorResponseSchema,
          403: AuditErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = requireSession(request, env);
      if (!session) return unauthenticated(request, reply);
      // Default-deny: only the platform role may read the integrity report.
      if (session.user.role !== "SUPER_ADMIN") {
        return reply.status(403).send({
          error: {
            code: "forbidden",
            message: "Audit integrity verification is restricted.",
            requestId: request.id,
          },
        });
      }
      return reply.send(await verifyAuditIntegrity());
    },
  );

  app.get(
    "/patients/:patientId/audit",
    {
      schema: {
        tags: ["audit"],
        params: PatientParams,
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        }),
        response: { 200: AuditListResponseSchema, 401: AuditErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!requireSession(request, env)) return unauthenticated(request, reply);
      return reply.send(
        await listAuditEvents({ ...request.query, patientId: request.params.patientId }),
      );
    },
  );
};
