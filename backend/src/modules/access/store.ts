/**
 * The reason vocabulary is the canonical one (architecture §2.5), owned by
 * `services/access-service.ts` and shared with the patient-registry decision so
 * that a denial means the same thing whichever endpoint reported it. This
 * module does not define its own dialect: `consent_requested` is
 * `consent_pending`, `consent_rejected` is `consent_denied`, and the
 * purpose/record-type/window refinements are `no_consent` and
 * `consent_pending` with a `detail` saying which. An unknown patient is not a
 * decision at all — it is a 404 (there is no record to decide about).
 */
import { type AccessReason } from "../../services/access-service.js";

export type { AccessReason };

export interface AccessDecisionRecord {
  id: string;
  actorId: string;
  organizationId: string | null;
  patientId: string;
  purpose: string;
  recordType: string;
  allowed: boolean;
  reason: AccessReason;
  /**
   * The refinement a shared vocabulary folds together: `purpose_not_allowed`
   * and `record_type_not_allowed` under `no_consent`, `not_yet_valid` under
   * `consent_pending`. Null when the reason says all there is to say.
   */
  detail: string | null;
  consentId: string | null;
  decidedAt: string;
}

const decisions: AccessDecisionRecord[] = [];

export function recordDecision(decision: AccessDecisionRecord): void { decisions.push(decision); }
export function resetAccessStore(): void { decisions.length = 0; }
export function allAccessDecisions(): readonly AccessDecisionRecord[] { return decisions; }
