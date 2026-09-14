import { randomUUID } from "node:crypto";
import { getPatient } from "../patients/store.js";
import {
  getClinicalRecord, getEncounter, insertClinicalRecord, insertEncounter, listClinicalRecords,
  listEncounters, resetCareStore, updateEncounterRecord, type ClinicalRecord, type EncounterRecord,
} from "./store.js";
import type { CreateClinicalRecordBody, CreateEncounterBody, UpdateEncounterBody } from "./schemas.js";

export { resetCareStore };
export { getClinicalRecord, getEncounter } from "./store.js";

type Actor = { id: string; name: string; orgId?: string };
type Result<T> = { ok: true; value: T } | { ok: false; code: "patient_not_found" | "encounter_not_found" | "record_not_found" | "invalid_reference"; message: string };

function now(): string { return new Date().toISOString(); }
function patientExists(patientId: string): boolean { return getPatient(patientId) !== null; }

export function createEncounter(patientId: string, actor: Actor, input: CreateEncounterBody): Result<EncounterRecord> {
  const patient = getPatient(patientId);
  if (!patient) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  const timestamp = now();
  const encounter: EncounterRecord = {
    id: randomUUID(), patientId, orgId: actor.orgId ?? patient.orgId, facilityName: input.facilityName ?? null,
    date: input.date, setting: input.setting, status: input.status ?? "in_progress",
    clinicianId: actor.id, clinicianName: actor.name, reason: input.reason ?? null,
    assessment: input.assessment ?? null, disposition: input.disposition ?? null, notes: input.notes ?? null,
    createdAt: timestamp, updatedAt: timestamp,
  };
  insertEncounter(encounter);
  return { ok: true, value: encounter };
}

export function listPatientEncounters(patientId: string): Result<EncounterRecord[]> {
  if (!patientExists(patientId)) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  return { ok: true, value: listEncounters(patientId) };
}

export function updateEncounter(id: string, input: UpdateEncounterBody): Result<EncounterRecord> {
  const encounter = updateEncounterRecord(id, (current) => {
    if (input.date !== undefined) current.date = input.date;
    if (input.setting !== undefined) current.setting = input.setting;
    if (input.status !== undefined) current.status = input.status;
    if (input.facilityName !== undefined) current.facilityName = input.facilityName;
    if (input.reason !== undefined) current.reason = input.reason;
    if (input.assessment !== undefined) current.assessment = input.assessment;
    if (input.disposition !== undefined) current.disposition = input.disposition;
    if (input.notes !== undefined) current.notes = input.notes;
  });
  return encounter
    ? { ok: true, value: encounter }
    : { ok: false, code: "encounter_not_found", message: "Unable to load encounter." };
}

export function createClinicalRecord(patientId: string, actor: Actor, input: CreateClinicalRecordBody): Result<ClinicalRecord> {
  const patient = getPatient(patientId);
  if (!patient) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  if (input.encounterId) {
    const encounter = getEncounter(input.encounterId);
    if (!encounter || encounter.patientId !== patientId) {
      return { ok: false, code: "invalid_reference", message: "Encounter does not belong to this patient." };
    }
  }
  if (input.correctsId) {
    const original = getClinicalRecord(input.correctsId);
    if (!original || original.patientId !== patientId) {
      return { ok: false, code: "record_not_found", message: "Unable to load clinical record to correct." };
    }
  }
  const record: ClinicalRecord = {
    id: randomUUID(), patientId, orgId: actor.orgId ?? patient.orgId, encounterId: input.encounterId ?? null,
    type: input.type, title: input.title ?? null, detail: input.detail ?? null, occurredOn: input.occurredOn ?? null,
    data: input.data ?? null, recordedById: actor.id, recordedByName: actor.name,
    correctsId: input.correctsId ?? null, correctionReason: input.correctionReason ?? null, createdAt: now(),
  };
  insertClinicalRecord(record);
  return { ok: true, value: record };
}

export function listPatientRecords(patientId: string): Result<ClinicalRecord[]> {
  if (!patientExists(patientId)) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  return { ok: true, value: listClinicalRecords(patientId) };
}

export function patientTimeline(patientId: string): Result<Array<{
  id: string; date: string; type: string; title: string; summary: string | null;
  encounterId: string | null; recordedBy: string | null;
}>> {
  if (!patientExists(patientId)) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  const events = [
    ...listEncounters(patientId).map((encounter) => ({
      id: encounter.id, date: encounter.date, type: "ENCOUNTER",
      title: `${encounter.setting} encounter${encounter.reason ? ` — ${encounter.reason}` : ""}`,
      summary: encounter.assessment, encounterId: encounter.id, recordedBy: encounter.clinicianName,
    })),
    ...listClinicalRecords(patientId).map((record) => ({
      id: record.id, date: record.occurredOn ?? record.createdAt.slice(0, 10), type: record.type,
      title: record.title ?? record.type.replace(/_/g, " "), summary: record.detail,
      encounterId: record.encounterId, recordedBy: record.recordedByName,
    })),
  ];
  return { ok: true, value: events.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)) };
}
