import { z } from "zod";

const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "must be a real calendar date");

export const ConsentStatusSchema = z.enum(["REQUESTED", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"]);

export const CreateConsentBodySchema = z.object({
  patientId: z.string().uuid(),
  purpose: z.string().min(1).max(500),
  recordTypes: z.array(z.string().min(1).max(100)).min(1).max(20).transform((types) => [...new Set(types)]),
  validFrom: CalendarDateSchema.optional(),
  validUntil: CalendarDateSchema,
}).superRefine((body, context) => {
  if (body.validFrom && body.validUntil < body.validFrom) {
    context.addIssue({ code: "custom", path: ["validUntil"], message: "must be on or after validFrom" });
  }
});

export const DecisionBodySchema = z.object({ note: z.string().min(1).max(2_000).optional() });
export const ListConsentsQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  status: ConsentStatusSchema.optional(),
});

const ConsentViewSchema = z.object({
  id: z.string(), patientId: z.string(), requesterId: z.string(), requesterName: z.string(),
  requesterOrganizationId: z.string(), purpose: z.string(), recordTypes: z.array(z.string()),
  validFrom: z.string(), validUntil: z.string(), status: ConsentStatusSchema, createdAt: z.string(),
  decidedAt: z.string().nullable(), decidedById: z.string().nullable(), revokedAt: z.string().nullable(), note: z.string().nullable(),
});

export const ConsentResponseSchema = z.object({ consent: ConsentViewSchema });
export const ConsentListResponseSchema = z.object({ consents: z.array(ConsentViewSchema) });
export const ConsentErrorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }) });

export type CreateConsentBody = z.infer<typeof CreateConsentBodySchema>;
export type ListConsentsQuery = z.infer<typeof ListConsentsQuerySchema>;
