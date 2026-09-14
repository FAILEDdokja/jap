import { apiRequest } from "./client";
import type { AccessDecision } from "@/data/store";

/**
 * Patient API types, mirroring `backend/src/modules/patients/schemas.ts`.
 *
 * Two things about this contract are load-bearing for the UI:
 *
 *  - **Identities arrive masked.** The full ABHA number or address never leaves
 *    the server (doc 04 §3), so there is no `value` to render — only `masked`,
 *    plus the verification state that makes an identifier trustworthy.
 *  - **A list row may be sealed.** When the actor's tenant has a consent
 *    artifact for a patient that is not active, the server returns a stub:
 *    id, owning tenant and the decision, with no demographics at all. Rendering
 *    a sealed row like a record would invent data, so the two shapes are a
 *    discriminated union and the list has to handle both.
 */

export type ApiPatientIdentity = {
  id: string;
  type: "ABHA_NUMBER" | "ABHA_ADDRESS";
  /** Masked form only — never the identifier itself. */
  masked: string;
  verified: boolean;
  primary: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

export type ApiPatient = {
  id: string;
  /** Owning tenant: reads are scoped by it, writes are restricted to it. */
  orgId: string;
  status: "provisional" | "registered";
  /** Derived linkage state. Never an access rule — ABHA is not a precondition of care. */
  state: "provisional" | "registered" | "abha_linked";
  name: string;
  gender: string | null;
  dob: string | null;
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  contact: { phone: string | null; address: string | null; email: string | null };
  emergencyContact: { name: string | null; relation: string | null; phone: string | null };
  identities: ApiPatientIdentity[];
  registeredOn: string;
  createdAt: string;
  updatedAt: string;
};

/** A row the actor may read: the record plus the decision that allowed it. */
export type ApiAccessiblePatient = ApiPatient & { sealed: false; access: AccessDecision };

/** A row the actor may know EXISTS but not read. */
export type ApiSealedPatient = { sealed: true; id: string; orgId: string; access: AccessDecision };

export type ApiPatientListItem = ApiAccessiblePatient | ApiSealedPatient;

export type ApiPatientPage = {
  patients: ApiPatientListItem[];
  /** Rows matching the actor's scope AND the filters (the pagination total). */
  total: number;
  /** How many of them are sealed stubs. */
  sealedCount: number;
  limit: number;
  offset: number;
  /** How the list was scoped, so an empty result can be explained. */
  scope: { kind: "platform" | "tenant" | "self" | "none"; orgId: string | null };
};

export type ApiIdentityInput = { type: "ABHA_NUMBER" | "ABHA_ADDRESS"; value: string };

export type ApiCreatePatientInput = {
  /** `provisional` = walk-in/emergency intake with minimal demographics. */
  status?: "provisional" | "registered";
  name: string;
  gender?: "Male" | "Female" | "Other";
  dob?: string;
  bloodGroup?: string;
  heightCm?: number;
  weightKg?: number;
  contact?: { phone?: string; address?: string; email?: string };
  emergencyContact?: { name?: string; relation?: string; phone?: string };
  /**
   * Optional, and never required: care does not wait for an ABHA
   * (architecture §2.4). Declared identifiers are stored UNVERIFIED.
   */
  identities?: ApiIdentityInput[];
};

export type ApiUpdatePatientInput = Partial<Omit<ApiCreatePatientInput, "status" | "identities">> & {
  /** One-way lifecycle transition. */
  status?: "registered";
  /** Declare one more identifier (stored unverified). */
  addIdentity?: ApiIdentityInput;
  /** Mark a declared identity verified — a server-owned transition. */
  markIdentityVerified?: string;
};

export type ApiListPatientsQuery = {
  /** Case-insensitive name match, applied INSIDE the actor's scope. */
  q?: string;
  orgId?: string;
  state?: "provisional" | "registered" | "abha_linked";
  status?: "provisional" | "registered";
  limit?: number;
  offset?: number;
};

function queryString(query: ApiListPatientsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export async function listPatients(query: ApiListPatientsQuery = {}): Promise<ApiPatientPage> {
  return apiRequest<ApiPatientPage>(`/patients${queryString(query)}`);
}

export async function getPatient(id: string) {
  return apiRequest<{ patient: ApiPatient; access: AccessDecision }>(`/patients/${encodeURIComponent(id)}`);
}

export async function createPatient(input: ApiCreatePatientInput) {
  return apiRequest<{ patient: ApiPatient; access: AccessDecision }>("/patients", { method: "POST", body: input }).then((r) => r.patient);
}

export async function updatePatient(id: string, input: ApiUpdatePatientInput) {
  return apiRequest<{ patient: ApiPatient; access: AccessDecision }>(`/patients/${encodeURIComponent(id)}`, { method: "PATCH", body: input }).then((r) => r.patient);
}

/** Narrow a list row to the readable shape. */
export function isAccessible(row: ApiPatientListItem): row is ApiAccessiblePatient {
  return row.sealed === false;
}
