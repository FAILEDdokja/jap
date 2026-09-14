/**
 * Synthetic demo identifiers.
 *
 * The Phase 3/4 backend runs on in-memory demo stores (no reachable database
 * in CI). Several of those stores must agree on the *same* ids — the auth
 * registry links a PATIENT account to a patient record (`users.patient_id`,
 * doc 03 §7), and the consent view links a consent artifact to the patient it
 * covers (doc architecture §2.5 rule 4). This module is the single place those
 * fixed ids are declared so the three stores cannot drift apart.
 *
 * Every value here is fabricated demo data. Nothing in this file is an
 * identifier of a real person, facility or ABHA account.
 */

/**
 * Deterministic UUID-shaped id (valid v4 layout: version nibble `4`, variant
 * nibble `8`). Real records mint `randomUUID()`; demo rows use this so tests
 * can name a record without guessing.
 */
export function demoUuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Demo tenants — the five organizations seeded by `prisma/seed.ts`. */
export const DEMO_ORG_ID = {
  platform: "org-platform",
  nmc: "org-nmc",
  sanjivani: "org-sanjivani",
  pathcare: "org-pathcare",
  medplus: "org-medplus",
} as const;

/**
 * Demo patient records, mirroring `src/data/seed.ts` (`p-01`…`p-06`) plus the
 * Phase 4 walk-in intake. Opaque to clients either way — no ABHA is ever part
 * of an id (docs/backend/05 §2, §6).
 */
export const DEMO_PATIENT_ID = {
  amitKumar: demoUuid(0x101),
  priyaPatel: demoUuid(0x102),
  rahulSharma: demoUuid(0x103),
  sunitaDeshmukh: demoUuid(0x104),
  iqbalAnsari: demoUuid(0x105),
  meeraJoshi: demoUuid(0x106),
  /** Provisional walk-in with no ABHA at all (doc 04: ABHA never mandatory). */
  vitthalShinde: demoUuid(0x107),
} as const;

/**
 * Demo consent artifacts, mirroring `src/data/seed.ts` consents `con-01`…
 * `con-05`. Read-only: the consent *plane* (request / decide / revoke) is a
 * later phase — see `src/services/consent-view.ts`.
 */
export const DEMO_CONSENT_ID = {
  /** org-nmc ← Sunita Deshmukh (org-sanjivani): approved, unexpired → ACTIVE. */
  nmcSunita: "con-01",
  /** org-nmc ← Iqbal Ansari (org-sanjivani): pending. */
  nmcIqbal: "con-02",
  /** org-sanjivani ← Amit Kumar (org-nmc): pending. */
  sanjivaniAmit: "con-03",
  /** org-sanjivani ← Priya Patel (org-nmc): expired. */
  sanjivaniPriya: "con-04",
  /** org-sanjivani ← Rahul Sharma (org-nmc): denied. */
  sanjivaniRahul: "con-05",
} as const;
