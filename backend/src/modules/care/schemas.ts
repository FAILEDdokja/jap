import { z } from "zod";

const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "must be a real calendar date");

export const EncounterSettingSchema = z.enum(["OPD", "IPD", "Emergency", "Teleconsult"]);
export const EncounterStatusSchema = z.enum(["in_progress", "completed", "cancelled"]);
export const ClinicalRecordTypeSchema = z.enum([
  "ALLERGY", "CONDITION", "MEDICATION", "NOTE", "VITAL", "OBSERVATION",
  "CONSULTATION", "DIAGNOSIS", "PRESCRIPTION", "LAB_ORDER", "LAB_RESULT",
  "PROCEDURE", "ADMISSION", "DISCHARGE", "IMMUNIZATION",
]);

export const CreateEncounterBodySchema = z.object({
  date: CalendarDateSchema,
  setting: EncounterSettingSchema,
  status: EncounterStatusSchema.optional(),
  facilityName: z.string().min(1).max(200).optional(),
  reason: z.string().min(1).max(2_000).optional(),
  assessment: z.string().min(1).max(10_000).optional(),
  disposition: z.string().min(1).max(1_000).optional(),
  notes: z.string().min(1).max(10_000).optional(),
});

export const UpdateEncounterBodySchema = CreateEncounterBodySchema.partial().refine(
  (body) => Object.keys(body).length > 0,
  "provide at least one field to update",
);

export const CreateClinicalRecordBodySchema = z.object({
  type: ClinicalRecordTypeSchema,
  title: z.string().min(1).max(500).optional(),
  detail: z.string().min(1).max(10_000).optional(),
  occurredOn: CalendarDateSchema.optional(),
  encounterId: z.string().uuid().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  correctsId: z.string().uuid().optional(),
  correctionReason: z.string().min(1).max(2_000).optional(),
}).superRefine((body, context) => {
  if (body.correctsId && !body.correctionReason) {
    context.addIssue({ code: "custom", path: ["correctionReason"], message: "required when correcting a record" });
  }
});

const EncounterViewSchema = z.object({
  id: z.string(), patientId: z.string(), orgId: z.string(), facilityName: z.string().nullable(),
  date: z.string(), setting: EncounterSettingSchema, status: EncounterStatusSchema,
  clinicianId: z.string(), clinicianName: z.string(), reason: z.string().nullable(),
  assessment: z.string().nullable(), disposition: z.string().nullable(), notes: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

const ClinicalRecordViewSchema = z.object({
  id: z.string(), patientId: z.string(), orgId: z.string(), encounterId: z.string().nullable(),
  type: ClinicalRecordTypeSchema, title: z.string().nullable(), detail: z.string().nullable(),
  occurredOn: z.string().nullable(), data: z.record(z.string(), z.unknown()).nullable(),
  recordedById: z.string(), recordedByName: z.string(), correctsId: z.string().nullable(),
  correctionReason: z.string().nullable(), createdAt: z.string(),
});

export const EncounterResponseSchema = z.object({ encounter: EncounterViewSchema });
export const EncounterListResponseSchema = z.object({ encounters: z.array(EncounterViewSchema) });
export const ClinicalRecordResponseSchema = z.object({ record: ClinicalRecordViewSchema });
export const ClinicalRecordListResponseSchema = z.object({ records: z.array(ClinicalRecordViewSchema) });
export const TimelineResponseSchema = z.object({
  events: z.array(z.object({
    id: z.string(), date: z.string(), type: z.string(), title: z.string(), summary: z.string().nullable(),
    encounterId: z.string().nullable(), recordedBy: z.string().nullable(),
  })),
});
export const CareErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});

export type CreateEncounterBody = z.infer<typeof CreateEncounterBodySchema>;
export type UpdateEncounterBody = z.infer<typeof UpdateEncounterBodySchema>;
export type CreateClinicalRecordBody = z.infer<typeof CreateClinicalRecordBodySchema>;
