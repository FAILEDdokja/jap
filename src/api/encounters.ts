import { apiRequest } from "./client";

export type ApiEncounter = { id: string; patientId: string; organizationId: string; practitionerId?: string | null; status: string; type?: string | null; startedAt: string; endedAt?: string | null; summary?: string | null; [key: string]: unknown };

export async function listEncounters(patientId: string) { return (await apiRequest<{ encounters: ApiEncounter[] }>(`/patients/${encodeURIComponent(patientId)}/encounters`)).encounters; }
export async function getEncounter(id: string) { return (await apiRequest<{ encounter: ApiEncounter }>(`/encounters/${encodeURIComponent(id)}`)).encounter; }
export async function createEncounter(patientId: string, input: Record<string, unknown>) { return (await apiRequest<{ encounter: ApiEncounter }>(`/patients/${encodeURIComponent(patientId)}/encounters`, { method: "POST", body: input })).encounter; }
export async function updateEncounter(id: string, input: Record<string, unknown>) { return (await apiRequest<{ encounter: ApiEncounter }>(`/encounters/${encodeURIComponent(id)}`, { method: "PATCH", body: input })).encounter; }
