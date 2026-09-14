/**
 * Patient routes — Phase 4.
 *
 * Endpoints (all require an authenticated session; 401 otherwise):
 *   POST   /api/v1/patients          → 201 { patient }   (ABHA optional)
 *   GET    /api/v1/patients          → 200 { patients, total, limit, offset }
 *   GET    /api/v1/patients/:id      → 200 { patient } | 404
 *   PATCH  /api/v1/patients/:id      → 200 { patient } | 404
 *
 * Invariants carried by every route:
 *   - `{id}` is the opaque internal record id. No ABHA in any path or query
 *     (docs/backend/04 §1, 06 §5) — invalid ids fail validation without
 *     leaking which ids exist.
 *   - Identities are returned masked only (doc 04 §3). The full value never
 *     crosses the wire and never enters logs.
 *   - Unknown patient → 404 `not_found` with a stable, non-enumerating body.
 *   - Audit: every write logs actor + patient id + action (+ masked identity
 *     only), mirroring the doc 09 §2 audit expectations.
 */

import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { requireSession } from "../../lib/session.js";
import {
  createPatient,
  getPatientView,
  listPatientViews,
  updatePatient,
  type ServiceError,
} from "./service.js";
import {
  CreatePatientBodySchema,
  ListPatientsQuerySchema,
  PatientListResponseSchema,
  PatientResponseSchema,
  UpdatePatientBodySchema,
} from "./schemas.js";

export interface PatientRoutesOptions {
  env: Env;
}

function unauthenticated(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  return reply.status(401).send({
    error: {
      code: "unauthenticated",
      message: "Sign-in required.",
      requestId: request.id,
    },
  });
}

export const patientRoutes: FastifyPluginAsync<PatientRoutesOptions> = async (instance, { env }) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  // Session gate shared by all four routes. Any authenticated professional
  // (or patient) session may call these; role-scoped visibility/scoping is a
  // per-facility policy decision (doc 07 §5) deferred like the record reads.
  const requireActor = (request: import("fastify").FastifyRequest) => {
    const session = requireSession(request, env);
    return session ? session.user : null;
  };

  // POST /api/v1/patients
  app.post(
    "/",
    {
      schema: {
        tags: ["patients"],
        description:
          "Create a patient record. ABHA is optional: declare identifiers via `identities` (stored UNVERIFIED in patient_identities) or omit them entirely. `status: \"provisional\"` creates a walk-in/emergency intake with minimal demographics.",
        body: CreatePatientBodySchema,
        response: { 201: PatientResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request);
      if (!actor) return unauthenticated(request, reply);

      const result = createPatient(
        { orgId: actor.orgId ?? "org-nmc" },
        request.body,
      );

      if (!result.ok) {
        const err: ServiceError = result.error;
        request.log.info({ actorId: actor.id, code: err.code }, "patients.create rejected");
        return reply.status(err.code === "identity_conflict" ? 409 : 400).send({
          error: { code: err.code, message: err.message, requestId: request.id },
        });
      }

      // Audit-style log: ids only — no ABHA value, no demographics.
      request.log.info(
        { actorId: actor.id, patientId: result.value.id, status: result.value.status, identities: result.value.identities.length },
        "patients.create",
      );
      return reply.status(201).send({ patient: result.value });
    },
  );

  // GET /api/v1/patients
  app.get(
    "/",
    {
      schema: {
        tags: ["patients"],
        description:
          "List patient records. Filters: `q` (name substring), `orgId`, `state` (derived: provisional | registered | abha_linked), `status` (lifecycle). Identities are masked only.",
        querystring: ListPatientsQuerySchema,
        response: { 200: PatientListResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request);
      if (!actor) return unauthenticated(request, reply);

      const result = listPatientViews(request.query);
      request.log.info(
        { actorId: actor.id, total: result.total, q: request.query.q ?? null },
        "patients.list",
      );
      return reply.status(200).send(result);
    },
  );

  // GET /api/v1/patients/:id
  app.get(
    "/:id",
    {
      schema: {
        tags: ["patients"],
        description:
          "Fetch one patient record by its opaque id. Unknown ids → 404 (no existence oracle). Identities masked only.",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PatientResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request);
      if (!actor) return unauthenticated(request, reply);

      const patient = getPatientView(request.params.id);
      if (!patient) {
        request.log.info({ actorId: actor.id, patientId: request.params.id }, "patients.get not_found");
        return reply.status(404).send({
          error: {
            code: "not_found",
            message: "Unable to load patient.",
            requestId: request.id,
          },
        });
      }

      request.log.info({ actorId: actor.id, patientId: patient.id }, "patients.get");
      return reply.status(200).send({ patient });
    },
  );

  // PATCH /api/v1/patients/:id
  app.patch(
    "/:id",
    {
      schema: {
        tags: ["patients"],
        description:
          "Update demographics/contacts; declare an additional identifier (`addIdentity`, stored unverified); record a server-side verification outcome (`markIdentityVerified` — the ABDM adapter's hook after a successful doc 04 §6 confirm); or transition a provisional record to registered (`status: \"registered\"`).",
        params: z.object({ id: z.string().uuid() }),
        body: UpdatePatientBodySchema,
        response: { 200: PatientResponseSchema },
      },
    },
    async (request, reply) => {
      const actor = requireActor(request);
      if (!actor) return unauthenticated(request, reply);

      const result = updatePatient(request.params.id, request.body);
      if (!result.ok) {
        const err: ServiceError = result.error;
        request.log.info({ actorId: actor.id, code: err.code }, "patients.update rejected");
        const status =
          err.code === "identity_conflict" ? 409 : err.code === "identity_not_found" ? 404 : 400;
        return reply.status(status).send({
          error: { code: err.code, message: err.message, requestId: request.id },
        });
      }
      if (!result.value) {
        request.log.info({ actorId: actor.id, patientId: request.params.id }, "patients.update not_found");
        return reply.status(404).send({
          error: {
            code: "not_found",
            message: "Unable to load patient.",
            requestId: request.id,
          },
        });
      }

      request.log.info(
        { actorId: actor.id, patientId: result.value.id, state: result.value.state },
        "patients.update",
      );
      return reply.status(200).send({ patient: result.value });
    },
  );
};
