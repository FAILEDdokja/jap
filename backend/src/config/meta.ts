/** Service identity — used in logs, /health and the OpenAPI document. */

export const SERVICE_NAME = "jan-arogya-api";
export const SERVICE_VERSION = "0.1.0";

export const API_TITLE = "Jan Arogya Portal API";
export const API_DESCRIPTION = [
  "REST API of the Jan Arogya Portal (JAP) — a consent-aware healthcare",
  "coordination platform built on the Ayushman Bharat Digital Mission (ABDM)",
  "ecosystem.",
  "",
  "**Phase 3 (this build): authentication** — role-scoped alias resolution",
  "(HPID / username / mobile; ABHA number / address), case/space/dash-",
  "insensitive matching, cross-role rejection, discriminated session contract,",
  "and HttpOnly SameSite=Lax cookie sessions. Foundation and PostgreSQL +",
  "Prisma data model from Phases 1–2 remain.",
  "",
  "Design constraints carried by every endpoint:",
  "medical records stay off-chain; JAP never becomes a centralized national",
  "medical-record database; every sensitive action is written to a",
  "tamper-evident, hash-chained audit trail.",
].join("\n");
