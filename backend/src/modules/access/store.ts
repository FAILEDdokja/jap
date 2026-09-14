export type AccessReason =
  | "self" | "consent_active" | "patient_not_found" | "role_not_permitted" | "no_consent"
  | "consent_requested" | "consent_rejected" | "consent_revoked" | "consent_expired"
  | "consent_not_yet_valid" | "purpose_not_allowed" | "record_type_not_allowed";

export interface AccessDecisionRecord {
  id: string;
  actorId: string;
  organizationId: string | null;
  patientId: string;
  purpose: string;
  recordType: string;
  allowed: boolean;
  reason: AccessReason;
  consentId: string | null;
  decidedAt: string;
}

const decisions: AccessDecisionRecord[] = [];

export function recordDecision(decision: AccessDecisionRecord): void { decisions.push(decision); }
export function resetAccessStore(): void { decisions.length = 0; }
export function allAccessDecisions(): readonly AccessDecisionRecord[] { return decisions; }
