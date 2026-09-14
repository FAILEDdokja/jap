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

function decide(actor: Actor, input: EvaluateAccessBody, allowed: boolean, reason: Reason, consentId: string | null) {
  const decision = {
    id: randomUUID(), actorId: actor.id, organizationId: actor.orgId ?? null,
    patientId: input.patientId, purpose: input.purpose, recordType: input.recordType,
    allowed, reason, consentId, decidedAt: new Date().toISOString(),
  };
  recordDecision(decision);
  return { allowed, reason, consentId, decidedAt: decision.decidedAt };
}

function consentReason(consent: ConsentRecord): Reason {
  switch (consent.status) {
    case "REQUESTED": return "consent_requested";
    case "REJECTED": return "consent_rejected";
    case "REVOKED": return "consent_revoked";
    case "EXPIRED": return "consent_expired";
    case "APPROVED": return "no_consent";
  }
}

/** The server-owned authorization decision point; browser claims are never used. */
export function evaluateAccess(actor: Actor, input: EvaluateAccessBody) {
  if (!getPatient(input.patientId)) return decide(actor, input, false, "patient_not_found", null);
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
  if (approved.length === 0) return decide(actor, input, false, relevant[0] ? consentReason(relevant[0]) : "no_consent", null);
  const samePurpose = approved.filter((consent) => consent.purpose === input.purpose);
  if (samePurpose.length === 0) return decide(actor, input, false, "purpose_not_allowed", approved[0]!.id);
  const matching = samePurpose.find((consent) => consent.recordTypes.includes(input.recordType));
  if (!matching) return decide(actor, input, false, "record_type_not_allowed", samePurpose[0]!.id);
  if (matching.validFrom > new Date().toISOString().slice(0, 10)) {
    return decide(actor, input, false, "consent_not_yet_valid", matching.id);
  }
  // `listConsents` refreshes expiry before returning. An APPROVED result is therefore in-window.
  return decide(actor, input, true, "consent_active", matching.id);
}
