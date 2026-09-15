/**
 * Request → audit context.
 *
 * One helper so every call site records provenance consistently, and so the
 * *raw* IP / user agent are reduced (truncated network, coarse device class)
 * inside the audit service rather than at twenty call sites.
 */
import type { FastifyRequest } from "fastify";

export interface AuditRequestContext {
  requestId: string;
  sourceIp?: string;
  userAgent?: string;
}

export function auditContext(request: FastifyRequest): AuditRequestContext {
  const userAgent = request.headers["user-agent"];
  return {
    requestId: String(request.id),
    sourceIp: request.ip,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  };
}
