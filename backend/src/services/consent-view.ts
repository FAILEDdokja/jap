/**
 * Consent view — the READ side of consent artifacts that access evaluation
 * needs (architecture §2.5 rule 4).
 *
 * The consent PLANE is `modules/consents`: it owns the workflow (a clinician
 * requests, only the patient decides, expiry is refreshed on read, revocation
 * closes access at once). This module is an adapter over that plane, never a
 * second copy of it — the authorization stack reads consent state through here
 * and holds no table of its own:
 *
 *   - the plane's `ConsentRecord` is the source of truth: id, validity window,
 *     status, who asked, what was written when it was decided;
 *   - this module projects it into the §2.5 vocabulary the decision and the UI
 *     speak (`pending | approved | denied | expired | revoked`) and leaves the
 *     internal fields (`decidedById`) out of what callers receive;
 *   - every read returns a fresh copy, so no caller can mutate consent state
 *     through the authorization stack.
 *
 * It also seeds the five demo artifacts (`con-01`…`con-05`) into the plane. The
 * plane ships with an empty store, and without artifacts on file every
 * cross-tenant read would collapse to `no_consent` — the isolation layer could
 * not then be distinguished from a blanket denial. Seeding goes through
 * `insertConsent`, so these are ordinary rows the plane's own endpoints list,
 * decide and revoke like any other consent.
 *
 * Two deliberate choices in the seed:
 *
 *   - Dates are RELATIVE TO NOW. The frontend seed anchors its clock at
 *     2026-09-10, which would silently expire `con-01` (the one genuinely
 *     active cross-tenant grant) and change the demo's meaning without anyone
 *     editing a file. Statuses and the (patient, requesting-org) pairs are 1:1
 *     with the frontend seed.
 *   - `purpose` uses the plane's purpose codes, because
 *     `/api/v1/access/evaluate` matches purpose exactly: with codes, the
 *     sharing decision and the patient-registry decision agree on the same
 *     artifacts instead of talking past each other. The human sentence the
 *     requester wrote lives in `note`.
 *
 * In production the plane's store becomes a Prisma read over `consents` +
 * `consent_records`; `access-service` keeps calling the same three functions.
 */

import { DEMO_CONSENT_ID, DEMO_ORG_ID, DEMO_PATIENT_ID } from "../lib/demo-ids.js";
import { listConsents } from "../modules/consents/service.js";
import { getConsent, insertConsent, type ConsentRecord, type ConsentStatus as PlaneConsentStatus } from "../modules/consents/store.js";

export type ConsentStatus = "pending" | "approved" | "denied" | "expired" | "revoked";

/** Plane status → the §2.5 vocabulary `AccessDecision` and the pill speak. */
const STATUS_VIEW: Record<PlaneConsentStatus, ConsentStatus> = {
  REQUESTED: "pending",
  APPROVED: "approved",
  REJECTED: "denied",
  REVOKED: "revoked",
  EXPIRED: "expired",
};

export interface ConsentArtifact {
  id: string;
  patientId: string;
  /** The organization that asked for access (the actor's tenant). */
  requestingOrgId: string;
  requestingUserId: string | null;
  /** Purpose code (`TREATMENT`, `SECOND_OPINION`, …). */
  purpose: string;
  /** The requester's plain-words reason, or the patient's note on deciding. */
  note: string | null;
  /** Clinical record types covered (`modules/care` vocabulary). */
  scope: string[];
  status: ConsentStatus;
  /** Calendar-day ISO timestamps. */
  requestedOn: string;
  decidedOn: string | null;
  /** First day the grant is in force. */
  validFrom: string;
  expiresOn: string | null;
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** The plane compares validity windows as calendar days (`YYYY-MM-DD`). */
const calendarDay = (iso: string): string => iso.slice(0, 10);

function toArtifact(record: ConsentRecord): ConsentArtifact {
  return {
    id: record.id,
    patientId: record.patientId,
    requestingOrgId: record.requesterOrganizationId,
    requestingUserId: record.requesterId,
    purpose: record.purpose,
    note: record.note,
    scope: [...record.recordTypes],
    status: STATUS_VIEW[record.status],
    requestedOn: record.createdAt,
    decidedOn: record.decidedAt,
    validFrom: record.validFrom,
    expiresOn: record.validUntil,
  };
}

interface DemoConsent {
  id: string;
  patientId: string;
  requestingOrgId: string;
  requestingUserId: string;
  requestingUserName: string;
  purpose: string;
  note: string;
  scope: string[];
  /**
   * The status to insert. `con-04` is inserted APPROVED with a window that has
   * already closed so the plane's own expiry refresh — not a hardcoded status —
   * is what makes it `expired`.
   */
  status: PlaneConsentStatus;
  requestedDaysAgo: number;
  decidedDaysAgo: number | null;
  /** The account that decided it, when the demo registry has one. */
  decidedById: string | null;
  validFromDaysAgo: number;
  validUntilInDays: number;
}

const DEMO_CONSENTS: DemoConsent[] = [
  {
    id: DEMO_CONSENT_ID.nmcSunita,
    patientId: DEMO_PATIENT_ID.sunitaDeshmukh,
    requestingOrgId: DEMO_ORG_ID.nmc,
    requestingUserId: "u-aroha",
    requestingUserName: "Dr. Aroha Deshpande",
    purpose: "TREATMENT",
    note: "Co-management of diabetes during the Nashik visit",
    scope: ["DIAGNOSIS", "MEDICATION", "LAB_RESULT", "CONSULTATION"],
    status: "APPROVED",
    requestedDaysAgo: 9,
    decidedDaysAgo: 9,
    decidedById: null,
    validFromDaysAgo: 9,
    // Approved and unexpired ⇒ the one genuinely ACTIVE cross-tenant grant.
    validUntilInDays: 81,
  },
  {
    id: DEMO_CONSENT_ID.nmcIqbal,
    patientId: DEMO_PATIENT_ID.iqbalAnsari,
    requestingOrgId: DEMO_ORG_ID.nmc,
    requestingUserId: "u-vikram",
    requestingUserName: "Dr. Vikram Nair",
    purpose: "REFERRAL",
    note: "Pre-operative pulmonary assessment referral",
    scope: ["DIAGNOSIS", "MEDICATION", "CONSULTATION"],
    status: "REQUESTED",
    requestedDaysAgo: 2,
    decidedDaysAgo: null,
    decidedById: null,
    validFromDaysAgo: 0,
    validUntilInDays: 30,
  },
  {
    id: DEMO_CONSENT_ID.sanjivaniAmit,
    patientId: DEMO_PATIENT_ID.amitKumar,
    requestingOrgId: DEMO_ORG_ID.sanjivani,
    requestingUserId: "u-farah",
    requestingUserName: "Dr. Farah Sheikh",
    purpose: "SECOND_OPINION",
    note: "Cardiology opinion on exertional breathlessness",
    scope: ["DIAGNOSIS", "MEDICATION", "LAB_RESULT", "CONSULTATION", "PRESCRIPTION"],
    status: "REQUESTED",
    requestedDaysAgo: 1,
    decidedDaysAgo: null,
    decidedById: null,
    validFromDaysAgo: 0,
    validUntilInDays: 30,
  },
  {
    id: DEMO_CONSENT_ID.sanjivaniPriya,
    patientId: DEMO_PATIENT_ID.priyaPatel,
    requestingOrgId: DEMO_ORG_ID.sanjivani,
    requestingUserId: "u-farah",
    requestingUserName: "Dr. Farah Sheikh",
    purpose: "SECOND_OPINION",
    note: "Second opinion, chronic cough",
    scope: ["DIAGNOSIS", "CONSULTATION"],
    status: "APPROVED",
    requestedDaysAgo: 135,
    decidedDaysAgo: 135,
    decidedById: "u-priya",
    validFromDaysAgo: 135,
    // Closed 43 days ago: the plane expires it on read.
    validUntilInDays: -43,
  },
  {
    id: DEMO_CONSENT_ID.sanjivaniRahul,
    patientId: DEMO_PATIENT_ID.rahulSharma,
    requestingOrgId: DEMO_ORG_ID.sanjivani,
    requestingUserId: "u-farah",
    requestingUserName: "Dr. Farah Sheikh",
    purpose: "TREATMENT",
    note: "Orthopaedic records request — declined by the patient",
    scope: ["CONSULTATION", "LAB_RESULT"],
    status: "REJECTED",
    requestedDaysAgo: 92,
    decidedDaysAgo: 91,
    decidedById: null,
    validFromDaysAgo: 92,
    validUntilInDays: 30,
  },
];

/**
 * Put the demo artifacts in the plane. Idempotent by id: a second call is a
 * no-op, and `resetConsentStore()` in a test is followed by one call to restore
 * the demo state.
 */
export function seedDemoConsents(): void {
  for (const demo of DEMO_CONSENTS) {
    if (getConsent(demo.id)) continue;
    insertConsent({
      id: demo.id,
      patientId: demo.patientId,
      requesterId: demo.requestingUserId,
      requesterName: demo.requestingUserName,
      requesterOrganizationId: demo.requestingOrgId,
      purpose: demo.purpose,
      recordTypes: [...demo.scope],
      validFrom: calendarDay(daysFromNow(-demo.validFromDaysAgo)),
      validUntil: calendarDay(daysFromNow(demo.validUntilInDays)),
      status: demo.status,
      createdAt: daysFromNow(-demo.requestedDaysAgo),
      decidedAt: demo.decidedDaysAgo === null ? null : daysFromNow(-demo.decidedDaysAgo),
      decidedById: demo.decidedById,
      revokedAt: null,
      note: demo.note,
    });
  }
}

/**
 * Is a consent usable RIGHT NOW? Approved and inside its validity window — the
 * §2.5 rule-4 test, and the same window arithmetic the plane applies. A
 * `revoked` or `denied` artifact is never active however far away its expiry
 * is, and an approved one that has not started yet is not active either.
 */
export function isConsentActive(consent: ConsentArtifact, now: number = Date.now()): boolean {
  if (consent.status !== "approved") return false;
  const today = calendarDay(new Date(now).toISOString());
  if (calendarDay(consent.validFrom) > today) return false;
  if (consent.expiresOn !== null && calendarDay(consent.expiresOn) < today) return false;
  return true;
}

/**
 * Artifacts for one patient requested by one tenant, newest first. Reads go
 * through the plane's `listConsents`, which refreshes expiry before returning —
 * so an `approved` artifact here is in-window by construction.
 */
export function consentsFor(patientId: string, requestingOrgId: string): ConsentArtifact[] {
  return listConsents({ patientId })
    .filter((record) => record.requesterOrganizationId === requestingOrgId)
    .map(toArtifact);
}

/**
 * Patients a tenant has ANY consent history with (active or not). This is what
 * makes a cross-tenant patient *listable but sealed* — the tenant asked, so it
 * may know the request exists; it may not read the record until the artifact is
 * active (architecture §2.5, `visiblePatients`).
 */
export function consentedPatientIds(requestingOrgId: string): Set<string> {
  return new Set(
    listConsents({})
      .filter((record) => record.requesterOrganizationId === requestingOrgId)
      .map((record) => record.patientId),
  );
}

/** Every artifact the plane holds, projected. Test and introspection helper. */
export function allConsents(): ConsentArtifact[] {
  return listConsents({}).map(toArtifact);
}

// The demo registry is seeded at import (as the patient store is): a server
// that starts with an empty consent plane cannot demonstrate the cross-tenant
// rule at all.
seedDemoConsents();
