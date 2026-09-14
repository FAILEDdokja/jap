# JAP Architecture — Current State, Target State, Migration Plan

**Status:** Phase 0 deliverable (repository audit + architecture plan)
**Date:** 2026-09-14 · **Branch:** `arena/01a09f96-jap`
**Supersedes nothing yet** — this document *describes* the current system and
*proposes* the target. Implementation decisions become locked phase by phase.

---

## 1. Purpose

Transform the current React/Vite/TypeScript JAP prototype into a
backend-driven healthcare interoperability platform **while preserving the
existing frontend functionality**. The target architecture is:

```
React/Vite frontend
        ↓
JAP REST API
        ↓
Node.js + TypeScript backend (Fastify · Prisma · Zod · OpenAPI)
        ↓
PostgreSQL                      ← coordination + consent + audit plane
        ↓
JAP services                    ← consent / access / audit / blockchain
        ↓
ABDM adapter                    ← ABHA, HPR, HFR, HIP, HIU, consent, HI exchange
        ↓
ABDM Sandbox (later: production)
```

Hard constraints carried through every phase:

1. **Audit integrity.** Audit event → SHA-256 hash → blockchain proof
   (§4.7). The chain is tamper-evident and independently verifiable.
2. **Medical records stay off-chain.** Only SHA-256 digests of *audit
   envelopes* (which carry opaque resource ids, never clinical content) are
   ever anchored. No PHI, no record content, no ABHA number ever goes on-chain.
3. **JAP is not a centralized national medical-record database.** JAP is a
   consent, coordination, identity-reference and audit layer. Clinical records
   remain owned by the tenant that produced them; cross-tenant movement of
   clinical content happens only through active patient consent, and the API
   exposes no endpoint that can dump clinical data across tenants (§4.2).
4. **No unnecessary rewrites.** Every page, component and visual behaviour in
   `src/` survives the migration; only the module *behind* the existing seams
   changes (§5, §6, §7).

Baseline verified at audit time: `npm ci && npm run build` (type-check +
production build) passes cleanly on commit `753c926`.

---

## 2. Phase 0 — Repository audit

### 2.1 Repository map

| Path | What it is | Relevance to migration |
| --- | --- | --- |
| `src/` (root Vite app) | **The current product**: React 18 + TypeScript SPA "Jan Arogya Nexus" — consent-aware continuity of care. Vite 5, Tailwind, react-router 6, lucide-react, date-fns. | **Migration subject.** Everything in §2.2–§2.9 refers to this app. |
| `frontend/` | **Legacy** no-build vanilla-JS prototype (government landing page, doctor workspace, auth/identity *seams* with swappable mocks). | Not the migration subject. Kept untouched. Its seam philosophy (§6 of this doc) is the model we reuse. |
| `docs/backend/01…10` | Backend spec written **against the legacy `frontend/` app** (auth seam, identity seam, 3-patient record model, admission derivation). | Reusable for NFRs, ABDM vocabulary, audit requirements, error-envelope conventions. Where it conflicts with the React app's contracts, **the React app wins** (§6.3). |
| `docs/engineering/` | Charter, project brief, implementation logs (login, patient identity). | Process + decision-record source of truth; this migration adds to it, doesn't amend it. |
| `index.html`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js` | React app build config. `@` alias → `src/`. Vite dev server on 5173. | Add a dev proxy for `/api` here in Phase 2 (no CORS needed in dev). |
| `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEMO_MODE`. | Supabase path is retired by the migration (§2.8); a `VITE_DATA_MODE=local\|api` flag takes its place (§5.2). |

### 2.2 Application structure (React app)

Entry chain: `src/main.tsx` → `BrowserRouter` + `AuthProvider` + `ToastProvider`
+ `App` → routes in `src/App.tsx`:

| Route | Page | Data consumed (from `src/data/store.ts`) |
| --- | --- | --- |
| `/` | `Landing.tsx` | none (marketing) |
| `/login` | `Login.tsx` | `usersAll()` persona list, `signIn`/`signInAs` |
| `/app` (protected) | `Dashboard.tsx` → role switch over 6 role dashboards | per-role subsets: `patientBundle`, `labQueueFor`, `prescriptionsFor`, `tasksFor`, `auditFeed`, `platformStats`, `metrics.summary()`, notifications |
| `/app/patients` | `PatientList.tsx` | `visiblePatients`, `orgById` |
| `/app/patients/:patientId` | `PatientProfile.tsx` | `patientBundle`, `patientTimeline`, `evaluateAccess`, `audit`, `metrics`, `advanceTask`, clinical-action modals |
| `/app/consent` | `ConsentCenter.tsx` | `getDb().consents`, `visiblePatients`, `decideConsent` |
| `/app/coordination` | `Coordination.tsx` | `tasksFor`, `advanceTask` |
| `/app/lab-orders` | `LabOrders.tsx` | `labQueueFor`, `updateLabOrder` |
| `/app/prescriptions` | `Prescriptions.tsx` | `prescriptionsFor`, `dispensePrescription` |
| `/app/audit` | `Audit.tsx` | `auditFeed`, CSV export |
| `/app/staff` | `Staff.tsx` | `getDb().users`, `inviteUser` |
| `/app/organizations` | `Organizations.tsx` | `orgDirectory` |
| `/app/analytics` | `Analytics.tsx` | `platformStats`, `auditFeed`, `metrics` |
| `/app/my-timeline` | `patient/MyTimeline.tsx` | `patientTimeline(user.patientId)` |
| `/app/my-records` | `patient/MyRecords.tsx` | `patientBundle` |
| `/app/my-consents` | `patient/MyConsents.tsx` | `patientBundle().consents`, `decideConsent`, `metrics.recordGrant` |
| `/app/my-care` | `patient/MyCare.tsx` | `patientBundle().careTasks` |

Layout: `components/layout/AppShell.tsx` (role-aware sidebar from
`NAV_BY_ROLE`, persona switcher, demo-reset), `GlobalSearch` (⌘K — patients,
labs, prescriptions, orgs), `NotificationsMenu`, `ProtectedRoute`.

### 2.3 Domain model — `src/data/types.ts` (226 lines)

Single source of truth for the domain today. Entities (all ids are opaque
prefixed strings minted by `uid()`):

`Organization` (hospital/lab/pharmacy/platform) · `User` (role + orgId,
optional `patientId` link for PATIENT users) · `Patient` (tenant-owned via
`orgId`; ABHA number+address, `abhaVerified`, contacts, biometrics, chronic
conditions, allergies, current medications) · `Diagnosis` · `Encounter`
(OPD/IPD/Emergency/Teleconsult) · `Prescription` + `PrescriptionItem`
(status: issued → partially_dispensed/dispensed/cancelled) · `LabOrder`
(ordered → collected → in_progress → resulted/cancelled, result fields,
`abnormal` flag) · `Consent` (pending/approved/denied/expired/revoked; scope
list, ABDM `hiTypes`, expiry) · `CareTask` (cross-org assignments) ·
`Notification` (audience by user/org/role) · `AuditEvent` (actor snapshot,
action, resource, status success|blocked) · `Database` (the root aggregate of
all of the above).

Roles: `PATIENT`, `DOCTOR`, `HOSPITAL_ADMIN`, `LAB`, `PHARMACY`,
`SUPER_ADMIN`.

### 2.4 The data layer — `src/data/store.ts` (582 lines) ← the module to replace

A self-contained in-browser substitute for the server:

- **Persistence.** Whole `Database` serialized to `localStorage` under
  `jan-arogya-nexus:db:v4` (`SEED_VERSION`-keyed). `commit()` deep-clones,
  mutates, persists, then notifies subscribers (`subscribe()` / `emit()`).
  `resetDemoData()` re-seeds.
- **Seeding.** `src/data/seed.ts` — deterministic synthetic dataset
  (5 orgs, 10 users, 6 patients, 8 diagnoses, 8 encounters, 5 prescriptions,
  10 lab orders, 5 consents, 7 care tasks, 6 notifications, 10 audit events),
  anchored to 2026-09-10.
- **Reactivity.** `src/data/useStore.ts` — `useStore()` bumps a version on
  every commit; pages call the query helpers synchronously during render.

Exported surface (33 functions + the `metrics` object — this is the **seam**
the migration preserves; full endpoint mapping in §4.8):

| Area | Functions |
| --- | --- |
| Getters | `getDb`, `orgs`, `orgById`, `usersAll`, `userById`, `patientById` |
| Access | `evaluateAccess(actor, patient) → AccessDecision` |
| Queries | `visiblePatients`, `patientBundle`, `patientTimeline`, `auditFeed`, `notificationsFor`, `tasksFor`, `labQueueFor`, `prescriptionsFor`, `orgDirectory`, `platformStats` |
| Consents | `requestConsent`, `decideConsent` |
| Tasks | `createTask`, `advanceTask` |
| Labs | `createLabOrder`, `updateLabOrder` |
| Prescriptions | `createPrescription`, `dispensePrescription` |
| Registry | `registerPatient`, `inviteUser`, `addClinicalNote` |
| Audit | `audit(actor, event)` |
| Notifications | `markNotificationRead`, `markAllNotificationsRead` |
| Metrics | `metrics` (research instrumentation class) |
| Lifecycle | `subscribe`, `resetDemoData` |

### 2.5 Consent logic (must be reproduced server-side, exactly)

`evaluateAccess(actor, patient)` in `store.ts`:

1. `SUPER_ADMIN` → allowed, reason `platform` (still audited).
2. `PATIENT` → allowed only for own record (`self`), else denied.
3. Same tenant (`actor.orgId === patient.orgId`) → allowed, `same_tenant`
   (implicit treatment relationship).
4. Otherwise: newest consent for (patient, actor's org). **Active** =
   `status === "approved"` AND (`expiresOn` absent OR in the future) →
   allowed, `consent_active`. Else denied with the most-relevant reason:
   `consent_pending` / `consent_expired` / `consent_revoked` /
   `consent_denied` / `no_consent`.

Supporting flows: `requestConsent` (creates `pending`, notifies the patient
user, audits `consent.request`); `decideConsent` (approve ⇒ default 90-day
expiry if unset; notify requester; audit `consent.approve|deny|revoke`).
`visiblePatients` lists own-tenant patients plus any patient with consent
history involving the actor's org. UI enforcement lives in
`PatientProfile.tsx` (access gate + blocked-view audit) and
`ConsentPill.tsx` (reason → label/tone map). Permission matrix: `CAN` in
`src/auth/roles.ts` (who may prescribe, dispense, order/result labs,
request/decide consent, manage staff, create tasks).

### 2.6 Audit logic

`audit(actor, e)` prepends an event with an actor/org snapshot
(`actorId/Name/Role`, `orgId/orgName`). **Every** sensitive action writes one:
`consent.request/approve/deny/revoke`, `care.task.create/update`,
`lab.order.create/update`, `lab.result.upload`, `prescription.create/dispense`,
`patient.register`, `patient.note.add`, `staff.invite`, and — emitted from
`PatientProfile.tsx` — `patient.context.view` with `status: "success"` or
`"blocked"` (denied views are logged with the denial reason).
`auditFeed(actor)` scopes: SUPER_ADMIN sees all; PATIENT sees events touching
their `patientId`; orgs see their own events plus events on patients they can
view. `Audit.tsx` adds filtering + CSV export. Audit events are currently
mutable in `localStorage` — the target makes them append-only and hash-chained
(§4.7).

### 2.7 Patient timeline logic

`patientTimeline(patientId)` merges five record families
(encounters, prescriptions, lab orders, diagnoses, consents) into
`TimelineEvent[]` (`id, date, type, title, provider, summary, status, tone`)
sorted date-descending, with presentation rules (Emergency ⇒ critical tone,
abnormal lab ⇒ warning, approved consent ⇒ positive, …). Consumed by the
`Timeline.tsx` component, `PatientProfile` (Timeline tab + tab counts) and
`MyTimeline`. Moves server-side as `GET /patients/:id/timeline`; the
`TimelineEvent` shape is preserved byte-for-byte so `Timeline.tsx` is reused
untouched.

### 2.8 localStorage + Supabase inventory

| Key | Written by | Migration |
| --- | --- | --- |
| `jan-arogya-nexus:db:v4` | `store.ts` — entire database | **Replaced** by PostgreSQL via JAP API |
| `jan-arogya-nexus:metrics:v1` | `store.ts` `Metrics` — research instrumentation (context-assembly runs, blocked attempts, consent grants) | Kept client-side in Phase 1–3; server-derived equivalents come from audit analytics in Phase 4 (§6.2) |
| `jan-arogya-nexus:session:userId` | `AuthContext.tsx` | **Replaced** by server session (§4.5) |
| `jan-arogya-nexus:theme` | `lib/theme.ts` | **Stays** (pure UI preference) |

Supabase: `src/lib/supabase.ts` creates a client only when
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set and `VITE_DEMO_MODE`
is not `true` (`dataMode: "supabase" | "demo"`). **Only `AuthContext.tsx`
ever uses it** (getSession / signInWithPassword / signOut) — the data layer
never talks to Supabase in any mode. Conclusion: Supabase integration is a
stub; the migration retires it (dep + env vars + code paths) in favour of the
JAP API. No production behaviour is lost.

### 2.9 ABDM integration today — `src/lib/abdm.ts` (mock)

Three functions with simulated latency, **no network calls**:
`lookupAbha(input)` (validates 14-digit number or `name@abdm` address,
derives a deterministic demographic stub), `sendAbhaOtp()` (returns
`{ txnId, demoCode }`), `verifyAbhaOtp()` (code is always `123456`).
Consumed only by `NewPatientModal.tsx` (identify → OTP → confirm wizard),
which then calls `registerPatient`. The mock's contract is exactly what the
real ABDM adapter (§4.6) hides behind: the wizard UI is reused unchanged.

### 2.10 Reusable frontend inventory (summary — detail in §6)

Everything outside the seams is reusable: 24 pages/dashboards, all UI
primitives (`Card/Badge/Button/Modal/Toast/DataTable/StatCard/EmptyState/
Avatar/…`), layout shell, global search, notifications menu, charts,
`Timeline`, `ConsentPill`, `RequestConsentModal`, clinical-action modals,
`lib/format|status|cn|theme`, `auth/roles.ts` nav+labels, routing, theming.

---

## 3. Target architecture — overview

```
┌────────────────────────────────────────────────────────────────────┐
│ React/Vite frontend (src/) — unchanged UI, new data driver         │
│   src/data/store-api.ts  ← same function surface as store.ts today │
│   src/data/remote-impl.ts (JAP API client)  + local-impl.ts (demo) │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ REST /api/v1 (JSON, OpenAPI-described)
┌──────────────────────────────▼─────────────────────────────────────┐
│ backend/ — Node 20+ · TypeScript · Fastify                         │
│                                                                    │
│  modules/   auth · users · organizations · patients · encounters   │
│             clinical-records · prescriptions · labs · consents     │
│             access-control · audit · abdm                          │
│  services/  consent-service · access-service · audit-service       │
│             blockchain-service                                     │
│  integrations/abdm/  client · gateway · abha · hfr · hpr · hip     │
│                      hiu · consent · care-context ·                │
│                      health-information                            │
│  integrations/fhir/  HI-type ↔ FHIR resource mapping               │
│  middleware/  session · rbac · audit-logger · error-handler · rate │
│  config/      env (Zod-validated) · prisma client · logger         │
│  app.ts (Fastify instance factory) · server.ts (bootstrap)         │
├────────────────────────────────────────────────────────────────────┤
│ Prisma ORM → PostgreSQL                                            │
│   coordination plane: orgs, users, patient identity, consents,     │
│   care tasks, notifications, audit_events + blockchain anchors,    │
│   ABDM transaction refs                                            │
│   tenant-scoped clinical plane: diagnoses, encounters,             │
│   prescriptions, lab orders (§4.2 data-residency rules)            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
              JAP services (consent / access / audit / blockchain)
                               │
                    ABDM adapter (mock | sandbox | production)
                               │
                         ABDM Sandbox
```

### 3.1 Technology (per brief)

| Concern | Choice |
| --- | --- |
| Runtime | Node.js ≥ 20, TypeScript (strict), ESM |
| HTTP framework | Fastify (+ `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/helmet` later) |
| ORM | Prisma (`prisma/schema.prisma`, migrations, seed script) |
| Database | PostgreSQL 15+ (docker-compose for dev) |
| Validation | Zod — one schema set driving request validation **and** OpenAPI |
| API docs | `@fastify/swagger` + `@fastify/swagger-ui` via `fastify-type-provider-zod` (OpenAPI 3 at `/docs`) |
| Testing | Vitest + Fastify `inject()` integration tests against a test DB |
| Auth (Phase 1→) | Demo-persona login first (parity with today), then real credentials; httpOnly signed session cookie (`SESSION_SECRET`); CSRF-safe (SameSite=Lax + origin check) |

### 3.2 Backend layout (per brief, annotated)

```
backend/
  prisma/
    schema.prisma            # §4.3
    seed.ts                  # re-uses src/data/seed.ts content 1:1
  src/
    config/
      env.ts                 # Zod-parsed process.env (DATABASE_URL, SESSION_SECRET,
                             #   ABDM_MODE, ABDM_BASE_URL, BLOCKCHAIN_*, PORT)
      prisma.ts              # singleton PrismaClient
      logger.ts              # structured logs, no PII
    middleware/
      session.ts             # cookie session → req.user (User + org)
      rbac.ts                # role guards mirroring CAN (src/auth/roles.ts)
      audit-logger.ts        # route-level audit emission hook
      error-handler.ts       # { error: { code, message } } envelope
      rate-limit.ts
    modules/
      auth/                  # POST /auth/login|logout|persona, GET /auth/me
      users/                 # staff directory, invites
      organizations/         # directory, per-org rollups
      patients/              # registry, bundle, timeline, notes, access check
      encounters/            # encounter CRUD (tenant-scoped)
      clinical-records/      # diagnoses + longitudinal lists
      prescriptions/         # create, dispense
      labs/                  # order, status transitions, results
      consents/              # request, decide, list, revoke
      access-control/        # evaluateAccess engine (no HTTP routes; service + guard)
      audit/                 # append-only feed, verification endpoint
      abdm/                  # ABHA lookup/OTP endpoints proxying the adapter
    services/
      consent-service.ts     # consent state machine + notifications + audit hooks
      access-service.ts      # single implementation of the §2.5 rules
      audit-service.ts       # canonicalization → SHA-256 → hash chain → store
      blockchain-service.ts  # anchoring + proof verification (§4.7)
    integrations/
      abdm/
        client.ts            # HTTP client: base URL, token, timeout, retry
        gateway.ts           # ABDM Gateway session/auth (fetchAccessToken)
        abha.ts              # ABHA search/lookup + OTP send/verify
        hpr.ts               # Healthcare Professional Registry verify
        hfr.ts               # Health Facility Registry verify
        hip.ts               # HIP callbacks (care-context link, HI provision)
        hiu.ts               # HIU flows (consent-request initiation, data fetch)
        consent.ts           # consent artefact lifecycle vs ABDM CM
        care-context.ts      # care context link/unlink
        health-information.ts# HI bundle exchange (FHIR)
        adapter.ts           # mode switch: MockAbdm | SandboxAbdm | ProductionAbdm
      fhir/
        hi-types.ts          # OPConsultation, Prescription, DiagnosticReport,
                             #   DischargeSummary, ImmunizationRecord ↔ FHIR resources
    app.ts                   # buildApp(): plugin + module registration (injectable for tests)
    server.ts                # listen(0.0.0.0:PORT), graceful shutdown
  tests/
    unit/                    # access-service, consent state machine, hash chain
    integration/             # API flows with seeded DB (consent grant→access,
                             #   deny→blocked audit, hash-chain verification)
```

Each module folder follows the same shape: `routes.ts` (Fastify plugin) ·
`schemas.ts` (Zod) · `service.ts` (logic; Prisma injected) · `module.test.ts`.

---

## 4. Target design, detail

### 4.1 Roles & authorization

The six roles survive unchanged. Server enforces, in this order:

1. `session.ts` — authenticates; 401 `{code:"unauthenticated"}` otherwise.
2. `rbac.ts` — route-level role guard mirroring `CAN` from
   `src/auth/roles.ts` (e.g. only `DOCTOR` prescribes; only `PATIENT` decides
   consents on their record); 403 `{code:"forbidden"}`.
3. `access-service` — data-level tenant/consent decision (§2.5 rules,
   re-implemented once, shared by every patient-data route). Denials return
   403 with the `AccessDecision` reason and **write a `blocked` audit event**
   exactly like today's UI does.

`AccessDecision` (allowed + reason union) is part of the API contract so
`ConsentPill.tsx` renders unchanged.

### 4.2 Data residency — what lives in JAP's Postgres

| Plane | Contents | Rule |
| --- | --- | --- |
| **Coordination plane** (JAP-owned) | Organizations, users, patient *identity registry* (demographics + ABHA refs, as registered by a tenant), consents + decisions, care tasks, notifications, audit events + blockchain anchors, ABDM transaction references, HIU session metadata | Fully in Postgres. This is what makes JAP JAP. |
| **Tenant clinical plane** | Diagnoses, encounters, prescriptions, lab orders | Stored in Postgres **partitioned by `orgId`** (row-level tenant scoping enforced only through `access-service`). These are records of the tenant that produced them. |
| **Cross-tenant clinical reads** | — | **Only** through an active consent evaluated by `access-service`, returned as a scoped, purpose-bound view (the `bundle`), never as a bulk export. No API may list/search clinical content across tenants. `SUPER_ADMIN` sees counts and audit, not clinical content — same as today (`platformStats` returns aggregates only). |
| **ABDM end-state** | — | As HIPs come online, tenant clinical records migrate to the source system; JAP retains pointers (care-context links) and brokers consented HIU fetches without persisting cross-tenant copies. The schema keeps `externalRef`/`hipId` fields from day 1 so that shift is data migration, not schema surgery. |

This is the concrete meaning of *"JAP must not become a centralized national
medical-record database"*: the platform holds identity references, consent,
coordination state and proof-of-access — not a national copy of records.

### 4.3 Prisma schema (outline)

Models map 1:1 from `src/data/types.ts` (names and fields preserved; string
ids become `cuid()` with stable prefixes for display, ISO strings become
`DateTime`):

```prisma
enum Role { PATIENT DOCTOR HOSPITAL_ADMIN LAB PHARMACY SUPER_ADMIN }
enum OrgType { hospital lab pharmacy platform }
enum ConsentStatus { pending approved denied expired revoked }
enum LabStatus { ordered collected in_progress resulted cancelled }
enum RxStatus { issued partially_dispensed dispensed cancelled }
enum TaskStatus { pending in_progress completed cancelled }
enum AuditStatus { success blocked }

model Organization { id String @id @default(cuid())  name  type  code  city  state  createdAt
                     users User[]  patients Patient[]  ... }
model User         { id @id  name  email @unique  role  orgId  title?  phone?
                     patientId? @unique            // PATIENT ↔ Patient link
                     org Organization @relation(...) }
model Patient      { id @id  orgId                 // registering tenant (ownership)
                     name  gender  dob             // dob: calendar date, no TZ
                     abhaNumber  abhaAddress  abhaVerified
                     contact Json  emergencyContact Json
                     bloodGroup  heightCm  weightKg
                     chronicConditions String[]  allergies Json  currentMedications Json
                     registeredAt
                     @@index([orgId])  @@unique([abhaNumber]) }
model Diagnosis    { id @id  patientId  orgId  label  code?  date  status  encounterId?  clinicianName }
model Encounter    { id @id  patientId  orgId  facilityName  date  setting
                     clinicianId  clinicianName  reason  assessment  disposition  notes? }
model Prescription { id @id  patientId  encounterId?  orgId  issuedAt
                     prescriberId  prescriberName  items Json  status
                     dispensedByOrgId?  dispensedByName?  dispensedAt?  notes? }
model LabOrder     { id @id  patientId  orderedByOrgId  orderedByName  performingOrgId
                     test  panel?  priority  orderedAt  status
                     collectedAt?  resultedAt?  resultSummary?  resultValue?
                     unit?  referenceRange?  abnormal? }
model Consent      { id @id  patientId  requestingOrgId  requestingUserId
                     requestingUserName  purpose  scope String[]  hiTypes String[]
                     requestedAt  status  decidedAt?  expiresAt?  note?
                     abdmConsentId?               // link to ABDM consent artefact later
                     @@index([patientId, requestingOrgId, status]) }
model CareTask     { ... as in types.ts ... }
model Notification { id @id  audienceOrgId?  audienceRole?  audienceUserId?
                     title  body  kind  createdAt  read  href? }

model AuditEvent   { seq BigInt @id @default(autoincrement())   // chain order
                     id String @unique @default(cuid())
                     ts DateTime
                     actorId  actorName  actorRole  orgId  orgName
                     action  resourceType  resourceId?  patientId?
                     status AuditStatus  detail?
                     payloadHash String            // SHA-256 of canonical envelope
                     prevHash  String              // hash of previous event ("" at genesis)
                     anchorId  String?             // FK to BlockchainAnchor once anchored }
model BlockchainAnchor { id @id  createdAt  merkleRoot String  chain String
                     txRef String?  status String  // pending | confirmed | failed
                     eventSeqs BigInt[] }
```

Notes: `Consent.scope`/`hiTypes` and `Patient.allergies/medications` are
JSON/arrays exactly as the frontend types them, so DTOs are pass-through.
Three-way allergy semantics (absent / recorded-none / unknown) preserved per
`docs/backend/05 §1.5`. Audit table is append-only: no update/delete in the
Prisma client surface used by application code; DB role can be further
restricted in staging/prod.

### 4.4 Consent service

`consent-service.ts` owns the state machine
(`pending → approved | denied`, `approved → revoked`, time-based `expired`)
plus side effects that today live inline in `store.ts`:

- create ⇒ notify patient user, audit `consent.request`
- decide ⇒ default 90-day expiry on approval without one, notify requester,
  audit `consent.approve|deny|revoke`
- expiry is **evaluated at read time** (`approved && expiresAt > now`), never
  by mutating rows on a timer — identical semantics to `consentActive()` today
- ABDM mode `sandbox|production`: consent requests additionally initiate the
  ABDM consent flow via `integrations/abdm/consent.ts`; local `Consent` rows
  carry `abdmConsentId` and the ABDM status callbacks reconcile into it.
  In `mock` mode the local flow is authoritative (today's behaviour).

### 4.5 Auth & sessions

Phase 1 keeps parity: `POST /auth/login { email }` resolves a seeded user
(today's demo behaviour, password accepted-but-ignored), `POST /auth/persona
{ userId }` for the persona switcher (demo mode only), `GET /auth/me` for
bootstrap, `POST /auth/logout`. Session = signed, httpOnly, SameSite=Lax
cookie holding the user id; server-side session table (revocable, idle +
absolute expiry per `docs/backend/09 §4`). Phase 5+ adds real credentials
(argon2id) and optional OTP — additive, no contract change.
`AuthContext.tsx` keeps its exact public shape (`user, org, loading, error,
mode, signIn, signInAs, signOut`) so `Login.tsx` and `AppShell.tsx` need zero
UI changes (§5.3).

### 4.6 ABDM adapter

`integrations/abdm/adapter.ts` exposes one interface with three
implementations selected by `ABDM_MODE`:

| Mode | Implementation | Behaviour |
| --- | --- | --- |
| `mock` (default, dev/demo) | In-process port of `src/lib/abdm.ts` | Same deterministic lookups, OTP `123456`, same latency simulation — demo parity |
| `sandbox` | HTTP client against ABDM Sandbox (`client.ts` + `gateway.ts` auth) | Real ABHA verify/OTP, HPR/HFR lookups, consent artefacts |
| `production` | Same client, production endpoints + secrets | Post-approval only |

Frontend-facing endpoints (consumed by the unchanged `NewPatientModal`
wizard): `POST /abdm/abha/lookup`, `POST /abdm/abha/otp/send`,
`POST /abdm/abha/otp/verify`. OTPs are never logged or stored in plaintext
(single-use, short TTL, rate-limited — `docs/backend/09 §4`).
Registry interactions (HPR for clinicians, HFR for facilities) surface in
`organizations`/`users` modules as verification status, **never as cloned
registry data** (`docs/backend/07 §3`).

### 4.7 Audit integrity — event → SHA-256 → blockchain proof

```
sensitive action ──► audit-service.record(envelope)
                        │ canonical JSON (sorted keys, ISO-8601 UTC, opaque ids only)
                        ▼
                   payloadHash = SHA-256(canonical)
                        │ prevHash = last persisted payloadHash
                        ▼
                   INSERT AuditEvent (append-only)
                        │
                        ▼  (batcher, e.g. every N events / T seconds)
                   blockchain-service.anchor([seqs])
                        │ merkleRoot = Merkle root of batch hashes
                        ▼
                   chain tx (only the 32-byte root on-chain)
                        │
                        ▼
                   UPDATE BlockchainAnchor(txRef, status=confirmed)
```

Properties:

- **Tamper-evidence:** any edit to a historical event breaks its
  `payloadHash` and every subsequent `prevHash`; `GET /audit/verify`
  recomputes the chain and reports the first broken link.
- **External proof:** Merkle-root anchoring gives an independently checkable
  commitment without per-event chain cost; verification = recompute root,
  compare with chain tx. (Chain choice is an open decision — §8.)
- **Off-chain guarantee:** the canonical envelope contains ids, roles, action
  verbs, timestamps and status — never names, ABHA numbers, clinical facts or
  free-text detail (detail is hashed as part of the envelope but is never
  transmitted anywhere; it stays in Postgres). Nothing but 32-byte digests
  leaves the database.
- **Fail-closed for sensitive writes** (`docs/backend/09 §2`): if the audit
  insert fails, the triggering write fails. Anchoring is asynchronous and its
  outage degrades to "not yet anchored", never to data loss.

Frontend: `Audit.tsx` gains (Phase 4, additive) a per-event proof badge and a
"Verify chain" action calling `/audit/verify` — existing layout reused.

### 4.8 API contract map — store function → REST endpoint

Base `/api/v1`; JSON; envelope `{ error: { code, message } }` on failure
(conventions lifted from `docs/backend/06`). Every row is a function the
frontend calls today (§2.4), so coverage is complete by construction.

| Store function today | Endpoint | Module |
| --- | --- | --- |
| `signIn` / `signInAs` / `signOut` / session bootstrap | `POST /auth/login` · `POST /auth/persona` · `POST /auth/logout` · `GET /auth/me` | auth |
| `usersAll` (staff page), `inviteUser` | `GET /users` · `POST /users` | users |
| `orgs`, `orgById`, `orgDirectory` | `GET /organizations` · `GET /organizations/:id` | organizations |
| `visiblePatients` | `GET /patients?visibility=mine` | patients + access-control |
| `patientById` (refs) | `GET /patients/:id` (identity only, pre-access-check) | patients |
| `patientBundle` | `GET /patients/:id/bundle` (access-gated; 403 carries `AccessDecision`) | patients + access-control |
| `patientTimeline` | `GET /patients/:id/timeline` | patients |
| `evaluateAccess` | `GET /patients/:id/access` (also inlined in bundle responses) | access-control |
| `registerPatient` | `POST /patients` | patients |
| `addClinicalNote` | `POST /patients/:id/notes` | clinical-records |
| diagnoses/encounters reads (bundle tabs) | inside `/bundle`; later `GET /patients/:id/encounters` etc. | encounters, clinical-records |
| `requestConsent` | `POST /consents` | consents |
| `decideConsent` | `POST /consents/:id/decision` | consents |
| consent register (ConsentCenter) | `GET /consents?scope=involving-my-org` | consents |
| `tasksFor` / `createTask` / `advanceTask` | `GET /care-tasks` · `POST /care-tasks` · `PATCH /care-tasks/:id` | coordination (under patients module area) |
| `labQueueFor` / `createLabOrder` / `updateLabOrder` | `GET /lab-orders` · `POST /lab-orders` · `PATCH /lab-orders/:id` | labs |
| `prescriptionsFor` / `createPrescription` / `dispensePrescription` | `GET /prescriptions` · `POST /prescriptions` · `POST /prescriptions/:id/dispense` | prescriptions |
| `auditFeed` | `GET /audit?…` (server applies the §2.6 scoping) | audit |
| — (new) chain verification | `GET /audit/verify` | audit |
| `notificationsFor` / mark read / mark all | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read` | notifications (under users) |
| `platformStats` | `GET /platform/stats` (aggregates only, §4.2) | organizations/platform |
| `lookupAbha` / `sendAbhaOtp` / `verifyAbhaOtp` | `POST /abdm/abha/lookup` · `POST /abdm/abha/otp/send` · `POST /abdm/abha/otp/verify` | abdm |
| `metrics.recordContextRun/Blocked/Grant` | keep client-side (Phase 1–3); Phase 4 derives blocked/grant counts server-side from the audit feed | — |

Mutating endpoints emit their audit events server-side (the frontend stops
being the audit authority); `patient.context.view` success/blocked is emitted
by the bundle endpoint itself.

---

## 5. Migration strategy

### 5.1 Principles

1. **Strangler seam, not rewrite.** The exported surface of `store.ts`
   (33 functions + `metrics`) is the contract. We re-implement it against the API and never touch a page
   that doesn't require it. The legacy vanilla-JS `frontend/` app proved this
   seam pattern works; we apply it one level deeper.
2. **Demo mode survives.** `local` data mode (today's store, minus nothing)
   stays available behind `VITE_DATA_MODE=local` — the competition/offline
   demo keeps working on day 1 of backend availability and during outages.
3. **Server becomes the authority progressively.** First reads, then writes,
   then access decisions, then audit. At no point does the frontend hold a
   rule the server doesn't also hold; parity is enforced by integration tests
   that run the same scenarios through both implementations.
4. **Every phase ships a runnable, reviewable increment** (charter discipline)
   and updates `docs/engineering/log.md`.

### 5.2 Frontend seam design

```
src/data/
  types.ts            # unchanged — DTO types shared by both impls
  store-api.ts        # THE public surface (same exports as store.ts today)
  local-impl.ts       # today's store.ts moved verbatim (demo mode)
  remote-impl.ts      # API-backed implementation
  useStore.ts         # unchanged hook; bump() now also fires on cache refresh
  api-client.ts       # fetch wrapper: base /api/v1, credentials: "include",
                      #   error-envelope normalization, 401 → /login
```

- Reads in `remote-impl` are served from a normalized client cache hydrated
  on session start and refreshed after each mutation (optimistic where safe),
  so **synchronous render-time getters keep working** — pages don't need
  async refactors.
- Mutations become thin `async` wrappers (`await api.post(…)` then refresh +
  `emit()`); today's call sites are fire-and-forget handlers, so the change
  is mechanical and per-page reviewable.
- `evaluateAccess` in API mode consumes the server's decision (bundle/access
  responses carry `AccessDecision`); the local copy remains only in demo mode.
- Switching: `VITE_DATA_MODE=local|api` (default `api` once Phase 3 ships;
  `local` forever available). Vite dev config proxies `/api → :4000`, so no
  CORS and no localhost URLs in browser code.

### 5.3 Phases and exit criteria

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 — Audit & plan** (this doc) | No code changes. Repository audit; architecture doc. | `docs/architecture.md` accepted; frontend build green. ✅ |
| **1 — Backend skeleton** | `backend/` per §3.2: Fastify app factory, Prisma schema §4.3 + migration, seed script replaying `seed.ts` 1:1, Zod env config, error envelope, `/health`, auth module §4.5 (demo personas), OpenAPI at `/docs`; docker-compose Postgres; unit tests for env/config. | `npm run dev` in `backend/` serves seeded `/api/v1/auth/me` + `/docs`; seed data verifiably identical to frontend demo data. |
| **2 — Read APIs + frontend read seam** | organizations, users, patients (list/identity/bundle/timeline/access), audit feed, notifications, platform stats; `remote-impl` reads + `api-client`; `VITE_DATA_MODE` flag; parity tests (same actor, same visibility, both impls). | Every page renders identically in `api` mode for all 6 roles; `local` mode unchanged. |
| **3 — Write APIs + server authority** | consents, labs, prescriptions, tasks, patient registration, staff invites, notes; `access-service` as sole gatekeeper; server-emitted audit for every mutation; frontend mutations switched to API; Supabase dep retired. | Full end-to-end demo runs against the API; a denied cross-tenant access returns 403 + `blocked` audit row; no frontend writes bypass the API. |
| **4 — Audit integrity + ABDM sandbox** | hash chain live on all audit writes; `blockchain-service` anchoring + `/audit/verify` + UI proof badge; `ABDM_MODE=sandbox` adapter against ABDM Sandbox for ABHA verify/OTP (mock stays default); FHIR HI-type mapping scaffold. | Chain verify passes over seeded history; ABHA verification completes against the sandbox with a test ABHA; anchored root visible with tx ref. |
| **5 — Hardening & cleanup** | rate limiting, security headers, session revocation UI, real-credentials option, `frontend/` legacy app archived or pointed at the same API (decision pending), docs/decision records complete. | Security checklist from `docs/backend/09 §4` green; dead demo-only code paths removed or explicitly kept. |

### 5.4 Parity checklist (run at every phase gate)

- [ ] Login as each of the 7 personas → identical dashboard for the role
- [ ] Doctor sees own-tenant patients + consented externals only
- [ ] Cross-tenant patient without consent → sealed view + `blocked` audit row
- [ ] Consent request → patient notification → approve → access opens; revoke → sealed again
- [ ] Lab order lifecycle (order → collect → result) notifies ordering doctor
- [ ] Prescription lifecycle (issue → dispense) notifies patient
- [ ] Timeline tab and MyTimeline identical ordering/content
- [ ] Audit page scope per role identical; CSV export unchanged
- [ ] Demo reset + persona switch still work (demo-mode affordances intact)

### 5.5 Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Synchronous render-time getters tempt an async rewrite of pages | §5.2 cache design keeps getters sync; a lint rule flags `await` in render paths |
| Dual implementations drift | Parity tests execute identical scenario scripts against both impls in CI |
| Audit hash chain complicates inserts under concurrency | Single writer path via `audit-service` + Postgres advisory lock / serial `seq`; anchoring async |
| ABDM Sandbox instability blocks Phase 4 | Adapter defaults to `mock`; sandbox behind the same interface, flip by env |
| Scope creep into record-storage centralization | §4.2 residency rules encoded in API review checklist: any endpoint returning cross-tenant clinical content is rejected at design review |

---

## 6. Reusable components (keep unchanged)

| Category | Items |
| --- | --- |
| **All pages & dashboards** | Landing, Login, NotFound, 6 role dashboards + router, PatientList, PatientProfile (incl. access gate + instrumentation), ConsentCenter, Coordination, LabOrders, Prescriptions, Audit, Staff, Organizations, Analytics, MyTimeline, MyRecords, MyConsents, MyCare |
| **UI kit** | `ui/primitives.tsx` (Card, Badge, Button, Input, Select, Textarea, Field, StatCard, EmptyState, Avatar, SampleTag, PageLoader), `ui/Modal.tsx`, `ui/Toast.tsx`, `DataTable.tsx`, `PageHeader.tsx`, `Wordmark.tsx`, `ThemeToggle.tsx`, `charts/Charts.tsx` |
| **Domain components** | `Timeline.tsx` (consumes `TimelineEvent` verbatim), `ConsentPill.tsx` + `consentLabel`, `RequestConsentModal.tsx` (SCOPES/HI_TYPES vocab already ABDM-shaped), clinical-action modals, `NewPatientModal` wizard |
| **Layout & shell** | `AppShell` (role nav, persona switcher), `GlobalSearch`, `NotificationsMenu`, `ProtectedRoute` |
| **Config & lib** | `auth/roles.ts` (NAV_BY_ROLE, ROLE_LABEL/ACCENT, CAN → server RBAC source), `lib/format|status|cn|theme`, Tailwind config, routing tree, theme system |
| **Types** | `src/data/types.ts` — becomes the shared DTO contract (backend Zod schemas mirror it) |
| **Seed content** | `src/data/seed.ts` — replayed 1:1 by `backend/prisma/seed.ts` |
| **Docs** | `docs/backend/01–10` for NFRs, ABDM vocabulary, audit fields, error conventions; `docs/engineering/*` process records |

## 7. Components that need replacement

| Current | Replacement | Phase |
| --- | --- | --- |
| `src/data/store.ts` — localStorage persistence + all business rules | `store-api.ts` + `remote-impl.ts` against JAP API; rules move to backend services (§3.2); `local-impl.ts` keeps demo mode | 2–3 |
| `src/auth/AuthContext.tsx` — localStorage session + Supabase branch | Same public API, backed by `GET /auth/me` + cookie session; Supabase branch deleted | 3 |
| `src/lib/abdm.ts` — in-browser ABHA mock | Backend ABDM adapter (§4.6); frontend calls `/abdm/abha/*` | 4 (mock-backed from 1) |
| `src/lib/supabase.ts` + `@supabase/supabase-js` + Supabase env vars | Retired — JAP API is the only backend | 3 |
| `src/data/seed.ts` as runtime data source | Backend seed (same content); frontend seed only serves `local` demo mode | 1 |
| Client-emitted audit (`audit()` calls scattered in pages/store) | Server-emitted audit in route handlers/services; client instrumentation calls removed | 3 |
| `metrics` localStorage persistence | Kept short-term; server-derived analytics replace its dashboard uses | 4+ |
| localStorage keys `:db:v4`, `:session:userId`, `:metrics:v1` | Server state / session cookie / (metrics key stays until 4+) | 3 |
| Legacy `frontend/` vanilla app seams (`auth-service.js`, `identity-service.js`) | Untouched for now; decision pending whether it reuses the same API later | 5 (decision) |

## 8. Open decisions (need owner sign-off per charter)

1. **Chain choice for audit anchoring** (public L1/L2 vs permissioned ledger)
   — affects `blockchain-service` transport only; the hash/merkle design is
   chain-agnostic. **Decision needed before Phase 4.**
2. Session mechanism confirmation: httpOnly cookie (proposed, matches
   `docs/backend/03`) vs bearer JWT.
3. Fate of the legacy `frontend/` app (archive vs rewire).
4. Real-credential policy for staff users (Phase 5): passwords vs OTP-only.
5. Whether `metrics` research instrumentation ships to the server as its own
   event type or stays a client concern.

---

*Prepared as Phase 0 of the JAP backend transformation. No application code
was modified in this phase; the frontend builds and runs exactly as before.*
