/**
 * Permission matrix — Layer 2 of the authorization model (docs/backend/07 §4).
 *
 *   Layer 1 — Authentication:  who are you?            → src/lib/session.ts
 *   Layer 2 — Role permission: what may your role do?  → THIS FILE
 *   Layer 3/4 — Relationship + consent: may you touch THIS record?
 *                                                      → src/services/access-service.ts
 *   Layer 5 — Audit: every granted/denied decision     → src/modules/audit
 *
 * Rules encoded here:
 *
 *   1. **Default-deny.** A capability is granted only if it appears in the
 *      role's explicit grant list. An unknown role, an unknown capability, or a
 *      role with no entry is denied — never allowed by absence of a rule
 *      (doc 07 §7: "Default-deny for all new capabilities").
 *   2. **Role facts are not interchangeable** (doc 07 §1). Each row models a
 *      real difference: a laboratory may read a patient it has an order for but
 *      never register or edit one; a pharmacy may dispense but not prescribe.
 *   3. **A capability is a question about the ROLE, never about the record.**
 *      `can()` answers "may a DOCTOR update patients at all?" — whether *this*
 *      patient is theirs is Layer 3/4's job. Skipping Layer 2 because Layer 3
 *      would also deny is exactly the mistake that produces leaks.
 *   4. **Frontend guards are UX only.** `CAN` in `src/auth/roles.ts` hides
 *      buttons; this matrix is the enforcement (doc 07 §7).
 *
 * The patient-registry capabilities are enforced now (Phase 4, by
 * `/api/v1/patients`). The remaining capabilities mirror the frontend `CAN`
 * matrix verbatim so the clinical routes that land later inherit a decided
 * policy instead of inventing one; they are declared data, not speculative
 * endpoints (doc 08: no APIs before their milestone is designed).
 */

import { isRole, type Role } from "./roles.js";

export const CAPABILITIES = Object.freeze([
  // ── Patient identity registry (Phase 4 — enforced now) ────────────────────
  /** Create a patient record in the actor's own tenant. */
  "patient.register",
  /** Read one patient record (still subject to Layer 3/4 access). */
  "patient.read",
  /** Search/list the registry (still subject to the visibility scope). */
  "patient.search",
  /** Update demographics, contacts and the provisional → registered lifecycle. */
  "patient.update",
  /** Declare an external identifier (ABHA number/address) — stored UNVERIFIED. */
  "patient.link_identity",
  /**
   * Record a verification outcome for a declared identifier. This is the hook
   * the ABDM verification adapter calls after a successful doc 04 §6 confirm;
   * it is deliberately a distinct capability so verification can never be
   * smuggled in through a demographic update.
   */
  "patient.verify_identity",

  // ── Mirrored from frontend `CAN` (src/auth/roles.ts) — enforced later ─────
  "prescription.create",
  "prescription.dispense",
  "lab.order",
  "lab.result",
  "consent.request",
  "consent.decide",
  "care_task.create",
  "staff.manage",
] as const);

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Explicit grants per role. Everything absent is denied.
 *
 * Justifications (so a reviewer can check a row against a document):
 *
 * - PATIENT — reads **own** record only (the `self` rule is Layer 3/4, not
 *   here) and decides consents on it (doc 07 §5: "Grant/revoke consent ✅").
 *   A patient cannot register, edit or verify records through this API: the
 *   registration desk is a facility function, and self-service demographic
 *   editing is not a designed capability (doc 08 §4 — patient dashboard is a
 *   future milestone).
 * - DOCTOR — the point-of-care role: registers patients, identifies them by
 *   ABHA → OTP (doc 04 §1, doc 07 §5 "Identify patient ✅"), prescribes and
 *   orders labs, requests consent, creates coordination tasks.
 * - HOSPITAL_ADMIN — facility registration desk + roster: registers and edits
 *   patients and declares identifiers, manages staff, requests consent. It does
 *   NOT get `patient.verify_identity`: ABHA→OTP identification at the point of
 *   care is a clinician capability in the locked matrix (doc 07 §5 leaves the
 *   facility roles' clinical permissions undesigned), and facility identity
 *   design is explicitly deferred (doc 07 §2).
 * - LAB / PHARMACY — read patients they have a coordination relationship with
 *   (an order or a prescription, gated by Layer 3/4), plus their own write
 *   capability (`lab.result` / `prescription.dispense`). No registry writes.
 * - SUPER_ADMIN — programme oversight: read + search, staff management. No
 *   patient writes: the platform sees counts, coordination state and audit,
 *   not clinical content it may edit (architecture §4.2).
 */
const GRANTS: Readonly<Record<Role, readonly Capability[]>> = Object.freeze({
  PATIENT: ["patient.read", "patient.search", "consent.decide"],
  DOCTOR: [
    "patient.register",
    "patient.read",
    "patient.search",
    "patient.update",
    "patient.link_identity",
    "patient.verify_identity",
    "prescription.create",
    "lab.order",
    "consent.request",
    "care_task.create",
  ],
  HOSPITAL_ADMIN: [
    "patient.register",
    "patient.read",
    "patient.search",
    "patient.update",
    "patient.link_identity",
    "consent.request",
    "care_task.create",
    "staff.manage",
  ],
  LAB: ["patient.read", "patient.search", "lab.result"],
  PHARMACY: ["patient.read", "patient.search", "prescription.dispense"],
  SUPER_ADMIN: ["patient.read", "patient.search", "staff.manage"],
});

const MATRIX: ReadonlyMap<Role, ReadonlySet<Capability>> = new Map(
  (Object.keys(GRANTS) as Role[]).map((role) => [role, new Set(GRANTS[role])]),
);

const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set(CAPABILITIES);

/**
 * Does `role` hold `capability`? Default-deny: anything unrecognised on either
 * side is `false`.
 */
export function can(role: unknown, capability: string): boolean {
  if (!isRole(role)) return false;
  if (!KNOWN_CAPABILITIES.has(capability)) return false;
  return MATRIX.get(role)?.has(capability as Capability) ?? false;
}

/** Every capability granted to a role (empty for unknown roles). */
export function capabilitiesOf(role: unknown): Capability[] {
  if (!isRole(role)) return [];
  return [...(MATRIX.get(role) ?? [])];
}
