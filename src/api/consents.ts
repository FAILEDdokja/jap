import { apiRequest } from "./client";

export type ConsentStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "REVOKED" | "EXPIRED";
export type ApiConsent = { id: string; patientId: string; requesterId: string; requesterName: string; requesterOrganizationId: string; purpose: string; recordTypes: string[]; validFrom?: string | null; validUntil?: string | null; status: ConsentStatus; createdAt: string; decidedAt?: string | null; decidedById?: string | null; revokedAt?: string | null; note?: string | null };

export async function listConsents(query?: { patientId?: string }) {
  const params = new URLSearchParams(query?.patientId ? { patientId: query.patientId } : undefined);
  return (await apiRequest<{ consents: ApiConsent[] }>(`/consents${params.size ? `?${params}` : ""}`)).consents;
}
export async function getConsent(id: string) { return (await apiRequest<{ consent: ApiConsent }>(`/consents/${encodeURIComponent(id)}`)).consent; }
export async function createConsent(input: Record<string, unknown>) { return (await apiRequest<{ consent: ApiConsent }>("/consents", { method: "POST", body: input })).consent; }
export async function approveConsent(id: string, note?: string) { return (await apiRequest<{ consent: ApiConsent }>(`/consents/${encodeURIComponent(id)}/approve`, { method: "POST", body: { note } })).consent; }
export async function rejectConsent(id: string, note?: string) { return (await apiRequest<{ consent: ApiConsent }>(`/consents/${encodeURIComponent(id)}/reject`, { method: "POST", body: { note } })).consent; }
export async function revokeConsent(id: string, note?: string) { return (await apiRequest<{ consent: ApiConsent }>(`/consents/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { note } })).consent; }
