/**
 * Patient routes — Phase 4.
 *
 * Endpoints (docs/backend/06 §3, doc 05 §2–§4):
 *   POST   /api/v1/patients          → 201 { patient, access }   (ABHA optional)
 *   GET    /api/v1/patients          → 200 { patients, total, sealedCount, limit, offset, scope }
 *   GET    /api/v1/patients/:id      → 200 { patient, access } | 403 | 404
 *   PATCH  /api/v1/patients/:id      → 200 { patient, access } | 403 | 404 | 409
 *
 * Authorization is the route's structure, not an afterthought in the handler
 * (architecture §4.1 — session → rbac → access-service → audit):
 *
 *   - `preHandler: requireCapability(...)` admits only a session whose role
 *     holds the capability. It answers 401 (no/expired session) or 403
 *     (`role_not_permitted`) and writes the `blocked` audit row itself, so a
 *     handler can never forget to.
 *   - the handler then applies the data-level decision — visibility scope on
 *     the list, `evaluateAccess` on a read, `evaluateWriteAccess` on a write —
 *     through the service, and reports denials via `middleware/rbac.ts`.
 *   - every allow AND deny is audited (Layer 5).
 *
 * Tenant isolation, concretely:
 *   - POST writes into the actor's own tenant. There is no `orgId` in the body
 *     and none is honored if one is sent.
 *   - GET (list) never leaves the actor's scope: own tenant + patients with a
 *     consent artifact for that tenant. Everything else does not exist for this
 *     caller — not counted, not matched by `q`.
 *   - GET/PATCH `:id` are refused across tenants. An active consent opens the
 *     READ; it never opens the write (`cross_tenant_write`).
 *
 * Invariants carried by every route:
 *   - `{id}` is the opaque internal record id. No ABHA in any path or query
 *     (doc 04 §1, 06 §5) — invalid ids fail validation without leaking which
 *     ids exist.
 *   - Identities are returned masked only (doc 04 §3). The full value never
 *     crosses the wire and never enters logs.
 *   - Unknown patient → 404 `not_found`; known-but-inaccessible → 403 with the
 *     `AccessDecision` (the sealed view). Both bodies carry no record data.
 *   - Nothing in a log line or an audit detail: no ABHA value, no patient name,
 *     no demographics, no search term (doc 09 §2, §4).
 */

import { z } from "zod";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Env } from "../../config/env.js";
import { ERROR_RESPONSES, ERROR_RESPONSES_NO_CONFLICT } from "../../middleware/error-schemas.js";
import {
  denyAccess,
  denyCapability,
  denyWrite,
  forbidden,
  requireCapability,
} from "../../middleware/rbac.js";
import { toAccessDecisionView } from "../../services/access-schemas.js";
import type { Actor } from "../../services/access-service.js";
import {
  CAPABILITY_AUDIT_ACTION,
  capabilitiesRequiredFor,
  createPatient,
  listPatientsForActor,
  readPatientForActor,
  updatePatientForActor,
  type ServiceError,
} from "./service.js";
import {
  CreatePatientBodySchema,
  ListPatientsQuerySchema,
  PatientErrorResponseSchema,
  PatientListResponseSchema,
  PatientResponseSchema,
  UpdatePatientBodySchema,
} from "./schemas.js";
import { writeAuditEvent } from "../audit/service.js";

export interface PatientRoutesOptions {
  /**
   * Accepted for symmetry with the other modules; the RBAC guard reads the
   * parsed config from `request.server.env` (decorated in app.ts) so the
   * session boundary is resolved in exactly one place.
   */
  env: Env;
}

/**
 * The principal the guard resolved. Fails loudly if a route ever runs without
 * `requireCapability` — a handler must never have to guess whether it is
 * authorized.
 */
function actorOf(request: FastifyRequest): Actor {
  if (!request.actor) {
    throw new Error("patient route ran without the RBAC guard");
  }
  return request.actor;
}

function notFound(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send({
    error: {
      code: "not_found",
      message: "Unable to load patient.",
      requestId: request.id,
    },
  });
}

/** Business rejection → status. One mapping, used by both write routes. */
function rejectedStatus(code: ServiceError["code"]): 400 | 403 | 404 | 409 {
  switch (code) {
    case "identity_conflict":
      return 409;
    case "identity_not_found":
      return 404;
    case "no_tenant":
      return 403;
    default:
      return 400;
  }
}

export const patientRoutes: FastifyPluginAsync<PatientRoutesOptions> = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  // ── POST /api/v1/patients ─────────────────────────────────────────────────
  app.post(
    "/",
    {
      preHandler: requireCapability({
        capability: "patient.register",
        action: "CREATE_RECORD",
      }),
      schema: {
        tags: ["patients"],
        description:
          "Create a patient record in the caller's own tenant (the tenant comes from the session, never from the body). ABHA is optional: declare identifiers via `identities` (stored UNVERIFIED in patient_identities) or omit them entirely. `status: \"provisional\"` creates a walk-in/emergency intake with minimal demographics. Requires the `patient.register` capability (DOCTOR, HOSPITAL_ADMIN).",
        body: CreatePatientBodySchema,
        response: { 201: PatientResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      const result = createPatient(actor, request.body);

      if (!result.ok) {
        const err = result.error;
        writeAuditEvent({
          actor,
          action: "CREATE_RECORD",
          resourceType: "PATIENT",
          status: "blocked",
          reason: err.code,
          capability: "patient.register",
          requestId: request.id,
        });
        request.log.info({ actorId: actor.id, code: err.code }, "patients.create rejected");
        if (err.code === "no_tenant") {
          return forbidden(request, reply, {
            reason: "no_tenant",
            message: err.message,
            capability: "patient.register",
          });
        }
        return reply.status(rejectedStatus(err.code)).send({
          error: { code: err.code, message: err.message, requestId: request.id },
        });
      }

      const { patient, access } = result.value;
      // Audit-style record: ids and counts only — no ABHA value, no
      // demographics, no name (doc 09 §2).
      writeAuditEvent({
        actor,
        action: "CREATE_RECORD",
        resourceType: "PATIENT",
        resourceId: patient.id,
        patientId: patient.id,
        status: "success",
        reason: access.reason,
        capability: "patient.register",
        requestId: request.id,
      });
      request.log.info(
        {
          actorId: actor.id,
          patientId: patient.id,
          status: patient.status,
          identities: patient.identities.length,
        },
        "patients.create",
      );
      return reply
        .status(201)
        .send({ patient, access: toAccessDecisionView(access) });
    },
  );

  // ── GET /api/v1/patients ──────────────────────────────────────────────────
  app.get(
    "/",
    {
      preHandler: requireCapability({
        capability: "patient.search",
        action: "LIST_RECORDS",
      }),
      schema: {
        tags: ["patients"],
        description:
          "List the patient records visible to the caller: their own tenant's records, plus any patient with a consent artifact for that tenant (returned as a sealed stub — id and decision only — unless the consent is active). Platform oversight (SUPER_ADMIN) lists all; a PATIENT lists only their own record. Filters: `q` (name substring), `orgId`, `state` (derived: provisional | registered | abha_linked), `status` (lifecycle). Filters are applied INSIDE the scope and can never widen it. Identities are masked only.",
        querystring: ListPatientsQuerySchema,
        response: { 200: PatientListResponseSchema, ...ERROR_RESPONSES_NO_CONFLICT },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      const result = listPatientsForActor(actor, request.query);

      writeAuditEvent({
        actor,
        action: "LIST_RECORDS",
        resourceType: "PATIENT",
        status: "success",
        capability: "patient.search",
        requestId: request.id,
      });
      request.log.info(
        { actorId: actor.id, scope: result.scope.kind, total: result.total, sealed: result.sealedCount },
        "patients.list",
      );
      return reply.status(200).send(result);
    },
  );

  // ── GET /api/v1/patients/:id ──────────────────────────────────────────────
  app.get(
    "/:id",
    {
      preHandler: requireCapability({ capability: "patient.read", action: "VIEW_RECORD" }),
      schema: {
        tags: ["patients"],
        description:
          "Fetch one patient record by its opaque id. Unknown ids → 404 (no existence oracle). Known but not accessible from the caller's tenant → 403 carrying the AccessDecision (the sealed view: reason + consent artifact, no record data) and writing a `blocked` audit row. Identities masked only.",
        params: z.object({ id: z.string().uuid() }),
        response: { 200: PatientResponseSchema, ...ERROR_RESPONSES_NO_CONFLICT },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      const id = request.params.id;
      const result = readPatientForActor(actor, id);

      if (result.kind === "not_found") {
        // Audited as a blocked read: probes at unguessable ids are exactly what
        // an enumeration attempt looks like, and the trail should show them.
        writeAuditEvent({
          actor,
          action: "VIEW_RECORD",
          resourceType: "PATIENT",
          resourceId: id,
          patientId: id,
          status: "blocked",
          reason: "not_found",
          capability: "patient.read",
          requestId: request.id,
        });
        request.log.info({ actorId: actor.id, patientId: id }, "patients.get not_found");
        return notFound(request, reply);
      }

      if (result.kind === "denied") {
        return denyAccess(request, reply, actor, {
          action: "VIEW_RECORD",
          decision: result.decision,
          patientId: id,
          capability: "patient.read",
        });
      }

      writeAuditEvent({
        actor,
        action: "VIEW_RECORD",
        resourceType: "PATIENT",
        resourceId: id,
        patientId: id,
        status: "success",
        reason: result.access.reason,
        capability: "patient.read",
        requestId: request.id,
        authorizationId: result.access.consent?.id ?? null,
      });
      request.log.info(
        { actorId: actor.id, patientId: id, reason: result.access.reason },
        "patients.get",
      );
      return reply
        .status(200)
        .send({ patient: result.patient, access: toAccessDecisionView(result.access) });
    },
  );

  // ── PATCH /api/v1/patients/:id ────────────────────────────────────────────
  app.patch(
    "/:id",
    {
      preHandler: requireCapability({ capability: "patient.update", action: "UPDATE_RECORD" }),
      schema: {
        tags: ["patients"],
        description:
          "Update demographics/contacts (`patient.update`), declare an additional identifier (`addIdentity` → `patient.link_identity`, stored unverified), or record a server-side verification outcome (`markIdentityVerified` → `patient.verify_identity`, the ABDM adapter's hook after a successful doc 04 §6 confirm). The route itself requires `patient.update`; individual fields can require MORE, never less — capabilities are checked per field so a role that may edit demographics cannot also attest verification. Writes are restricted to the owning tenant: an active consent grants reading, never writing.",
        params: z.object({ id: z.string().uuid() }),
        body: UpdatePatientBodySchema,
        response: { 200: PatientResponseSchema, ...ERROR_RESPONSES },
      },
    },
    async (request, reply) => {
      const actor = actorOf(request);
      const id = request.params.id;
      const result = updatePatientForActor(actor, id, request.body);

      switch (result.kind) {
        case "missing_capability": {
          const capability = result.capability;
          return denyCapability(
            request,
            reply,
            actor,
            capability,
            CAPABILITY_AUDIT_ACTION[capability] ?? "UPDATE_RECORD",
            id,
          );
        }

        case "not_found":
          writeAuditEvent({
            actor,
            action: "UPDATE_RECORD",
            resourceType: "PATIENT",
            resourceId: id,
            patientId: id,
            status: "blocked",
            reason: "not_found",
            capability: "patient.update",
            requestId: request.id,
          });
          request.log.info({ actorId: actor.id, patientId: id }, "patients.update not_found");
          return notFound(request, reply);

        case "denied_write":
          return denyWrite(request, reply, actor, {
            action: "UPDATE_RECORD",
            decision: result.decision,
            patientId: id,
          });

        case "rejected": {
          const err = result.error;
          writeAuditEvent({
            actor,
            action: "UPDATE_RECORD",
            resourceType: err.code === "identity_not_found" ? "PATIENT_IDENTITY" : "PATIENT",
            resourceId: id,
            patientId: id,
            status: "blocked",
            reason: err.code,
            requestId: request.id,
          });
          request.log.info({ actorId: actor.id, code: err.code }, "patients.update rejected");
          return reply.status(rejectedStatus(err.code)).send({
            error: { code: err.code, message: err.message, requestId: request.id },
          });
        }

        case "ok": {
          // One audit row per action the patch actually performed — the same
          // capability decomposition that authorized it.
          for (const capability of capabilitiesRequiredFor(request.body)) {
            const action = CAPABILITY_AUDIT_ACTION[capability] ?? "UPDATE_RECORD";
            const identityAction = action === "LINK_IDENTITY" || action === "VERIFY_IDENTITY";
            writeAuditEvent({
              actor,
              action,
              resourceType: identityAction ? "PATIENT_IDENTITY" : "PATIENT",
              // An identity action points at the identity row when one is known;
              // `patientId` still carries the record it belongs to.
              resourceId: capability === "patient.verify_identity"
                ? result.verifiedIdentityId ?? id
                : id,
              patientId: id,
              status: "success",
              reason: result.access.reason,
              capability,
              requestId: request.id,
            });
          }
          request.log.info(
            { actorId: actor.id, patientId: id, state: result.patient.state },
            "patients.update",
          );
          return reply
            .status(200)
            .send({ patient: result.patient, access: toAccessDecisionView(result.access) });
        }
      }
    },
  );
};
