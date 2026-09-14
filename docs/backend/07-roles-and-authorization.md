# 07 — Roles and Authorization

The six roles, what identifies each one, how they map to ABDM registries, and
the authorization model the backend must build — today and as it grows.

## 1. The six roles (locked registry)

Single source today: `frontend/src/js/roles.js`. Insertion order is the public
dropdown order and must stay stable.

| Key | Label | Audience line | Identifier field | ABDM identity anchor |
| --- | --- | --- | --- | --- |
| `patient` | Patient | Citizen | ABHA Number | ABHA number / ABHA address |
| `doctor` | Doctor | Healthcare Professional | HPID / Username / Mobile Number | HPID via Healthcare Professionals Registry (**HPR**) |
| `hospital` | Hospital | Health Facility | Facility ID / Username | Facility ID via Health Facility Registry (**HFR**) |
| `pharmacy` | Pharmacy | Pharmacy Facility | Facility ID / Username | Facility ID via HFR |
| `laboratory` | Laboratory | Diagnostic Facility | Facility ID / Username | Facility ID via HFR |
| `government` | Government | Government Department | Department User ID | Department IdP / SSO (**decision required**) |

Locked rules:

- Roles are **not interchangeable** (brief §"Healthcare Ecosystem"). Model
  differences explicitly; never a generic user with cosmetic labels.
- Role facts (labels, audiences, field copy) live in exactly one place. The
  backend should keep its own role registry (for messages/policy) mirroring
  `roles.js` — and the two must be kept in sync by process, not by hope.
  PROPOSAL: a shared `roles.json`-style contract both sides generate from
  (needs a decision).

## 2. Per-role identity semantics

### Patient — ABHA

- Identifiers: 14-digit ABHA number (formatted or bare) or ABHA address.
- Verification: ABDM-backed OTP (doc 04). The mock's bare-ABHA login is
  **not** production-acceptable — patient login must gain the credential step.
- A patient account links to at most one ABHA; the ABHA links to at most one
  clinical record. Account ≠ record (doc 03, §7).

### Doctor — HPID (+ username / mobile aliases)

- Primary anchor is **HPID**, verified against **HPR**. Username and mobile
  are login aliases, not identity proof.
- "Doctor ID" wording is banned (brief-adjacent terminology decision) —
  HPID is a digital professional identity, not a medical registration number.
- HPR verification should confirm the professional is registered and in good
  standing; cache policy for HPR lookups needs a decision (verify-each-login
  vs periodic revalidation).

### Hospital / Pharmacy / Laboratory — Facility ID (+ username)

- Primary anchor is the ABDM **Health Facility Registry (HFR)** facility ID.
- Open design questions (decisions required): does a facility account
  represent the facility (shared operational login) or a staff member acting
  for it? How are staff provisioned, deprovisioned, and audited per facility?
  Do pharmacy/lab get distinct HFR facility types with distinct permissions?
  **Do not build these roles until these are answered** — the frontend
  honestly reports them unavailable (hospital/lab) or placeholder (pharmacy
  signs in but lands on a placeholder dashboard).

### Government — Department User ID

- Anchor undecided: department identity provider, SSO federation, or
  provisioned accounts. Assurance level, eligible departments, and data scope
  (aggregate vs row-level, de-identified vs identifiable) all need decisions.
- Government access is programme oversight, not a superuser backdoor: every
  government read must carry purpose + audit like any other (doc 09, §2).

## 3. ABDM registries (backend verification duties)

| Registry | Verifies | Used by |
| --- | --- | --- |
| ABHA / PHR address services | Patient identity (number + address) | Patient login, point-of-care identification |
| HPR (Healthcare Professionals Registry) | Doctor HPID + standing | Doctor login |
| HFR (Health Facility Registry) | Facility IDs | Hospital/pharmacy/lab login (when designed) |
| HIE-CM / Consent Manager | Consent artifacts for data sharing | Record access gating (future plane) |
| ABDM Gateway | Session/token issuance for API calls | All ABDM calls (adapter layer) |

Rules: verify against registries; store references + verification outcomes,
never shadow copies of registry data. All ABDM calls go through the adapter
module (doc 04, §5). Sandbox first, certification, then production.

## 4. Authorization model

### Today (locked by frontend behavior)

| Check | Rule |
| --- | --- |
| Route guard | session exists AND `session.role === route.role`, else login redirect |
| Record access | professional session + fresh verification grant for that patient (doc 06, §3) |
| Cross-role | identifiers valid in one role never authenticate in another (doc 03, §4) |

### Growth path (PROPOSAL — needs decisions as milestones land)

```
Layer 1 — Authentication:  who are you? (role-scoped account + credential)
Layer 2 — Role permission: what may your role do? (RBAC matrix, §5 below)
Layer 3 — Relationship:    are you in a care relationship with this patient? (treating doctor, admitting facility…)
Layer 4 — Consent:         does a live consent artifact cover this purpose + data + period? (ABDM-aligned)
Layer 5 — Audit:           every granted/denied decision logged with actor, purpose, result
```

Build Layer 1 + a minimal Layer 2 now. Design Layers 3–4 as **insertion
points** (middleware/guard interfaces), not as speculative implementations.
Layer 5 from day one.

## 5. Permission matrix (current reality + near-term PROPOSAL)

Current reality (what the frontend can even attempt):

| Capability | Patient | Doctor | Hospital | Pharmacy | Laboratory | Government |
| --- | --- | --- | --- | --- | --- | --- |
| Sign in | mock ✅ | mock ✅ | ❌ unavailable | mock ✅ | ❌ unavailable | ❌ unavailable |
| Open own placeholder dashboard | ✅ | n/a (workspace) | — | ✅ | — | — |
| Doctor Dashboard + admissions list | — | ✅ | — | — | — | — |
| Identify patient (ABHA→OTP) | — | ✅ | — | — | — | — |
| Read verified patient record | — | ✅ | — | — | — | — |

Near-term PROPOSAL (each row needs milestone design + decision before building):

| Capability | Patient | Doctor | Hospital | Pharmacy | Laboratory | Government |
| --- | --- | --- | --- | --- | --- | --- |
| Read own record | ✅ | — | — | — | — | — |
| Grant/revoke consent | ✅ | — | — | — | — | — |
| Write encounters for verified patients | — | ✅ | — | — | — | — |
| Manage facility admissions/roster | — | scoped | ✅ | — | — | — |
| Receive/dispense prescriptions | — | — | — | ✅ | — | — |
| Receive orders / report results | — | — | — | — | ✅ | — |
| Aggregate programme reporting | — | — | — | — | — | ✅ (de-identified) |

Admission-list scoping (open decision): today the signed-in doctor sees all
active admissions. Production options: (a) all admissions at doctor's
facility/facilities, (b) only patients with a care relationship to the doctor,
(c) all + audit. Decide before finalizing `GET /admissions` (doc 06, §3).

## 6. Adding future roles (clinics, insurers, …)

The brief names clinics and insurance providers as future participants. The
backend must make adding a role a **data + policy change**:

- Role registry entry (key, labels, audience, identifier semantics).
- Auth policy (which registry/IdP verifies it; which aliases allowed).
- Permission matrix row (default-deny; grant explicitly per capability).
- Frontend `roles.js` entry + login/route support (frontend milestone).

No role may be added backend-only in a way the frontend cannot represent, or
vice versa. PROPOSAL: a role-addition checklist doc owned jointly (needs a
decision on where it lives).

## 7. Backend checklist (roles + authz)

- [ ] Backend role registry mirroring `roles.js` (sync process defined)
- [ ] HPR verification for doctors; HFR verification path designed for facilities
- [ ] Government IdP/SSO approach decided (or explicitly deferred with unavailable state kept)
- [ ] RBAC enforcement server-side on every endpoint (frontend guards are UX only)
- [ ] Relationship + consent guard insertion points designed (not necessarily built)
- [ ] Admission-list scoping decided and enforced
- [ ] Default-deny for all new capabilities; matrix updated per milestone
- [ ] Every allow/deny decision audit-logged
