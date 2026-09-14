# 02 — Current Frontend State

What exists in the repository today (through Doctor Workspace milestone 2).
Backend engineers need this because every seam, route, event, and rule below
is a **constraint the backend must satisfy**.

## 1. Platform facts

| Fact | Value |
| --- | --- |
| Stack | Static HTML + ES modules + Custom Elements. **No framework, no build step, no bundler.** |
| Styling | Tailwind via Play CDN + `tailwind-config.js` theme + `custom.css` |
| Routing | **Hash routing** (`#/...`) — works from any static host with no URL-rewrite rules |
| Entry | `frontend/index.html` → `frontend/src/js/app.js` |
| Persistence | None. `sessionStorage` holds presentation-only session (see doc 03). No `localStorage`. |
| Test toolchain | None, deliberately (charter: stay lightweight). Past milestones verified with throwaway `/tmp` harnesses, not committed. |
| Run locally | `python3 -m http.server 8000 --bind 0.0.0.0` from `frontend/` |

**Backend implication:** deployment is a static file host plus an API origin.
Hash routing means the backend never needs SPA-fallback rewrite rules. CORS
must allow the static origin to call the API origin (doc 09, §7).

## 2. Architecture map

```
frontend/
  index.html                    landing shell + mount points
  src/
    components/                 custom elements (views)
      government-header.js      GoI header bar (chrome)
      top-navbar.js             nav + role login menu / signed-in identity (chrome)
      announcement-ticker.js    updates ticker (chrome)
      main-section.js           landing identity block (chrome)
      site-footer.js            footer (chrome)
      login-modal.js            <login-modal> — role-specific auth panel
      role-dashboard.js         <role-dashboard> — placeholder destination (non-doctor roles)
      doctor-workspace.js       <doctor-workspace> — doctor shell: nav + Dashboard/placeholders
      patient-intake.js         <patient-intake> — New Patient: ABHA step → OTP step
      patient-profile.js        <patient-profile> — identified patient's clinical summary
    js/
      app.js                    THE orchestrator: routes → views, session writes, navigation, patient resolution
      roles.js                  THE role registry (6 roles; labels, audiences, field copy)
      router.js                 hash parse + ONLY path builders in the codebase
      auth/                     THE AUTH SEAM (professional sign-in)
        auth-service.js           interface: authenticate(), getDemoIdentifier()
        mock-auth.js              mock implementation (3 demo accounts) — DELETE when backend ships
        session.js                sessionStorage read/write/clear + shape validation
      abdm/                     THE IDENTITY SEAM (patient identification at point of care)
        identity-service.js       interface: identifyPatient(), verifyPatientOtp(), getDemoAbha(), getDemoOtp()
        mock-identity.js          mock ABDM behavior (request ids, generated codes) — DELETE when backend ships
      mock/
        patients.js               THE 3 prototype records + derivations (getPatientById, patientStateOf,
                                  activeAdmissions, latestInvestigationResults) — replaced by record API reads
    styles/                     custom.css, tailwind-config.js
```

### Ownership rules (locked)

- **Only `app.js`** decides what a route shows, writes the session, navigates,
  and resolves a route's `patientId` into a record. Components never navigate
  (except plain `<a href>` links built by `router.js` builders) and never read
  session/storage/records directly.
- **Only `router.js`** builds paths. No component concatenates URLs.
- **Only `roles.js`** knows role facts (labels, audiences, field copy).
- **Only `mock-auth.js`** knows demo credentials. **Only `mock-identity.js`**
  knows what makes an OTP correct. **Only `mock/patients.js`** knows patient
  facts. No UI file duplicates any of these.

## 3. Routes (all of them)

| Hash | View | Guard |
| --- | --- | --- |
| `#/` | Public landing | — |
| `#/login/<role>` | Landing + `<login-modal>` overlay for that role | role must be known, else landing |
| `#/dashboard/<role>` | Doctor → `<doctor-workspace>` Dashboard; others → `<role-dashboard>` placeholder | session required **and** `session.role === role`, else `replace`-redirect to `#/login/<role>` |
| `#/dashboard/doctor/patients` | Placeholder ("not designed yet") | same as above |
| `#/dashboard/doctor/history` | Placeholder | same as above |
| `#/dashboard/doctor/admissions` | Placeholder | same as above |
| `#/dashboard/doctor/new-patient` | `<patient-intake>` (ABHA → OTP) | same as above |
| `#/dashboard/doctor/patient/<record-id>` | `<patient-profile>` for that record, or "Unable to load patient" | same as above; `patient/<id>` without id redirects to Dashboard |
| anything else | Public landing (fallback) | — |

Roles: `patient`, `doctor`, `hospital`, `pharmacy`, `laboratory`, `government`.

Notes the backend must respect:

- The patient route carries an **opaque internal record id** (`p-01`), never an
  ABHA number/address. Backend record ids must be safe to expose in URLs,
  history, and screenshots — opaque, non-sequential, non-PII.
- Guards are **presentation routing**, not authorization. The backend must
  re-verify session + role + record access on every API call.
- Deep links work: a reload on a patient URL re-resolves the patient from the
  route. The record API must therefore serve `GET /patients/:id` statelessly.

## 4. Components and what they call

| Component | Calls | Emits | Never does |
| --- | --- | --- | --- |
| `<login-modal>` | `auth-service.authenticate()`, `getDemoIdentifier()` | `jap:authenticated {user}`, `jap:cancel` | routes, session writes, credential checks |
| `<top-navbar>` | `roles.js`, `router.loginPathFor()`, `session.readSession()` | `jap:sign-out`, listens `jap:session-change` | auth logic |
| `<role-dashboard>` | `roles.getRole()` only | — | reads session or mocks |
| `<doctor-workspace>` | `roles.js`, `router.workspacePathFor()`, `mock/patients.activeAdmissions()` | — | looks up session or patient itself (both are passed in via `show(session, section, patient)`) |
| `<patient-intake>` | `identity-service` (all four functions) | `jap:patient-identified {patientId}` | navigation, session/record reads; shows **no name** at either step |
| `<patient-profile>` | `router.workspacePathFor()`, `patients.patientStateOf()`, `patients.latestInvestigationResults()` | — | navigation (except Back link), any action control — **no buttons at all** |

`app.js` listens for `jap:authenticated` (writes session, navigates to
dashboard), `jap:cancel` (navigates home), `jap:sign-out` (clears session,
navigates home), `jap:patient-identified` (navigates to patient route).

## 5. The two seams (backend integration points)

### Auth seam — `js/auth/auth-service.js`

```js
authenticate({ role, identifier })
  → { status: "authenticated", user: { id, role, name } }
  | { status: "identifier-not-found" }
  | { status: "role-unavailable" }
// Future additive states allowed, e.g. { status: "requires-credential", ... }
getDemoIdentifier(role) → string | null   // dev-only; production omits the method
```

Swap point: `setAuthenticationService(createApiAuthService(fetch))`, then
delete `mock-auth.js`. Full spec in doc 03; endpoints in doc 06.

### Identity seam — `js/abdm/identity-service.js`

```js
identifyPatient({ abha })
  → { status: "otp-required", requestId, maskedAbha }
  | { status: "abha-not-recognized" }
verifyPatientOtp({ requestId, otp })   // → service.verifyOtp({ requestId, otp })
  → { status: "verified", patientId }
  | { status: "otp-invalid" }
getDemoAbha() → string | null          // dev-only
getDemoOtp({ requestId }) → string | null  // dev-only
```

Swap point: `setPatientIdentityService(createAbdmIdentityService(fetch))`,
then delete `mock-identity.js`. Full spec in doc 04; endpoints in doc 06.

### Records — `js/mock/patients.js`

Three records (`p-01` admitted, `p-02` discharged, `p-03` outpatient) plus
four functions: `getPatientById`, `patientStateOf`, `activeAdmissions`,
`latestInvestigationResults`. The backend replaces the *reads* with record
APIs; the *derivations* must move server-side (or be re-implemented
identically) so every client derives the same state from the same facts.
Full schema in doc 05.

## 6. Demo data inventory (all mocks, to be retired)

**Auth demo accounts** (`mock-auth.js` only):

| Role | Accepted identifiers | Signs in as |
| --- | --- | --- |
| Doctor | `HP-1001`, `aroha.deshpande`, `9823456781` | Dr. Aroha Deshpande (`hp-1001`) |
| Patient | `12-3456-7891-2345`, `12345678912345`, `ramesh.kulkarni@abdm` | Ramesh Kulkarni (`abha-12345678912345`) |
| Pharmacy | `FAC-PH-2201`, `janseva.store` | Jan Seva Medical Store (`fac-ph-2201`) |
| Hospital / Laboratory / Government | *none — by design* | `role-unavailable` |

**Identity demo data** (`mock-identity.js` + `patients.js`):

| Patient | ABHA number | ABHA address | State |
| --- | --- | --- | --- |
| p-01 Amit Kumar | `23-4567-8912-3401` | `amit.kumar@abdm` | Admitted — Ward B / Bed 3 |
| p-02 Priya Patel | `34-5678-9123-4502` | `priya.patel@abdm` | Discharged 8 Sep 2026 |
| p-03 Rahul Sharma | `45-6789-1234-5603` | `rahul.sharma@abdm` | Outpatient |

Critical: the patient **login** ABHA (`12-3456-7891-2345`, Ramesh Kulkarni)
has **no clinical record** — looking it up correctly returns
`abha-not-recognized`. Login identity ≠ clinical record. The backend must keep
these concerns separate (doc 03, §7; doc 05, §8).

## 7. Deliberate absences (do not read as oversights)

The following do not exist **by decision**, and the backend must not
pre-build them speculatively — each arrives with its own designed milestone
(see doc 08):

- Encounter entry / workspace (Profile has **no buttons, no "Encounter" string**)
- Patient queue, counters, stats, charts (no screen shows them)
- Links from Dashboard admission rows into patient context (Admissions milestone)
- Patients / History / Admissions pages (placeholders)
- Bed roster / facility model (Dashboard lists *who is admitted*, not free beds)
- OTP expiry, resend, lockout, attempt counting, loading spinners, confirm dialogs
- Registration, password/Aadhaar UI, caregiver, insurance, billing, analytics
- Vitals outside encounters, `clinicianId` on encounters, `queuePosition`
- Anything new in `roles.js`, `js/auth/`, or the Tailwind theme

## 8. Pre-existing frontend issues (backend-relevant subset)

Full list (10 items) is in `docs/engineering/login-implementation-log.md` §8.
The ones that touch backend/deployment planning:

1. **Tailwind Play CDN is unpinned** — a supply-chain/reproducibility risk for
   public infrastructure. When the backend team sets up real hosting, the
   frontend needs vendored/pinned assets. Flag, don't fix here.
2. **Emblem hotlinked** from a `googleusercontent.com` URL in two components —
   fragile for a government portal; hosting should serve it.
3. **No ADR/design record** — six comments cite an "approved design" not in the
   repo. Backend API/design docs (this set) should not repeat the mistake:
   keep decisions written down.
4. Footer `© 2024` hardcoded — trivial, noted for completeness.

## 9. Engineering history (where to find why)

| Log | Covers |
| --- | --- |
| `docs/engineering/project-brief.md` | PRD: vision, ecosystem, ABDM posture, philosophy |
| `docs/engineering/charter.md` | Team roles: Dhishan decides, Linus mentors, Arena implements; scope discipline |
| `docs/engineering/login-implementation-log.md` | Role login: architecture, contracts, a11y, verification (96 checks) |
| `docs/engineering/log.md` | Doctor shell + Dashboard (partially superseded — see next) |
| `docs/engineering/patient-identity-implementation-log.md` | ABHA→OTP→Profile: decisions, flow, records, verification (188 checks), handoffs |

Read the two implementation logs before changing any contract. They record
*escalated decisions* (e.g., opaque record id in URL, no encounter affordance,
patient records own the admission) that must not be re-litigated silently.
