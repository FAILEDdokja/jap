import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import {
  createClinicalRecord, createEncounter, getClinicalRecord, getEncounter, listPatientEncounters,
  listPatientRecords, patientTimeline, updateEncounter,
} from "./service.js";
import {
  CareErrorResponseSchema, ClinicalRecordListResponseSchema, ClinicalRecordResponseSchema,
  CreateClinicalRecordBodySchema, CreateEncounterBodySchema, EncounterListResponseSchema,
  EncounterResponseSchema, TimelineResponseSchema, UpdateEncounterBodySchema,
} from "./schemas.js";
import { writeAuditEvent } from "../audit/service.js";

const IdParams = z.object({ id: z.string().uuid() });
const PatientParams = z.object({ patientId: z.string().uuid() });

export interface CareRoutesOptions { env: Env; }

function unauthorized(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(401).send({ error: { code: "unauthenticated", message: "Sign-in required.", requestId: request.id } });
}

function failure(reply: FastifyReply, request: FastifyRequest, result: { code: string; message: string }) {
  const status = result.code.endsWith("not_found") ? 404 : 400;
  return reply.status(status).send({ error: { code: result.code, message: result.message, requestId: request.id } });
}

export const careRoutes: FastifyPluginAsync<CareRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const actor = (request: FastifyRequest) => requireSession(request, env)?.user ?? null;

  app.post("/patients/:patientId/encounters", { schema: { tags: ["care"], params: PatientParams, body: CreateEncounterBodySchema, response: { 201: EncounterResponseSchema, 400: CareErrorResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = createEncounter(request.params.patientId, user, request.body);
    if (!result.ok) return failure(reply, request, result);
    request.log.info({ actorId: user.id, patientId: request.params.patientId, encounterId: result.value.id }, "care.encounter.create");
    writeAuditEvent({ actor: user, patientId: request.params.patientId, action: "CREATE_RECORD", resourceType: "ENCOUNTER", resourceId: result.value.id, requestId: request.id });
    return reply.status(201).send({ encounter: result.value });
  });

  app.get("/patients/:patientId/encounters", { schema: { tags: ["care"], params: PatientParams, response: { 200: EncounterListResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = listPatientEncounters(request.params.patientId);
    if (result.ok) writeAuditEvent({ actor: user, patientId: request.params.patientId, action: "VIEW_RECORD", resourceType: "ENCOUNTER", requestId: request.id });
    return result.ok ? reply.send({ encounters: result.value }) : failure(reply, request, result);
  });

  app.get("/encounters/:id", { schema: { tags: ["care"], params: IdParams, response: { 200: EncounterResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const encounter = getEncounter(request.params.id);
    if (encounter) writeAuditEvent({ actor: user, patientId: encounter.patientId, action: "VIEW_RECORD", resourceType: "ENCOUNTER", resourceId: encounter.id, requestId: request.id });
    return encounter ? reply.send({ encounter }) : failure(reply, request, { code: "encounter_not_found", message: "Unable to load encounter." });
  });

  app.patch("/encounters/:id", { schema: { tags: ["care"], params: IdParams, body: UpdateEncounterBodySchema, response: { 200: EncounterResponseSchema, 400: CareErrorResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = updateEncounter(request.params.id, request.body);
    if (!result.ok) return failure(reply, request, result);
    request.log.info({ actorId: user.id, encounterId: result.value.id }, "care.encounter.update");
    writeAuditEvent({ actor: user, patientId: result.value.patientId, action: "UPDATE_RECORD", resourceType: "ENCOUNTER", resourceId: result.value.id, requestId: request.id });
    return reply.send({ encounter: result.value });
  });

  app.get("/patients/:patientId/records", { schema: { tags: ["care"], params: PatientParams, response: { 200: ClinicalRecordListResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = listPatientRecords(request.params.patientId);
    if (result.ok) writeAuditEvent({ actor: user, patientId: request.params.patientId, action: "VIEW_RECORD", resourceType: "CLINICAL_RECORD", requestId: request.id });
    return result.ok ? reply.send({ records: result.value }) : failure(reply, request, result);
  });

  app.post("/patients/:patientId/records", { schema: { tags: ["care"], params: PatientParams, body: CreateClinicalRecordBodySchema, response: { 201: ClinicalRecordResponseSchema, 400: CareErrorResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = createClinicalRecord(request.params.patientId, user, request.body);
    if (!result.ok) return failure(reply, request, result);
    request.log.info({ actorId: user.id, patientId: request.params.patientId, recordId: result.value.id, type: result.value.type }, "care.record.create");
    writeAuditEvent({ actor: user, patientId: request.params.patientId, action: "CREATE_RECORD", resourceType: result.value.type, resourceId: result.value.id, requestId: request.id });
    return reply.status(201).send({ record: result.value });
  });

  app.get("/records/:id", { schema: { tags: ["care"], params: IdParams, response: { 200: ClinicalRecordResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const record = getClinicalRecord(request.params.id);
    if (record) writeAuditEvent({ actor: user, patientId: record.patientId, action: "VIEW_RECORD", resourceType: record.type, resourceId: record.id, requestId: request.id });
    return record ? reply.send({ record }) : failure(reply, request, { code: "record_not_found", message: "Unable to load clinical record." });
  });

  app.get("/patients/:patientId/timeline", { schema: { tags: ["care"], params: PatientParams, response: { 200: TimelineResponseSchema, 404: CareErrorResponseSchema } } }, async (request, reply) => {
    const user = actor(request); if (!user) return unauthorized(request, reply);
    const result = patientTimeline(request.params.patientId);
    if (result.ok) writeAuditEvent({ actor: user, patientId: request.params.patientId, action: "VIEW_RECORD", resourceType: "TIMELINE", requestId: request.id });
    return result.ok ? reply.send({ events: result.value }) : failure(reply, request, result);
  });
};
