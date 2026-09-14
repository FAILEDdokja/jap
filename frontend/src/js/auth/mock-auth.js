/**
 * Mock authentication implementation
 *
 * This file is the ONLY place in the frontend that knows demo identities or
 * mock verification rules. It exists to make the login workflow genuinely
 * demonstrable while the real backend is still being designed.
 *
 * It is deliberately NOT a fake backend:
 *   - no persistence, no accounts to register, no password store
 *   - no patient / encounter / prescription / admission / pharmacy data
 *   - no data model wider than the authenticated-user object
 *
 * When the backend team ships an API, `auth-service.js` points at it and this
 * file is deleted. Nothing in any component changes.
 */

import { ROLE } from "../roles.js";

/**
 * Demo identities.
 *
 * `identifiers` lists every string that resolves to the same account, mirroring
 * the role-specific identifier field in the login form: a doctor may sign in
 * with an HPID, a username or a mobile number, because the real field says so.
 * The first entry is the one shown as the form's example.
 *
 * Hospital, Laboratory and Government are intentionally absent. Their routes,
 * form and labels exist (the roles stay in the public navigation), but no
 * identities are provisioned for them at this milestone.
 */
const DEMO_ACCOUNTS = [
  {
    id: "hp-1001",
    role: ROLE.DOCTOR,
    name: "Dr. Aroha Deshpande",
    identifiers: ["HP-1001", "aroha.deshpande", "9823456781"],
  },
  {
    id: "abha-12345678912345",
    role: ROLE.PATIENT,
    name: "Ramesh Kulkarni",
    identifiers: ["12-3456-7891-2345", "12345678912345", "ramesh.kulkarni@abdm"],
  },
  {
    id: "fac-ph-2201",
    role: ROLE.PHARMACY,
    name: "Jan Seva Medical Store",
    identifiers: ["FAC-PH-2201", "janseva.store"],
  },
];

/**
 * Identifiers are matched ignoring case, spaces and dashes so that a formatted
 * value ("12-3456-7891-2345") and a typed-quickly value ("12345678912345")
 * reach the same account. This is a display convention, not a data rule.
 */
function normalizeIdentifier(value) {
  return String(value || "").toLowerCase().replace(/[\s-]/g, "");
}

/** role -> [account], built once at load. */
const ACCOUNTS_BY_ROLE = DEMO_ACCOUNTS.reduce((byRole, account) => {
  byRole[account.role] = byRole[account.role] || [];
  byRole[account.role].push(account);
  return byRole;
}, {});

/** identifier -> account, for every role that has demo identities. */
const ACCOUNTS_BY_IDENTIFIER = DEMO_ACCOUNTS.reduce((byIdentifier, account) => {
  for (const identifier of account.identifiers) {
    byIdentifier[normalizeIdentifier(identifier)] = account;
  }
  return byIdentifier;
}, {});

/** The minimum authenticated-user shape the whole frontend relies on. */
function toAuthenticatedUser(account) {
  return { id: account.id, role: account.role, name: account.name };
}

export function createMockAuthService() {
  return {
    /**
     * Identifies the account and, because this milestone mocks authentication,
     * authenticates it in the same call. The result is a discriminated union so
     * a real implementation can later return `requires-credential` (OTP,
     * password, Aadhaar) without the login UI being rewritten.
     */
    authenticate({ role, identifier }) {
      const accounts = ACCOUNTS_BY_ROLE[role];

      if (!accounts) {
        return Promise.resolve({ status: "role-unavailable" });
      }

      const account = ACCOUNTS_BY_IDENTIFIER[normalizeIdentifier(identifier)];

      if (!account || account.role !== role) {
        // A valid identifier from another role must not sign in here.
        return Promise.resolve({ status: "identifier-not-found" });
      }

      return Promise.resolve({ status: "authenticated", user: toAuthenticatedUser(account) });
    },

    /**
     * Development affordance: the login form shows this as the field's example
     * text. A production implementation omits this method and the UI adapts.
     */
    getDemoIdentifier({ role }) {
      const example = (ACCOUNTS_BY_ROLE[role] || [])[0];
      return Promise.resolve(example ? example.identifiers[0] : null);
    },
  };
}
