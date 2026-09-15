/**
 * Audit event shape, canonicalization and hashing.
 *
 * The audit record is a *metadata* record. It answers "who did what, to which
 * opaque reference, under which authorization, with what result" — and nothing
 * else. It deliberately never carries (docs/backend/09 §2, §3):
 *
 *   - OTPs, passwords, session secrets or any credential
 *   - full ABHA numbers/addresses (only opaque internal patient ids)
 *   - clinical payloads (diagnoses, notes, results)
 *
 * `assertNoSensitiveValues()` is a defensive check applied on every write so a
 * future caller cannot quietly start passing a secret through.
 */
import { createHash } from "node:crypto";

export type AuditStatus = "success" | "blocked";

export interface AuditEvent {
  id: string;
  /** Monotonic, gap-free-by-construction order of the chain. */
  sequence: number;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  organizationId: string | null;
  patientId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: string | null;
  /** Verification grant / consent id that authorized the action. */
  authorizationId: string | null;
  requestId: string | null;
  status: AuditStatus;
  /** Coarse provenance — never a device fingerprint. */
  sourceIp: string | null;
  deviceClass: string | null;
  prevEventId: string | null;
  prevHash: string | null;
  hash: string;
  timestamp: string;
}

export type AuditEventDraft = Omit<AuditEvent, "hash">;

/** Fields that participate in the chain digest. Order is part of the contract. */
export function canonicalEnvelope(event: AuditEventDraft): string {
  return JSON.stringify({
    sequence: event.sequence,
    actorId: event.actorId,
    actorRole: event.actorRole,
    organizationId: event.organizationId,
    patientId: event.patientId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    purpose: event.purpose,
    authorizationId: event.authorizationId,
    requestId: event.requestId,
    status: event.status,
    sourceIp: event.sourceIp,
    deviceClass: event.deviceClass,
    prevEventId: event.prevEventId,
    prevHash: event.prevHash,
    timestamp: event.timestamp,
  });
}

export function hashEvent(event: AuditEventDraft): string {
  return createHash("sha256").update(canonicalEnvelope(event)).digest("hex");
}

/**
 * Patterns that must never reach the audit store. Cheap, conservative, and
 * intentionally noisy in tests rather than silently passing PHI through.
 */
const FORBIDDEN_PATTERNS: Array<{ name: string; test: (value: string) => boolean }> = [
  {
    name: "abha-number",
    // A 14-digit ABHA, bare or in the `12-3456-7891-2345` display form, as the
    // WHOLE value. Anchored so an opaque id that merely happens to contain 14
    // digits is not a false positive.
    test: (v) => /^\d{14}$/.test(v) || /^\d{2}-\d{4}-\d{4}-\d{4}$/.test(v),
  },
  {
    name: "abha-address",
    test: (v) => /@(abdm|sbx|ndhm)\b/i.test(v),
  },
  {
    name: "credential-keyword",
    test: (v) => /\b(otp|password|passwd|secret|token|bearer)\b/i.test(v),
  },
];

export class SensitiveAuditValueError extends Error {
  constructor(field: string, pattern: string) {
    super(`Refusing to audit: field '${field}' matches forbidden pattern '${pattern}'.`);
    this.name = "SensitiveAuditValueError";
  }
}

/** Free-text-ish audit fields that must be screened. Opaque ids are exempt. */
const SCREENED_FIELDS = [
  "action",
  "resourceType",
  "resourceId",
  "purpose",
  "actorName",
] as const;

/** Opaque internal identifiers are exempt: they are exactly what audit should carry. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertNoSensitiveValues(event: Partial<AuditEvent>): void {
  for (const field of SCREENED_FIELDS) {
    const value = event[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (UUID.test(value)) continue;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(value)) throw new SensitiveAuditValueError(field, pattern.name);
    }
  }
}

/**
 * Reduce a client address to what anomaly detection actually needs.
 * IPv4 keeps the /24, IPv6 keeps the /48 — enough to spot an abusive source,
 * not enough to be a per-user tracker (docs/decisions/0009-privacy-and-real-data-gate.md).
 */
export function truncateIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const value = ip.trim();
  if (value.length === 0) return null;
  if (value.includes(":")) {
    const groups = value.split(":").filter(Boolean).slice(0, 3);
    return groups.length > 0 ? `${groups.join(":")}::/48` : null;
  }
  const octets = value.split(".");
  if (octets.length !== 4) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

/** Coarse device class from a user agent — three buckets, nothing more. */
export function deviceClassOf(userAgent: string | undefined | null): string | null {
  if (!userAgent) return null;
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "mobile";
  if (/curl|wget|node|python|go-http|postman/i.test(userAgent)) return "automation";
  return "desktop";
}
