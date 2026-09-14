# Implementation Log — Backend Phase 4 (Patients + RBAC & Tenant Isolation)

- **Date:** 2026-09-14
- **Task:** the patient identity registry (`POST|GET /api/v1/patients`,
  `GET|PATCH /api/v1/patients/{id}`) per `docs/backend/04`, `05 §2–§4`,
  `06 §3`, and the **RBAC + tenant-isolation layer** that makes those endpoints
  safe to expose — `docs/backend/07 §4–§7`, `docs/architecture.md §4.1–§4.2`
- **Status:** Complete for this phase
- **Branch:** `arena/01a0a0ad-jap` → PR to `main`

> Read this before touching `backend/src/lib/{roles,permissions,audit}.ts`,
> `backend/src/middleware/rbac.ts`, `backend/src/services/*`, or
> `backend/src/modules/patients/*`.

**On phase numbers.** "Phase 4" here is the backend implementation-log sequence
(`backend-phase1` … `backend-phase4`), *not* `docs/architecture.md` §5.3, whose
Phase 4 is "Audit integrity + ABDM sandbox". Mapped onto §5.3, this phase ships
the patients module of architecture Phases 1–2 plus the authorization slice of
architecture Phase 3 — including that phase's exit criterion *"a denied
cross-tenant access returns 403 + `blocked` audit row"*, which is now true and
asserted by test.

## 1. Scope

In scope:

- the four patient-registry endpoints, with JAP-local opaque patient ids, ABHA
  identifiers mapped exclusively through `patient_identities`, server-owned
  verification state, and the `provisional` / `registered` / `abha_linked`
  lifecycle;
- the authorization stack those endpoints need: role registry, default-deny
  capability matrix, the data-level access decision, tenant-scoped queries, and
  an audit row for every allow and deny;
- tests for all of the above, and the fixes needed to make the existing suite
  run at all.

Explicitly out of scope (deferred with a reason, not silently):

| Deferred | Why / where it lands |
| --- | --- |
| Consent **plane** (request / decide / revoke / notify) | `docs/backend/08 §5` — undesigned milestone. Only the *read* side exists (`services/consent-view.ts`) because rule 4 of the access decision cannot be evaluated without it. |
| ABDM verification adapter (`patient-verifications` + OTP) | `docs/backend/04 §5–§6`. The `patient.verify_identity` capability and `markIdentityVerified` field are its insertion point, so it arrives without a redesign. |
| Audit anchoring | Audit-integrity milestone (architecture §5.3). The hash chain itself landed with `modules/audit` (§10.1); anchoring it externally is still open. Both are in-memory and lossy-on-restart until the store is durable, which is documented rather than papered over (doc 04 §4's rule of thumb). |
| Patient bundle / timeline / admissions reads | `docs/backend/06 §3`, `08 §1–§2`. They inherit `access-service` unchanged. |
| Prisma-backed patient store | The Map store mirrors `patients` + `patient_identities` column-for-column; swapping it changes one file (`modules/patients/store.ts`). CI must run without a reachable database, same as the Phase 3 auth registry. |
| Facility-role identity design (HFR / staff model) | `docs/backend/07 §2` says do not build these roles until answered. They hold read capabilities here and no write capabilities, which is the honest interim state. |

## 2. State found, and what that meant

The patient module had landed in the previous commit (`efb99e9`) but **had never
been executed**. Three consequences, all fixed here:

1. **`npm run typecheck` failed** (8 errors). The routes returned 400/404/409
   bodies that no `response` schema declared; with `fastify-type-provider-zod` a
   route may only send statuses it declares. Fixed by declaring the error
   envelope per status (`middleware/error-schemas.ts`) — which also puts the
   real failure contract into the OpenAPI document.
2. **`npm test` could not start.** Vitest found no config in `backend/`, walked
   up the tree and loaded the *frontend's* `/vite.config.ts`, which imports
   `@vitejs/plugin-react`. Fixed with `backend/vitest.config.ts` (node
   environment, `tests/**/*.test.ts`, isolated files).
3. **Seeded identities collided.** `resetPatientStore()` minted identity ids
   from a counter that restarted per patient (`uuid(0x200 + idx)`), and because
   the identity table is keyed by id, 10 of the 12 seeded identities silently
   overwrote each other: every patient but the last appeared to have **no
   identifiers at all**, so no record could ever reach `abha_linked`. Fixed with
   one running counter. Verified before/after:
   `Amit/Priya/Rahul/Sunita/Iqbal/Meera` each carry their 2 identities again,
   the walk-in carries none.

### Found by starting the server, not by the suite

The suite could not see these, because every test file calls
`resetPatientStore()` in `beforeEach` — which seeds the demo tables as a side
effect. Both were caught by `npm run dev` plus `curl`:

4. **`npm run dev` crashed on boot.** `prisma generate` downloads an engine
   binary, which an offline machine cannot fetch; the generated stub then throws
   `@prisma/client did not initialize yet` **at construction time**, and
   `lib/prisma.ts` constructed it at import — taking the server down with it,
   even though every runtime path (health, auth, patients) is DB-free. That
   file's own comment already claimed it tolerated a missing client; it did not.
   Now `prisma` is `null` when construction fails, `server.ts` logs why, and
   code that genuinely needs the data layer calls `requirePrisma()` for a single
   actionable error instead of the stub's.
5. **The booted server served an empty registry.** `resetPatientStore()` is
   documented as "runs at import" but nothing called it at import. Over HTTP:
   `GET /api/v1/patients` → `total: 0`, every record read → 404 — while 100+
   tests passed. Fixed by calling it once at module load (tests still call it to
   reset), and pinned by a new suite that deliberately never resets
   (`tests/bootstrap.test.ts`): with the call removed, all three of its tests
   fail (`expected +0 to be 7`, `expected 404 to be 200`), which is the point.

6. **The request line logged search terms.** The list handler deliberately never
   logs `q`, but Fastify's own `incoming request` line logs `req.url` — query
   string included — so `GET /api/v1/patients?q=iqbal` put a fragment of a
   patient's name into every log sink anyway (docs/backend/09 §2, §4 forbid
   exactly that). Fixed in `config/logger.ts`: the `req` serializer now masks
   every query value except an explicit allowlist of operational parameters
   (`limit`, `offset`, `status`, `state`, `orgId`, sorting), keeping the path and
   the key so a log still shows that a search happened. Observed in the dev log:
   `url: "/api/v1/patients?abhaNumber=[redacted]&offset=0"`. The not-found
   handler echoed the raw URL in its message too, and now echoes the path only.
   Four unit tests pin `redactUrl`, because logging is disabled under
   `NODE_ENV=test` and no integration test can see it.

Two smaller fidelity fixes in the same pass: Amit Kumar's `bloodGroup`/`weightKg`
and contact email now match `src/data/seed.ts` (`B+`, 81 kg,
`amit.kumar@abdm.example.in`), and `provisional → registered` promotion now
requires the demographics **in the request** — the old check read the stored
values, which for an intake record are placeholders, so promotion was
unrefusable and the existing test asserting `400` could never pass.

## 3. The authorization layer

`docs/backend/07 §4` describes five layers and says to build 1 + a minimal 2
now, designing 3–4 as insertion points. This phase needs all four of the first
four, because a patient registry with no tenant scope is a national patient
directory — the exact failure `docs/backend/08 §4` warns about.

```
1  session       lib/session.ts              401 unauthenticated
2  role          lib/permissions.ts          403 forbidden · role_not_permitted
3  relationship  services/access-service.ts  403 forbidden · AccessDecision
4  consent       services/consent-view.ts    (feeds rule 4 of the decision)
5  audit         modules/audit               every allow AND deny
```

Order is enforced structurally, not by convention: Layer 1+2 run in a
`preHandler` (`middleware/rbac.ts → requireCapability`) that answers and writes
its own `blocked` audit row before the handler exists; Layers 3–4 run inside the
service, which is the only place patient rows are read. There is no unscoped
read function left to call — `getPatient()` is store-internal, and every exported
service entry point takes an `Actor`.

### Layer 2 — capability matrix (default-deny)

| Capability | PATIENT | DOCTOR | HOSPITAL_ADMIN | LAB | PHARMACY | SUPER_ADMIN |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `patient.register` | — | ✅ | ✅ | — | — | — |
| `patient.read` / `patient.search` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `patient.update` | — | ✅ | ✅ | — | — | — |
| `patient.link_identity` | — | ✅ | ✅ | — | — | — |
| `patient.verify_identity` | — | ✅ | — | — | — | — |

The remaining capabilities (`prescription.create`, `prescription.dispense`,
`lab.order`, `lab.result`, `consent.request`, `consent.decide`,
`care_task.create`, `staff.manage`) are declared now because they mirror the
frontend's `CAN` matrix (`src/auth/roles.ts`) and a unit test asserts the mirror
capability-for-capability, role-for-role. They are data, not endpoints: nothing
routes on them yet, and no speculative API was built for them (doc 08's rule).

`patient.read`/`patient.search` are deliberately broad. The capability answers
"may this role query the registry"; **the scope answers which rows exist for
this caller**. A grant never implies a record — that separation is the whole
point of having both layers.

### Layers 3–4 — the access decision

`services/access-service.ts` reproduces `evaluateAccess` from
`src/data/store.ts` exactly (architecture §2.5 says "must be reproduced
server-side, exactly"), plus one rule the browser never needed: an actor with no
tenant is denied. The `AccessReason` union is closed and travels on the wire, so
`ConsentPill.tsx` renders server decisions unchanged.

Consent artifacts come in through `ConsentLookup`, an injected interface with a
demo default. That is the insertion point doc 07 §4 asks for: when the consent
plane lands, a Prisma-backed lookup replaces the demo view and no rule changes.
It also makes all nine reasons unit-testable, including `consent_revoked`, which
the demo data does not contain.

### Tenant isolation, concretely

- **Writes belong to the owning tenant.** `evaluateWriteAccess` never consults
  consent: an artifact opens a read, not an edit of another facility's registry
  row (`cross_tenant_write`). Platform oversight is read-only for the same
  reason (architecture §4.2 — JAP must not hold one tenant's records for
  another).
- **Out-of-scope records are absent.** Not sealed — absent: not listed, not in
  `total`, not matched by `q`. A laboratory with no consent history gets an
  empty registry, not somebody else's.
- **Sealed rows exist only where the caller's own request exists.** If the
  tenant has an artifact that is not active, the list returns
  `{ sealed: true, id, orgId, access }` — four keys, no demographics. The
  frontend's demo list shows a name there; the API is stricter on purpose, and
  doc 08 §4 flags this scoping as privacy-critical. Sealed stubs are dropped
  whenever a content filter (`q`, `state`, `status`) is present, so a filter
  cannot profile a record the caller cannot read.
- **`orgId` narrows, never widens.** `?orgId=org-sanjivani` from org-nmc returns
  only rows already in scope (one readable, one sealed); the same filter cannot
  reach a tenant with no artifact.
- **Identifier uniqueness is platform-wide, and silent.** `(type, value)` is
  unique across tenants (one ABHA is one person — a second tenant registering it
  must collide, not fork), and the 409 names neither the holder nor their tenant.
- **403 vs 404.** Unknown id → 404; known-but-inaccessible → 403 with the
  decision (the sealed view + `blocked` audit row that architecture §5.4
  requires). Safe only because ids are opaque UUIDv4; that dependency is written
  into the test so nobody "simplifies" it later.

### Layer 5 — audit

The trail is `modules/audit` — one hash-chained writer for the whole API (§10.1):
`sequence`, actor snapshot, `organizationId`, `action`, `resourceType`/
`resourceId`, `patientId`, `status`, plus `reason`, `capability`,
`authorizationId`, `requestId`, each event hashing its predecessor's id. It is
append-only: there is no update or delete API, only readers. Recorded: allowed
reads/writes/creates, denied reads (with the `AccessDecision` reason), refused
cross-tenant writes, role denials (with the capability), unauthenticated
attempts (actor null), and 404 probes (because that is what enumeration looks
like).

PHI rules, asserted by test rather than by intention: no patient name, no dob,
no identifier value, no contact detail, and **no search term** — the list
handler logs counts and `filtered=yes|no`, never `q`. The only name in the trail
is the acting account's own snapshot (`audit_events.actor_name`), never the
subject's.

## 4. Files

### Added

| File | Responsibility |
| --- | --- |
| `backend/vitest.config.ts` | Runner config, so the suite never loads the frontend's Vite config |
| `backend/src/lib/roles.ts` | Role registry: the six locked roles, backend key ↔ legacy frontend key, audience/identifier facts, ABDM anchor (doc 07 §1) |
| `backend/src/lib/permissions.ts` | Layer 2: capability vocabulary + default-deny matrix + `can()` |
| `backend/src/lib/demo-ids.ts` | The synthetic ids the auth registry, patient store and consent view must agree on |
| `backend/src/middleware/rbac.ts` | The guard: `requireCapability` preHandler + `denyCapability`/`denyAccess`/`denyWrite`/`forbidden`/`unauthenticated` |
| `backend/src/middleware/error-schemas.ts` | Declared error envelopes (400/401/403/404/409) for typed replies + OpenAPI |
| `backend/src/services/access-service.ts` | Layers 3/4: `evaluateAccess`, `evaluateWriteAccess`, `resolveVisibility`, `ConsentLookup` seam |
| `backend/src/services/access-schemas.ts` | `AccessDecision` as an API contract + the consent projection |
| `backend/src/services/consent-view.ts` | The authorization stack's read side of the consent plane: projects `modules/consents` records into the §2.5 vocabulary and seeds the demo artifacts (§10.2) |
| `backend/tests/rbac.test.ts` | 38 unit tests: registry, matrix (+ frontend `CAN` parity), the closed reason union, write scope, visibility, consent activity, the trail's chain and hash coverage |
| `backend/tests/patients-authz.test.ts` | 27 integration tests: every role × every endpoint, every cross-tenant state, sealed shape, audit correlation, OpenAPI |
| `backend/tests/bootstrap.test.ts` | 3 boot-state tests: the registry is populated on import, all 12 seeded identities survive, a record read works on the first request |
| `docs/engineering/backend-phase4-patients-log.md` | This file |

### Modified

| File | Change |
| --- | --- |
| `modules/patients/routes.ts` | Guard on every route; audit on every decision; scoped list; 401/403/404/409 declared and returned |
| `modules/patients/service.ts` | Every entry point takes an `Actor`; visibility scope + access decision on reads; write scope + per-field capabilities on writes; discriminated outcomes |
| `modules/patients/schemas.ts` | `access` on read responses; sealed/accessible list rows; `scope` + `sealedCount`; documented filters |
| `modules/patients/store.ts` | Identity-id collision fixed; ids from `lib/demo-ids.ts`; seed fidelity to `src/data/seed.ts` |
| `modules/auth/service.ts` · `schemas.ts` · `routes.ts` | PATIENT accounts carry `patientId` (`users.patient_id`) — the basis of the `self` rule |
| `lib/session.ts` | `SessionUser.patientId` + the "what a session carries" note |
| `types/fastify.d.ts` | `request.actor` augmentation |
| `app.ts` · `config/meta.ts` · `package.json` · `README.md` | Phase 4 + authorization described where callers look |
| `tests/patients.test.ts` | Counts and shapes updated for tenant scoping; two cases added (soft downgrade to provisional; body `orgId` ignored) |
| `tests/app.test.ts` | +6: the auth boundary declares its real statuses and returns the declared 401 envelope; `redactUrl` masks sensitive values, keeps operational ones, fails closed on unlisted keys, and the 404 does not echo a query string |
| `lib/prisma.ts` | Tolerant construction: `prisma` is `null` when the generated client is missing; `requirePrisma()` for code that needs the data layer |
| `server.ts` | Says once, at startup, when the data layer is off; `prisma?.$disconnect()` on shutdown |
| `modules/auth/routes.ts` | Declares 400 on `authenticate` and 401 on `session`/`me`, so Layer 1's failure contract is in the OpenAPI document |
| `config/logger.ts` | Request-line redaction: `redactUrl` + `LOGGABLE_QUERY_KEYS`, so a query string cannot carry a name into the logs |
| `middleware/error-handler.ts` | The 404 message echoes the path, not the URL with its query string |

## 5. Decisions worth recording

1. **All four authorization layers now, not "1 + a minimal 2".** Doc 07 §4
   proposes a minimal Layer 2 today; a patient *registry* read cannot be shipped
   without Layer 3/4, because the alternative to scoping is a cross-tenant
   directory. Layers 3–4 are one pure function each, and the consent lookup is
   injected rather than built out.
2. **Consent artifacts are seeded read-only.** Rule 4 cannot be exercised
   without them, and a blanket denial would be indistinguishable from correct
   isolation. The demo consents are `src/data/seed.ts`'s `con-01…con-05` mapped
   onto the backend's patient ids; there is no create/approve/revoke path.
3. **Consent dates are relative to now, unlike the frontend seed's fixed
   2026-09-10 anchor.** The anchor would silently turn the one active artifact
   (`con-01`) into an expired consent on 2026-11-30 and change the demo's
   meaning without anyone editing a file. Statuses and (patient, org) pairs are
   1:1 with the seed; only the clock differs, and it is documented in the file.
4. **`patient.verify_identity` is DOCTOR-only.** Doc 07 §5's locked matrix gives
   "Identify patient (ABHA→OTP)" to the doctor and leaves facility roles
   undesigned, and doc 07 §2 says do not build those roles before their identity
   design is answered. A hospital admin may *declare* an ABHA (registration desk)
   but may not attest that ABDM verified it.
5. **Promotion to `registered` must carry gender + dob in the request.** Intake
   placeholders (`Other` / `1980-01-01`) satisfy the NOT NULL columns; treating
   them as captured data would let a walk-in be marked complete with a fabricated
   dob. ABHA is deliberately absent from the requirement — that is the phase's
   central constraint, and the refusal message is asserted not to mention it.
6. **Incomplete create is downgraded, not rejected.** `{ name, gender }` with no
   `status` becomes a provisional record (201) instead of a 400: a missing field
   must not block care. An *explicit* `status: "registered"` without dob is
   refused, because the caller asked for a complete record.
7. **Sealed stubs carry four keys.** Id, tenant, decision, `sealed`. The
   frontend demo shows a name in that row; the API does not, because a list is
   the one place where a name plus a tenant plus a state becomes a directory.
   When the consent plane ships, "your request is pending" is better served from
   the requester's own consent list than from somebody else's demographics.
8. **Sessions carry `patientId`.** The `self` rule cannot be enforced on a
   client-supplied id, and `users.patient_id` already exists in the schema. The
   legacy mock's record-less patient account keeps no `patientId` — it correctly
   reaches nothing (doc: a login identity is not a clinical record).
9. **`SUPER_ADMIN` reads everything and writes nothing.** Rule 1 of §2.5 is
   reproduced faithfully (and audited); architecture §4.2 keeps platform
   oversight out of clinical content, so it holds no registry write capability.
10. **The auth routes declare their error statuses too.** Layer 1 belongs to
    this phase's contract, and `GET /session` was answering a 401 the OpenAPI
    document never mentioned. Declaring it makes Fastify serialize the 401
    through the schema, so the test also asserts `requestId` survives —
    a declaration that silently stripped envelope fields would be worse than
    none, and that is exactly the failure mode item 11 guards against.
11. **429 and 500 are not declared per route.** They are produced by the
    rate-limit plugin and the centralized handler outside a route's response map;
    declaring them would run their bodies through a serializer that could strip
    fields the handler set on purpose.

12. **Log redaction is an allowlist of what may be logged, not of what is
    sensitive.** The natural implementation lists keys like `q`, `abha`, `name` —
    and fails open: the first endpoint that adds a person-identifying parameter
    nobody thought to list leaks it on every request. Masking everything except
    known-operational parameters means a new parameter is silent until someone
    decides it belongs in a log. The first version of this fix used the
    sensitive-key list and a test caught it missing `abhaNumber` on a casing
    mismatch — the allowlist version has no such hole to fall into.

## 6. Verification

- `npm run typecheck` — clean (was 8 errors before this phase's fixes).
- `npm test` — **132 tests, 10 files, 0 failures**, with no database and no
  listening socket: `app` 18 · `auth` 13 · `patients` 18 · `rbac` 38 ·
  `patients-authz` 27 · `bootstrap` 3, plus `main`'s `access` 6 · `consents` 4 ·
  `care` 3 · `audit` 2, all green against the reconciled modules (§10).
- `npm run dev` + `curl` on `:4000` — the server boots (with the documented
  "Prisma client unavailable" warning, since the engine binaries cannot be
  fetched here) and the §7 block was executed against it verbatim, end to end,
  with the outputs recorded below and as comments in the block. Observed, among
  the rest:
  - org-nmc doctor: `total 7, sealedCount 1`; the sealed row is Iqbal with
    `access.reason: consent_pending` and exactly four keys
    (`sealed,id,orgId,access`); `?q=iqbal` → `total 0`.
  - org-sanjivani admin: `total 5, sealedCount 3` — the three stubs carry
    `consent_pending`, `consent_expired`, `consent_denied`; `?q=meera` →
    `total 0` (absent, not sealed).
  - LAB (`org-pathcare`) and PHARMACY (`org-medplus`): `total 0` — a facility
    with no consent history reaches no registry rows at all.
  - `SUPER_ADMIN`: every record (the seeded seven plus whatever the walkthrough
    created), `sealedCount 0`, `scope.kind "platform"`; `PATCH` →
    403 `role_not_permitted` / `capability: patient.update`; `POST` → 403.
  - `PATIENT` (Amit's ABHA): `total 1`, `scope.kind "self"`, own record; reading
    another patient's id → 403; after `sign-out` → 401.
  - A created record with a *declared* ABHA answers `state: "registered"` with
    `verified: false`; the hospital admin's attempt to flip it → 403
    `role_not_permitted` / `capability: patient.verify_identity` and the record
    is unchanged; a doctor of the owning tenant succeeds → `state:
    "abha_linked"`, `verifiedAt` set.
  - Unknown uuid → 404, non-uuid → 400 (validation, before any lookup),
    known-but-cross-tenant → 403 + decision, duplicate ABHA on create → 409
    `identity_conflict` naming no holder.
- `GET /docs/json` — `/api/v1/patients/` declares `POST 201/400/401/403/404/409`
  and `GET 200/400/401/403/404`; `/api/v1/patients/{id}` declares
  `GET 200/400/401/403/404` and `PATCH 200/400/401/403/404/409`. The 403 body
  documents `reason`, `capability` and the nine-value `access.reason` enum; the
  list schema documents `patients/total/sealedCount/limit/offset/scope`. The
  auth routes now declare `400` (authenticate) and `401` (session/me).
- Both `/api/v1/patients` and `/api/v1/patients/` resolve to the collection
  (asserted).
- PHI sweep: after a run of searches, creates with identifiers, reads and
  denials, the serialized trail contains no seeded name, dob, phone,
  address, ABHA number or address, masked form, or search term; the live record
  body contains `ABHA •••• 3401` and never `23456789123401`.

## 7. Manual walkthrough for a reviewer

Start the server first — it logs `Prisma client unavailable` and carries on,
because every route below is DB-free:

```bash
cd backend && npm run dev
```

Then, in a second shell, run this block as written. Everything here was executed
against `:4000`; the trailing comments are the observed answers, and the `…ID`
variables come from the command above them.

```bash
B=http://localhost:4000
c() { curl -s -b /tmp/c.jar -c /tmp/c.jar -H 'content-type: application/json' "$@"; }
J() { jq -c "$@"; }

# ── DOCTOR, org-nmc (Dr. Aroha Deshpande): own tenant + Sunita via con-01 ──────
rm -f /tmp/c.jar
c -XPOST $B/api/v1/auth/authenticate -d '{"role":"DOCTOR","identifier":"HP-1001"}' | J '{status,user:.user.name,org:.user.orgId}'
c $B/api/v1/patients | J '{total,sealedCount,scope}'                    # 7, 1, {kind:"tenant",orgId:"org-nmc"}
c $B/api/v1/patients | J '.patients[] | select(.sealed==true)'          # 4 keys: sealed,id,orgId,access (consent_pending)
c "$B/api/v1/patients?q=iqbal" | J '{total,sealedCount}'                # 0, 0 — a filter drops sealed rows
SID=$(c "$B/api/v1/patients?q=sunita" | jq -r '.patients[0].id')
c $B/api/v1/patients/$SID | J '{name:.patient.name,access:.access}'      # consent_active
c -XPATCH $B/api/v1/patients/$SID -d '{"name":"Nope"}' | J '.error'      # 403 cross_tenant_write

# ── ABHA is optional end to end: walk-in → registered, still no identifier ────
NID=$(c -XPOST $B/api/v1/patients -d '{"name":"Emergency Intake"}' | tee /dev/stderr | jq -r .patient.id)
                                                                 # 201, status provisional, identities []
c -XPATCH $B/api/v1/patients/$NID -d '{"status":"registered"}' | J .error
                                                                 # 400 invalid_transition (no dob in the request)
c -XPATCH $B/api/v1/patients/$NID -d '{"gender":"Male","dob":"1980-01-01","status":"registered"}' | J '{status:.patient.status,state:.patient.state}'
                                                                 # registered, registered — no ABHA involved

# ── Declaring an ABHA is not verifying one ────────────────────────────────────
rm -f /tmp/h.jar
H() { curl -s -b /tmp/h.jar -c /tmp/h.jar -H 'content-type: application/json' "$@"; }
H -XPOST $B/api/v1/auth/authenticate -d '{"role":"HOSPITAL_ADMIN","identifier":"HOSP-ADM-2001"}' >/dev/null
H $B/api/v1/patients | J '{total,sealedCount}'                        # 5, 3 (pending/expired/denied stubs)
H "$B/api/v1/patients?q=meera" | J .total                             # 0 — other tenant, no artifact: absent
KID=$(H -XPOST $B/api/v1/patients -d '{"name":"Kamla Bai","gender":"Female","dob":"1975-06-02","identities":[{"type":"ABHA_NUMBER","value":"98765432109876"}]}' | tee /dev/stderr | jq -r .patient.id)
                                                        # 201, state "registered", identities[0].verified false, masked "ABHA •••• 9876"
IID=$(H $B/api/v1/patients/$KID | jq -r .patient.identities[0].id)     # verification names an id, never a value
H -XPATCH $B/api/v1/patients/$KID -d "{\"markIdentityVerified\":\"$IID\"}" | J '.error'
                                                        # 403 role_not_permitted / capability patient.verify_identity
H $B/api/v1/patients/$KID | J '[.patient.identities[].verified]'       # [false] — the refusal changed nothing
rm -f /tmp/d.jar
D() { curl -s -b /tmp/d.jar -c /tmp/d.jar -H 'content-type: application/json' "$@"; }
D -XPOST $B/api/v1/auth/authenticate -d '{"role":"DOCTOR","identifier":"HP-2001"}' >/dev/null
D -XPATCH $B/api/v1/patients/$KID -d "{\"markIdentityVerified\":\"$IID\"}" | J '{state:.patient.state,ids:[.patient.identities[]|{masked,verified}]}'
                                                        # abha_linked, verified true — owning tenant + doctor

# ── Facility roles hold read capability and reach nothing ─────────────────────
for r in "LAB LAB-3001" "PHARMACY PHARM-4001"; do set -- $r; rm -f /tmp/f.jar
  curl -s -c /tmp/f.jar -XPOST $B/api/v1/auth/authenticate -H 'content-type: application/json' -d "{\"role\":\"$1\",\"identifier\":\"$2\"}" >/dev/null
  curl -s -b /tmp/f.jar $B/api/v1/patients | J "{role:\"$1\",total,sealedCount,scope}"; done   # 0, 0 both

# ── Platform oversight is read-only; a patient reaches one record ─────────────
rm -f /tmp/s.jar; curl -s -c /tmp/s.jar -XPOST $B/api/v1/auth/authenticate -H 'content-type: application/json' -d '{"role":"SUPER_ADMIN","identifier":"SUPER-001"}' >/dev/null
curl -s -b /tmp/s.jar $B/api/v1/patients | J '{total,sealedCount,scope}'        # everything, 0 sealed, kind "platform"
curl -s -b /tmp/s.jar -XPATCH $B/api/v1/patients/$SID -H 'content-type: application/json' -d '{"name":"Nope"}' | J '.error'   # 403 role_not_permitted
rm -f /tmp/p.jar; curl -s -c /tmp/p.jar -XPOST $B/api/v1/auth/authenticate -H 'content-type: application/json' -d '{"role":"PATIENT","identifier":"23456789123401"}' >/dev/null
curl -s -b /tmp/p.jar $B/api/v1/patients | J '{total,scope,names:[.patients[].name]}'   # 1, kind "self", ["Amit Kumar"]
curl -s -o /dev/null -w 'other record → %{http_code}\n' -b /tmp/p.jar $B/api/v1/patients/$SID   # 403
curl -s -b /tmp/p.jar -XPOST $B/api/v1/auth/sign-out >/dev/null
curl -s -b /tmp/p.jar $B/api/v1/patients | J .error.code                        # unauthenticated

# ── Ids and conflicts ─────────────────────────────────────────────────────────
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/c.jar $B/api/v1/patients/not-a-uuid                      # 400
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/c.jar $B/api/v1/patients/00000000-0000-4000-8000-00000000beef  # 404
curl -s -o /dev/null -w '%{http_code}\n' $B/api/v1/patients                                              # 401
c -XPOST $B/api/v1/patients -d '{"name":"Duplicate Probe","gender":"Female","identities":[{"type":"ABHA_NUMBER","value":"23456789123401"}]}' | J .error
                                          # 409 identity_conflict — names no holder, no tenant
```

The in-memory stores reset when the process restarts (and on every file change
under `tsx watch`), so counts are those of a freshly booted server: 7 seeded
patients, 5 consent artifacts, 12 seeded identities.

## 8. Checklist status (`docs/backend/07 §7`)

- [x] Backend role registry mirroring `roles.js` — `lib/roles.ts`; sync is by
      process (a role change touches `roles.js`, the Prisma enum and this
      registry in one commit), and the mapping is asserted by test.
- [x] RBAC enforcement server-side on every endpoint (patient registry; frontend
      guards remain UX only).
- [x] Relationship + consent guard insertion points designed — `ConsentLookup`
      (Layer 4) and `evaluateWriteAccess` (ownership) are the seams; neither is
      speculatively implemented.
- [x] Default-deny for all new capabilities; matrix rows carry a documented
      justification each.
- [x] Every allow/deny decision audit-logged (`modules/audit`, Layer 5).
- [ ] HPR verification for doctors; HFR path for facilities — needs the ABDM
      adapter milestone (doc 04 §5, doc 07 §2–§3).
- [ ] Government IdP/SSO approach — still an open decision; `SUPER_ADMIN`'s
      anchor is recorded as `undecided` rather than guessed.
- [ ] Admission-list scoping — no admissions endpoint yet (doc 08 §2).
- [x] Audit hash chain — landed with `modules/audit` (sha256 over a canonical
      envelope linking `prevEventId`); the authorization layer's `reason` and
      `capability` are inside that envelope (§10.1).
- [ ] Audit anchoring — periodic external anchor for the chain; audit-integrity
      milestone (docs/architecture §5.3 Phase 4).

## 9. Next

1. **ABDM verification adapter** (`POST /api/v1/patient-verifications` +
   `…/{id}/confirm`, doc 04 §6): on a successful confirm it calls the same
   `patient.verify_identity` path this phase exposed, bound to the requesting
   professional's session, and audits the transition.
2. ~~**Consent plane**~~ — landed on `main` and reconciled (§10.2): what remains
   is durability, i.e. the plane's in-memory store → Prisma. `access-service`
   does not change when that happens; the seam is `ConsentLookup`.
3. **Bundle / timeline reads** (`GET /patients/{id}/bundle`, `/timeline`):
   inherit `readPatientForActor`; no new scoping logic.
4. **Durable stores**: patient store → Prisma, sessions → Redis/Postgres,
   consents/access/audit stores → their Prisma tables (the hash chain already
   has the columns it needs). Each is a single-module swap by design.
5. **Frontend API mode end to end**: the patient list and profile now render the
   server's decisions (§10.4); the consent centre, audit page and clinical
   screens still read the demo store in API mode.

## 10. Reconciliation with `main` (Phases 6–7 landed in parallel)

While this phase sat in review as PR #5, `main` moved on: the consent plane
(`modules/consents`), clinical records (`modules/care`), a sharing-decision
endpoint (`modules/access`), a hash-chained audit module (`modules/audit`) and a
frontend REST layer all landed, on a history with no merge base against this
branch. Phase 4 was therefore re-landed on today's `main` and reconciled module
by module. The rule throughout: **one implementation per concept** — where both
sides had built the same thing, one of the two was deleted rather than wrapped,
because two audit writers or two consent tables is how a system ends up with
decisions that disagree with each other.

### 10.1 One audit trail — `lib/audit.ts` deleted

Both sides had a writer. Mine was append-only with `reason` and `capability`;
`main`'s is a sha256 hash chain (`prevEventId`, `sequence`, canonical envelope)
with read routes (`GET /api/v1/audit`, `GET /api/v1/patients/{id}/audit`) and
tests pinning the chain. Main's is strictly stronger, so mine was deleted and
every authorization call site moved to `writeAuditEvent`.

Two fields the authorization layer cannot do without were added to main's event,
**inside the hashed envelope**:

| Field | Why the trail needs it |
| --- | --- |
| `reason` | A denial without its reason is unreviewable: `consent_pending` and `role_not_permitted` demand different responses from an auditor. |
| `capability` | Names the Layer-2 permission that was checked, so a role denial can be tied to a matrix row. |

Hashing them is the point, and it is asserted rather than assumed: two denials
that differ only in `reason` (or only in `capability`) hash differently, so
somebody rewriting *why* an access was granted breaks the chain
(`tests/rbac.test.ts`, "hashes the denial reason and capability").

Vocabulary and content changes that came with the move:

| Before (this branch) | After (`modules/audit`) |
| --- | --- |
| `patient.register` / `patient.read` / `patient.update` / `patient.search` | `CREATE_RECORD` / `VIEW_RECORD` / `UPDATE_RECORD` / `LIST_RECORDS` |
| `patient.identity.link` / `patient.identity.verify` | `LINK_IDENTITY` / `VERIFY_IDENTITY` |
| `resourceType: "Patient"` / `"PatientIdentity"` | `"PATIENT"` / `"PATIENT_IDENTITY"` |
| `detail: "consent con-01"` (free text) | `authorizationId: "con-01"` (the artifact id) |
| `detail: "identity <uuid>"` | `resourceId: <identity id>` |
| `detail: "status=registered identities=0"` | dropped — counts belong in the structured log line, not in a hash chain |
| `orgId` | `organizationId` |

The capability keeps its dotted name (`patient.register`): it is a permission
key from `lib/permissions.ts`, not a trail action. Free-text `detail` left the
trail altogether — prose in a hash chain is an invitation to put PHI in one, and
every fact the trail needs has an id.

### 10.2 One consent plane — `consent-view.ts` became an adapter

Mine held five hardcoded artifacts; `main`'s `modules/consents` is the real
workflow (a clinician requests, only the patient decides, expiry is refreshed on
read, revocation closes access at once). Two consent sources would have meant
two answers to "is this grant active?", so the view now reads the plane:

- `ConsentRecord` → `ConsentArtifact` projection: `REQUESTED→pending`,
  `APPROVED→approved`, `REJECTED→denied`, `REVOKED→revoked`, `EXPIRED→expired`.
  Every read returns a fresh copy, so the authorization stack still cannot
  mutate consent state (asserted).
- `isConsentActive` is the §2.5 rule-4 test on the plane's own window
  arithmetic: approved, started (`validFrom`) and not past `validUntil`.
- The five demo artifacts are seeded **through `insertConsent`**, so they are
  ordinary rows the plane's endpoints list, decide and revoke — not a side table.
  `con-04` is inserted `APPROVED` with a window that closed 43 days ago, which
  makes the plane's own expiry refresh (not a hardcoded status) the thing that
  turns it into `consent_expired`.
- `ConsentLookup` remains the seam; only its default source changed
  (`demoConsentLookup` → `consentPlaneLookup`), which is what the seam was for.

Projection changes: gained `note` (the requester's plain words, or the patient's
note on deciding) and `validFrom`; lost `hiTypes`, because the plane scopes
grants by clinical record type and the ABDM HI-type vocabulary arrives with the
ABDM adapter rather than being invented here. Seed purposes are now the plane's
codes (`TREATMENT`, `REFERRAL`, `SECOND_OPINION`) with the human sentence in
`note`: `/access/evaluate` matches purpose exactly, so with sentences the two
decision points would never have agreed on the same artifact.

### 10.3 One access vocabulary — the closed §2.5 union

`main`'s `modules/access` had its own twelve-value reason dialect. The canonical
union is `ACCESS_REASONS` in `services/access-service.ts` (architecture §2.5,
and the vocabulary `ConsentPill` already renders), so the module adopted it:

| `main` before | canonical | note |
| --- | --- | --- |
| `consent_requested` | `consent_pending` | one word for "not effective yet" |
| `consent_not_yet_valid` | `consent_pending` | `detail: "not_yet_valid"` keeps the distinction |
| `consent_rejected` | `consent_denied` | the patient refused |
| `purpose_not_allowed` | `no_consent` | `detail: "purpose_not_allowed"`, consent id retained |
| `record_type_not_allowed` | `no_consent` | `detail: "record_type_not_allowed"` |
| `patient_not_found` | *(removed)* | a 404 `not_found`, not a decision: there is no record to decide about, and the attempt is still audited |
| `self`, `consent_active`, `consent_revoked`, `consent_expired`, `no_consent`, `role_not_permitted` | unchanged | |

`role_not_permitted` is the one addition to the closed union (now ten values),
and it is added on both sides in the same commit — backend enum, frontend
`AccessDecision`, `ConsentPill`'s exhaustive `MAP`. It is the Layer-2 refusal
(the role may not ask at all, so no artifact is consulted): neither
implementation of `evaluateAccess` produces it, but a denial has to be nameable
in one set of words whichever layer produced it, and a browser has no capability
matrix to derive it from.

Note what the two decision points still answer differently, on purpose:
`evaluateAccess` (patient registry) asks *may this actor see this record*, where
same-tenant care needs no consent; `/access/evaluate` asks *is there a grant for
this purpose and record type*, where tenancy is not a substitute for consent.
Same vocabulary, different questions — which is exactly why the reasons had to
be one set.

### 10.4 Frontend compatibility

The REST layer on `main` was written against shapes this branch changed, and two
of its bugs predate both:

- `src/api/patients.ts` retyped against `modules/patients/schemas.ts`:
  identities are `{ id, type, masked, verified, primary, verifiedAt, createdAt }`
  — there is no `value` to render, the full ABHA never leaves the server;
  `contact`/`emergencyContact` are non-optional objects of nullable fields;
  create/update inputs are their own types instead of `Partial<ApiPatient>`
  (which invited sending `id`, `state` and masked identities back).
- List rows are a discriminated union (`ApiAccessiblePatient | ApiSealedPatient`)
  and `PatientList` renders both: a sealed row shows "Sealed record", `Withheld`
  identities and the server's decision pill, never invented demographics. The
  demo list shows a name there because its data is local; the API is stricter on
  purpose. A content search hides sealed rows, mirroring the server's rule.
- `PatientProfile` renders the decision that arrives with the record
  (`ConsentPill`), and a 403 renders as a sealed view using the denial's
  `reason` — `ApiError` now carries it. Clinical activity is fetched
  non-fatally: a denial from `modules/care` must not hide a record the actor is
  allowed to read.
- Pre-existing, and fixed because a red baseline hides real breakage:
  `MyConsents.tsx` passed a nullable `validUntil` to `fmtDate` (the frontend did
  not typecheck on `main`); `consents.test.ts` shadowed its own helper
  (`const patientId = await patientId(...)`, a TDZ error that failed three of
  its four tests on pristine `main`); `backend/.env.example` had its Sessions
  block written with literal `\n` sequences, so `cp .env.example .env` produced
  a malformed cookie name.
- `tests/access.test.ts` updated for §10.3 (two assertions) and extended by
  three: the pending/denied renames, the not-yet-valid `detail`, and the 404.
  Its hardcoded `validUntil: "2026-12-31"` is now computed from today, so the
  suite does not start failing in December for a reason nobody edited.

### 10.5 Verification after reconciliation

- Backend: `npm run typecheck` clean; `npm test` **132 tests / 10 files / 0
  failures** — this branch's six files and `main`'s four, against the merged
  modules.
- Frontend: `npm run typecheck` clean; `npm run build` succeeds.
- Live server (`npm run dev`, `:4000`, no database), as the NMC doctor:
  - `GET /patients` → `total 7, sealedCount 1, scope {kind:"tenant"}`; the
    sealed stub is Iqbal with `consent_pending`; Sunita is open with
    `consent_active` **and the artifact comes from the consent plane**
    (`con-01`, purpose `TREATMENT`, note, `validFrom`, `expiresOn`).
  - `GET /patients/{sunita}` → masked identities (`ABHA •••• 5604`, verified)
    and the decision with its projected consent.
  - `GET /patients/{iqbal}` → 403 whose body carries `reason`, and the full
    decision, and no demographics.
  - `POST /access/evaluate` → `consent_active` for `TREATMENT/DIAGNOSIS`;
    `no_consent` + `detail: purpose_not_allowed` for `RESEARCH`;
    `no_consent` + `detail: record_type_not_allowed` for `IMMUNIZATION`;
    unknown patient → 404 `not_found`.
  - `POST /patients` as LAB → 403 `role_not_permitted` with
    `capability: patient.register`.
  - `GET /audit` → 14 events, `prevEventId` links intact from sequence 1, one
    chain spanning `LOGIN → LIST_RECORDS → VIEW_RECORD → ACCESS_DENIED →
    CREATE_RECORD → ACCESS_ALLOWED`, with `reason`, `capability` and
    `authorizationId` (`con-01` on the allowed cross-tenant read, `con-02` on
    the sealed denial) populated.
