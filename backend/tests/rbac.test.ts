/**
 * Authorization layer tests — the RBAC + tenant-isolation stack as units.
 *
 * Covers the layers of docs/backend/07 §4 in order, each on its own terms:
 *
 *   Layer 2  role permissions   — lib/permissions.ts (default-deny matrix, and
 *                                  parity with the frontend's `CAN`)
 *   Layer 3/4 relationship +    — services/access-service.ts (the nine
 *           consent               `AccessDecision` reasons, write scope, the
 *                                  visibility scope that drives the list)
 *   Layer 5  audit              — modules/audit (append-only, hash-chained,
 *                                  PHI-free)
 *
 * The same layers driven through HTTP — every role against every endpoint, and
 * every cross-tenant combination — live in `patients-authz.test.ts`. These unit
 * tests exist so a rule can be pinned even when the demo data does not contain
 * the case (a revoked consent, an actor with no tenant).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_PATIENT_ID } from "../src/lib/demo-ids.js";
import { listAuditEvents, resetAuditStore, writeAuditEvent } from "../src/modules/audit/service.js";
import { allEvents } from "../src/modules/audit/store.js";
import { CAPABILITIES, can, capabilitiesOf } from "../src/lib/permissions.js";
import {
  FRONTEND_ROLE_KEY,
  ROLE_KEYS,
  getRoleDefinition,
  isRole,
  roleFromFrontendKey,
} from "../src/lib/roles.js";
import {
  ACCESS_REASONS,
  evaluateAccess,
  evaluateWriteAccess,
  isVisible,
  resolveVisibility,
  type Actor,
  type ConsentLookup,
} from "../src/services/access-service.js";
import { listConsents } from "../src/modules/consents/service.js";
import { allConsents, isConsentActive, type ConsentArtifact } from "../src/services/consent-view.js";

// ── fixtures ────────────────────────────────────────────────────────────────

function actor(role: string, orgId: string | null, patientId: string | null = null): Actor {
  return { id: `u-${role.toLowerCase()}`, role, name: `${role} Test`, orgId, patientId };
}

const ARTIFACT_DEFAULTS = {
  requestingUserId: "u-requester",
  purpose: "TREATMENT",
  note: "Test purpose",
  scope: ["DIAGNOSIS"],
  requestedOn: new Date().toISOString(),
  decidedOn: null,
  validFrom: new Date().toISOString().slice(0, 10),
  expiresOn: null,
};

function artifact(overrides: Partial<ConsentArtifact> & { id: string; patientId: string; requestingOrgId: string }): ConsentArtifact {
  return { ...ARTIFACT_DEFAULTS, status: "approved", ...overrides } as ConsentArtifact;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** A lookup holding one artifact, for the reasons the demo data lacks. */
function lookupWith(consent: ConsentArtifact | null): ConsentLookup {
  return {
    consentsFor: (patientId, orgId) =>
      consent && consent.patientId === patientId && consent.requestingOrgId === orgId
        ? [consent]
        : [],
    consentedPatientIds: (orgId) =>
      new Set(consent && consent.requestingOrgId === orgId ? [consent.patientId] : []),
  };
}

const AMIT = { id: DEMO_PATIENT_ID.amitKumar, orgId: DEMO_ORG_ID.nmc };
const SUNITA = { id: DEMO_PATIENT_ID.sunitaDeshmukh, orgId: DEMO_ORG_ID.sanjivani };
const IQBAL = { id: DEMO_PATIENT_ID.iqbalAnsari, orgId: DEMO_ORG_ID.sanjivani };
const MEERA = { id: DEMO_PATIENT_ID.meeraJoshi, orgId: DEMO_ORG_ID.nmc };
const WALK_IN = { id: DEMO_PATIENT_ID.vitthalShinde, orgId: DEMO_ORG_ID.nmc };

const DOCTOR_NMC = actor("DOCTOR", DEMO_ORG_ID.nmc);
const DOCTOR_SANJIVANI = actor("DOCTOR", DEMO_ORG_ID.sanjivani);

beforeEach(() => resetAuditStore());

// ── role registry ───────────────────────────────────────────────────────────

describe("role registry (doc 07 §1)", () => {
  it("holds exactly the six locked roles, in the public presentation order", () => {
    expect(ROLE_KEYS).toEqual([
      "PATIENT",
      "DOCTOR",
      "HOSPITAL_ADMIN",
      "LAB",
      "PHARMACY",
      "SUPER_ADMIN",
    ]);
  });

  it("maps every backend role to a legacy frontend key and back", () => {
    for (const key of ROLE_KEYS) {
      const definition = getRoleDefinition(key);
      expect(definition, key).toBeTruthy();
      expect(roleFromFrontendKey(definition!.frontendKey)).toBe(key);
      expect(FRONTEND_ROLE_KEY[definition!.frontendKey]).toBe(key);
    }
    // The six public keys of frontend/src/js/roles.js.
    expect(Object.keys(FRONTEND_ROLE_KEY).sort()).toEqual(
      ["doctor", "government", "hospital", "laboratory", "patient", "pharmacy"].sort(),
    );
  });

  it("carries the identity facts, and never the banned 'Doctor ID' wording", () => {
    for (const key of ROLE_KEYS) {
      const definition = getRoleDefinition(key)!;
      expect(definition.label.length, key).toBeGreaterThan(0);
      expect(definition.audience.length, key).toBeGreaterThan(0);
      expect(definition.identifierLabel.length, key).toBeGreaterThan(0);
      expect(definition.identifierLabel).not.toMatch(/doctor id/i);
    }
    // HPID anchors the doctor; ABHA anchors the patient; HFR the facilities.
    expect(getRoleDefinition("DOCTOR")!.abdmAnchor).toBe("HPR");
    expect(getRoleDefinition("PATIENT")!.abdmAnchor).toBe("ABHA");
    expect(getRoleDefinition("HOSPITAL_ADMIN")!.abdmAnchor).toBe("HFR");
    expect(getRoleDefinition("LAB")!.abdmAnchor).toBe("HFR");
    expect(getRoleDefinition("PHARMACY")!.abdmAnchor).toBe("HFR");
    // The government anchor is an open decision — recorded as undecided rather
    // than guessed (doc 07 §2).
    expect(getRoleDefinition("SUPER_ADMIN")!.abdmAnchor).toBe("undecided");
  });

  it("rejects anything that is not a known role", () => {
    expect(isRole("DOCTOR")).toBe(true);
    for (const bad of ["doctor", "ADMIN", "", null, undefined, 7, {}, "SUPERUSER"]) {
      expect(isRole(bad), String(bad)).toBe(false);
      expect(getRoleDefinition(bad)).toBeNull();
    }
  });
});

// ── Layer 2: permissions ────────────────────────────────────────────────────

describe("permission matrix — Layer 2 (doc 07 §4, §5)", () => {
  it("is default-deny for unknown roles and unknown capabilities", () => {
    for (const capability of CAPABILITIES) {
      expect(can("ADMIN", capability)).toBe(false);
      expect(can("doctor", capability)).toBe(false); // case-sensitive keys
      expect(can(undefined, capability)).toBe(false);
      expect(can(null, capability)).toBe(false);
    }
    for (const role of ROLE_KEYS) {
      expect(can(role, "patient.delete")).toBe(false);
      expect(can(role, "")).toBe(false);
      expect(can(role, "__proto__")).toBe(false);
    }
    expect(capabilitiesOf("NOPE")).toEqual([]);
  });

  it("grants the patient registry exactly as decided", () => {
    // Registration is a facility function (frontend: canRegister = DOCTOR ||
    // HOSPITAL_ADMIN).
    expect(can("DOCTOR", "patient.register")).toBe(true);
    expect(can("HOSPITAL_ADMIN", "patient.register")).toBe(true);
    for (const role of ["PATIENT", "LAB", "PHARMACY", "SUPER_ADMIN"]) {
      expect(can(role, "patient.register"), role).toBe(false);
    }

    // Reading/searching is broader — but always subject to Layer 3/4 scope.
    for (const role of ROLE_KEYS) {
      expect(can(role, "patient.read"), role).toBe(true);
      expect(can(role, "patient.search"), role).toBe(true);
    }

    // Editing is clinical/facility only; oversight is read-only.
    expect(can("DOCTOR", "patient.update")).toBe(true);
    expect(can("HOSPITAL_ADMIN", "patient.update")).toBe(true);
    for (const role of ["PATIENT", "LAB", "PHARMACY", "SUPER_ADMIN"]) {
      expect(can(role, "patient.update"), role).toBe(false);
    }

    // Declaring an identifier vs attesting its verification are different
    // privileges: the registration desk may do the first, only the point-of-care
    // clinician (the ABDM OTP flow, doc 04 §1) may do the second.
    expect(can("DOCTOR", "patient.link_identity")).toBe(true);
    expect(can("HOSPITAL_ADMIN", "patient.link_identity")).toBe(true);
    expect(can("DOCTOR", "patient.verify_identity")).toBe(true);
    expect(can("HOSPITAL_ADMIN", "patient.verify_identity")).toBe(false);
    for (const role of ["PATIENT", "LAB", "PHARMACY", "SUPER_ADMIN"]) {
      expect(can(role, "patient.link_identity"), role).toBe(false);
      expect(can(role, "patient.verify_identity"), role).toBe(false);
    }
  });

  it("keeps the roles non-interchangeable on their own capabilities", () => {
    expect(can("DOCTOR", "prescription.create")).toBe(true);
    expect(can("DOCTOR", "prescription.dispense")).toBe(false);
    expect(can("PHARMACY", "prescription.dispense")).toBe(true);
    expect(can("PHARMACY", "prescription.create")).toBe(false);
    expect(can("DOCTOR", "lab.order")).toBe(true);
    expect(can("DOCTOR", "lab.result")).toBe(false);
    expect(can("LAB", "lab.result")).toBe(true);
    expect(can("LAB", "lab.order")).toBe(false);
    expect(can("PATIENT", "consent.decide")).toBe(true);
    expect(can("DOCTOR", "consent.decide")).toBe(false);
  });

  it("mirrors the frontend `CAN` matrix (src/auth/roles.ts) capability for capability", () => {
    // Parity is the point of the mirror: same answers, enforced server-side.
    const CAN = {
      createPrescription: (r: string) => r === "DOCTOR",
      dispensePrescription: (r: string) => r === "PHARMACY",
      orderLab: (r: string) => r === "DOCTOR",
      resultLab: (r: string) => r === "LAB",
      requestConsent: (r: string) => r === "DOCTOR" || r === "HOSPITAL_ADMIN",
      decideConsent: (r: string) => r === "PATIENT",
      createTask: (r: string) => r === "DOCTOR" || r === "HOSPITAL_ADMIN",
      manageStaff: (r: string) => r === "HOSPITAL_ADMIN" || r === "SUPER_ADMIN",
    } as const;
    const pairs: Array<[keyof typeof CAN, string]> = [
      ["createPrescription", "prescription.create"],
      ["dispensePrescription", "prescription.dispense"],
      ["orderLab", "lab.order"],
      ["resultLab", "lab.result"],
      ["requestConsent", "consent.request"],
      ["decideConsent", "consent.decide"],
      ["createTask", "care_task.create"],
      ["manageStaff", "staff.manage"],
    ];
    for (const role of ROLE_KEYS) {
      for (const [frontendFn, capability] of pairs) {
        expect(can(role, capability), `${role}.${capability}`).toBe(CAN[frontendFn](role));
      }
    }
  });

  it("lists a role's capabilities without inventing any", () => {
    expect(capabilitiesOf("PATIENT")).toEqual(["patient.read", "patient.search", "consent.decide"]);
    expect(capabilitiesOf("SUPER_ADMIN")).toEqual(["patient.read", "patient.search", "staff.manage"]);
    for (const role of ROLE_KEYS) {
      for (const capability of capabilitiesOf(role)) {
        expect(CAPABILITIES).toContain(capability);
        expect(can(role, capability)).toBe(true);
      }
    }
  });
});

// ── Layers 3/4: the access decision ─────────────────────────────────────────

describe("evaluateAccess — Layers 3/4 (architecture §2.5)", () => {
  it("covers the closed reason union and nothing else", () => {
    expect([...ACCESS_REASONS].sort()).toEqual(
      [
        "same_tenant",
        "consent_active",
        "self",
        "platform",
        "no_consent",
        "consent_pending",
        "consent_expired",
        "consent_revoked",
        "consent_denied",
        "role_not_permitted",
      ].sort(),
    );
  });

  it("rule 1 — platform oversight is allowed and says so", () => {
    const decision = evaluateAccess(actor("SUPER_ADMIN", DEMO_ORG_ID.platform), AMIT);
    expect(decision).toMatchObject({ allowed: true, reason: "platform" });
    // Oversight reaches any tenant's record, and still carries no consent.
    expect(evaluateAccess(actor("SUPER_ADMIN", DEMO_ORG_ID.platform), SUNITA).allowed).toBe(true);
  });

  it("rule 2 — a patient reaches their own record only", () => {
    const amit = actor("PATIENT", DEMO_ORG_ID.nmc, DEMO_PATIENT_ID.amitKumar);
    expect(evaluateAccess(amit, AMIT)).toMatchObject({ allowed: true, reason: "self" });
    // Somebody else's record in the SAME tenant is still denied: `self` is not
    // `same_tenant`, and sharing an org is not a treatment relationship.
    expect(evaluateAccess(amit, MEERA)).toMatchObject({ allowed: false, reason: "no_consent" });
    // A patient account with no record reaches nothing.
    const recordless = actor("PATIENT", DEMO_ORG_ID.nmc, null);
    expect(evaluateAccess(recordless, AMIT).allowed).toBe(false);
  });

  it("rule 3 — the same tenant is allowed without any consent", () => {
    expect(evaluateAccess(DOCTOR_NMC, AMIT)).toMatchObject({
      allowed: true,
      reason: "same_tenant",
      consent: null,
    });
    // …including a record with no ABHA at all: linkage is not an access rule.
    expect(evaluateAccess(DOCTOR_NMC, WALK_IN)).toMatchObject({
      allowed: true,
      reason: "same_tenant",
    });
  });

  it("rule 4 — cross-tenant reads follow the newest consent artifact", () => {
    // Active (approved + unexpired) — the demo's one live cross-tenant grant.
    const active = evaluateAccess(DOCTOR_NMC, SUNITA);
    expect(active).toMatchObject({ allowed: true, reason: "consent_active" });
    expect(active.consent?.id).toBe("con-01");

    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT)).toMatchObject({
      allowed: false,
      reason: "consent_pending",
    });
    expect(evaluateAccess(DOCTOR_SANJIVANI, { id: DEMO_PATIENT_ID.priyaPatel, orgId: DEMO_ORG_ID.nmc })).toMatchObject({
      allowed: false,
      reason: "consent_expired",
    });
    expect(evaluateAccess(DOCTOR_SANJIVANI, { id: DEMO_PATIENT_ID.rahulSharma, orgId: DEMO_ORG_ID.nmc })).toMatchObject({
      allowed: false,
      reason: "consent_denied",
    });
    // No artifact at all.
    expect(evaluateAccess(DOCTOR_SANJIVANI, MEERA)).toMatchObject({
      allowed: false,
      reason: "no_consent",
      consent: null,
    });
  });

  it("rule 4 — a revoked artifact denies, and says revoked", () => {
    const revoked = artifact({
      id: "con-revoked",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "revoked",
      requestedOn: daysFromNow(-3),
      decidedOn: daysFromNow(-3),
      expiresOn: daysFromNow(60), // unexpired, and still not access
    });
    const decision = evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookupWith(revoked));
    expect(decision).toMatchObject({ allowed: false, reason: "consent_revoked" });
    expect(decision.consent?.id).toBe("con-revoked");
  });

  it("rule 4 — an approved artifact past its expiry is not access", () => {
    const lapsed = artifact({
      id: "con-lapsed",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "approved",
      requestedOn: daysFromNow(-120),
      decidedOn: daysFromNow(-120),
      expiresOn: daysFromNow(-1),
    });
    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookupWith(lapsed))).toMatchObject({
      allowed: false,
      reason: "consent_expired",
    });
  });

  it("rule 4 — a live grant is not suspended by a newer pending request", () => {
    const activeOlder = artifact({
      id: "con-live",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "approved",
      requestedOn: daysFromNow(-30),
      expiresOn: daysFromNow(30),
    });
    const pendingNewer = artifact({
      id: "con-ask",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "pending",
      requestedOn: daysFromNow(-1),
    });
    const lookup: ConsentLookup = {
      consentsFor: () => [pendingNewer, activeOlder], // newest first
      consentedPatientIds: () => new Set([AMIT.id]),
    };
    // Any active artifact grants access (architecture §2.5, reproduced from
    // `evaluateAccess` in src/data/store.ts); the newest one is consulted only
    // to explain a DENIAL.
    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookup)).toMatchObject({
      allowed: true,
      reason: "consent_active",
    });
  });

  it("rule 4 — with nothing active, the newest artifact names the denial", () => {
    const expiredOlder = artifact({
      id: "con-old",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "expired",
      requestedOn: daysFromNow(-120),
    });
    const deniedNewer = artifact({
      id: "con-new",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "denied",
      requestedOn: daysFromNow(-2),
    });
    const lookup: ConsentLookup = {
      consentsFor: () => [deniedNewer, expiredOlder],
      consentedPatientIds: () => new Set([AMIT.id]),
    };
    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookup)).toMatchObject({
      allowed: false,
      reason: "consent_denied",
      consent: { id: "con-new" },
    });
  });

  it("rule 4 — revocation closes access at once", () => {
    // The consent model revokes the artifact itself (`decideConsent` sets
    // status on the existing row), so there is no "older active + newer
    // revoked" pair to order: the live grant becomes the revoked one.
    const live = artifact({
      id: "con-live",
      patientId: AMIT.id,
      requestingOrgId: DEMO_ORG_ID.sanjivani,
      status: "approved",
      requestedOn: daysFromNow(-10),
      expiresOn: daysFromNow(80),
    });
    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookupWith(live)).allowed).toBe(true);

    const revoked: ConsentArtifact = { ...live, status: "revoked", decidedOn: daysFromNow(0) };
    expect(evaluateAccess(DOCTOR_SANJIVANI, AMIT, lookupWith(revoked))).toMatchObject({
      allowed: false,
      reason: "consent_revoked",
    });
  });

  it("fails closed for an unknown role or an actor with no tenant", () => {
    expect(evaluateAccess(actor("ROOT", DEMO_ORG_ID.nmc), AMIT).allowed).toBe(false);
    expect(evaluateAccess(actor("", null), AMIT)).toMatchObject({
      allowed: false,
      reason: "no_consent",
    });
    // A tenantless DOCTOR is not even same-tenant with a record whose orgId is
    // null-ish — no tenant means no basis for a decision.
    expect(evaluateAccess(actor("DOCTOR", null), AMIT).allowed).toBe(false);
  });

  it("never consults ABHA: a verified identifier changes nothing", () => {
    // Same tenant, one record with a verified ABHA (Amit) and one with none
    // (the walk-in): identical decisions. Identity linkage is a data fact, not
    // an authentication or consent mechanism.
    const withAbha = evaluateAccess(DOCTOR_NMC, AMIT);
    const withoutAbha = evaluateAccess(DOCTOR_NMC, WALK_IN);
    expect(withAbha.allowed).toBe(withoutAbha.allowed);
    expect(withAbha.reason).toBe(withoutAbha.reason);
    // Cross-tenant, no artifact: denied for both, ABHA or not.
    expect(evaluateAccess(DOCTOR_SANJIVANI, MEERA).allowed).toBe(false);
    expect(evaluateAccess(DOCTOR_SANJIVANI, WALK_IN).allowed).toBe(false);
  });
});

describe("evaluateWriteAccess — tenant ownership of writes", () => {
  it("allows only the owning tenant", () => {
    expect(evaluateWriteAccess(DOCTOR_NMC, AMIT)).toEqual({ allowed: true, reason: "same_tenant" });
  });

  it("refuses a cross-tenant write even when a consent is active", () => {
    // The heart of the isolation rule: con-01 lets org-nmc READ Sunita's
    // record. It does not let org-nmc edit it.
    expect(evaluateAccess(DOCTOR_NMC, SUNITA).allowed).toBe(true);
    expect(evaluateWriteAccess(DOCTOR_NMC, SUNITA)).toEqual({
      allowed: false,
      reason: "cross_tenant_write",
    });
  });

  it("refuses platform oversight writes and tenantless actors", () => {
    expect(evaluateWriteAccess(actor("SUPER_ADMIN", DEMO_ORG_ID.platform), AMIT)).toEqual({
      allowed: false,
      reason: "cross_tenant_write",
    });
    expect(evaluateWriteAccess(actor("DOCTOR", null), AMIT)).toEqual({
      allowed: false,
      reason: "no_tenant",
    });
  });
});

describe("visibility scope — what a list may contain", () => {
  it("scopes by role", () => {
    expect(resolveVisibility(actor("SUPER_ADMIN", DEMO_ORG_ID.platform)).kind).toBe("all");
    expect(resolveVisibility(actor("PATIENT", DEMO_ORG_ID.nmc, AMIT.id))).toEqual({
      kind: "self",
      patientId: AMIT.id,
    });
    expect(resolveVisibility(DOCTOR_NMC).kind).toBe("tenant");
    expect(resolveVisibility(actor("DOCTOR", null)).kind).toBe("none");
    expect(resolveVisibility(actor("ROOT", DEMO_ORG_ID.nmc)).kind).toBe("none");
  });

  it("tenant scope = own records + records with a consent artifact", () => {
    const visibility = resolveVisibility(DOCTOR_NMC);
    expect(isVisible(visibility, AMIT)).toBe(true); // own tenant
    expect(isVisible(visibility, SUNITA)).toBe(true); // active consent
    expect(isVisible(visibility, IQBAL)).toBe(true); // pending consent → listed, sealed
    expect(isVisible(visibility, MEERA)).toBe(true); // own tenant
    // A record in another tenant with no artifact is not in scope at all: it is
    // not sealed, it is absent (this is what stops a national directory).
    expect(
      isVisible(visibility, { id: DEMO_PATIENT_ID.rahulSharma, orgId: DEMO_ORG_ID.sanjivani }),
    ).toBe(false);
  });

  it("self scope reaches exactly one record", () => {
    const visibility = resolveVisibility(actor("PATIENT", DEMO_ORG_ID.nmc, AMIT.id));
    expect(isVisible(visibility, AMIT)).toBe(true);
    expect(isVisible(visibility, MEERA)).toBe(false);
    expect(isVisible(visibility, SUNITA)).toBe(false);
    // No record linked ⇒ nothing visible, not even same-tenant rows.
    const recordless = resolveVisibility(actor("PATIENT", DEMO_ORG_ID.nmc, null));
    expect(isVisible(recordless, AMIT)).toBe(false);
  });

  it("`none` and unknown scopes hide everything", () => {
    const visibility = resolveVisibility(actor("DOCTOR", null));
    for (const patient of [AMIT, SUNITA, MEERA, WALK_IN]) {
      expect(isVisible(visibility, patient)).toBe(false);
    }
  });
});

// ── consent view ────────────────────────────────────────────────────────────

describe("consent view (read side only)", () => {
  it("holds the demo artifacts and treats exactly one as active", () => {
    const consents = allConsents();
    expect(consents.map((c) => c.id).sort()).toEqual(
      ["con-01", "con-02", "con-03", "con-04", "con-05"].sort(),
    );
    expect(consents.filter((c) => isConsentActive(c)).map((c) => c.id)).toEqual(["con-01"]);
  });

  it("is active only for an approved, unexpired artifact", () => {
    const base = { id: "c", patientId: AMIT.id, requestingOrgId: DEMO_ORG_ID.sanjivani };
    expect(isConsentActive(artifact({ ...base, status: "approved", expiresOn: daysFromNow(10) }))).toBe(true);
    expect(isConsentActive(artifact({ ...base, status: "approved", expiresOn: null }))).toBe(true);
    expect(isConsentActive(artifact({ ...base, status: "approved", expiresOn: daysFromNow(-1) }))).toBe(false);
    for (const status of ["pending", "denied", "expired", "revoked"] as const) {
      expect(
        isConsentActive(artifact({ ...base, status, expiresOn: daysFromNow(10) })),
        status,
      ).toBe(false);
    }
  });

  it("seeds the plane itself, so the consent endpoints see the same artifacts", () => {
    // Seeding goes through `insertConsent`: these are ordinary rows the plane
    // lists, decides and revokes — not a side table the authz stack owns.
    expect(listConsents({ patientId: DEMO_PATIENT_ID.sunitaDeshmukh }).map((c) => c.id)).toEqual([
      "con-01",
    ]);
    expect(listConsents({ patientId: DEMO_PATIENT_ID.priyaPatel })[0]!.status).toBe("EXPIRED");
  });

  it("hands out copies, so a caller cannot rewrite the artifacts", () => {
    const first = allConsents().find((c) => isConsentActive(c))!;
    expect(first.id).toBe("con-01");
    first.status = "revoked";
    first.scope.push("Everything");
    const second = allConsents().find((c) => c.id === first.id)!;
    expect(second.status).toBe("approved"); // unchanged
    expect(second.scope).not.toContain("Everything");
  });
});

// ── Layer 5: audit ──────────────────────────────────────────────────────────

/**
 * The trail is `modules/audit` — the same hash-chained writer the rest of the
 * API uses, extended with `reason` and `capability` so an authorization
 * decision is auditable in the terms it was made. `listAuditEvents` has no
 * status filter (it is the feed's read side), so denials are selected here.
 */
const blocked = () => allEvents().filter((e) => e.status === "blocked");

describe("audit trail — Layer 5 (doc 07 §4, doc 09 §2)", () => {
  it("is append-only and totally ordered", () => {
    writeAuditEvent({ actor: DOCTOR_NMC, action: "VIEW_RECORD", resourceType: "PATIENT", patientId: AMIT.id });
    writeAuditEvent({
      actor: DOCTOR_SANJIVANI,
      action: "VIEW_RECORD",
      resourceType: "PATIENT",
      patientId: AMIT.id,
      status: "blocked",
      reason: "consent_pending",
    });
    const trail = allEvents();
    expect(trail).toHaveLength(2);
    expect(trail.map((e) => e.sequence)).toEqual([1, 2]);
    expect(trail[0]!.status).toBe("success");
    expect(trail[1]!.status).toBe("blocked");
    expect(trail[1]!.reason).toBe("consent_pending");
    // Append-only: each row links its predecessor, so a removed or reordered
    // row breaks the chain rather than disappearing.
    expect(trail[0]!.prevEventId).toBeNull();
    expect(trail[1]!.prevEventId).toBe(trail[0]!.id);
  });

  it("snapshots the actor and can be queried by patient, action and actor", () => {
    writeAuditEvent({
      actor: DOCTOR_NMC,
      action: "CREATE_RECORD",
      resourceType: "PATIENT",
      patientId: AMIT.id,
      requestId: "req-1",
    });
    writeAuditEvent({
      actor: null,
      action: "VIEW_RECORD",
      resourceType: "PATIENT",
      patientId: AMIT.id,
      status: "blocked",
      reason: "unauthenticated",
      requestId: "req-2",
    });

    expect(listAuditEvents({ patientId: AMIT.id, limit: 50, offset: 0 }).total).toBe(2);
    expect(blocked()).toHaveLength(1);
    expect(listAuditEvents({ action: "CREATE_RECORD", limit: 50, offset: 0 }).total).toBe(1);
    const byActor = listAuditEvents({ actorId: DOCTOR_NMC.id, limit: 50, offset: 0 }).events;
    expect(byActor[0]!.actorRole).toBe("DOCTOR");
    expect(byActor[0]!.organizationId).toBe(DEMO_ORG_ID.nmc);
    // An unauthenticated attempt has no actor at all — and is still recorded.
    expect(blocked()[0]!.actorId).toBeNull();
    expect(blocked()[0]!.requestId).toBe("req-2");
  });

  it("records the capability on a Layer 2 denial", () => {
    writeAuditEvent({
      actor: actor("LAB", DEMO_ORG_ID.pathcare),
      action: "CREATE_RECORD",
      resourceType: "PATIENT",
      status: "blocked",
      reason: "role_not_permitted",
      capability: "patient.register",
    });
    const entry = blocked()[0]!;
    expect(entry.reason).toBe("role_not_permitted");
    expect(entry.capability).toBe("patient.register");
  });

  it("hashes the denial reason and capability, not just the ids", () => {
    // `reason` and `capability` were added to the hashed envelope on purpose:
    // a trail that let somebody rewrite WHY an access was granted would be
    // tamper-evidence in name only.
    const common = {
      actor: DOCTOR_SANJIVANI,
      action: "VIEW_RECORD",
      resourceType: "PATIENT",
      patientId: AMIT.id,
      status: "blocked" as const,
    };
    const pending = writeAuditEvent({ ...common, reason: "consent_pending" });
    const revoked = writeAuditEvent({ ...common, reason: "consent_revoked" });
    const withCapability = writeAuditEvent({
      ...common,
      reason: "consent_revoked",
      capability: "patient.read",
    });
    expect(pending.hash).not.toBe(revoked.hash);
    expect(revoked.hash).not.toBe(withCapability.hash);
    expect(pending.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("carries no PHI: no patient name, no identifier value, no demographics", () => {
    writeAuditEvent({
      actor: DOCTOR_NMC,
      action: "VERIFY_IDENTITY",
      resourceType: "PATIENT_IDENTITY",
      patientId: AMIT.id,
      resourceId: "00000000-0000-4000-8000-000000000512",
      status: "success",
    });
    const serialized = JSON.stringify(allEvents());
    for (const forbidden of [
      "Amit Kumar",
      "1991-03-14",
      "23456789123401",
      "amit.kumar@abdm",
      "98230 45671",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // Opaque ids are the point: they are all the trail needs.
    expect(serialized).toContain(DEMO_PATIENT_ID.amitKumar);
  });

  it("resets between tests", () => {
    expect(allEvents()).toHaveLength(0);
  });
});
