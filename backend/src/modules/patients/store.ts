/**
 * Patient store — Phase 4.
 *
 * In-memory demo store that mirrors the Prisma `patients` + `patient_identities`
 * tables one-for-one (backend/prisma/schema.prisma). It exists for the same
 * reason the Phase 3 auth registry does: the API and its tests must run without
 * a reachable database in CI, while keeping every rule the real store enforces:
 *
 *   - opaque UUIDv4 ids (never ABHA-derived, never sequential)
 *   - `patient_identities` is the ONLY place external identifiers live —
 *     the `patients` row carries no ABHA column at all
 *   - identity values are stored canonical (bare digits for ABHA numbers,
 *     lowercase for ABHA addresses) per docs/backend/04 §3
 *   - each identity carries its own verification state (`verified`,
 *     `verifiedAt`) — an ABDM-adapter-owned field, never client-assertable
 *   - `(type, value)` is globally unique (mirrors `PatientIdentity_type_value_key`)
 *
 * Swapping this Map-based store for Prisma changes only this module's
 * internals; the service and route layers keep calling the same functions.
 *
 * Demo ids come from `lib/demo-ids.ts`, the single place the auth registry (a
 * PATIENT account → its record), this store and the consent view agree on them.
 */

import { DEMO_ORG_ID, DEMO_PATIENT_ID, demoUuid } from "../../lib/demo-ids.js";

export type PatientGender = "Male" | "Female" | "Other";

export type PatientIdentityType = "ABHA_NUMBER" | "ABHA_ADDRESS";

/**
 * Lifecycle of the demographic record (Prisma `PatientStatus`):
 *   - `provisional` — walk-in / emergency intake; minimal demographics
 *     captured so care can proceed immediately (ABHA never required)
 *   - `registered`  — complete demographic record
 */
export type PatientStatus = "provisional" | "registered";

/**
 * Derived linkage state returned by the API (NOT stored — always computed):
 *   - `abha_linked` — at least one patient_identity of ABHA type is verified
 *   - `registered`  — complete demographics, no verified ABHA linkage yet
 *   - `provisional` — provisional record, no verified ABHA linkage
 *
 * A verified ABHA is a *linkage* fact about an identifier. It is not
 * authentication (that is the session, Phase 3) and not consent (that is the
 * consent plane, doc 08) — the three live in separate mechanisms by design.
 */
export type PatientState = "provisional" | "registered" | "abha_linked";

export interface PatientIdentityRecord {
  id: string;
  patientId: string;
  /** Tenant under which this identity was registered/verified. */
  orgId: string;
  type: PatientIdentityType;
  /** Canonical value: bare digits (number) / lowercase (address). Never logged in full. */
  value: string;
  /** Display form, e.g. "ABHA •••• 3401" — the only form that leaves the server. */
  masked: string;
  verified: boolean;
  verifiedAt: string | null;
  primary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecord {
  id: string;
  orgId: string;
  status: PatientStatus;
  name: string;
  gender: PatientGender | null;
  /** Calendar date `YYYY-MM-DD` (doc 05 §6) — age is derived, never stored. */
  dob: string | null;
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  contact: { phone: string | null; address: string | null; email: string | null };
  emergencyContact: { name: string | null; relation: string | null; phone: string | null };
  registeredOn: string;
  createdAt: string;
  updatedAt: string;
}

// ── In-memory tables ─────────────────────────────────────────────────────────

const patients = new Map<string, PatientRecord>();
const identities = new Map<string, PatientIdentityRecord>();
/** Canonical (type, value) → identity id. Enforces the DB's unique index. */
const identityKeys = new Map<string, string>();
/** Insertion order preserved for stable list responses. */
let patientOrder: string[] = [];

function identityKey(type: PatientIdentityType, value: string): string {
  return `${type}:${value}`;
}

export function findIdentityByValue(
  type: PatientIdentityType,
  canonicalValue: string,
): PatientIdentityRecord | null {
  const id = identityKeys.get(identityKey(type, canonicalValue));
  return id ? (identities.get(id) ?? null) : null;
}

export function listIdentitiesFor(patientId: string): PatientIdentityRecord[] {
  return [...identities.values()]
    .filter((i) => i.patientId === patientId)
    .sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));
}

export function getPatient(id: string): PatientRecord | null {
  return patients.get(id) ?? null;
}

/** All patients in insertion order (the service filters/derives on top). */
export function allPatients(): PatientRecord[] {
  return patientOrder.map((id) => patients.get(id)!).filter(Boolean);
}

/** Canonicalization + masking (docs/backend/04 §3 — locked behavior). */

/** `23-4567-8912-3401` / `23456789123401` / ` 23 4567…` → `23456789123401`. */
export function canonicalizeAbhaNumber(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** `Amit.Kumar@ABDM` / ` amit.kumar@abdm ` → `amit.kumar@abdm`. */
export function canonicalizeAbhaAddress(value: string): string {
  return String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

/** Masking: `ABHA •••• <last-4-digits>` — only the tail is ever handed back. */
export function maskAbhaNumber(canonical14Digits: string): string {
  return `ABHA •••• ${canonical14Digits.slice(-4)}`;
}

/** Address masking: keep the domain, hide the local part — `••••@abdm`. */
export function maskAbhaAddress(canonicalAddress: string): string {
  const at = canonicalAddress.indexOf("@");
  return at < 0 ? "••••" : `••••${canonicalAddress.slice(at)}`;
}

// ── Mutations (called by the service layer only) ─────────────────────────────

export function insertPatient(record: PatientRecord): PatientRecord {
  patients.set(record.id, record);
  patientOrder.push(record.id);
  return record;
}

export function insertIdentity(record: PatientIdentityRecord): PatientIdentityRecord {
  identities.set(record.id, record);
  identityKeys.set(identityKey(record.type, record.value), record.id);
  return record;
}

export function getIdentity(id: string): PatientIdentityRecord | null {
  return identities.get(id) ?? null;
}

export function updatePatientRecord(id: string, mutate: (p: PatientRecord) => void): PatientRecord | null {
  const p = patients.get(id);
  if (!p) return null;
  mutate(p);
  p.updatedAt = new Date().toISOString();
  return p;
}

export function updateIdentityRecord(id: string, mutate: (i: PatientIdentityRecord) => void): PatientIdentityRecord | null {
  const i = identities.get(id);
  if (!i) return null;
  mutate(i);
  i.updatedAt = new Date().toISOString();
  return i;
}

// ── Seed ─────────────────────────────────────────────────────────────────────
// Deterministic synthetic demo data mirroring src/data/seed.ts (frontend) so
// the demo replay reaches the same patients. All values are fabricated.

const uuid = demoUuid;

const SEED_T = "2026-09-10T09:30:00.000Z";

interface SeedIdentity {
  type: PatientIdentityType;
  /** Already-canonical value (bare digits / lowercase). */
  value: string;
  verified: boolean;
}

interface SeedPatient {
  id: string;
  orgId: string;
  name: string;
  gender?: PatientGender;
  dob?: string;
  status?: PatientStatus;
  bloodGroup?: string;
  heightCm?: number;
  weightKg?: number;
  phone?: string;
  address?: string;
  email?: string;
  emergency?: { name: string; relation: string; phone: string };
  identities?: SeedIdentity[];
}

const SEED_PATIENTS: SeedPatient[] = [
  {
    id: DEMO_PATIENT_ID.amitKumar, orgId: DEMO_ORG_ID.nmc, name: "Amit Kumar", gender: "Male", dob: "1991-03-14",
    bloodGroup: "B+", heightCm: 172, weightKg: 81,
    phone: "98230 45671", address: "House 22, Panchavati, Nashik, Maharashtra 422003",
    email: "amit.kumar@abdm.example.in",
    emergency: { name: "Sunita Kumar", relation: "Spouse", phone: "98230 45672" },
    identities: [
      { type: "ABHA_NUMBER", value: "23456789123401", verified: true },
      { type: "ABHA_ADDRESS", value: "amit.kumar@abdm", verified: true },
    ],
  },
  {
    id: DEMO_PATIENT_ID.priyaPatel, orgId: DEMO_ORG_ID.nmc, name: "Priya Patel", gender: "Female", dob: "1985-11-02",
    bloodGroup: "O+", heightCm: 160, weightKg: 58,
    phone: "98500 21436", address: "Flat 4B, Adgaon Road, Nashik, Maharashtra 422009",
    emergency: { name: "Nikhil Patel", relation: "Brother", phone: "98500 21437" },
    identities: [
      { type: "ABHA_NUMBER", value: "34567891234502", verified: true },
      { type: "ABHA_ADDRESS", value: "priya.patel@abdm", verified: true },
    ],
  },
  {
    id: DEMO_PATIENT_ID.rahulSharma, orgId: DEMO_ORG_ID.nmc, name: "Rahul Sharma", gender: "Male", dob: "1978-07-21",
    bloodGroup: "A-", heightCm: 175, weightKg: 70,
    phone: "98909 76512", address: "Shop 3, College Road, Nashik, Maharashtra 422005",
    emergency: { name: "Meena Sharma", relation: "Spouse", phone: "98909 76513" },
    identities: [
      { type: "ABHA_NUMBER", value: "45678912345603", verified: true },
      { type: "ABHA_ADDRESS", value: "rahul.sharma@abdm", verified: true },
    ],
  },
  {
    id: DEMO_PATIENT_ID.sunitaDeshmukh, orgId: DEMO_ORG_ID.sanjivani, name: "Sunita Deshmukh", gender: "Female", dob: "1963-01-09",
    bloodGroup: "AB+", heightCm: 156, weightKg: 61,
    phone: "97640 33218", address: "Lane 5, Kothrud, Pune, Maharashtra 411038",
    emergency: { name: "Arjun Deshmukh", relation: "Son", phone: "97640 33219" },
    identities: [
      { type: "ABHA_NUMBER", value: "56789012345604", verified: true },
      { type: "ABHA_ADDRESS", value: "sunita.deshmukh@abdm", verified: true },
    ],
  },
  {
    id: DEMO_PATIENT_ID.iqbalAnsari, orgId: DEMO_ORG_ID.sanjivani, name: "Iqbal Ansari", gender: "Male", dob: "1968-05-30",
    bloodGroup: "B-", heightCm: 170, weightKg: 74,
    phone: "96070 55412", address: "24 Camp Road, Pune, Maharashtra 411001",
    emergency: { name: "Rukhsana Ansari", relation: "Spouse", phone: "96070 55413" },
    identities: [
      { type: "ABHA_NUMBER", value: "67890123456705", verified: true },
      { type: "ABHA_ADDRESS", value: "iqbal.ansari@abdm", verified: true },
    ],
  },
  // Registered but ABHA *not* verified — linkage state stays `registered`
  // despite identifiers being on file. Verification is a separate fact.
  {
    id: DEMO_PATIENT_ID.meeraJoshi, orgId: DEMO_ORG_ID.nmc, name: "Meera Joshi", gender: "Female", dob: "1997-09-19",
    bloodGroup: "O-", heightCm: 163, weightKg: 64,
    phone: "95030 71190", address: "Plot 9, Indira Nagar, Nashik, Maharashtra 422009",
    emergency: { name: "Rohit Joshi", relation: "Spouse", phone: "95030 71191" },
    identities: [
      { type: "ABHA_NUMBER", value: "78901234567806", verified: false },
      { type: "ABHA_ADDRESS", value: "meera.joshi@abdm", verified: false },
    ],
  },
  // Walk-in intake with NO ABHA whatsoever — healthcare delivery must proceed
  // without one (this phase's central constraint). Provisional lifecycle.
  {
    id: DEMO_PATIENT_ID.vitthalShinde, orgId: DEMO_ORG_ID.nmc, name: "Vitthal Shinde (Emergency Intake)",
    status: "provisional",
    phone: "90000 00001",
  },
];

/**
 * (Re)build the demo tables. Called once at import so the running server has a
 * populated registry, and again by tests in `beforeEach` to start from a known
 * state. Without the import-time call the API boots with an empty store: every
 * list answers `total: 0` and every record read answers 404, while the test
 * suite — which resets explicitly — stays green. That gap is why this line is
 * here rather than left to a caller.
 */
export function resetPatientStore(): void {
  patients.clear();
  identities.clear();
  identityKeys.clear();
  patientOrder = [];

  // Identity ids are minted from ONE running counter across all patients.
  // (A per-patient counter produced colliding ids, and because `identities` is
  // keyed by id the later rows silently overwrote the earlier ones — every
  // seeded patient but the last appeared to have no identifiers at all. A
  // per-patient *stride* fixes the seeded data but collides again the moment a
  // patient carries more identities than the stride allows.)
  let identitySeq = 0x200;

  for (const s of SEED_PATIENTS) {
    insertPatient({
      id: s.id,
      orgId: s.orgId,
      status: s.status ?? "registered",
      name: s.name,
      gender: s.gender ?? null,
      dob: s.dob ?? null,
      bloodGroup: s.bloodGroup ?? null,
      heightCm: s.heightCm ?? null,
      weightKg: s.weightKg ?? null,
      contact: { phone: s.phone ?? null, address: s.address ?? null, email: s.email ?? null },
      emergencyContact: s.emergency
        ? { name: s.emergency.name, relation: s.emergency.relation, phone: s.emergency.phone }
        : { name: null, relation: null, phone: null },
      registeredOn: SEED_T,
      createdAt: SEED_T,
      updatedAt: SEED_T,
    });

    let isFirstNumber = true;
    (s.identities ?? []).forEach((ident) => {
      insertIdentity({
        id: uuid(identitySeq++),
        patientId: s.id,
        orgId: s.orgId,
        type: ident.type,
        value: ident.value,
        masked: ident.type === "ABHA_NUMBER" ? maskAbhaNumber(ident.value) : maskAbhaAddress(ident.value),
        verified: ident.verified,
        verifiedAt: ident.verified ? SEED_T : null,
        // First ABHA number on file acts as the primary identifier.
        primary: ident.type === "ABHA_NUMBER" && isFirstNumber,
        createdAt: SEED_T,
        updatedAt: SEED_T,
      });
      if (ident.type === "ABHA_NUMBER") isFirstNumber = false;
    });
  }
}

// Populate on import — see resetPatientStore()'s note.
resetPatientStore();
