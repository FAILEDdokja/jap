import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import { evaluateAccess } from "./service.js";
import { AccessDecisionResponseSchema, EvaluateAccessBodySchema } from "./schemas.js";
import { writeAuditEvent } from "../audit/service.js";
import { auditContext } from "../audit/context.js";

export interface AccessRoutesOptions { env: Env; }

function unauthenticated(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(401).send({ error: { code: "unauthenticated", message: "Sign-in required.", requestId: request.id } });
}

export const accessRoutes: FastifyPluginAsync<AccessRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post("/evaluate", {
    schema: {
      tags: ["access"],
      description: "Evaluate server-owned access to one clinical record type. Actor role and organization come only from the authenticated session; browser-supplied authorization is ignored.",
      body: EvaluateAccessBodySchema,
      response: { 200: AccessDecisionResponseSchema },
    },
  }, async (request, reply) => {
    const session = requireSession(request, env);
    if (!session) return unauthenticated(request, reply);
    const decision = evaluateAccess(session.user, request.body);
    await writeAuditEvent({
      actor: session.user, patientId: request.body.patientId,
      action: decision.allowed ? "ACCESS_ALLOWED" : "ACCESS_DENIED", resourceType: request.body.recordType,
      purpose: request.body.purpose, authorizationId: decision.consentId ?? undefined, ...auditContext(request),
      status: decision.allowed ? "success" : "blocked",
    });
    request.log.info({ actorId: session.user.id, patientId: request.body.patientId, recordType: request.body.recordType, allowed: decision.allowed, reason: decision.reason, consentId: decision.consentId }, "access.evaluate");
    return reply.send({ decision });
  });
};
