import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import { listAuditEvents } from "./service.js";
import { AuditErrorResponseSchema, AuditListQuerySchema, AuditListResponseSchema } from "./schemas.js";

export interface AuditRoutesOptions { env: Env; }
const PatientParams = z.object({ patientId: z.string().uuid() });
function unauthenticated(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(401).send({ error: { code: "unauthenticated", message: "Sign-in required.", requestId: request.id } });
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const list = async (request: FastifyRequest<{ Querystring: { patientId?: string; actorId?: string; action?: string; limit: number; offset: number } }>, reply: FastifyReply) => {
    if (!requireSession(request, env)) return unauthenticated(request, reply);
    return reply.send(listAuditEvents(request.query));
  };

  app.get("/audit", { schema: { tags: ["audit"], querystring: AuditListQuerySchema, response: { 200: AuditListResponseSchema, 401: AuditErrorResponseSchema } } }, list);
  app.get("/patients/:patientId/audit", { schema: { tags: ["audit"], params: PatientParams, querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }), response: { 200: AuditListResponseSchema, 401: AuditErrorResponseSchema } } }, async (request, reply) => {
    if (!requireSession(request, env)) return unauthenticated(request, reply);
    return reply.send(listAuditEvents({ ...request.query, patientId: request.params.patientId }));
  });
};
