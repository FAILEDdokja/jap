/**
 * RBAC guard — the route-level authorization layer (docs/backend/07 §4, §7;
 * architecture §4.1, §3.2 `middleware/rbac.ts`).
 *
 * Enforcement order, exactly as architecture §4.1 fixes it:
 *
 *   1. session      → who are you?                 401 `unauthenticated`
 *   2. rbac (here)  → may your role do this?       403 `forbidden` + `role_not_permitted`
 *   3. access-service → may you touch THIS record? 403 `forbidden` + the `AccessDecision`
 *      (called from the route/service, and reported through `denyAccess` here)
 *   4. audit        → every decision above, allow AND deny (`modules/audit`)
 *
 * Layer 2 and Layer 3 answer different questions and both always run. Skipping
 * Layer 2 "because Layer 3 would deny it anyway" is how a role ends up able to
 * read a record it has no business reading: the record-level rule can allow
 * (same tenant!) what the role-level rule forbids (a laboratory editing a
 * demographic record).
 *
 * Frontend guards are UX only (doc 07 §7) — hiding a button is not enforcement.
 * Everything here is server-side, and every denial writes a `blocked` audit
 * row so the decision is answerable later.
 *
 * Note on 403 vs 404: an unknown id is 404 and a known-but-inaccessible id is
 * 403 (the "sealed view" the parity checklist requires, architecture §5.4).
 * That distinction is only safe because ids are opaque UUIDv4 — there is no
 * enumerable id space to probe (docs/backend/05 §2, doc 06 §5).
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import { writeAuditEvent } from "../modules/audit/service.js";
import { can, type Capability } from "../lib/permissions.js";
import { isRole } from "../lib/roles.js";
import { requireSession } from "../lib/session.js";
import { toAccessDecisionView } from "../services/access-schemas.js";
import type { AccessDecision, Actor, WriteDecision } from "../services/access-service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turn a validated session into the principal the authorization layers reason
 * about. Null when there is no session or it has expired — the cookie is a
 * bearer reference, the server-side store is the authority (doc 03 §5).
 */
export function resolveActor(request: FastifyRequest, env: Env): Actor | null {
  const session = requireSession(request, env);
  if (!session) return null;
  const user = session.user;
  return {
    id: user.id,
    // An unrecognised role is preserved as-is and fails closed in `can()` /
    // `evaluateAccess()` rather than being coerced into a valid one.
    role: isRole(user.role) ? user.role : String(user.role ?? ""),
    name: user.name,
    orgId: user.orgId ?? null,
    patientId: user.patientId ?? null,
  };
}

/** The `:id` route parameter when it is a well-formed opaque id. */
function patientIdFromRequest(request: FastifyRequest): string | null {
  const params = request.params as { id?: unknown } | null;
  const id = params?.id;
  return typeof id === "string" && UUID_RE.test(id) ? id : null;
}

/** 401 — no session, or an expired/revoked one. */
export function unauthenticated(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(401).send({
    error: {
      code: "unauthenticated",
      message: "Sign-in required.",
      requestId: request.id,
    },
  });
}

export interface ForbiddenDetails {
  reason: string;
  message: string;
  capability?: string;
  access?: AccessDecision;
}

/** 403 — authenticated, not permitted. Never carries record data. */
export function forbidden(
  request: FastifyRequest,
  reply: FastifyReply,
  details: ForbiddenDetails,
): FastifyReply {
  return reply.status(403).send({
    error: {
      code: "forbidden",
      message: details.message,
      requestId: request.id,
      reason: details.reason,
      ...(details.capability ? { capability: details.capability } : {}),
      ...(details.access ? { access: toAccessDecisionView(details.access) } : {}),
    },
  });
}

export interface GuardOptions {
  /** Layer 2 capability required to call the route at all. */
  capability: Capability;
  /**
   * Audit action recorded for both the allow and the denial, in the trail's
   * vocabulary (`modules/audit`): `CREATE_RECORD`, `VIEW_RECORD`,
   * `UPDATE_RECORD`, `LIST_RECORDS`, `LINK_IDENTITY`, `VERIFY_IDENTITY`.
   */
  action: string;
  resourceType?: string;
}

/**
 * Route guard: session + capability.
 *
 * On success it decorates `request.actor` so the handler reasons about a
 * resolved principal instead of re-reading the cookie. On failure it answers
 * (401/403), writes the `blocked` audit row and short-circuits — the handler
 * never runs.
 */
export function requireCapability(options: GuardOptions) {
  const resourceType = options.resourceType ?? "PATIENT";

  return async function rbacGuard(request: FastifyRequest, reply: FastifyReply) {
    const env = request.server.env;
    const patientId = patientIdFromRequest(request);
    const actor = resolveActor(request, env);

    if (!actor) {
      writeAuditEvent({
        actor: null,
        action: options.action,
        resourceType,
        patientId,
        status: "blocked",
        reason: "unauthenticated",
        capability: options.capability,
        requestId: request.id,
      });
      return unauthenticated(request, reply);
    }

    if (!can(actor.role, options.capability)) {
      writeAuditEvent({
        actor,
        action: options.action,
        resourceType,
        patientId,
        status: "blocked",
        reason: "role_not_permitted",
        capability: options.capability,
        requestId: request.id,
      });
      // No capability list in the response: telling a caller what they *could*
      // do is policy disclosure nobody asked for.
      request.log.info(
        { actorId: actor.id, role: actor.role, capability: options.capability },
        "authz.denied role_not_permitted",
      );
      return forbidden(request, reply, {
        reason: "role_not_permitted",
        capability: options.capability,
        message: "Your role is not permitted to perform this action.",
      });
    }

    request.actor = actor;
  };
}

/**
 * In-handler capability check, for requests whose required capability depends
 * on the payload (a PATCH that both edits demographics and records a
 * verification outcome needs two capabilities). Sends the 403 and audits it;
 * returns `false` so the caller can `return` immediately.
 */
export function denyCapability(
  request: FastifyRequest,
  reply: FastifyReply,
  actor: Actor,
  capability: Capability,
  action: string,
  patientId: string | null,
): FastifyReply {
  writeAuditEvent({
    actor,
    action,
    resourceType: "PATIENT",
    patientId,
    status: "blocked",
    reason: "role_not_permitted",
    capability,
    requestId: request.id,
  });
  request.log.info(
    { actorId: actor.id, role: actor.role, capability, patientId },
    "authz.denied role_not_permitted",
  );
  return forbidden(request, reply, {
    reason: "role_not_permitted",
    capability,
    message: "Your role is not permitted to perform this action.",
  });
}

/**
 * Report a Layer 3/4 read denial: 403 with the `AccessDecision` (so the client
 * can render the sealed view and its reason) and a `blocked` audit row — the
 * parity checklist's "denied cross-tenant access returns 403 + blocked audit
 * row" (architecture §5.4, exit criterion of the write-API phase).
 */
export function denyAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  actor: Actor,
  args: { action: string; decision: AccessDecision; patientId: string; capability?: Capability },
): FastifyReply {
  writeAuditEvent({
    actor,
    action: args.action,
    resourceType: "PATIENT",
    resourceId: args.patientId,
    patientId: args.patientId,
    status: "blocked",
    reason: args.decision.reason,
    capability: args.capability ?? null,
    requestId: request.id,
    // The consent artifact the decision turned on, when there is one. This is
    // what `authorizationId` is for; a free-text note would not be queryable.
    authorizationId: args.decision.consent?.id ?? null,
  });
  request.log.info(
    { actorId: actor.id, patientId: args.patientId, reason: args.decision.reason },
    "authz.denied access",
  );
  return forbidden(request, reply, {
    reason: args.decision.reason,
    access: args.decision,
    message: "You do not have access to this patient record.",
  });
}

/**
 * Report a write-scope denial. Consent does not appear here: a consent artifact
 * grants reading, never editing another tenant's registry row
 * (`evaluateWriteAccess`, architecture §4.2).
 */
export function denyWrite(
  request: FastifyRequest,
  reply: FastifyReply,
  actor: Actor,
  args: { action: string; decision: WriteDecision; patientId: string },
): FastifyReply {
  writeAuditEvent({
    actor,
    action: args.action,
    resourceType: "PATIENT",
    resourceId: args.patientId,
    patientId: args.patientId,
    status: "blocked",
    reason: args.decision.reason,
    requestId: request.id,
  });
  request.log.info(
    { actorId: actor.id, patientId: args.patientId, reason: args.decision.reason },
    "authz.denied write scope",
  );
  return forbidden(request, reply, {
    reason: args.decision.reason,
    message:
      args.decision.reason === "no_tenant"
        ? "Your session is not attached to an organization."
        : "This patient record is not owned by your organization.",
  });
}
