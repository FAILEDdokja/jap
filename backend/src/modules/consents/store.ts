export type ConsentStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "REVOKED" | "EXPIRED";

export interface ConsentRecord {
  id: string;
  patientId: string;
  requesterId: string;
  requesterName: string;
  requesterOrganizationId: string;
  purpose: string;
  recordTypes: string[];
  validFrom: string;
  validUntil: string;
  status: ConsentStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedById: string | null;
  revokedAt: string | null;
  note: string | null;
}

const consents = new Map<string, ConsentRecord>();

export function resetConsentStore(): void { consents.clear(); }
export function insertConsent(consent: ConsentRecord): void { consents.set(consent.id, consent); }
export function getConsent(id: string): ConsentRecord | null { return consents.get(id) ?? null; }
export function allConsents(): ConsentRecord[] { return [...consents.values()]; }
