import { randomUUID } from "node:crypto";
import { getPatient } from "../patients/store.js";
import { allConsents, getConsent, insertConsent, resetConsentStore, type ConsentRecord, type ConsentStatus } from "./store.js";
import type { CreateConsentBody, ListConsentsQuery } from "./schemas.js";

export { resetConsentStore };

type Actor = { id: string; name: string; role: string; orgId?: string; patientId?: string };
type Failure = { ok: false; code: "patient_not_found" | "consent_not_found" | "invalid_transition" | "forbidden"; message: string };
type Result<T> = { ok: true; value: T } | Failure;

function today(): string { return new Date().toISOString().slice(0, 10); }

function refreshExpiry(consent: ConsentRecord): ConsentRecord {
  if ((consent.status === "REQUESTED" || consent.status === "APPROVED") && consent.validUntil < today()) consent.status = "EXPIRED";
  return consent;
}

export function createConsent(actor: Actor, input: CreateConsentBody): Result<ConsentRecord> {
  if (!getPatient(input.patientId)) return { ok: false, code: "patient_not_found", message: "Unable to load patient." };
  const validFrom = input.validFrom ?? today();
  if (input.validUntil < validFrom) {
    return { ok: false, code: "invalid_transition", message: "Consent validity must end on or after it begins." };
  }
  const consent: ConsentRecord = {
    id: randomUUID(), patientId: input.patientId, requesterId: actor.id, requesterName: actor.name,
    requesterOrganizationId: actor.orgId ?? "platform", purpose: input.purpose, recordTypes: input.recordTypes,
    validFrom, validUntil: input.validUntil, status: "REQUESTED",
    createdAt: new Date().toISOString(), decidedAt: null, decidedById: null, revokedAt: null, note: null,
  };
  insertConsent(consent);
  return { ok: true, value: consent };
}

export function listConsents(query: ListConsentsQuery): ConsentRecord[] {
  return allConsents().map(refreshExpiry).filter((consent) =>
    (!query.patientId || consent.patientId === query.patientId) && (!query.status || consent.status === query.status),
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getConsentView(id: string): Result<ConsentRecord> {
  const consent = getConsent(id);
  return consent ? { ok: true, value: refreshExpiry(consent) } : { ok: false, code: "consent_not_found", message: "Unable to load consent." };
}

function decide(id: string, actor: Actor, next: Extract<ConsentStatus, "APPROVED" | "REJECTED" | "REVOKED">, note?: string): Result<ConsentRecord> {
  const consent = getConsent(id);
  if (!consent) return { ok: false, code: "consent_not_found", message: "Unable to load consent." };
  refreshExpiry(consent);
  if (actor.role !== "PATIENT" || actor.patientId !== consent.patientId) {
    return { ok: false, code: "forbidden", message: "Only the consent's patient may decide it." };
  }
  const allowed = next === "REVOKED" ? consent.status === "APPROVED" : consent.status === "REQUESTED";
  if (!allowed) return { ok: false, code: "invalid_transition", message: `Cannot change ${consent.status} consent to ${next}.` };
  consent.status = next;
  consent.note = note ?? null;
  consent.decidedAt = new Date().toISOString();
  consent.decidedById = actor.id;
  if (next === "REVOKED") consent.revokedAt = consent.decidedAt;
  return { ok: true, value: consent };
}

export const approveConsent = (id: string, actor: Actor, note?: string) => decide(id, actor, "APPROVED", note);
export const rejectConsent = (id: string, actor: Actor, note?: string) => decide(id, actor, "REJECTED", note);
export const revokeConsent = (id: string, actor: Actor, note?: string) => decide(id, actor, "REVOKED", note);
