/** In-memory Phase 5 store; its shapes mirror `encounters` and `clinical_records`. */

export type EncounterSetting = "OPD" | "IPD" | "Emergency" | "Teleconsult";
export type EncounterStatus = "in_progress" | "completed" | "cancelled";
export type ClinicalRecordType =
  | "ALLERGY" | "CONDITION" | "MEDICATION" | "NOTE" | "VITAL" | "OBSERVATION"
  | "CONSULTATION" | "DIAGNOSIS" | "PRESCRIPTION" | "LAB_ORDER" | "LAB_RESULT"
  | "PROCEDURE" | "ADMISSION" | "DISCHARGE" | "IMMUNIZATION";

export interface EncounterRecord {
  id: string;
  patientId: string;
  orgId: string;
  facilityName: string | null;
  date: string;
  setting: EncounterSetting;
  status: EncounterStatus;
  clinicianId: string;
  clinicianName: string;
  reason: string | null;
  assessment: string | null;
  disposition: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalRecord {
  id: string;
  patientId: string;
  orgId: string;
  encounterId: string | null;
  type: ClinicalRecordType;
  title: string | null;
  detail: string | null;
  occurredOn: string | null;
  data: Record<string, unknown> | null;
  recordedById: string;
  recordedByName: string;
  correctsId: string | null;
  correctionReason: string | null;
  createdAt: string;
}

const encounters = new Map<string, EncounterRecord>();
const records = new Map<string, ClinicalRecord>();

export function resetCareStore(): void {
  encounters.clear();
  records.clear();
}

export function insertEncounter(record: EncounterRecord): void {
  encounters.set(record.id, record);
}

export function getEncounter(id: string): EncounterRecord | null {
  return encounters.get(id) ?? null;
}

export function listEncounters(patientId: string): EncounterRecord[] {
  return [...encounters.values()]
    .filter((encounter) => encounter.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function updateEncounterRecord(
  id: string,
  mutate: (encounter: EncounterRecord) => void,
): EncounterRecord | null {
  const record = encounters.get(id);
  if (!record) return null;
  mutate(record);
  record.updatedAt = new Date().toISOString();
  return record;
}

export function insertClinicalRecord(record: ClinicalRecord): void {
  records.set(record.id, record);
}

export function getClinicalRecord(id: string): ClinicalRecord | null {
  return records.get(id) ?? null;
}

export function listClinicalRecords(patientId: string): ClinicalRecord[] {
  return [...records.values()]
    .filter((record) => record.patientId === patientId)
    .sort((a, b) => (b.occurredOn ?? b.createdAt).localeCompare(a.occurredOn ?? a.createdAt));
}
