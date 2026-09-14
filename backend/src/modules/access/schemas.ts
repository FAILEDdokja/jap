import { z } from "zod";
import { ClinicalRecordTypeSchema } from "../care/schemas.js";

export const EvaluateAccessBodySchema = z.object({
  patientId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  recordType: ClinicalRecordTypeSchema,
});

export const AccessDecisionResponseSchema = z.object({
  decision: z.object({
    allowed: z.boolean(),
    reason: z.enum([
      "self", "consent_active", "patient_not_found", "role_not_permitted", "no_consent",
      "consent_requested", "consent_rejected", "consent_revoked", "consent_expired",
      "consent_not_yet_valid", "purpose_not_allowed", "record_type_not_allowed",
    ]),
    consentId: z.string().nullable(),
    decidedAt: z.string(),
  }),
});

export type EvaluateAccessBody = z.infer<typeof EvaluateAccessBodySchema>;
