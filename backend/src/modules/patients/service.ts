/**
 * Patient service — Phase 4.
 *
 * Business rules over the patient store, encoding the phase's constraints:
 *
 *   1. ABHA is NEVER mandatory for healthcare delivery. A patient can be
 *      created with zero identities, live provisionally, be registered,
 *      treated and discharged — all without any ABHA ever existing.
 *   2. `patient_identities` is the single mapping point for external
 *      identifiers (ABHA number / ABHA address). The patient row itself
 *      carries none.
 *   3. ABHA verification state is server-owned. Declared ≠ verified: an
 *      identifier arrives unverified and only an explicit server-side
 *      transition (in production, the ABDM verification adapter after a
 *      successful doc 04 §6 confirm) flips it.
 *   4. ABHA ≠ authentication ≠ consent. Linkage state (`abha_linked`) is a
 *      data fact about an identifier; sessions (Phase 3) and the consent
 *      plane (doc 08) remain separate mechanisms.
 *   5. Identity values are canonicalized at the boundary, matched canonically
 *      and unique per (type, value) — doc 04 §3's locked matching rules.
 *   6. Only masked identifiers ever leave the server; no ABHA in logs.
 */

import { randomUUID } from "node:crypto";
import {
  allPatients,
  findIdentityByValue,
  getIdentity,
  getPatient,
  insertIdentity,
  insertPatient,
  listIdentitiesFor,
  maskAbhaAddress,
  maskAbhaNumber,
  updateIdentityRecord,
  updatePatientRecord,
  type PatientIdentityRecord,
  type PatientRecord,
  type PatientState,
  type PatientStatus,
} from "./store.js";
import type {
  CreatePatientBody,
  ListPatientsQuery,
  PatientView,
  UpdatePatientBody,
} from "./schemas.js";

export { resetPatientStore } from "./store.js";

export interface ServiceError {
  code: "identity_conflict" | "identity_not_found" | "invalid_transition";
  message: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

/** A verified ABHA identity (number OR address) ⇒ `abha_linked`. */
export function deriveState(patient: PatientRecord, identities: PatientIdentityRecord[]): PatientState {
  const hasVerifiedAbha = identities.some(
    (i) => (i.type === "ABHA_NUMBER" || i.type === "ABHA_ADDRESS") && i.verified,
  );
  if (hasVerifiedAbha) return "abha_linked";
  return patient.status; // provisional | registered
}

function toIdentityView(i: PatientIdentityRecord) {
  return {
    id: i.id,
    type: i.type,
    masked: i.masked,
    verified: i.verified,
    primary: i.primary,
    verifiedAt: i.verifiedAt,
    createdAt: i.createdAt,
  };
}

function toPatientView(patient: PatientRecord, identities: PatientIdentityRecord[]): PatientView {
  return {
    id: patient.id,
    orgId: patient.orgId,
    status: patient.status,
    state: deriveState(patient, identities),
    name: patient.name,
    gender: patient.gender,
    dob: patient.dob,
    bloodGroup: patient.bloodGroup,
    heightCm: patient.heightCm,
    weightKg: patient.weightKg,
    contact: { ...patient.contact },
    emergencyContact: { ...patient.emergencyContact },
    identities: identities.map(toIdentityView),
    registeredOn: patient.registeredOn,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function validDob(dob: string): boolean {
  return !Number.isNaN(new Date(`${dob}T00:00:00Z`).getTime());
}

/**
 * Create a patient. `input.identities` values arrive canonical (the Zod
 * schema transforms them). Identifiers are stored UNVERIFIED.
 */
export function createPatient(
  ctx: { orgId: string },
  input: CreatePatientBody,
): Result<PatientView> {
  const status: PatientStatus =
    input.status ?? (input.gender && input.dob ? "registered" : "provisional");

  // A registered record requires complete demographics; provisional needs a
  // name only (emergency intake often has nothing else — ABHA least of all).
  if (status === "registered") {
    if (!input.gender || !input.dob) {
      return {
        ok: false,
        error: {
          code: "invalid_transition",
          message:
            "A registered patient requires gender and dob. Create the record as provisional instead.",
        },
      };
    }
    if (!validDob(input.dob)) {
      return {
        ok: false,
        error: { code: "invalid_transition", message: "dob must be a real calendar date." },
      };
    }
  }

  // Uniqueness of (type, value) across ALL patients (mirrors the DB unique
  // index). Comparison is on canonical values, so formatting/case variants
  // of the same identifier conflict — doc 04 §3.
  for (const ident of input.identities ?? []) {
    if (findIdentityByValue(ident.type, ident.value)) {
      return {
        ok: false,
        error: {
          code: "identity_conflict",
          message: "This identifier is already linked to a patient record.",
        },
      };
    }
  }

  const now = nowIso();
  const record: PatientRecord = {
    id: randomUUID(),
    orgId: ctx.orgId,
    status,
    name: input.name,
    gender: input.gender ?? "Other",
    dob: input.dob ?? "1980-01-01",
    bloodGroup: input.bloodGroup ?? null,
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    contact: {
      phone: input.contact?.phone ?? null,
      address: input.contact?.address ?? null,
      email: input.contact?.email ?? null,
    },
    emergencyContact: {
      name: input.emergencyContact?.name ?? null,
      relation: input.emergencyContact?.relation ?? null,
      phone: input.emergencyContact?.phone ?? null,
    },
    registeredOn: now,
    createdAt: now,
    updatedAt: now,
  };
  insertPatient(record);

  let isFirstNumber = true;
  for (const ident of input.identities ?? []) {
    insertIdentity({
      id: randomUUID(),
      patientId: record.id,
      orgId: ctx.orgId,
      type: ident.type,
      value: ident.value,
      masked: ident.type === "ABHA_NUMBER" ? maskAbhaNumber(ident.value) : maskAbhaAddress(ident.value),
      // Declared ≠ verified. Only markIdentityVerified (server-side,
      // ABDM-adapter-owned) flips this.
      verified: false,
      verifiedAt: null,
      primary: ident.type === "ABHA_NUMBER" && isFirstNumber,
      createdAt: now,
      updatedAt: now,
    });
    if (ident.type === "ABHA_NUMBER") isFirstNumber = false;
  }

  return { ok: true, value: toPatientView(record, listIdentitiesFor(record.id)) };
}

export function getPatientView(id: string): PatientView | null {
  const patient = getPatient(id);
  if (!patient) return null;
  return toPatientView(patient, listIdentitiesFor(id));
}

export function listPatientViews(query: ListPatientsQuery): {
  patients: PatientView[];
  total: number;
  limit: number;
  offset: number;
} {
  const q = query.q?.trim().toLowerCase() ?? null;

  const views: PatientView[] = [];
  for (const patient of allPatients()) {
    const identities = listIdentitiesFor(patient.id);
    if (q && !patient.name.toLowerCase().includes(q)) continue;
    if (query.orgId && patient.orgId !== query.orgId) continue;
    if (query.status && patient.status !== query.status) continue;
    if (query.state) {
      const state = deriveState(patient, identities);
      if (state !== query.state) continue;
    }
    views.push(toPatientView(patient, identities));
  }

  const total = views.length;
  const page = views.slice(query.offset, query.offset + query.limit);
  return { patients: page, total, limit: query.limit, offset: query.offset };
}

/**
 * Update demographics, declare one more identity, or record a server-side
 * verification outcome. `null` result ⇒ patient id unknown (routes map that
 * to 404 with no oracle).
 */
export function updatePatient(
  id: string,
  patch: UpdatePatientBody,
): Result<PatientView | null> {
  const patient = getPatient(id);
  if (!patient) return { ok: true, value: null };

  if (patch.status === "registered" && patient.status === "provisional") {
    // Registering a provisional record requires complete demographics —
    // supply them in the same PATCH or complete them first.
    const name = patch.name ?? patient.name;
    const gender = patch.gender ?? patient.gender;
    const dob = patch.dob ?? patient.dob;
    if (!name.trim() || !gender || !dob || !validDob(dob)) {
      return {
        ok: false,
        error: {
          code: "invalid_transition",
          message:
            "Registering a provisional patient requires name, gender and a valid dob.",
        },
      };
    }
  }

  updatePatientRecord(id, (p) => {
    if (patch.name !== undefined) p.name = patch.name;
    if (patch.gender !== undefined) p.gender = patch.gender;
    if (patch.dob !== undefined) p.dob = patch.dob;
    if (patch.bloodGroup !== undefined) p.bloodGroup = patch.bloodGroup;
    if (patch.heightCm !== undefined) p.heightCm = patch.heightCm;
    if (patch.weightKg !== undefined) p.weightKg = patch.weightKg;
    if (patch.contact) {
      if (patch.contact.phone !== undefined) p.contact.phone = patch.contact.phone;
      if (patch.contact.address !== undefined) p.contact.address = patch.contact.address;
      if (patch.contact.email !== undefined) p.contact.email = patch.contact.email;
    }
    if (patch.emergencyContact) {
      if (patch.emergencyContact.name !== undefined) p.emergencyContact.name = patch.emergencyContact.name;
      if (patch.emergencyContact.relation !== undefined) p.emergencyContact.relation = patch.emergencyContact.relation;
      if (patch.emergencyContact.phone !== undefined) p.emergencyContact.phone = patch.emergencyContact.phone;
    }
    // One-way lifecycle transition: provisional → registered. Never back.
    if (patch.status === "registered" && p.status === "provisional") p.status = "registered";
  });

  // Declare one more external identifier (stored unverified; conflict if the
  // canonical (type, value) already exists anywhere).
  if (patch.addIdentity) {
    const ident = patch.addIdentity;
    if (findIdentityByValue(ident.type, ident.value)) {
      return {
        ok: false,
        error: {
          code: "identity_conflict",
          message: "This identifier is already linked to a patient record.",
        },
      };
    }
    const now = nowIso();
    const hasPrimaryNumber = listIdentitiesFor(id).some(
      (i) => i.type === "ABHA_NUMBER" && i.primary,
    );
    insertIdentity({
      id: randomUUID(),
      patientId: id,
      orgId: patient.orgId,
      type: ident.type,
      value: ident.value,
      masked: ident.type === "ABHA_NUMBER" ? maskAbhaNumber(ident.value) : maskAbhaAddress(ident.value),
      verified: false,
      verifiedAt: null,
      primary: ident.type === "ABHA_NUMBER" && !hasPrimaryNumber,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Server-side verification transition (production: ABDM adapter callback
  // after doc 04 §6 confirm). The identity must belong to THIS patient —
  // a foreign or unknown id is a 404, never a cross-patient oracle.
  if (patch.markIdentityVerified) {
    const identity = getIdentity(patch.markIdentityVerified);
    if (!identity || identity.patientId !== id) {
      return {
        ok: false,
        error: {
          code: "identity_not_found",
          message: "No such identifier on this patient record.",
        },
      };
    }
    updateIdentityRecord(identity.id, (i) => {
      i.verified = true;
      i.verifiedAt = nowIso();
    });
  }

  return { ok: true, value: toPatientView(patient, listIdentitiesFor(id)) };
}


