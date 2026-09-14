/**
 * Error-envelope schemas (Zod) — the declared shape of every non-2xx response.
 *
 * Two reasons these exist as schemas rather than ad-hoc objects:
 *
 *   1. **Typed replies.** With `fastify-type-provider-zod`, a route may only
 *      `reply.status(n).send(body)` for a status it declares. Declaring the
 *      error statuses is what lets a handler return 400/401/403/404/409 at all
 *      (and what makes the compiler reject an undeclared one).
 *   2. **OpenAPI honesty.** The generated document shows callers the real
 *      failure contract instead of only the happy path — including the
 *      authorization fields (`reason`, `capability`, `access`) that a sealed
 *      view is rendered from.
 *
 * The envelope itself is owned by `middleware/error-handler.ts`
 * (`{ error: { code, message, requestId } }`); these schemas mirror it and add
 * the authorization fields. `code` is a plain string here rather than a
 * per-status literal because several codes share a status (400 carries both
 * `validation_failed` and the patient module's `invalid_transition`); each
 * schema documents its codes instead.
 *
 * Deliberately NOT declared: 429 and 500. Those are produced by the
 * rate-limit plugin and the centralized error handler outside any route's
 * response map; declaring them would force their bodies through a serializer
 * that could strip fields the handler intentionally set.
 */

import { z } from "zod";
import { AccessDecisionSchema } from "../services/access-schemas.js";

const ErrorBodyBase = {
  message: z.string().describe("Safe, displayable message — never an internal detail."),
  requestId: z.string().optional().describe("Correlation id, echoed on every response."),
};

/** 400 — `validation_failed` (Zod) or a module-level business rejection. */
export const BadRequestResponseSchema = z.object({
  error: z.object({
    code: z.string().describe("`validation_failed` | `invalid_transition`"),
    ...ErrorBodyBase,
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .describe("Per-field validation issues (omitted in production)."),
  }),
});

/** 401 — `unauthenticated`: no session, or an expired/revoked one. */
export const UnauthorizedResponseSchema = z.object({
  error: z.object({
    code: z.string().describe("`unauthenticated`"),
    ...ErrorBodyBase,
  }),
});

/**
 * 403 — `forbidden`: authenticated, but not permitted.
 *
 * `reason` distinguishes the two authorization layers that can deny:
 *   - `role_not_permitted`            Layer 2 — the role lacks the capability
 *     (named in `capability`)
 *   - an `AccessDecision` reason      Layer 3/4 — `no_consent`,
 *     `consent_pending`, `consent_expired`, `consent_revoked`, `consent_denied`
 *     (the full decision is in `access`)
 *   - `cross_tenant_write` /          a write outside the owning tenant, or an
 *     `no_tenant`                     actor with no tenant
 *
 * A 403 never carries patient data — that is what makes it a sealed view
 * rather than a partial leak.
 */
export const ForbiddenResponseSchema = z.object({
  error: z.object({
    code: z.string().describe("`forbidden`"),
    ...ErrorBodyBase,
    reason: z.string().optional().describe("Why the request was denied."),
    capability: z.string().optional().describe("Capability checked (Layer 2 denials)."),
    access: AccessDecisionSchema.optional().describe("Data-level decision (Layer 3/4 denials)."),
  }),
});

/** 404 — `not_found`: unknown id, with no hint about which ids exist. */
export const NotFoundResponseSchema = z.object({
  error: z.object({
    code: z.string().describe("`not_found` | `identity_not_found`"),
    ...ErrorBodyBase,
  }),
});

/** 409 — `identity_conflict`: a canonical identifier already exists. */
export const ConflictResponseSchema = z.object({
  error: z.object({
    code: z.string().describe("`identity_conflict`"),
    ...ErrorBodyBase,
  }),
});

/**
 * The error statuses every patient/clinical route declares. Spread into a
 * route's `response` map:
 *
 * ```ts
 * response: { 200: PatientResponseSchema, ...ERROR_RESPONSES }
 * ```
 */
export const ERROR_RESPONSES = {
  400: BadRequestResponseSchema,
  401: UnauthorizedResponseSchema,
  403: ForbiddenResponseSchema,
  404: NotFoundResponseSchema,
  409: ConflictResponseSchema,
} as const;

/** Routes that cannot conflict (409) use this narrower set. */
export const ERROR_RESPONSES_NO_CONFLICT = {
  400: BadRequestResponseSchema,
  401: UnauthorizedResponseSchema,
  403: ForbiddenResponseSchema,
  404: NotFoundResponseSchema,
} as const;
