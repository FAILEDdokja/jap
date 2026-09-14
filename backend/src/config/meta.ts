/** Service identity — used in logs, /health and the OpenAPI document. */

export const SERVICE_NAME = "jan-arogya-api";
export const SERVICE_VERSION = "0.1.0";

export const API_TITLE = "Jan Arogya Portal API";
export const API_DESCRIPTION = [
  "REST API of the Jan Arogya Portal (JAP) — a consent-aware healthcare",
  "coordination platform built on the Ayushman Bharat Digital Mission (ABDM)",
  "ecosystem.",
  "",
  "**Phase 1 (this build): foundation only** — health probe, configuration,",
  "structured logging, request IDs, centralized errors, CORS, security",
  "headers, rate limiting, Zod validation and OpenAPI documentation.",
  "",
  "Design constraints carried by every future endpoint:",
  "medical records stay off-chain; JAP never becomes a centralized national",
  "medical-record database; every sensitive action is written to a",
  "tamper-evident, hash-chained audit trail.",
].join("\n");
