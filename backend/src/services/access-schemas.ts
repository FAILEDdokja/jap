/**
 * API contract of the access layer.
 *
 * `AccessDecision` is part of the public contract, not an internal detail:
 * `ConsentPill.tsx` renders `decision.reason` verbatim and `PatientProfile.tsx`
 * gates on `decision.allowed` (architecture §4.1, §2.5). So the reason union is
 * **closed** — additive changes only, never renames — and the decision travels
 * with patient reads (200) and with denials (403).
 *
 * The consent artifact is projected before it leaves the server: purpose, the
 * requester's note, status, covered record types and the validity window are
 * the facts a UI needs to explain a decision; `requestingOrgId` (the actor's
 * own tenant) and `requestingUserId` (an internal account id) are not, and
 * neither is `decidedById` — the plane records who decided, the API does not
 * publish it.
 */

import { z } from "zod";
import { ACCESS_REASONS, type AccessDecision } from "./access-service.js";
import type { ConsentArtifact } from "./consent-view.js";

export const AccessReasonSchema = z.enum(ACCESS_REASONS);

export const ConsentProjectionSchema = z.object({
  id: z.string(),
  /** Purpose code the artifact was requested under (`TREATMENT`, …). */
  purpose: z.string(),
  status: z.enum(["pending", "approved", "denied", "expired", "revoked"]),
  /** The requester's plain-words reason, or the patient's note on deciding. */
  note: z.string().nullable(),
  /** Clinical record types the artifact covers (`modules/care` vocabulary). */
  scope: z.array(z.string()),
  requestedOn: z.string(),
  validFrom: z.string(),
  decidedOn: z.string().nullable(),
  expiresOn: z.string().nullable(),
});

export const AccessDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: AccessReasonSchema,
  /** The artifact the decision rests on, when there is one. */
  consent: ConsentProjectionSchema.nullable(),
});

export type AccessDecisionView = z.infer<typeof AccessDecisionSchema>;
export type ConsentProjection = z.infer<typeof ConsentProjectionSchema>;

export function projectConsent(consent: ConsentArtifact | null): ConsentProjection | null {
  if (!consent) return null;
  return {
    id: consent.id,
    purpose: consent.purpose,
    status: consent.status,
    note: consent.note,
    scope: [...consent.scope],
    requestedOn: consent.requestedOn,
    validFrom: consent.validFrom,
    decidedOn: consent.decidedOn,
    expiresOn: consent.expiresOn,
  };
}

/** Service decision → wire shape. */
export function toAccessDecisionView(decision: AccessDecision): AccessDecisionView {
  return {
    allowed: decision.allowed,
    reason: decision.reason,
    consent: projectConsent(decision.consent),
  };
}
