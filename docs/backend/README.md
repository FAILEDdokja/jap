# Backend Team Documentation — Jan Arogya Portal

**Status:** Living document · **Last updated:** 2026-09-10 · **Covers frontend through:** Doctor Workspace milestone 2 (New Patient → ABHA → OTP → Patient Profile)

## What this is

Jan Arogya Portal (JAP) is a government-oriented healthcare coordination platform
for India, built to participate in the Ayushman Bharat Digital Mission (ABDM)
ecosystem. Today the repository contains **only the frontend** — a static,
no-build web application with **mock** authentication and **mock** patient
identity. There is no backend, no database, and no ABDM integration yet.

This documentation set exists so the backend team can:

1. Understand the product vision and direction the backend must serve.
2. See exactly what the frontend already does, and the contracts it expects.
3. Build the backend APIs, persistence, and ABDM integration the frontend's
   seams were designed to plug into — with minimal frontend changes.

## How to read this

| If you are… | Start with |
| --- | --- |
| Joining the project | Doc 01 (vision), then this page's 10-minute brief below |
| Designing the API | Docs 03, 04, 06 (auth, identity, contracts) |
| Designing the database | Doc 05 (data model), then 07 (roles/authorization) |
| Planning ABDM work | Doc 04 (patient identity + ABDM), then 09 (compliance) |
| Wiring frontend to backend | Doc 10 (integration checklist), then 02 (current state) |
| Planning the next milestones | Doc 08 (roadmap + handoffs) |

## Document map

| Doc | Contents |
| --- | --- |
| [01 — Product vision and direction](01-product-vision-and-direction.md) | What JAP is, why it exists, relationship-centered design, government context, ABDM posture, development philosophy |
| [02 — Current frontend state](02-current-frontend-state.md) | Architecture, routes, components, the two seams, the three mocks, events, deliberate absences |
| [03 — Authentication and session](03-authentication-and-session.md) | Role-specific login, identifier rules, the auth service contract, session shape, what the backend must own |
| [04 — Patient identity and ABDM](04-patient-identity-and-abdm.md) | ABHA/OTP verification flow, masking and privacy rules, how the mock maps to real ABDM APIs, consent gap |
| [05 — Data model](05-data-model.md) | The patient record schema field-by-field, derived state, constraints the backend must preserve |
| [06 — API contracts](06-api-contracts.md) | Endpoint-by-endpoint specification the backend should ship, mapped 1:1 to frontend seams |
| [07 — Roles and authorization](07-roles-and-authorization.md) | The six roles, per-role identity semantics, ABDM registries (HPR/HFR), authorization model |
| [08 — Roadmap and handoffs](08-roadmap-and-handoffs.md) | Pending milestones (Encounter, Admissions, History, remaining roles) and their backend implications |
| [09 — Non-functional requirements](09-nonfunctional-requirements.md) | Security, auditability, privacy/DPDP, reliability, deployment, observability |
| [10 — Integration checklist](10-integration-checklist.md) | Step-by-step tie-in procedure, seam-swap instructions, verification checklist |

## The 10-minute brief

### The product in one paragraph

JAP models healthcare as a **network of relationships** (patient ↔ doctor,
doctor ↔ lab, hospital ↔ government, …), not as isolated organizations with
isolated records. Documents and prescriptions are *consequences* of those
relationships. The platform must connect every participant — patients, doctors,
hospitals, clinics, pharmacies, labs, insurers, government — while respecting
each role's distinct responsibilities and permissions. It builds **on top of
ABDM** (ABHA identity, professional/facility registries, consent-driven record
sharing) rather than replacing it. See doc 01.

### The frontend in one diagram

```
Browser (static, no build; hash routing)
│
├── js/auth/auth-service.js ────── the AUTH seam ──────► mock-auth.js (DELETE later)
│      authenticate({role, identifier}) → authenticated | identifier-not-found | role-unavailable
│
├── js/abdm/identity-service.js ── the IDENTITY seam ──► mock-identity.js (DELETE later)
│      identifyPatient({abha}) → otp-required{requestId, maskedAbha} | abha-not-recognized
│      verifyPatientOtp({requestId, otp}) → verified{patientId} | otp-invalid
│
└── js/mock/patients.js ── the RECORDS ──► 3 prototype patient records + derivations
```

Three hard rules the backend must preserve:

1. **Authenticating the professional and identifying the patient are separate
   transactions.** They live in separate seams (`js/auth/` vs `js/abdm/`) and
   must remain separate backend concerns. Never merge them.
2. **No patient name, age, or clinical fact is reachable before verification.**
   Identification returns a masked ABHA and a `requestId`; only a verified OTP
   yields a `patientId`; only the record view reads the record.
3. **Patient state is derived, never stored.** Admitted / discharged /
   outpatient is computed from `admission` + `dischargedOn`. The backend must
   not add a stored `status` field that can drift from the admission facts.

### What the backend must build (summary)

| # | Backend deliverable | Frontend seam it plugs into |
| --- | --- | --- |
| 1 | Role-scoped authentication API + real sessions | `auth-service.js` (`setAuthenticationService`) |
| 2 | ABHA verification API (ABDM-backed OTP) | `identity-service.js` (`setPatientIdentityService`) |
| 3 | Patient record API (read record by opaque id) | replaces `mock/patients.js` reads |
| 4 | Derived admissions feed | replaces `activeAdmissions()` |
| 5 | Persistent data model per doc 05 | — |
| 6 | ABDM sandbox → production integration (ABHA verify, HPR/HFR, consent) | behind deliverable 2 |
| 7 | Audit logging, RBAC, PII protection per docs 07 + 09 | cross-cutting |

### Key vocabulary

| Term | Meaning in this project |
| --- | --- |
| **Seam** | A service-interface module the UI calls; the mock behind it is deleted when the backend ships |
| **ABHA** | Ayushman Bharat Health Account — 14-digit number (`23-4567-8912-3401`) and/or address (`name@abdm`) |
| **HPID** | Healthcare Professional ID (ABDM/HPR) — explicitly *not* a medical registration number |
| **Facility ID** | ABDM Health Facility Registry (HFR) identity for hospitals/pharmacies/labs |
| **Patient context** | The routed state `#/dashboard/doctor/patient/<record-id>` — note the **opaque record id**, never an ABHA, in the URL |
| **Encounter** | A single care interaction (OPD/IPD) holding reason, assessment, disposition, prescription, investigations |
| **Disposition** | Encounter outcome (`Admit`, `Discharge`, `Continue OPD`) — the only writer of admission facts |

### Source-of-truth hierarchy

1. **Accepted engineering decisions** (per the team charter in
   `docs/engineering/charter.md`) — decisions belong to Dhishan (owner) and
   Linus (mentor). Backend designs that touch product behavior need their sign-off.
2. **The implementation logs** in `docs/engineering/` — the authoritative record
   of *why* the frontend is shaped the way it is. Read them before proposing
   changes to any contract documented here.
3. **This documentation set** — a synthesis for the backend team. Where it
   *proposes* something the frontend does not yet constrain (endpoint paths,
   database technology, OTP expiry policy), it says so explicitly. Proposals are
   marked **PROPOSAL**; anything else describes locked frontend behavior the
   backend must match.
