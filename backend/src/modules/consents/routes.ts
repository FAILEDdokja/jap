import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import { approveConsent, createConsent, getConsentView, listConsents, rejectConsent, revokeConsent } from "./service.js";
import { ConsentErrorResponseSchema, ConsentListResponseSchema, ConsentResponseSchema, CreateConsentBodySchema, DecisionBodySchema, ListConsentsQuerySchema } from "./schemas.js";
import { writeAuditEvent } from "../audit/service.js";
import { auditContext } from "../audit/context.js";

const IdParams = z.object({ id: z.string().uuid() });
export interface ConsentRoutesOptions { env: Env; }

function unauthenticated(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(401).send({ error: { code: "unauthenticated", message: "Sign-in required.", requestId: request.id } });
}

function failure(reply: FastifyReply, request: FastifyRequest, error: { code: string; message: string }) {
  const status = error.code === "consent_not_found" ? 404 : error.code === "forbidden" ? 403 : 400;
  return reply.status(status).send({ error: { ...error, requestId: request.id } });
}

export const consentRoutes: FastifyPluginAsync<ConsentRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const actor = (request: FastifyRequest) => requireSession(request, env)?.user ?? null;

  app.post("/", { schema: { tags: ["consents"], body: CreateConsentBodySchema, response: { 201: ConsentResponseSchema, 400: ConsentErrorResponseSchema, 404: ConsentErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthenticated(request, reply);
    const result = createConsent(user, request.body);
    if (!result.ok) return failure(reply, request, result);
    request.log.info({ actorId: user.id, consentId: result.value.id, patientId: result.value.patientId }, "consent.create");
    await writeAuditEvent({ actor: user, patientId: result.value.patientId, action: "CONSENT_CREATED", resourceType: "CONSENT", resourceId: result.value.id, purpose: result.value.purpose, ...auditContext(request) });
    return reply.status(201).send({ consent: result.value });
  });

  app.get("/", { schema: { tags: ["consents"], querystring: ListConsentsQuerySchema, response: { 200: ConsentListResponseSchema } } }, async (request, reply) => {
    if (!actor(request)) return unauthenticated(request, reply);
    return reply.send({ consents: listConsents(request.query) });
  });

  app.get("/:id", { schema: { tags: ["consents"], params: IdParams, response: { 200: ConsentResponseSchema, 404: ConsentErrorResponseSchema } } }, async (request, reply) => {
    if (!actor(request)) return unauthenticated(request, reply);
    const result = getConsentView(request.params.id);
    return result.ok ? reply.send({ consent: result.value }) : failure(reply, request, result);
  });

  for (const [path, decide, action] of [
    ["/:id/approve", approveConsent, "approve"],
    ["/:id/reject", rejectConsent, "reject"],
    ["/:id/revoke", revokeConsent, "revoke"],
  ] as const) {
    app.post(path, { schema: { tags: ["consents"], params: IdParams, body: DecisionBodySchema, response: { 200: ConsentResponseSchema, 400: ConsentErrorResponseSchema, 403: ConsentErrorResponseSchema, 404: ConsentErrorResponseSchema } } }, async (request, reply) => {
      const user = actor(request); if (!user) return unauthenticated(request, reply);
      const result = decide(request.params.id, user, request.body.note);
      if (!result.ok) return failure(reply, request, result);
      request.log.info({ actorId: user.id, consentId: result.value.id, status: result.value.status }, `consent.${action}`);
      await writeAuditEvent({
        actor: user, patientId: result.value.patientId,
        action: result.value.status === "APPROVED" ? "CONSENT_APPROVED" : result.value.status === "REVOKED" ? "CONSENT_REVOKED" : "CONSENT_REJECTED",
        resourceType: "CONSENT", resourceId: result.value.id, purpose: result.value.purpose, ...auditContext(request),
      });
      return reply.send({ consent: result.value });
    });
  }
};
