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
 *      plane (doc 08) remain separate mechanisms. Nothing in this file reads
 *      an identity to decide access.
 *   5. Identity values are canonicalized at the boundary, matched canonically
 *      and unique per (type, value) — doc 04 §3's locked matching rules.
 *   6. Only masked identifiers ever leave the server; no ABHA in logs.
 *   7. **Every entry point takes the actor.** There is no unscoped read: the
 *      tenant scope and the access decision are applied here, not left to the
 *      caller's discretion (architecture §4.1 — one implementation, shared by
 *      every patient-data route).
 *
 * Layering: this file decides *what is required and what is visible*;
 * `middleware/rbac.ts` decides *how a denial is reported* (status, envelope,
 * audit row). Keeping the two apart is what lets the same rules serve a future
 * bundle/timeline endpoint without duplicating them.
 */

import { randomUUID } from "node:crypto";
import { can, type Capability } from "../../lib/permissions.js";
import {
  evaluateAccess,
  evaluateWriteAccess,
  isVisible,
  resolveVisibility,
  type AccessDecision,
  type Actor,
  type WriteDecision,
} from "../../services/access-service.js";
import type { AccessDecisionView } from "../../services/access-schemas.js";
import { toAccessDecisionView } from "../../services/access-schemas.js";
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
  code:
    | "identity_conflict"
    | "identity_not_found"
    | "invalid_transition"
    /** Actor has no tenant — fail closed (no basis for ownership). */
    | "no_tenant";
  message: string;
  /** Present for `no_tenant` so the route can answer 403 rather than 400. */
  reason?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

/** What a list row looks like on the wire (see schemas.ts). */
export type PatientListItem =
  | (PatientView & { sealed: false; access: AccessDecisionView })
  | { sealed: true; id: string; orgId: string; access: AccessDecisionView };

export interface PatientListResult {
  patients: PatientListItem[];
  total: number;
  /** How many listed rows are sealed stubs (no demographics). */
  sealedCount: number;
  limit: number;
  offset: number;
  /** How the list was scoped — transparency for the caller, not a control. */
  scope: { kind: "platform" | "tenant" | "self" | "none"; orgId: string | null };
}

/** Discriminated outcomes so routes map each to one status, unambiguously. */
export type ReadResult =
  | { kind: "not_found" }
  | { kind: "denied"; decision: AccessDecision }
  | { kind: "ok"; patient: PatientView; access: AccessDecision };

export type UpdateResult =
  | { kind: "not_found" }
  /** Payload needs a capability the actor's role does not hold. */
  | { kind: "missing_capability"; capability: Capability }
  | { kind: "denied_write"; decision: WriteDecision }
  | { kind: "rejected"; error: ServiceError }
  | {
      kind: "ok";
      patient: PatientView;
      access: AccessDecision;
      /** Identity whose verification outcome was recorded, when the patch did. */
      verifiedIdentityId: string | null;
    };

/** Capability → audit action for the patient registry (Layer 5 vocabulary). */
/**
 * Audit action vocabulary for the registry, in the trail's own names
 * (`modules/audit`): `CREATE_RECORD` / `VIEW_RECORD` / `UPDATE_RECORD` are the
 * actions the other modules already write, so one feed reads consistently, and
 * the three registry-specific ones follow the same convention. Capabilities keep
 * their dotted names — they are the permission vocabulary, not the trail's.
 */
export type PatientAuditAction =
  | "CREATE_RECORD"
  | "VIEW_RECORD"
  | "UPDATE_RECORD"
  | "LIST_RECORDS"
  | "LINK_IDENTITY"
  | "VERIFY_IDENTITY";

export const CAPABILITY_AUDIT_ACTION: Partial<Record<Capability, PatientAuditAction>> = {
  "patient.register": "CREATE_RECORD",
  "patient.read": "VIEW_RECORD",
  "patient.search": "LIST_RECORDS",
  "patient.update": "UPDATE_RECORD",
  "patient.link_identity": "LINK_IDENTITY",
  "patient.verify_identity": "VERIFY_IDENTITY",
};

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
  const date = new Date(`${dob}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dob;
}

/**
 * Create a patient **in the actor's own tenant**.
 *
 * The tenant is taken from the session and never from the payload: there is no
 * `orgId` in `CreatePatientBody`, and a record cannot be created into another
 * organization's registry (architecture §4.2). `input.identities` values arrive
 * canonical (the Zod schema transforms them) and are stored UNVERIFIED.
 */
export function createPatient(actor: Actor, input: CreatePatientBody): Result<{
  patient: PatientView;
  access: AccessDecision;
}> {
  if (!actor.orgId) {
    return {
      ok: false,
      error: {
        code: "no_tenant",
        reason: "no_tenant",
        message: "Your session is not attached to an organization.",
      },
    };
  }

  // Lifecycle on arrival:
  //   - explicit `status` wins (and `registered` is validated below);
  //   - omitted + complete demographics (gender AND dob) ⇒ `registered`;
  //   - omitted + incomplete demographics ⇒ `provisional`.
  // Incomplete intake is downgraded, never rejected: a missing dob must not
  // block care, which is the same principle that keeps ABHA optional (doc 04,
  // doc 08 §1). The alternative — defaulting an omitted `status` to
  // `registered` and answering 400 "create the record as provisional instead" —
  // refuses an emergency intake that the lifecycle already has a state for, so
  // it is deliberately not kept. An EXPLICIT `status: "registered"` without
  // gender+dob is still refused: the caller asked for a complete record.
  const status: PatientStatus =
    input.status ?? (input.gender && input.dob ? "registered" : "provisional");

  // An explicitly `registered` record must actually be complete. A provisional
  // one needs a name only (emergency intake often has nothing else — ABHA least
  // of all), and gets placeholder demographics below because the columns are
  // NOT NULL in `prisma/schema.prisma` (`gender`, `dob`).
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
  // index). Comparison is on canonical values, so formatting/case variants of
  // the same identifier conflict — doc 04 §3. Note this is deliberately
  // platform-wide, not tenant-scoped: one ABHA is one person, and a second
  // tenant registering the same ABHA must collide rather than fork the
  // identity. The conflict response says nothing about who holds it.
  // `declaredIdentityKeys` catches the same identifier declared twice inside
  // ONE request, which the store cannot see until the first row is written.
  const declaredIdentityKeys = new Set<string>();
  for (const ident of input.identities ?? []) {
    const key = `${ident.type}:${ident.value}`;
    if (declaredIdentityKeys.has(key) || findIdentityByValue(ident.type, ident.value)) {
      return {
        ok: false,
        error: {
          code: "identity_conflict",
          message: "This identifier is already linked to a patient record.",
        },
      };
    }
    declaredIdentityKeys.add(key);
  }

  const now = nowIso();
  const record: PatientRecord = {
    id: randomUUID(),
    orgId: actor.orgId,
    status,
    name: input.name,
    // Nullable since the provisional-demographics migration: an intake that
    // knows only a name stores nulls rather than invented placeholders. Nulls
    // are never mistaken for captured data — promotion to `registered` requires
    // gender and dob to be present once the patch is applied (see
    // `updatePatientForActor`).
    gender: input.gender ?? null,
    dob: input.dob ?? null,
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
      orgId: actor.orgId,
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

  return {
    ok: true,
    value: {
      patient: toPatientView(record, listIdentitiesFor(record.id)),
      access: evaluateAccess(actor, record),
    },
  };
}

/**
 * Read one record for this actor: `not_found` (404), `denied` (403 + the
 * decision) or `ok`. Existence is checked first so an unknown id and a
 * known-but-sealed id stay distinguishable — safe only because ids are opaque
 * UUIDv4 (doc 05 §2).
 */
export function readPatientForActor(actor: Actor, id: string): ReadResult {
  const patient = getPatient(id);
  if (!patient) return { kind: "not_found" };

  const decision = evaluateAccess(actor, patient);
  if (!decision.allowed) return { kind: "denied", decision };

  return {
    kind: "ok",
    patient: toPatientView(patient, listIdentitiesFor(id)),
    access: decision,
  };
}

/**
 * List the records this actor may see (the server-side `visiblePatients`,
 * architecture §2.5).
 *
 * Scope, then filters — never the other way round:
 *
 *   - outside the actor's visibility scope a record does not exist: it is
 *     neither counted in `total` nor matched by `q`. A search must not become a
 *     cross-tenant oracle or a national patient directory (doc 08 §4).
 *   - inside the scope, records the actor may not *read* (a consent artifact
 *     exists but is not active) are returned as **sealed stubs**: id + owning
 *     tenant + the access decision, and no demographics at all. The tenant
 *     learns that its own request is pending/expired/denied — nothing about the
 *     person.
 *   - sealed stubs are dropped as soon as a content filter (`q`, `state`,
 *     `status`) is present: answering a content question about a record you
 *     cannot read would leak the answer through inclusion alone.
 */
export function listPatientsForActor(actor: Actor, query: ListPatientsQuery): PatientListResult {
  const visibility = resolveVisibility(actor);
  const q = query.q?.trim().toLowerCase() ?? null;
  const contentFiltered = Boolean(q || query.state || query.status);

  const accessible: Array<PatientView & { sealed: false; access: AccessDecisionView }> = [];
  const sealed: Array<{ sealed: true; id: string; orgId: string; access: AccessDecisionView }> = [];

  for (const patient of allPatients()) {
    if (!isVisible(visibility, patient)) continue;

    const decision = evaluateAccess(actor, patient);

    if (!decision.allowed) {
      if (contentFiltered) continue;
      if (query.orgId && patient.orgId !== query.orgId) continue;
      sealed.push({
        sealed: true,
        id: patient.id,
        orgId: patient.orgId,
        access: toAccessDecisionView(decision),
      });
      continue;
    }

    if (query.orgId && patient.orgId !== query.orgId) continue;

    const identities = listIdentitiesFor(patient.id);
    if (q && !patient.name.toLowerCase().includes(q)) continue;
    if (query.status && patient.status !== query.status) continue;
    if (query.state && deriveState(patient, identities) !== query.state) continue;

    accessible.push({
      ...toPatientView(patient, identities),
      sealed: false,
      access: toAccessDecisionView(decision),
    });
  }

  // Stable, useful ordering: readable records by name (parity with the
  // frontend's `visiblePatients`), sealed stubs after them by id.
  accessible.sort((a, b) => (a.name === b.name ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name)));
  sealed.sort((a, b) => a.id.localeCompare(b.id));

  const matched: PatientListItem[] = [...accessible, ...sealed];
  const page = matched.slice(query.offset, query.offset + query.limit);

  return {
    patients: page,
    total: matched.length,
    sealedCount: sealed.length,
    limit: query.limit,
    offset: query.offset,
    scope:
      visibility.kind === "all"
        ? { kind: "platform", orgId: actor.orgId }
        : visibility.kind === "tenant"
          ? { kind: "tenant", orgId: visibility.orgId }
          : visibility.kind === "self"
            ? { kind: "self", orgId: actor.orgId }
            : { kind: "none", orgId: null },
  };
}

/**
 * Which capabilities a PATCH payload needs.
 *
 * Field-level, not route-level: one endpoint carries three different kinds of
 * write (demographics, declaring an identifier, recording a verification
 * outcome) and they are not the same privilege. Splitting them is what stops
 * verification state being smuggled in through a demographic update, and what
 * lets a registration desk declare an ABHA without being able to attest that
 * ABDM verified it.
 */
export function capabilitiesRequiredFor(patch: UpdatePatientBody): Capability[] {
  const required: Capability[] = [];
  const touchesDemographics =
    patch.name !== undefined ||
    patch.gender !== undefined ||
    patch.dob !== undefined ||
    patch.bloodGroup !== undefined ||
    patch.heightCm !== undefined ||
    patch.weightKg !== undefined ||
    patch.contact !== undefined ||
    patch.emergencyContact !== undefined ||
    patch.status !== undefined;

  if (touchesDemographics) required.push("patient.update");
  if (patch.addIdentity) required.push("patient.link_identity");
  if (patch.markIdentityVerified) required.push("patient.verify_identity");
  // An empty PATCH is still an update attempt on the record.
  if (required.length === 0) required.push("patient.update");
  return required;
}

/**
 * Update demographics, declare one more identity, or record a server-side
 * verification outcome — for this actor, on a record this actor's tenant owns.
 *
 * Order of refusals matters: capability (Layer 2) before existence, so an
 * unauthorized payload cannot probe which ids exist; write scope (Layer 3)
 * before any mutation, so a cross-tenant write is refused without touching the
 * record even when a consent artifact is active.
 */
export function updatePatientForActor(actor: Actor, id: string, patch: UpdatePatientBody): UpdateResult {
  for (const capability of capabilitiesRequiredFor(patch)) {
    // The route guard already checked `patient.update`; this covers the
    // capabilities the payload asks for beyond it.
    if (!can(actor.role, capability)) return { kind: "missing_capability", capability };
  }

  const patient = getPatient(id);
  if (!patient) return { kind: "not_found" };

  // Consent grants reading, never writing: only the owning tenant mutates.
  const write = evaluateWriteAccess(actor, patient);
  if (!write.allowed) return { kind: "denied_write", decision: write };

  if (patch.status === "registered" && patient.status === "provisional") {
    // Promotion is refused unless the record is complete ONCE THE PATCH IS
    // APPLIED. Since the provisional-demographics migration an intake record
    // stores nulls rather than invented placeholders, so a gender or dob
    // already on file IS captured data and counts; what must not happen is
    // promoting a record that still has a null in either column. (The earlier
    // rule demanded both in the request because the stored values were
    // placeholders like `1980-01-01` — that rationale died with the nulls.)
    // ABHA is deliberately absent from this requirement: registration completes
    // with no identifier at all.
    const name = patch.name ?? patient.name;
    const gender = patch.gender ?? patient.gender;
    const dob = patch.dob ?? patient.dob;
    if (!name.trim() || !gender || !dob || !validDob(dob)) {
      return {
        kind: "rejected",
        error: {
          code: "invalid_transition",
          message:
            "Registering a provisional patient requires a name, gender and a valid dob — send the missing ones in this request.",
        },
      };
    }
  }

  // Declare one more external identifier BEFORE mutating demographics: a
  // conflicting identifier must refuse the whole request rather than leave a
  // half-applied patch behind.
  if (patch.addIdentity) {
    const ident = patch.addIdentity;
    if (findIdentityByValue(ident.type, ident.value)) {
      return {
        kind: "rejected",
        error: {
          code: "identity_conflict",
          message: "This identifier is already linked to a patient record.",
        },
      };
    }
  }

  if (patch.markIdentityVerified) {
    const identity = getIdentity(patch.markIdentityVerified);
    // The identity must belong to THIS patient — a foreign or unknown id is a
    // 404, never a cross-patient (or cross-tenant) oracle.
    if (!identity || identity.patientId !== id) {
      return {
        kind: "rejected",
        error: {
          code: "identity_not_found",
          message: "No such identifier on this patient record.",
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

  if (patch.addIdentity) {
    const ident = patch.addIdentity;
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

  // Server-side verification transition (production: the ABDM adapter callback
  // after doc 04 §6 confirm, bound to the professional's session).
  let verifiedIdentityId: string | null = null;
  if (patch.markIdentityVerified) {
    const identity = getIdentity(patch.markIdentityVerified);
    if (identity) {
      updateIdentityRecord(identity.id, (i) => {
        i.verified = true;
        i.verifiedAt = nowIso();
      });
      verifiedIdentityId = identity.id;
    }
  }

  const updated = getPatient(id);
  if (!updated) return { kind: "not_found" };
  return {
    kind: "ok",
    patient: toPatientView(updated, listIdentitiesFor(id)),
    access: evaluateAccess(actor, updated),
    verifiedIdentityId,
  };
}
