import { createHash, randomUUID } from "node:crypto";
import { allEvents, appendEvent, resetAuditStore, type AuditEvent, type AuditStatus } from "./store.js";

export { resetAuditStore };

/** Widened to `null`/optional so an authorization layer can audit an attempt
 *  whose session is missing or whose principal has no tenant. */
type Actor = { id: string; name: string; role: string; orgId?: string | null };
/**
 * Every optional field accepts `null` as well as `undefined`: the stored event
 * is nullable across the board, and an authorization layer routinely audits an
 * attempt it could not attribute (no session, no record, no tenant).
 */
export interface WriteAuditEvent {
  actor?: Actor | null;
  patientId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  purpose?: string | null;
  authorizationId?: string | null;
  requestId?: string | null;
  status?: AuditStatus;
  /** Decision reason — see `AuditEvent.reason`. */
  reason?: string | null;
  /** Capability checked, for role/capability decisions. */
  capability?: string | null;
}

/** Hashes only opaque identifiers and metadata — never clinical data, ABHA, or credentials. */
function canonicalEnvelope(event: Omit<AuditEvent, "hash">): string {
  return JSON.stringify({
    sequence: event.sequence, actorId: event.actorId, organizationId: event.organizationId,
    patientId: event.patientId, action: event.action, resourceType: event.resourceType,
    resourceId: event.resourceId, purpose: event.purpose, authorizationId: event.authorizationId,
    requestId: event.requestId, status: event.status, reason: event.reason, capability: event.capability,
    prevEventId: event.prevEventId, timestamp: event.timestamp,
  });
}

export function writeAuditEvent(input: WriteAuditEvent): AuditEvent {
  const previous = allEvents().at(-1) ?? null;
  const eventWithoutHash = {
    id: randomUUID(), sequence: (previous?.sequence ?? 0) + 1,
    actorId: input.actor?.id ?? null, actorName: input.actor?.name ?? null, actorRole: input.actor?.role ?? null,
    organizationId: input.actor?.orgId ?? null, patientId: input.patientId ?? null,
    action: input.action, resourceType: input.resourceType, resourceId: input.resourceId ?? null,
    purpose: input.purpose ?? null, authorizationId: input.authorizationId ?? null, requestId: input.requestId ?? null,
    status: input.status ?? "success", reason: input.reason ?? null, capability: input.capability ?? null,
    prevEventId: previous?.id ?? null, timestamp: new Date().toISOString(),
  } satisfies Omit<AuditEvent, "hash">;
  const hash = createHash("sha256").update(canonicalEnvelope(eventWithoutHash)).digest("hex");
  const event: AuditEvent = { ...eventWithoutHash, hash };
  appendEvent(event);
  return event;
}

export function listAuditEvents(query: { patientId?: string; actorId?: string; action?: string; limit: number; offset: number }) {
  const filtered = allEvents().filter((event) =>
    (!query.patientId || event.patientId === query.patientId) &&
    (!query.actorId || event.actorId === query.actorId) &&
    (!query.action || event.action === query.action),
  ).slice().reverse();
  return { events: filtered.slice(query.offset, query.offset + query.limit), total: filtered.length, limit: query.limit, offset: query.offset };
}
