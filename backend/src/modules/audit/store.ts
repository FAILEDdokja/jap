export type AuditStatus = "success" | "blocked";

export interface AuditEvent {
  id: string;
  sequence: number;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  organizationId: string | null;
  patientId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: string | null;
  authorizationId: string | null;
  requestId: string | null;
  status: AuditStatus;
  /**
   * Why the decision was what it was. For a denial: the `AccessDecision` reason
   * (`no_consent`, `consent_pending`, `cross_tenant_write`, …),
   * `role_not_permitted` for a role/capability denial, `unauthenticated` for a
   * missing or revoked session, or a module-level refusal code
   * (`identity_conflict`, `invalid_transition`). Null on plain successes.
   */
  reason: string | null;
  /** Capability checked, when the decision was a role/capability one. */
  capability: string | null;
  prevEventId: string | null;
  hash: string;
  timestamp: string;
}

const events: AuditEvent[] = [];

export function appendEvent(event: AuditEvent): void { events.push(event); }
export function allEvents(): readonly AuditEvent[] { return events; }
export function resetAuditStore(): void { events.length = 0; }
