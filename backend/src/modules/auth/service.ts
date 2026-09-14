/**
 * Authentication service — Phase 3 (role-scoped alias resolution).
 *
 * Implements the locked contract from docs/backend/03-authentication-and-session.md
 * and docs/backend/06-api-contracts.md §1:
 *
 *   authenticate({ role, identifier }) → { status, user? }
 *
 * Locked rules reproduced here (so the frontend and backend never drift):
 *  1. Matching ignores case, spaces, and dashes (ABHA display convention).
 *  2. One account, multiple identifiers (HPID / username / mobile; ABHA number
 *     / address). Store canonical forms, compare normalized.
 *  3. Cross-role rejection — an identifier valid in another role must NOT
 *     authenticate on this role's screen.
 *  4. Error messages reveal nothing — "identifier-not-found" vs "role-unavailable"
 *     without oracle.
 *  5. New states are additive — future `requires-credential` slots in without
 *     redesign (see §8 of doc 03).
 *
 * Demo registry is in-memory and mirrors both the legacy mock-auth.js and the
 * seed's ten demo users (5 orgs). Production will replace this registry with a
 * Prisma-backed account store with alias tables and hashed credentials, but the
 * normalized lookup + cross-role semantics stay identical.
 */

import { DEMO_PATIENT_ID } from "../../lib/demo-ids.js";

export type Role =
  | "PATIENT"
  | "DOCTOR"
  | "HOSPITAL_ADMIN"
  | "LAB"
  | "PHARMACY"
  | "SUPER_ADMIN";

export const VALID_ROLES: ReadonlySet<string> = new Set<string>([
  "PATIENT",
  "DOCTOR",
  "HOSPITAL_ADMIN",
  "LAB",
  "PHARMACY",
  "SUPER_ADMIN",
]);

export interface DemoAccount {
  id: string;
  role: Role;
  name: string;
  orgId: string;
  /** All login aliases for this account (canonical forms). */
  identifiers: string[];
  email?: string;
  phone?: string;
  /**
   * For PATIENT accounts: the clinical record the account owns
   * (`users.patient_id`, doc 03 §7). An account is NOT a record — but a patient
   * account points at one, and that pointer is what makes the `self` access rule
   * enforceable server-side (access-service rule 2). A patient account with no
   * record is legitimate: the legacy mock's login-only ABHA account has none.
   */
  patientId?: string;
}

/**
 * Canonical demo registry — synthetic data only.
 *
 * Each account lists every alias that should authenticate it, per doc 03 §2:
 *  - Doctor: HPID / Username / Mobile
 *  - Patient: ABHA Number (formatted/bare) + ABHA address
 *  - Hospital/Lab/Pharmacy/Platform: facility or platform identifiers / email
 *
 * The first identifier per account is the placeholder shown in the login
 * form's `getDemoIdentifier()` affordance (absent in production).
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "u-super",
    role: "SUPER_ADMIN",
    name: "Kavita Rao",
    orgId: "org-platform",
    identifiers: ["kavita.rao@janarogyanexus.in", "kavita.rao", "SUPER-001"],
    email: "kavita.rao@janarogyanexus.in",
  },
  {
    id: "u-nmc-admin",
    role: "HOSPITAL_ADMIN",
    name: "Sanjay Gupta",
    orgId: "org-nmc",
    identifiers: ["sanjay.gupta@nmc.example.in", "sanjay.gupta", "HOSP-ADM-1001", "9823004401"],
    email: "sanjay.gupta@nmc.example.in",
    phone: "9823004401",
  },
  {
    id: "u-aroha",
    role: "DOCTOR",
    name: "Dr. Aroha Deshpande",
    orgId: "org-nmc",
    identifiers: ["HP-1001", "aroha.deshpande", "aroha.deshpande@nmc.example.in", "9823011002", "98230 11002"],
    email: "aroha.deshpande@nmc.example.in",
    phone: "9823011002",
  },
  {
    id: "u-vikram",
    role: "DOCTOR",
    name: "Dr. Vikram Nair",
    orgId: "org-nmc",
    identifiers: ["HP-1002", "vikram.nair", "vikram.nair@nmc.example.in", "9823011044", "98230 11044"],
    email: "vikram.nair@nmc.example.in",
    phone: "9823011044",
  },
  {
    id: "u-sanj-admin",
    role: "HOSPITAL_ADMIN",
    name: "Neha Kulkarni",
    orgId: "org-sanjivani",
    identifiers: ["neha.kulkarni@sanjivani.example.in", "neha.kulkarni", "HOSP-ADM-2001"],
    email: "neha.kulkarni@sanjivani.example.in",
  },
  {
    id: "u-farah",
    role: "DOCTOR",
    name: "Dr. Farah Sheikh",
    orgId: "org-sanjivani",
    identifiers: ["HP-2001", "farah.sheikh", "farah.sheikh@sanjivani.example.in", "9900022071", "99000 22071"],
    email: "farah.sheikh@sanjivani.example.in",
    phone: "9900022071",
  },
  {
    id: "u-lab",
    role: "LAB",
    name: "Anil Menon",
    orgId: "org-pathcare",
    identifiers: ["anil.menon@pathcare.example.in", "anil.menon", "LAB-3001", "9850011122"],
    email: "anil.menon@pathcare.example.in",
    phone: "9850011122",
  },
  {
    id: "u-pharm",
    role: "PHARMACY",
    name: "Deepa Iyer",
    orgId: "org-medplus",
    identifiers: ["deepa.iyer@medplus.example.in", "deepa.iyer", "PHARM-4001", "9850022233"],
    email: "deepa.iyer@medplus.example.in",
    phone: "9850022233",
  },
  {
    id: "u-amit",
    role: "PATIENT",
    name: "Amit Kumar",
    orgId: "org-nmc",
    identifiers: [
      "23-4567-8912-3401",
      "23456789123401",
      "amit.kumar@abdm",
      "amit.kumar@abdm.example.in",
    ],
    email: "amit.kumar@abdm.example.in",
    phone: "9823045671",
    // `src/data/seed.ts` u-amit → p-01; the patient store holds the same record
    // under its opaque id (lib/demo-ids.ts is the single source for both).
    patientId: DEMO_PATIENT_ID.amitKumar,
  },
  {
    id: "u-priya",
    role: "PATIENT",
    name: "Priya Patel",
    orgId: "org-nmc",
    identifiers: ["34-5678-9123-4502", "34567891234502", "priya.patel@abdm", "priya.patel@abdm.example.in"],
    email: "priya.patel@abdm.example.in",
    patientId: DEMO_PATIENT_ID.priyaPatel,
  },
  // Compatibility with legacy mock-auth.js (frontend/src/js/auth/mock-auth.js).
  // Deliberately has NO patientId: this login identity has no clinical record
  // (patient-identity-implementation-log §9 — "a login identity and a clinical
  // record are different concerns"), so it correctly reaches no record at all.
  {
    id: "abha-12345678912345",
    role: "PATIENT",
    name: "Ramesh Kulkarni",
    orgId: "org-nmc",
    identifiers: ["12-3456-7891-2345", "12345678912345", "ramesh.kulkarni@abdm"],
  },
  {
    id: "fac-ph-2201",
    role: "PHARMACY",
    name: "Jan Seva Medical Store",
    orgId: "org-medplus",
    identifiers: ["FAC-PH-2201", "janseva.store", "janseva.store@medplus.example.in"],
  },
];

function normalizeIdentifier(value: string): string {
  return String(value ?? "").toLowerCase().replace(/[\s-]/g, "");
}

// Precomputed normalized alias set per account for O(1) lookup per request.
interface NormalizedAccount {
  account: DemoAccount;
  normalizedAliases: Set<string>;
}

const normalizedRegistry: NormalizedAccount[] = DEMO_ACCOUNTS.map((acct) => ({
  account: acct,
  normalizedAliases: new Set(acct.identifiers.map(normalizeIdentifier)),
}));

// role -> normalized accounts (for role-unavailable vs identifier-not-found branching)
const accountsByRole = new Map<string, NormalizedAccount[]>();
for (const entry of normalizedRegistry) {
  const list = accountsByRole.get(entry.account.role) ?? [];
  list.push(entry);
  accountsByRole.set(entry.account.role, list);
}

export type AuthStatus = "authenticated" | "identifier-not-found" | "role-unavailable";
// Future additive status — not returned in Phase 3 but kept in the union so
// callers can switch on `status` without revision.
export type AuthResult =
  | {
      status: "authenticated";
      user: { id: string; role: Role; name: string; orgId: string; patientId?: string };
    }
  | { status: "identifier-not-found" }
  | { status: "role-unavailable" }
  | { status: "requires-credential"; requestId: string; methods: string[]; maskedContact: string };

/**
 * Authenticate an identifier within a role.
 *
 * Returns a discriminated union so the frontend can switch on `status` as
 * described in docs/backend/03 §3 and §8 — no throws for hand-typed URLs.
 */
export function authenticate(params: { role: string; identifier: string }): AuthResult {
  const { role, identifier } = params;

  // Unknown/invalid role → role-unavailable (never throw; hand-typed URL must not break).
  if (!role || typeof role !== "string" || !VALID_ROLES.has(role)) {
    return { status: "role-unavailable" };
  }

  const candidates = accountsByRole.get(role);
  if (!candidates || candidates.length === 0) {
    return { status: "role-unavailable" };
  }

  const normalized = normalizeIdentifier(identifier);
  if (!normalized) {
    return { status: "identifier-not-found" };
  }

  // Role-scoped search — cross-role match must NOT authenticate here.
  for (const entry of candidates) {
    if (entry.normalizedAliases.has(normalized)) {
      const { id, role: acctRole, name, orgId, patientId } = entry.account;
      return {
        status: "authenticated",
        // `patientId` is carried only when the account owns a record (doc 03
        // §7): it is the server-side basis of the PATIENT `self` access rule.
        user: { id, role: acctRole as Role, name, orgId, ...(patientId ? { patientId } : {}) },
      };
    }
  }

  return { status: "identifier-not-found" };
}

/**
 * Demo affordance: return the example identifier shown as the login form's
 * placeholder (`auth-service.getDemoIdentifier` bridge). Production auth omits
 * this — the form shows no example.
 */
export function getDemoIdentifier(role: string): string | null {
  const list = accountsByRole.get(role);
  if (!list || list.length === 0) return null;
  const first = list[0];
  if (!first) return null;
  return first.account.identifiers[0] ?? null;
}

export function toPublicUser(account: DemoAccount): { id: string; role: Role; name: string } {
  return { id: account.id, role: account.role, name: account.name };
}
