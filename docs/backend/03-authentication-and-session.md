# 03 — Authentication and Session

How sign-in works today, the exact contract the backend must implement, and
what the backend — not the frontend — must own.

## 1. The flow (locked)

```
Public landing → Login dropdown → pick role → #/login/<role>
  → one identifier field → authenticate({role, identifier})
  → authenticated → session written → #/dashboard/<role>
```

Constraints (all locked by the login milestone):

- **No universal login page.** Role is chosen *before* the form opens; the form
  has no role selector and never branches by role — only its copy changes.
- **One field on the first screen.** Progressive authentication: identifying
  the account is the whole first step. Credential steps (OTP/password) arrive
  later as **additive result states**, not as a form redesign.
- **The modal reports; `app.js` decides.** The component emits
  `jap:authenticated {user}`; only `app.js` writes the session and navigates.
- **Minimal clicks, minimal clutter.** No marketing copy, no illustrations.

## 2. Role-specific login content (locked)

| Role | Title | Audience | Identity field |
| --- | --- | --- | --- |
| Patient | Patient Login | Citizen | **ABHA Number** |
| Doctor | Doctor Login | Healthcare Professional | **HPID / Username / Mobile Number** |
| Hospital | Hospital Login | Health Facility | Facility ID / Username |
| Pharmacy | Pharmacy Login | Pharmacy Facility | Facility ID / Username |
| Laboratory | Laboratory Login | Diagnostic Facility | Facility ID / Username |
| Government | Government Login | Government Department | Department User ID |

Terminology rules (locked — the backend's API messages and docs must match):

- Say **ABHA Number**, never "Patient ID".
- Say **HPID / Username / Mobile Number** for doctors — "Doctor ID" is banned
  (a professional digital identity is not a medical registration number).
- Say **Facility ID** for hospital/pharmacy/lab (ABDM facility-registry term),
  never an invented identifier name.

## 3. The auth service contract (locked)

```js
authenticate({ role, identifier }) → Promise<Result>
```

| `result.status` | Meaning | UI behavior |
| --- | --- | --- |
| `authenticated` | `result.user = { id, role, name }` | store session, route to `#/dashboard/<role>` |
| `identifier-not-found` | no account matches **within that role** | inline error, focus back on field |
| `role-unavailable` | role exists but has no usable auth / no identities | inline error, honest wording |

Plus the dev-only affordance:

```js
getDemoIdentifier(role) → Promise<string | null>
```

The mock returns the example identifier shown as the field's `placeholder`.
**A production implementation omits this method** and the form simply shows no
example. No credential string may appear in any UI file.

### Extension rule (locked)

New states are **additive**. A real credential step returns a new status —
e.g. `{ status: "requires-credential", credential: "otp", requestId, maskedContact }`
— and the UI switches on `status`. The backend must therefore design auth as a
**discriminated transaction**, not as a boolean login. Unknown/invalid `role`
returns `role-unavailable`, never a throw (a hand-typed URL must not break the
page).

## 4. Identifier matching rules (locked behavior, backend must reproduce)

1. **Matching ignores case, spaces, and dashes.** `12-3456-7891-2345`,
   `12345678912345` reach the same account. This is a display convention, not
   a data rule — normalize at comparison time; store canonical forms.
2. **One account, multiple identifiers.** A doctor signs in with HPID *or*
   username *or* mobile; a patient with ABHA number *or* ABHA address. The
   backend's account model must support **multiple login aliases per account**
   from the start.
3. **Cross-role rejection.** An identifier valid in another role **must not**
   authenticate on this role's screen. A doctor's HPID typed into patient login
   returns `identifier-not-found`, not a hint to switch roles. Enforce
   role-scoping server-side on every attempt.
4. **Error messages reveal nothing.** "No account matches that identifier"
   regardless of whether the role has accounts or the identifier exists
   elsewhere. No user-enumeration oracle.

## 5. Session (what exists; what the backend must replace)

Today: `sessionStorage["jap.session"]` holding exactly:

```js
{ id: string, role: "patient"|"doctor"|"hospital"|"pharmacy"|"laboratory"|"government", name: string }
```

Read is defensive (malformed JSON, unavailable storage, unknown role →
`signed out`, bad entry dropped). This is **presentation state, not security**.

**Backend responsibilities (PROPOSAL for mechanism, locked for properties):**

| Property | Requirement |
| --- | --- |
| Real session boundary | Backend-owned. Every API call re-validates session + role. Frontend session is a UX cache only. |
| Minimal shape | Keep `{ id, role, name }` as the authenticated-user shape, or update `session.js`'s validator in the same commit that changes it. |
| Mechanism | **PROPOSAL:** HTTP-only, Secure, SameSite cookie session (or short-lived access token + refresh). Decide before implementation; document the decision. |
| Expiry | Idle + absolute timeouts; expired session → API 401 → frontend routes to `#/login/<role>`. **PROPOSAL:** values need a product decision. |
| Sign-out | `jap:sign-out` must also revoke server-side (session invalidation endpoint). |
| Refresh survival | Reload on `#/dashboard/<role>` must restore a signed-in view from the server session (today: from `sessionStorage`). Design the bootstrap accordingly. |

## 6. Unprovisioned roles (decision required)

Hospital, Laboratory, and Government are structurally complete (route, menu,
form, labels, destination) but have **no demo identities** and return
`role-unavailable` ("Sign-in for this role is not available yet").

The backend team must get a decision (Dhishan/Linus) on what real auth for
these roles looks like before building it:

- Hospital/Lab: facility-registry-backed? Facility admin accounts + staff
  roles? (HFR alignment — doc 07, §3.)
- Government: department IdP / SSO? Which departments, which assurance level?
- Patient: ABHA + OTP via ABDM (doc 04). The mock patient login accepts a bare
  ABHA with no credential — **production patient login must add ABDM-backed
  verification** (the `requires-credential` state exists for exactly this).

Do not "complete" these roles by inventing credential schemes in the backend.
Each needs an accepted engineering decision first.

## 7. AuthN vs clinical identity (locked separation)

`mock-auth.js` holds **no patient data**; `patients.js` holds **no
credentials**. The patient login demo account (Ramesh Kulkarni,
`12-3456-7891-2345`) has **no clinical record**, and the three clinical
records have **no login accounts**. Looking up the login ABHA in the clinical
flow correctly returns `abha-not-recognized`.

Backend consequences:

- Account store ≠ clinical record store. Link them by explicit reference
  (e.g., account → ABHA → record), never by conflating them.
- A verified login as a patient does not by itself authorize clinical access;
  a doctor's verified patient lookup does not create a login session for the
  patient. Keep the two session/transaction types distinct all the way down
  (separate tables/endpoints/audit streams).

## 8. Credential step design (PROPOSAL — needs decision)

The mock authenticates on identifier alone. Production needs real
verification. Proposed shape, consistent with the additive-status rule:

```
authenticate({role, identifier})
  → { status: "requires-credential", requestId, methods: ["otp"], maskedContact }
verifyCredential({ requestId, otp })
  → { status: "authenticated", user } | { status: "credential-invalid" } | { status: "credential-expired" }
```

Decisions required before building: per-role methods (ABDM OTP for patients?
HPID + OTP for doctors? passwords anywhere?), expiry windows, resend policy,
attempt limits and lockout, audit events. For patients, the credential **is**
the ABDM verification — reuse the identity transaction in doc 04 rather than
building a second OTP system.

## 9. Backend checklist (auth)

- [ ] Role-scoped account resolution with alias support (HPID/username/mobile; ABHA number/address)
- [ ] Case/space/dash-insensitive matching; canonical storage
- [ ] Cross-role rejection; non-enumerating errors
- [ ] Discriminated result contract incl. future `requires-credential`
- [ ] Server-side sessions: issue, validate, expire, revoke
- [ ] 401 semantics the frontend can route on
- [ ] Audit every attempt (success, failure, role, timestamp; never the secret)
- [ ] Rate-limit identifier probing and credential attempts
- [ ] Decisions obtained for: unprovisioned roles, credential methods, session lifetimes
- [ ] No demo-identifier affordance in production (`getDemoIdentifier` absent)
