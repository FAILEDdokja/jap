import { apiRequest } from "./client";

export type ApiPatient = {
  id: string; orgId: string; status: string; state: string; name: string; gender: string | null; dob: string | null;
  bloodGroup: string | null; heightCm: number | null; weightKg: number | null;
  contact: { phone?: string | null; email?: string | null }; emergencyContact: { name?: string | null; phone?: string | null } | null;
  identities: Array<{ type: string; value: string }>; registeredOn: string; createdAt: string; updatedAt: string;
};

export async function listPatients() { return (await apiRequest<{ patients: ApiPatient[] }>("/patients")).patients; }
export async function getPatient(id: string) { return (await apiRequest<{ patient: ApiPatient }>(`/patients/${encodeURIComponent(id)}`)).patient; }
export async function createPatient(input: Partial<ApiPatient>) { return (await apiRequest<{ patient: ApiPatient }>("/patients", { method: "POST", body: input })).patient; }
export async function updatePatient(id: string, input: Partial<ApiPatient>) { return (await apiRequest<{ patient: ApiPatient }>(`/patients/${encodeURIComponent(id)}`, { method: "PATCH", body: input })).patient; }
