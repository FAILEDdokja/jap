import { apiRequest } from "./client";

export type ApiRecord = { id: string; patientId: string; encounterId?: string | null; type: string; status?: string; createdAt: string; updatedAt?: string; [key: string]: unknown };
export type TimelineEvent = { id: string; date: string; type: string; title: string; summary: string | null; encounterId: string | null; recordedBy: string | null };

export async function listRecords(patientId: string) { return (await apiRequest<{ records: ApiRecord[] }>(`/patients/${encodeURIComponent(patientId)}/records`)).records; }
export async function getRecord(id: string) { return (await apiRequest<{ record: ApiRecord }>(`/records/${encodeURIComponent(id)}`)).record; }
export async function createRecord(patientId: string, input: Record<string, unknown>) { return (await apiRequest<{ record: ApiRecord }>(`/patients/${encodeURIComponent(patientId)}/records`, { method: "POST", body: input })).record; }
export async function getTimeline(patientId: string) { return (await apiRequest<{ events: TimelineEvent[] }>(`/patients/${encodeURIComponent(patientId)}/timeline`)).events; }
