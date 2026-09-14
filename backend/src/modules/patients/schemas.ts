/**
 * Zod schemas for the patients module (Phase 4).
 *
 * Single source of truth for runtime validation AND the OpenAPI document
 * (via fastify-type-provider-zod), same as the auth/health modules.
 *
 * Key design rules encoded here:
 *   - ABHA is optional everywhere — a body with no `identities` validates
 *     fine (healthcare delivery must not require ABHA).
 *   - Identity input carries NO `verified` field: a client can declare an
 *     identifier but can never assert its verification state. Verification
 *     transitions happen server-side only (ABDM-adapter-owned fact).
 *   - Values are canonicalized in the schema transform so the service and
 *     store only ever see canonical forms (doc 04 §3).
 */

import { z } from "zod";

export const GenderSchema = z.enum(["Male", "Female", "Other"]);

/** Calendar date `YYYY-MM-DD` (doc 05 §6 — clinical dates are DATE, age derived). */
export const DobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be a calendar date (YYYY-MM-DD)")
  .refine((s) => {
    const date = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
  }, {
    message: "dob must be a real calendar date",
  });

/**
 * ABHA number input — accepts formatted (`23-4567-8912-3401`), bare
 * (`23456789123401`) or space-separated digits. Transforms to the canonical
 * 14-digit form; anything else fails validation WITHOUT hinting whether the
 * value exists (doc 06 §5).
 */
export const AbhaNumberInputSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => /^\d{14}$/.test(v), {
    message: "ABHA number must contain exactly 14 digits",
  });

/** ABHA address input — canonicalized to lowercase, whitespace stripped. */
export const AbhaAddressInputSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, "").toLowerCase())
  .refine((v) => /^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*$/.test(v), {
    message: "ABHA address must look like name@domain (e.g. amit.kumar@abdm)",
  });

export const PatientIdentityTypeSchema = z.enum(["ABHA_NUMBER", "ABHA_ADDRESS"]);

/**
 * One declared external identifier. The discriminated union applies the
 * per-type canonicalization/validation; `value` arrives canonical.
 */
export const PatientIdentityInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ABHA_NUMBER"), value: AbhaNumberInputSchema }),
  z.object({ type: z.literal("ABHA_ADDRESS"), value: AbhaAddressInputSchema }),
]);

export const ContactInputSchema = z
  .object({
    phone: z.string().min(3).max(32).optional(),
    address: z.string().min(1).max(500).optional(),
    email: z.string().email().optional(),
  })
  .optional();

export const EmergencyContactInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    relation: z.string().min(1).max(100).optional(),
    phone: z.string().min(3).max(32).optional(),
  })
  .optional();

// ── POST /api/v1/patients ────────────────────────────────────────────────────

export const CreatePatientBodySchema = z.object({
  /**
   * Lifecycle on arrival. `provisional` = walk-in / emergency intake with
   * minimal demographics (name only); `registered` = full demographics.
   */
  status: z.enum(["provisional", "registered"]).optional(),
  name: z.string().min(1).max(200),
  gender: GenderSchema.optional(),
  dob: DobSchema.optional(),
  bloodGroup: z.string().max(8).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(1000).optional(),
  contact: ContactInputSchema,
  emergencyContact: EmergencyContactInputSchema,
  /**
   * Optional declared identifiers (ABHA number and/or address). NEVER
   * required. Each is stored in `patient_identities` as UNVERIFIED —
   * verification is a separate, server-owned transition.
   */
  identities: z.array(PatientIdentityInputSchema).max(4).optional(),
});

// ── PATCH /api/v1/patients/:id ───────────────────────────────────────────────

export const UpdatePatientBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  gender: GenderSchema.optional(),
  dob: DobSchema.optional(),
  bloodGroup: z.string().max(8).optional(),
  heightCm: z.number().positive().max(300).optional(),
  weightKg: z.number().positive().max(1000).optional(),
  contact: ContactInputSchema,
  emergencyContact: EmergencyContactInputSchema,
  /** Lifecycle transition: `provisional` → `registered` (one-way, explicit). */
  status: z.literal("registered").optional(),
  /** Declare one more external identifier (stored unverified). */
  addIdentity: PatientIdentityInputSchema.optional(),
  /**
   * Mark a previously declared identity as verified. In production this is
   * the hook the ABDM verification adapter (doc 04 §6 — patient-verifications
   * confirm) calls after a successful OTP verification; it exists as an
   * explicit server-side action so the verification state can never be
   * smuggled in through a demographic update.
   */
  markIdentityVerified: z.string().uuid().optional(),
});

// ── GET /api/v1/patients ─────────────────────────────────────────────────────

export const ListPatientsQuerySchema = z.object({
  /** Case-insensitive substring match on name. */
  q: z.string().max(200).optional(),
  orgId: z.string().min(1).optional(),
  /** Derived linkage state filter. */
  state: z.enum(["provisional", "registered", "abha_linked"]).optional(),
  status: z.enum(["provisional", "registered"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Responses ────────────────────────────────────────────────────────────────

export const PatientIdentityViewSchema = z.object({
  id: z.string(),
  type: PatientIdentityTypeSchema,
  /** Masked form ONLY — the full value never leaves the server (doc 04 §3). */
  masked: z.string(),
  verified: z.boolean(),
  primary: z.boolean(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const PatientStateSchema = z.enum(["provisional", "registered", "abha_linked"]);

export const PatientViewSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  status: z.enum(["provisional", "registered"]),
  /** Derived linkage state — see service.deriveState. */
  state: PatientStateSchema,
  name: z.string(),
  gender: GenderSchema.nullable(),
  dob: z.string().nullable(),
  bloodGroup: z.string().nullable(),
  heightCm: z.number().nullable(),
  weightKg: z.number().nullable(),
  contact: z.object({
    phone: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
  }),
  emergencyContact: z.object({
    name: z.string().nullable(),
    relation: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  identities: z.array(PatientIdentityViewSchema),
  registeredOn: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PatientResponseSchema = z.object({ patient: PatientViewSchema });

/** Standard API error envelope for documented patient-route failures. */
export const PatientErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export const PatientListResponseSchema = z.object({
  patients: z.array(PatientViewSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type CreatePatientBody = z.infer<typeof CreatePatientBodySchema>;
export type UpdatePatientBody = z.infer<typeof UpdatePatientBodySchema>;
export type ListPatientsQuery = z.infer<typeof ListPatientsQuerySchema>;
export type PatientView = z.infer<typeof PatientViewSchema>;
export type PatientIdentityInput = z.infer<typeof PatientIdentityInputSchema>;

