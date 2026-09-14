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
  prevEventId: string | null;
  hash: string;
  timestamp: string;
}

const events: AuditEvent[] = [];

export function appendEvent(event: AuditEvent): void { events.push(event); }
export function allEvents(): readonly AuditEvent[] { return events; }
export function resetAuditStore(): void { events.length = 0; }
