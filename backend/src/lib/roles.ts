/**
 * Role registry — the backend mirror of the locked six-role registry.
 *
 * Sources this file must stay in sync with (docs/backend/07 §1, §7 checklist):
 *   - `frontend/src/js/roles.js`   — presentation facts: label, audience,
 *     identifier field copy, public dropdown order
 *   - `src/data/types.ts` / `prisma/schema.prisma` `enum Role` — the keys the
 *     API and the database use
 *
 * Sync is by process, not by hope: any change to a role here is a change to
 * `roles.js` and to the Prisma enum in the same commit (doc 07 §6 — adding a
 * role is a data + policy change, never backend-only).
 *
 * Two vocabularies coexist and are mapped explicitly rather than conflated:
 *   - the legacy frontend keys (`patient`, `doctor`, `hospital`, `pharmacy`,
 *     `laboratory`, `government`) used by `#/login/<role>` and the public
 *     dropdown;
 *   - the backend/Prisma keys (`PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `LAB`,
 *     `PHARMACY`, `SUPER_ADMIN`) used by sessions and the permission matrix.
 *
 * `SUPER_ADMIN` is platform programme oversight. It is NOT a "government
 * superuser backdoor": every read it performs is audited like any other, and
 * doc 07 §2 leaves the Government identity anchor (department IdP / SSO)
 * undecided — so this role carries no government-specific authority here.
 */

/** Backend role keys — identical to the Prisma `Role` enum. */
export type Role =
  | "PATIENT"
  | "DOCTOR"
  | "HOSPITAL_ADMIN"
  | "LAB"
  | "PHARMACY"
  | "SUPER_ADMIN";

export interface RoleDefinition {
  /** Backend / Prisma key. */
  key: Role;
  /** Legacy frontend registry key (`frontend/src/js/roles.js`). */
  frontendKey: string;
  /** Public label. */
  label: string;
  /** Audience line shown on the login screen. */
  audience: string;
  /** What identifies this role at sign-in (doc 07 §1). */
  identifierLabel: string;
  /**
   * ABDM registry that anchors the role's identity (doc 07 §3). `undecided`
   * means the design decision is still open — do not build the role's
   * verification path on a guess.
   */
  abdmAnchor: "ABHA" | "HPR" | "HFR" | "undecided";
}

const DEFINITIONS: Readonly<Record<Role, RoleDefinition>> = Object.freeze({
  PATIENT: {
    key: "PATIENT",
    frontendKey: "patient",
    label: "Patient",
    audience: "Citizen",
    identifierLabel: "ABHA Number",
    abdmAnchor: "ABHA",
  },
  DOCTOR: {
    key: "DOCTOR",
    frontendKey: "doctor",
    label: "Doctor",
    audience: "Healthcare Professional",
    // "Doctor ID" wording is banned (doc 07 §2): HPID is a digital
    // professional identity, not a medical registration number.
    identifierLabel: "HPID / Username / Mobile Number",
    abdmAnchor: "HPR",
  },
  HOSPITAL_ADMIN: {
    key: "HOSPITAL_ADMIN",
    frontendKey: "hospital",
    label: "Hospital",
    audience: "Health Facility",
    identifierLabel: "Facility ID / Username",
    abdmAnchor: "HFR",
  },
  LAB: {
    key: "LAB",
    frontendKey: "laboratory",
    label: "Laboratory",
    audience: "Diagnostic Facility",
    identifierLabel: "Facility ID / Username",
    abdmAnchor: "HFR",
  },
  PHARMACY: {
    key: "PHARMACY",
    frontendKey: "pharmacy",
    label: "Pharmacy",
    audience: "Pharmacy Facility",
    identifierLabel: "Facility ID / Username",
    abdmAnchor: "HFR",
  },
  SUPER_ADMIN: {
    key: "SUPER_ADMIN",
    frontendKey: "government",
    label: "Government",
    audience: "Government Department",
    identifierLabel: "Department User ID",
    abdmAnchor: "undecided",
  },
});

/** Insertion order is the public presentation order and must stay stable. */
export const ROLE_KEYS: readonly Role[] = Object.freeze([
  "PATIENT",
  "DOCTOR",
  "HOSPITAL_ADMIN",
  "LAB",
  "PHARMACY",
  "SUPER_ADMIN",
]);

/** Legacy frontend key → backend key (the `#/login/<role>` mapping). */
export const FRONTEND_ROLE_KEY: Readonly<Record<string, Role>> = Object.freeze(
  Object.fromEntries(ROLE_KEYS.map((key) => [DEFINITIONS[key].frontendKey, key])) as Record<string, Role>,
);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLE_KEYS as readonly string[]).includes(value);
}

/** Registry facts for a role key, or null for anything unrecognised. */
export function getRoleDefinition(value: unknown): RoleDefinition | null {
  return isRole(value) ? DEFINITIONS[value] : null;
}

/** Resolve a legacy frontend role key (`doctor`) to a backend key (`DOCTOR`). */
export function roleFromFrontendKey(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return FRONTEND_ROLE_KEY[value.toLowerCase()] ?? null;
}
