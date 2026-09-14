import { randomUUID } from "node:crypto";
import { listConsents } from "../consents/service.js";
import type { ConsentRecord } from "../consents/store.js";
import { getPatient } from "../patients/store.js";
import { recordDecision, resetAccessStore, type AccessReason } from "./store.js";
import type { EvaluateAccessBody } from "./schemas.js";

export { resetAccessStore };

type Actor = { id: string; role: string; orgId?: string; patientId?: string };
type Reason = AccessReason;
const CLINICAL_ROLES = new Set(["DOCTOR", "HOSPITAL_ADMIN", "LAB", "PHARMACY"]);

/** What the endpoint answers with when there is a record to decide about. */
export interface AccessEvaluation {
  allowed: boolean;
  reason: Reason;
  detail: string | null;
  consentId: string | null;
  decidedAt: string;
}

type Failure = { ok: false; code: "patient_not_found"; message: string };
type Result = { ok: true; value: AccessEvaluation } | Failure;

function decide(
  actor: Actor,
  input: EvaluateAccessBody,
  allowed: boolean,
  reason: Reason,
  consentId: string | null,
  detail: string | null = null,
): Result {
  const decision = {
    id: randomUUID(), actorId: actor.id, organizationId: actor.orgId ?? null,
    patientId: input.patientId, purpose: input.purpose, recordType: input.recordType,
    allowed, reason, detail, consentId, decidedAt: new Date().toISOString(),
  };
  recordDecision(decision);
  return { ok: true, value: { allowed, reason, detail, consentId, decidedAt: decision.decidedAt } };
}

/**
 * Plane status → the canonical denial. The plane distinguishes REQUESTED from
 * APPROVED-but-not-yet-in-force; the vocabulary does not, because a UI (and a
 * patient) needs one word for "not effective yet". The refinement travels in
 * `detail`.
 */
function consentReason(consent: ConsentRecord): { reason: Reason; detail: string | null } {
  switch (consent.status) {
    case "REQUESTED": return { reason: "consent_pending", detail: null };
    case "REJECTED": return { reason: "consent_denied", detail: null };
    case "REVOKED": return { reason: "consent_revoked", detail: null };
    case "EXPIRED": return { reason: "consent_expired", detail: null };
    case "APPROVED": return { reason: "no_consent", detail: null };
  }
}

/** The server-owned authorization decision point; browser claims are never used. */
export function evaluateAccess(actor: Actor, input: EvaluateAccessBody): Result {
  // No patient, no decision: a 404, not a denial. Recording a decision about a
  // record that does not exist would put a fabricated row in the trail.
  if (!getPatient(input.patientId)) {
    return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  }
  if (actor.role === "PATIENT") {
    return actor.patientId === input.patientId
      ? decide(actor, input, true, "self", null)
      : decide(actor, input, false, "role_not_permitted", null);
  }
  if (!CLINICAL_ROLES.has(actor.role) || !actor.orgId) return decide(actor, input, false, "role_not_permitted", null);

  const relevant = listConsents({ patientId: input.patientId })
    .filter((consent) => consent.requesterOrganizationId === actor.orgId);
  // Purpose and record type are constraints on an approved, time-valid consent.
  const approved = relevant.filter((consent) => consent.status === "APPROVED");
  if (approved.length === 0) {
    // The newest artifact on file names the denial; no artifact at all is
    // `no_consent`.
    const newest = relevant[0];
    if (!newest) return decide(actor, input, false, "no_consent", null);
    const { reason, detail } = consentReason(newest);
    return decide(actor, input, false, reason, null, detail);
  }
  const samePurpose = approved.filter((consent) => consent.purpose === input.purpose);
  if (samePurpose.length === 0) {
    return decide(actor, input, false, "no_consent", approved[0]!.id, "purpose_not_allowed");
  }
  const matching = samePurpose.find((consent) => consent.recordTypes.includes(input.recordType));
  if (!matching) {
    return decide(actor, input, false, "no_consent", samePurpose[0]!.id, "record_type_not_allowed");
  }
  if (matching.validFrom > new Date().toISOString().slice(0, 10)) {
    return decide(actor, input, false, "consent_pending", matching.id, "not_yet_valid");
  }
  // `listConsents` refreshes expiry before returning. An APPROVED result is therefore in-window.
  return decide(actor, input, true, "consent_active", matching.id);
}
