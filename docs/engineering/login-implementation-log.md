# Implementation Log — Role-Specific Login System

- **Date:** 2026-09-10
- **Task:** Implement the role-specific login system for the Jan Arogya Portal frontend
- **Branch:** `arena/01a0870f-jan-arogya-portal`
- **Status:** Complete for this milestone (frontend + mock authentication only)
- **Written for:** the next agent/engineer to touch this repository

> Read this file before changing anything in `frontend/src/js/auth/`,
> `frontend/src/js/roles.js`, `frontend/src/js/router.js`,
> `frontend/src/components/login-modal.js`,
> `frontend/src/components/role-dashboard.js` or the Login area of
> `frontend/src/components/top-navbar.js`.

---

## 1. What the task asked for

Turn the existing placeholder Login dropdown on the public landing page into a
working, **role-specific** login flow:

```
Public landing -> Login dropdown -> pick role -> role login -> mock auth -> role destination
```

Constraints that shaped the implementation: no universal login page with a
second role selector; no framework migration; no build system; mock auth must
not become a fake backend; the UI must not contain credential logic; login must
reuse the existing visual language; minimal clicks; minimal clutter.

## 2. What exists now (file map)

### Added

| File | Responsibility |
| --- | --- |
| `frontend/src/js/roles.js` | **Role registry.** Single source of truth for the 6 roles: dropdown label, login title, audience line, identity field label, field name for messages, destination label. Insertion order = public dropdown order. |
| `frontend/src/js/router.js` | **Hash router.** `parseRoute`, `navigate`, `startRouter`, and the only three path builders. Knows nothing about roles, auth or views. |
| `frontend/src/js/auth/auth-service.js` | **The seam.** What every component calls. Holds which implementation is active; validates the role key. |
| `frontend/src/js/auth/mock-auth.js` | **The mock.** The only file that knows demo identities or matching rules. Deletable without touching a component. |
| `frontend/src/js/auth/session.js` | **Current-user state.** `readSession/writeSession/clearSession` over `sessionStorage`, with shape validation. |
| `frontend/src/components/login-modal.js` | **`<login-modal>`.** The role-specific authentication panel. |
| `frontend/src/components/role-dashboard.js` | **`<role-dashboard>`.** Signed-in destination placeholder for every role. |

### Modified

| File | Change | Why it was necessary |
| --- | --- | --- |
| `frontend/index.html` | Wrapped `announcement-ticker` + `main-section` in `<div id="public-view">`; added `<role-dashboard hidden>` and `<login-modal>`; updated the structure comment. | Routing needs one node to hide/show for public-only content. Header, nav and footer stay as shared chrome. |
| `frontend/src/js/app.js` | Registers the two new components and owns route -> view mapping, session writes and navigation on `jap:authenticated` / `jap:cancel` / `jap:sign-out`. | This is the only place that decides what a URL shows. |
| `frontend/src/components/top-navbar.js` | Role items are generated from the registry and now `href` their login route (was `href="#"` + `console.log`). Added click-toggle on the Login button, real `aria-expanded`, close on select/Escape/outside click, and a signed-in state (name + audience + **Sign out**). | Connecting the dropdown to login is the task. Brand/Home `#` changed to `#/` so they are real routes. |
| `frontend/src/styles/custom.css` | `.login-overlay` (dim + blur), `.login-overlay-open` (scroll lock), `.is-open` added to the existing dropdown reveal rule. | Backdrop treatment and touch access to the role menu. |
| `README.md` | Structure tree + route table + pointer to this log. | Keep the docs true to the tree. |

Everything else — `government-header.js`, `announcement-ticker.js`,
`main-section.js`, `site-footer.js`, `tailwind-config.js` — is **unchanged**.

## 3. Architecture

```
<top-navbar> ──href──▶ #/login/<role>
                          │
                    app.js (applyRoute)
                     │            │
              <login-modal>   <role-dashboard>
                     │ openFor(role) from roles.js
                     │ authenticate({role, identifier})
                     ▼
          js/auth/auth-service.js      ◀── the seam (UI never sees a mock)
                     │ setAuthenticationService(next)
                     ▼
          js/auth/mock-auth.js         ── to be deleted, replaced by an API client
                     │
        jap:authenticated {user}  ──▶ app.js ──▶ session.writeSession(user)
                    │                              navigate(#/dashboard/<role>)
                    ▼
             <role-dashboard>
```

Rules that keep this replaceable:

- Components never read mock data, never compare credentials, never build URLs by hand.
- The modal emits `jap:authenticated`; **only `app.js`** writes the session and navigates.
- The mock is not a database: three user records, no persistence, no wider schema.

### Authentication service contract

`authenticate({ role, identifier }) -> Promise<Result>`

| `result.status` | Meaning | UI behaviour |
| --- | --- | --- |
| `authenticated` | `result.user` = `{ id, role, name }` | store session, route to `#/dashboard/<role>` |
| `identifier-not-found` | no account matches within *that* role | inline error, focus back on field |
| `role-unavailable` | role exists but has no identities provisioned | inline error, honest wording |

New states (e.g. a future `requires-credential` for OTP/password/Aadhaar) are
**additive**: the UI switches on `status`, so progressive authentication can be
introduced without rewriting the form. An unknown/invalid `role` returns
`role-unavailable` instead of throwing, so a hand-typed URL cannot break the page.

`getDemoIdentifier(role) -> Promise<string|null>` is a dev-only affordance: the
mock's example identifier becomes the input's `placeholder`. That is why **no
credential string appears in any UI file**. A production implementation omits the
method and the form simply shows no example.

### Routes (hash-based)

| Route | View |
| --- | --- |
| `#/` (or empty) | public landing page |
| `#/login/<role>` | landing page stays mounted, modal over it |
| `#/dashboard/<role>` | `<role-dashboard>`; requires a session whose role matches |
| anything else | falls back to the public landing page |

Hash routing was chosen because the project is static and build-free: real path
routing would need server rewrite rules. `#/login/doctor` is exactly the
conceptual `/login/doctor` from the task, without that requirement.

`#/dashboard/<role>` with no session (or a session for another role) is
`replace`-redirected to that role's login, so refreshing the destination works and
an invalid URL never renders an empty dashboard or adds history junk.

### Session

`sessionStorage["jap.session"]`, holding only `{ id, role, name }`. Read is
defensive: malformed JSON, unavailable storage or an unknown role yields `null`
(signed out) and the bad entry is dropped. This is presentation state, **not**
authorization — the real session boundary belongs to the backend.

## 4. Role-specific content (what each screen says)

| Role | Title | Audience line | Identity field |
| --- | --- | --- | --- |
| Patient | Patient Login | Citizen | **ABHA Number** |
| Doctor | Doctor Login | Healthcare Professional | **HPID / Username / Mobile Number** |
| Hospital | Hospital Login | Health Facility | Facility ID / Username |
| Pharmacy | Pharmacy Login | Pharmacy Facility | Facility ID / Username |
| Laboratory | Laboratory Login | Diagnostic Facility | Facility ID / Username |
| Government | Government Login | Government Department | Department User ID |

"Doctor ID" is deliberately absent: a professional digital identity (HPID) is not
a medical registration number. Hospitals/pharmacies/labs use ABDM's existing
facility-registry term rather than an invented identifier.

### Demo identities — defined only in `mock-auth.js`

| Role | Accepted identifiers | Signs in as |
| --- | --- | --- |
| Doctor | `HP-1001`, `aroha.deshpande`, `9823456781` | Dr. Aroha Deshpande |
| Patient | `12-3456-7891-2345`, `12345678912345`, `ramesh.kulkarni@abdm` | Ramesh Kulkarni |
| Pharmacy | `FAC-PH-2201`, `janseva.store` | Jan Seva Medical Store |
| Hospital / Laboratory / Government | *none — by design* | — |

Matching is case-insensitive and ignores spaces and dashes, so a formatted and an
unformatted ABHA number reach the same account. An identifier belonging to another
role is **not** accepted on a role's own screen.

Hospital, Laboratory and Government are structurally complete (route, menu entry,
form, labels, destination) but return the honest "Sign-in for this role is not
available yet." state, per the instruction to keep unprovisioned roles minimal.

## 5. Visual language — reused, not extended

`tailwind-config.js` was **not modified**. The panel uses only existing tokens:

| Aspect | Reused from the existing system |
| --- | --- |
| Panel surface | `bg-surface-container-lowest` + `border border-outline-variant` + `rounded-lg` + `shadow-md` (same treatment as the existing dropdown) |
| Title | `font-headline-md text-headline-md text-primary` (as `main-section`'s portal name) |
| Eyebrow / helper text | `font-caption text-caption text-on-surface-variant uppercase` |
| Divider | `h-px w-16 bg-secondary` (the `main-section` gold rule) |
| Primary button | `bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant` (the existing Login button) |
| Focus ring | `focus:outline-none focus:ring-2 focus:ring-secondary` (existing convention) |
| Error | `bg-error-container text-on-error-container` (M3 tokens already in the theme) |
| Body copy | `font-body-md text-body-md` |
| Spacing | `p-margin-mobile md:p-stack-md`, `mb-base`, `mt-stack-md`, `max-w-container-max` |
| Container | `max-w-md` for the panel; overlay padding `16px` |

No new colours, radii, spacing or type were introduced. Deliberate omissions:
`rounded-full` (its token is overridden to 12px, so it is not actually a circle —
see §8), no illustrations, no gradients, no icons, no animation, no marketing
copy, no explanatory prose, and no new `dark:` variants (they are dead code today
— see §8).

Background treatment (`.login-overlay`): `rgba(11,28,48,.45)` dim — `on-surface`
at 45% — with `backdrop-filter: blur(3px)` behind `@supports`. The panel is never
blurred. If `backdrop-filter` is unavailable, the dim alone carries separation.

## 6. Accessibility and interaction decisions

- Dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the title.
- Focus moves to the identifier input on open (fewest interactions to start) and
  returns to the trigger on close if that trigger is still in the document.
- Tab is trapped inside the dialog, otherwise `aria-modal` would be a lie.
- `Escape`, the **Cancel** control and a click on the dimmed background all exit;
  Cancel is a visible control rather than an icon-only affordance.
- `<form>` + submit handler, so **Enter submits** — no extra click.
- Label is a real `<label for>`; error is `role="alert"`, `hidden` until needed,
  then wired via `aria-describedby` with `aria-invalid` on the field, and cleared
  as soon as the user edits.
- The button is disabled with `aria-busy` while awaiting the service (blocks
  double submission); the modal tolerates being closed mid-flight.
- `autocomplete="username"`, `spellcheck="false"`, `autocapitalize="none"`,
  `aria-required="true"`, `novalidate` so messaging is ours, not a browser bubble.
- Error copy is short, adjacent, non-alarming, and reveals nothing about which
  part of an identity matched or whether the role has accounts.

## 7. Explicit non-goals (do not "fix" these here)

Not built, on instruction: registration flow, password/OTP/Aadhaar UI,
caregiver/insurance/billing modules, analytics, any dashboard design (only the
placeholder), patient states, Encounter/Find-Patient screens, backend/API
integration, database, framework or build-tool migration, redesign of unrelated
components.

The Patient↔Encounter distinction (§16–17 of the task) is preserved: the login
layer produces only `{ id, role, name }` and a route. Nothing here assumes the
system is a static collection of profiles, and nothing pre-creates a patient or
encounter record.

## 8. Pre-existing issues found, NOT changed (they need Dhishan/Linus decisions)

1. **No ADR/design record.** Six comments still cite an "approved design" that is
   not in the repo. Left as found; the login work follows the code as the de facto
   design source.
2. **Tailwind Play CDN** is not a production mechanism and is unpinned — a
   supply-chain/reproducibility problem for "public digital infrastructure".
3. **`borderRadius.full` is overridden to `0.75rem`**, so every `rounded-full`
   (the nav icon buttons) is a rounded square, not a circle. Avoided in new code.
4. **33 `dark:` utilities are dead code** — `darkMode: "class"` is on but nothing
   ever adds a `dark` class. Not extended by this change.
5. **`docked` and `full-width`** on the nav/footer are not Tailwind utilities
   (design-export residue). Left untouched in `top-navbar`; never copied.
6. **Mobile hamburger has no handler**, so About/Services/FAQs/Contact are
   unreachable below `md`. Login is unaffected: the Login button is visible on
   mobile and the role menu now opens on tap.
7. **`A-`/`A`/`A+` font-size controls** in the government header advertise
   themselves as buttons but do nothing.
8. **Emblem is hotlinked** from `lh3.googleusercontent.com/aida-public/...`,
   duplicated in two components — fragile for a government portal.
9. **Ticker** animates infinitely with no pause control and no
   `prefers-reduced-motion` guard (WCAG 2.2.2).
10. **Footer `© 2024`** is hardcoded and stale.

## 9. Verification performed

Environment: static server only — `python3 -m http.server 8000 --bind 0.0.0.0`
from `frontend/`. The sandbox has **no browser and no outbound network**, so
Tailwind/fonts/CDN could not be fetched here and the render was not
pixel-verified; those requests come from the reviewer's own browser in the preview.

| Check | Result |
| --- | --- |
| All 16 fetched assets (every file in the import graph) | `200`, correct MIME types |
| `node --check` on every module (as ESM) | all parse |
| Every relative import resolves | no broken paths |
| Role registry / mock auth / session / router unit assertions | **38 passed, 0 failed** |
| `<login-modal>` + `<top-navbar>` driven with a DOM shim (real `render()`, `openFor()`, submit, Escape) | **58 passed, 0 failed** |
| Each of the 6 roles: correct title, audience, field label, dialog semantics, exactly one `<input>`, **no in-panel role selector** | pass |
| Doctor / Patient / Pharmacy demo logins authenticate end to end through the service | pass |
| Wrong id, empty id, unprovisioned role, unknown role | correct states, no throws |
| Navbar: 6 roles in original order, each linking `#/login/<role>`, Government emphasis preserved, no `href="#"` left on role items | pass |
| Signed-in navbar shows identity + exactly one Sign out; login menu hidden | pass |
| Untouched chrome byte-identical (language, accessibility, mobile toggle, About/Services/FAQs/Contact, header, ticker, footer) | confirmed via `git diff` |
| Credential strings appear in exactly one file (`mock-auth.js`) | confirmed via `grep` |

The verification scripts were run from `/tmp` and intentionally **not committed**
(the project keeps no test toolchain; the charter requires staying lightweight).
Reproduce with: `cp -r frontend/src /tmp/japtest/`, add `{"type":"module"}`
`package.json`, then run the two harnesses described above.

### Manual walkthrough for a reviewer (in a browser)

1. Open the preview → landing page as before.
2. Click **Login** → 6 roles → **Doctor** → URL `#/login/doctor`, page behind dims/blurs.
3. Type `HP-1001` (or use the shown example) → Enter or **Continue** → Doctor Dashboard placeholder.
4. Navbar now reads "Dr. Aroha Deshpande / Healthcare Professional" with **Sign out**.
5. Reload the destination URL → still signed in. Edit `jap.session` in devtools → reload → redirected to `#/login/doctor`.
6. Repeat with `12-3456-7891-2345` (Patient) and `FAC-PH-2201` (Pharmacy).
7. Pick Hospital/Laboratory/Government → form renders, error explains unavailability.
8. Keyboard only: Tab to **Login**, Enter, Tab to a role, Enter, type, Enter, **Escape**/**Cancel** returns to the landing page.
9. Narrow to 320px → panel spans the viewport minus 16px, field and button remain usable.

## 10. Handoff notes

**To the backend team:** replace the mock in one place —
`setAuthenticationService(createApiAuthService(fetch))` inside
`auth-service.js` — and delete `mock-auth.js`. Keep the `{ id, role, name }`
result shape, or update `session.js`'s validator in the same commit. If a real
credential step is added, return a new status instead of changing the flow's
shape. `getDemoIdentifier` should disappear in production; nothing depends on it.

**To the next milestone (Doctor Dashboard):** design `#/dashboard/doctor` only —
the placeholder in `role-dashboard.js` exists precisely so that destination is
already routed, session-backed and chrome-complete. Keep the registry
(`roles.js`) as the place role facts live, and do not put dashboard logic in the
login modal. Per the task: Doctor Dashboard = Dashboard, Find/Register Patient,
Patient, Encounter, with Patient deferred; prescription/investigation/admission
live inside an Encounter, not as top-level pages; and "Current Consultation" must
not be added just because dashboards usually have one.
