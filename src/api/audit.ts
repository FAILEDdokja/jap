import { apiRequest } from "./client";

export type ApiAuditEvent = { id: string; patientId: string | null; actorId: string | null; actorName: string | null; actorRole: string | null; organizationId: string | null; action: string; resourceType: string; resourceId: string | null; status: "success" | "blocked"; timestamp: string; [key: string]: unknown };
export type AuditQuery = { patientId?: string; actorId?: string; action?: string; limit?: number; offset?: number };

export async function listAudit(query: AuditQuery = {}) {
  const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return (await apiRequest<{ events: ApiAuditEvent[] }>(`/audit${params.size ? `?${params}` : ""}`)).events;
}
export async function listPatientAudit(patientId: string) { return (await apiRequest<{ events: ApiAuditEvent[] }>(`/patients/${encodeURIComponent(patientId)}/audit`)).events; }
