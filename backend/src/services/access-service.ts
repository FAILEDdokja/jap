/**
 * Access service — Layers 3 and 4 of the authorization model
 * (docs/backend/07 §4; architecture §2.5, §4.1).
 *
 * This is the ONE implementation of the data-level decision, shared by every
 * patient-data route: "may THIS actor touch THIS record?" Layer 2
 * (`lib/permissions.ts`) already answered "may this role do this at all?"; the
 * two are applied in order and neither substitutes for the other:
 *
 *   session (401) → capability (403) → access decision (403 + `blocked` audit)
 *
 * The rules reproduce `evaluateAccess` in `src/data/store.ts` exactly, because
 * architecture §2.5 says they "must be reproduced server-side, exactly" and the
 * parity checklist runs the same scenarios against both implementations:
 *
 *   1. `SUPER_ADMIN`        → allowed, `platform` (oversight — still audited)
 *   2. `PATIENT`            → allowed only for their own record, `self`
 *   3. same tenant          → allowed, `same_tenant` (implicit treatment
 *                             relationship: the tenant registered the record)
 *   4. otherwise            → the newest consent artifact for
 *                             (patient, actor's tenant): active
 *                             (`approved` + unexpired) → allowed,
 *                             `consent_active`; else denied with the most
 *                             relevant reason (`consent_pending`,
 *                             `consent_expired`, `consent_revoked`,
 *                             `consent_denied`, `no_consent`).
 *
 * Plus one rule the frontend never needed and the API cannot skip: an actor
 * with no tenant is denied (fail closed). A session that cannot name its tenant
 * has no basis for a cross-tenant decision.
 *
 * Two boundaries this file is careful about:
 *
 *   - **A consent grants READING, never writing.** Writes to a patient record
 *     belong to the tenant that owns it (`evaluateWriteAccess`); consent
 *     artifacts do not appear in that decision at all. Data residency
 *     (architecture §4.2) is the reason: JAP must not become a place where one
 *     facility edits another facility's registry rows.
 *   - **ABHA is not an access rule.** Nothing here reads `patient_identities`.
 *     A verified ABHA is a linkage fact about an identifier — it is not
 *     authentication (that is the session) and not consent (that is an
 *     artifact). A patient with no ABHA at all is as accessible to their own
 *     tenant as any other (doc 04, Phase 4's central constraint).
 *
 * `AccessDecision` is part of the API contract: `ConsentPill.tsx` renders its
 * `reason` verbatim, so the union is closed and must not be renamed casually
 * (additive changes only).
 */

import {
  consentedPatientIds as planeConsentedPatientIds,
  consentsFor as planeConsentsFor,
  isConsentActive,
  type ConsentArtifact,
} from "./consent-view.js";

/**
 * Where Layer 4 gets its facts.
 *
 * This is the insertion point doc 07 §4 asks for ("design Layers 3–4 as
 * insertion points, not as speculative implementations"): the rules below are
 * final, the *source* of consent artifacts is not. It is the consent plane now
 * (`modules/consents`, read through `services/consent-view.ts`); when the plane
 * moves to Prisma the read changes and nothing else in the authorization stack
 * does. Injecting a lookup is also what makes every reason in the union
 * testable, including the ones the seeded data does not contain.
 */
export interface ConsentLookup {
  /** Artifacts for (patient, requesting tenant), newest first. */
  consentsFor(patientId: string, requestingOrgId: string): ConsentArtifact[];
  /** Patients the tenant has any artifact for (active or not). */
  consentedPatientIds(requestingOrgId: string): Set<string>;
}

/** The default source: the consent plane, projected. */
export const consentPlaneLookup: ConsentLookup = {
  consentsFor: planeConsentsFor,
  consentedPatientIds: planeConsentedPatientIds,
};

/** The principal a request is acting as (from the session, Phase 3). */
export interface Actor {
  id: string;
  /** Backend role key (`lib/roles.ts`). Anything else fails closed. */
  role: string;
  name: string;
  /** Tenant the actor belongs to. Null for a principal with no tenant. */
  orgId: string | null;
  /** For PATIENT accounts: the clinical record they own (doc 03 §7). */
  patientId: string | null;
}

/** The minimum the access rules need to know about a record. */
export interface PatientRef {
  id: string;
  /** Owning/registrering tenant. */
  orgId: string;
}

/**
 * Closed union — the canonical access vocabulary (architecture §2.5), mirrored
 * by `AccessDecision["reason"]` in the frontend store and shared by both
 * server-side decision points: the record-access decision below and the
 * purpose-scoped sharing decision in `modules/access`.
 *
 * The first four are grants, the next five are §2.5 denials named by the state
 * of the artifact, and `role_not_permitted` is the Layer-2 refusal — the role
 * may not ask at all, so no artifact is consulted. It belongs in the shared
 * vocabulary because a denial has to be nameable in one set of words whichever
 * layer produced it; `evaluateAccess` itself never returns it (an unknown role
 * fails closed as `no_consent`).
 */
export const ACCESS_REASONS = [
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
] as const;

export type AccessReason = (typeof ACCESS_REASONS)[number];

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
  /** The artifact the decision rests on, when there is one. */
  consent: ConsentArtifact | null;
}

/** Why a WRITE was allowed or denied (a separate question from reading). */
export const WRITE_REASONS = ["same_tenant", "cross_tenant_write", "no_tenant"] as const;
export type WriteReason = (typeof WRITE_REASONS)[number];

export interface WriteDecision {
  allowed: boolean;
  reason: WriteReason;
}

const allow = (reason: AccessReason, consent: ConsentArtifact | null = null): AccessDecision => ({
  allowed: true,
  reason,
  consent,
});

const deny = (reason: AccessReason, consent: ConsentArtifact | null = null): AccessDecision => ({
  allowed: false,
  reason,
  consent,
});

/** Consent status → the denial reason it implies (architecture §2.5). */
const DENIAL_BY_STATUS: Record<string, AccessReason> = {
  pending: "consent_pending",
  expired: "consent_expired",
  revoked: "consent_revoked",
  denied: "consent_denied",
  // An `approved` artifact that is not active is past its expiry.
  approved: "consent_expired",
};

/**
 * May `actor` read the full record for `patient`?
 *
 * Pure and synchronous: the decision is a function of the actor, the record's
 * owning tenant, and the consent artifacts on file. Callers audit it
 * (allow AND deny) — Layer 5.
 */
export function evaluateAccess(
  actor: Actor,
  patient: PatientRef,
  lookup: ConsentLookup = consentPlaneLookup,
): AccessDecision {
  // Fail closed on anything that is not a known role.
  switch (actor.role) {
    case "SUPER_ADMIN":
      // Programme oversight. Audited like every other read; read-only over
      // patient records (see `evaluateWriteAccess`).
      return allow("platform");

    case "PATIENT":
      // Own record only. Note the denial reason is `no_consent`, not a
      // patient-specific one: a patient account is not a consent grant for
      // somebody else's record, and the union stays closed.
      return actor.patientId && actor.patientId === patient.id
        ? allow("self")
        : deny("no_consent");

    case "DOCTOR":
    case "HOSPITAL_ADMIN":
    case "LAB":
    case "PHARMACY":
      break;

    default:
      return deny("no_consent");
  }

  // Rule 3 — same tenant: the implicit treatment relationship.
  if (actor.orgId && actor.orgId === patient.orgId) return allow("same_tenant");

  // No tenant ⇒ no basis for a cross-tenant decision (fail closed).
  if (!actor.orgId) return deny("no_consent");

  // Rule 4 — consent artifacts for (patient, actor's tenant), newest first.
  const relevant = lookup.consentsFor(patient.id, actor.orgId);
  const active = relevant.find((c) => isConsentActive(c));
  if (active) return allow("consent_active", active);

  const latest = relevant[0];
  if (!latest) return deny("no_consent");
  return deny(DENIAL_BY_STATUS[latest.status] ?? "no_consent", latest);
}

/**
 * May `actor` WRITE to `patient`'s record?
 *
 * Only the owning tenant writes. Consent is irrelevant here by design — an
 * active consent opens a read (architecture §2.5/§4.2), never an edit of
 * another tenant's registry row. Platform oversight is read-only for the same
 * reason.
 */
export function evaluateWriteAccess(actor: Actor, patient: PatientRef): WriteDecision {
  if (!actor.orgId) return { allowed: false, reason: "no_tenant" };
  if (actor.orgId !== patient.orgId) return { allowed: false, reason: "cross_tenant_write" };
  return { allowed: true, reason: "same_tenant" };
}

/**
 * Which records may appear in a list for this actor (the server-side
 * `visiblePatients`): own tenant + any patient with consent history involving
 * the actor's tenant. Patients outside that set are not merely sealed — they do
 * not exist as far as this actor's search is concerned, which is what stops the
 * registry becoming a national patient directory (doc 08 §4).
 */
export type Visibility =
  | { kind: "all" }
  | { kind: "self"; patientId: string | null }
  | { kind: "tenant"; orgId: string | null; consented: ReadonlySet<string> }
  | { kind: "none" };

export function resolveVisibility(
  actor: Actor,
  lookup: ConsentLookup = consentPlaneLookup,
): Visibility {
  if (actor.role === "SUPER_ADMIN") return { kind: "all" };
  if (actor.role === "PATIENT") return { kind: "self", patientId: actor.patientId };
  if (!actor.orgId) return { kind: "none" };
  switch (actor.role) {
    case "DOCTOR":
    case "HOSPITAL_ADMIN":
    case "LAB":
    case "PHARMACY":
      return {
        kind: "tenant",
        orgId: actor.orgId,
        consented: lookup.consentedPatientIds(actor.orgId),
      };
    default:
      return { kind: "none" };
  }
}

/** Is this record inside the actor's visibility scope at all? */
export function isVisible(visibility: Visibility, patient: PatientRef): boolean {
  switch (visibility.kind) {
    case "all":
      return true;
    case "self":
      return visibility.patientId !== null && visibility.patientId === patient.id;
    case "tenant":
      return (
        (visibility.orgId !== null && visibility.orgId === patient.orgId) ||
        visibility.consented.has(patient.id)
      );
    case "none":
      return false;
  }
}
