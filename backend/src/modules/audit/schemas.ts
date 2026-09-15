import { z } from "zod";

const AuditEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  organizationId: z.string().nullable(),
  patientId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  purpose: z.string().nullable(),
  authorizationId: z.string().nullable(),
  requestId: z.string().nullable(),
  status: z.enum(["success", "blocked"]),
  sourceIp: z.string().nullable(),
  deviceClass: z.string().nullable(),
  prevEventId: z.string().nullable(),
  prevHash: z.string().nullable(),
  hash: z.string(),
  timestamp: z.string(),
});

export const AuditListQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  actorId: z.string().optional(),
  action: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AuditListResponseSchema = z.object({
  events: z.array(AuditEventSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const AuditErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});

/** Integrity verification report (Phase 4.2). */
export const AuditIntegrityResponseSchema = z.object({
  ok: z.boolean(),
  checked: z.number().int(),
  firstSequence: z.number().int().nullable(),
  lastSequence: z.number().int().nullable(),
  issues: z.array(
    z.object({
      kind: z.string(),
      eventId: z.string(),
      sequence: z.number().int(),
      detail: z.string(),
    }),
  ),
});
