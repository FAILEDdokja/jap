/**
 * Zod schemas for the authentication module.
 *
 * These are the single source of truth for runtime validation AND the generated
 * OpenAPI document (via fastify-type-provider-zod).
 */

import { z } from "zod";

export const AuthenticateBodySchema = z.object({
  role: z.string().min(1).describe("Role to authenticate as (e.g. DOCTOR, PATIENT)"),
  identifier: z.string().min(1).describe("Login alias — HPID / username / mobile / ABHA number / address"),
});

export const AuthenticatedUserSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  name: z.string().min(1),
  orgId: z.string().min(1).optional(),
});

export const AuthenticateResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("authenticated"),
    user: AuthenticatedUserSchema,
  }),
  z.object({
    status: z.literal("identifier-not-found"),
  }),
  z.object({
    status: z.literal("role-unavailable"),
  }),
  // Future additive state — kept so OpenAPI documents the seam's extensibility.
  z.object({
    status: z.literal("requires-credential"),
    requestId: z.string(),
    methods: z.array(z.string()),
    maskedContact: z.string(),
  }),
]);

export const SessionResponseSchema = z.object({
  user: AuthenticatedUserSchema,
});

export type AuthenticateBody = z.infer<typeof AuthenticateBodySchema>;
export type AuthenticateResponse = z.infer<typeof AuthenticateResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
