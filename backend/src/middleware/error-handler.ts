/**
 * Centralized error handling.
 *
 * Every error — validation, rate limiting, unknown routes, thrown exceptions —
 * is normalized here into one stable envelope so clients never see stack
 * traces, driver internals, or inconsistent shapes:
 *
 *   { "error": { "code": "…", "message": "…", "requestId": "…" , "details"?: … } }
 *
 * Conventions (docs/architecture.md §4.8, docs/backend/06):
 *   400 validation_failed   request body/params/headers failed the Zod schema
 *   404 not_found           unknown route
 *   429 rate_limited        rate limit exceeded
 *   500 internal_error      unexpected failure (logged server-side, opaque to caller)
 *
 * Validation `details` are included only outside production.
 */
import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ path: string; message: string }>;
  };
}

function zodIssues(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)",
    message: issue.message,
  }));
}

export interface ErrorHandlerOptions {
  /** Include validation details in responses (off in production). */
  exposeDetails: boolean;
}

export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const requestId = request.id;

    const send = (status: number, envelope: ErrorEnvelope): void => {
      reply.status(status).send(envelope);
    };

    // Rate limiting (from @fastify/rate-limit).
    if (error.statusCode === 429 || error.code === "FST_RATE_LIMIT") {
      request.log.warn({ requestId }, "rate limit exceeded");
      return send(429, {
        error: {
          code: "rate_limited",
          message: "Too many requests — please slow down and retry shortly.",
          requestId,
        },
      });
    }

    // Zod validation failure surfaced directly.
    if (error instanceof ZodError) {
      const details = zodIssues(error);
      request.log.info({ requestId, details }, "request validation failed");
      return send(400, {
        error: {
          code: "validation_failed",
          message: "Request validation failed.",
          requestId,
          ...(options.exposeDetails ? { details } : {}),
        },
      });
    }

    // Fastify-wrapped validation failure (ZodError carried on `.validation`).
    const validation = (error as { validation?: unknown }).validation;
    if (error.code === "FST_ERR_VALIDATION" || validation) {
      const details =
        validation instanceof ZodError
          ? zodIssues(validation)
          : Array.isArray(validation)
            ? validation.map((entry: { message?: string; instancePath?: string }) => ({
                path: entry.instancePath ?? "(root)",
                message: entry.message ?? "Invalid value",
              }))
            : undefined;
      request.log.info({ requestId, details }, "request validation failed");
      return send(400, {
        error: {
          code: "validation_failed",
          message: "Request validation failed.",
          requestId,
          ...(options.exposeDetails && details ? { details } : {}),
        },
      });
    }

    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    if (status >= 500) {
      // Log the real error server-side; return an opaque message to the caller.
      request.log.error({ err: error, requestId }, "unhandled error");
      return send(status, {
        error: {
          code: "internal_error",
          message: "Something went wrong on our side.",
          requestId,
        },
      });
    }

    // Other 4xx (client-originated, safe to surface).
    return send(status, {
      error: {
        code: "request_error",
        message: error.message,
        requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: "not_found",
        message: `Route ${request.method} ${request.url} not found.`,
        requestId: request.id,
      },
    } satisfies ErrorEnvelope);
  });
}
