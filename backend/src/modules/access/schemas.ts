import { z } from "zod";
import { AccessReasonSchema } from "../../services/access-schemas.js";
import { ClinicalRecordTypeSchema } from "../care/schemas.js";

export const EvaluateAccessBodySchema = z.object({
  patientId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  recordType: ClinicalRecordTypeSchema,
});

export const AccessDecisionResponseSchema = z.object({
  decision: z.object({
    allowed: z.boolean(),
    /** The canonical §2.5 vocabulary, shared with the patient-registry decision. */
    reason: AccessReasonSchema,
    /** Which constraint failed when the reason alone is not specific enough. */
    detail: z.string().nullable(),
    consentId: z.string().nullable(),
    decidedAt: z.string(),
  }),
});

export type EvaluateAccessBody = z.infer<typeof EvaluateAccessBodySchema>;
