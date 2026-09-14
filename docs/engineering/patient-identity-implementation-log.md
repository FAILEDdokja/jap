# Implementation Log — Patient Identity and Patient Profile

- **Date:** 2026-09-10
- **Task:** Doctor Workspace milestone 2 — `New Patient → ABHA → OTP → Patient Profile`, nothing further
- **Status:** Complete for this milestone
- **Written for:** the next engineer to touch `frontend/src/js/abdm/`, `frontend/src/js/mock/patients.js`, the doctor workspace, or the patient route

> Read this file before changing anything in `frontend/src/js/abdm/`,
> `frontend/src/js/mock/patients.js`, `frontend/src/components/patient-intake.js`,
> `frontend/src/components/patient-profile.js`, `frontend/src/components/doctor-workspace.js`,
> the patient branch of `frontend/src/js/app.js`, or `frontend/src/js/router.js`.

---

## 1. What was asked, and what was decided first

Four requirements in the specification disagreed with each other or with the merged
milestone, so they were escalated and answered before any code was written. These
answers **are** the engineering decision for this milestone:

| # | Question | Decision |
| --- | --- | --- |
| 1 | Milestone boundary | **This milestone only.** New Patient → ABHA → OTP → Patient Profile. Patients, History and Admissions stay placeholders. |
| 2 | How the mocked OTP verifies | **The mock supplies the code and the UI shows it** as a hint, mirroring `getDemoIdentifier` in login. A wrong code reports “OTP invalid”. |
| 3 | Who owns patient context | **Route state with an opaque record id** — `#/dashboard/doctor/patient/<record-id>`, one new path builder, `app.js` resolves the id. No ABHA in any URL. |
| 4 | Profile “what can I do next” (Encounter is undesigned) | **Omit the control entirely.** No start/continue-encounter affordance anywhere, not even a placeholder one. Strictly §48-ordered. |
| 5 | One source of truth for patients vs the merged admissions mock | **Patient records own the admission.** `mock/active-admissions.js` is deleted; the Dashboard derives its rows from the records. |

Decision 5 is the one that changed already-merged behavior, and it was accepted
knowing the consequence: the Dashboard's Active Admissions table went from four
rows (one of them a synthetic empty bed) to **one** row, because only one patient
is actually in a bed. An empty bed is not an admission, so it is simply absent.

## 2. What exists now (file map)

### Added

| File | Responsibility |
| --- | --- |
| `frontend/src/js/mock/patients.js` | **The three prototype patient records** and the derivations every screen reads: `getPatientById`, `patientStateOf`, `activeAdmissions`, `latestInvestigationResults`. |
| `frontend/src/js/abdm/identity-service.js` | **The seam.** `identifyPatient`, `verifyPatientOtp`, `getDemoAbha`, `getDemoOtp`. Separate from `js/auth/` on purpose: that authenticates the professional, this identifies a patient. |
| `frontend/src/js/abdm/mock-identity.js` | **The mock.** ABHA matching, the open verification, the generated code. The only file that knows what makes an OTP correct. |
| `frontend/src/components/patient-intake.js` | `<patient-intake>` — the ABHA step and the OTP step. |
| `frontend/src/components/patient-profile.js` | `<patient-profile>` — the clinical summary, ordered by clinical priority. |

### Modified

| File | Change | Why |
| --- | --- | --- |
| `frontend/src/js/router.js` | `patientPathFor`; a fourth segment accepted **only** as `patient/<id>` | Patient context has to be route state (decision 3). |
| `frontend/src/js/app.js` | Resolves `patientId` → record and hands it down; navigates on `jap:patient-identified` | Only this file turns a route into a view, and now also into a *subject*. |
| `frontend/src/components/doctor-workspace.js` | `show(session, section, patient)`; `new-patient` and `patient` are real views; admissions derived; `Unable to load patient` state | The shell decides which view, never which patient. |
| `frontend/index.html` | Comment only, documenting the two views mounted inside the workspace | The views are not body-level elements; nothing else changed. |
| `README.md` | Route row + the identity-seam paragraph | Keep the docs true to the tree. |

### Deleted

| File | Reason |
| --- | --- |
| `frontend/src/js/mock/active-admissions.js` | Its three bare names became a second source for facts the patient records now own (decision 5). |

Untouched: `js/auth/` (all three files), `roles.js`, `login-modal.js`,
`role-dashboard.js`, `top-navbar.js`, `government-header.js`,
`announcement-ticker.js`, `main-section.js`, `site-footer.js`,
`styles/custom.css`, `styles/tailwind-config.js`.

## 3. The flow, end to end

```
Dashboard → New Patient  (href, no JS)
   ↓
#/dashboard/doctor/new-patient  → <patient-intake>
   ↓ ABHA submitted (Enter or button)
identifyPatient({abha}) → { status: "otp-required", requestId, maskedAbha }
   ↓                                or { status: "abha-not-recognized" }
OTP step: code shown as a prototype hint
   ↓ verifyPatientOtp({requestId, otp})
{ status: "verified", patientId }  →  emits jap:patient-identified { patientId }
   ↓
app.js navigates → #/dashboard/doctor/patient/p-01
   ↓
app.js resolves getPatientById("p-01") → patient-profile.show(record)
```

Directional, and each fact has one owner:

| Fact | Owner | Readers |
| --- | --- | --- |
| Which section is open | the URL, via `router.js` | `app.js` |
| Which patient is in context | the URL's `patientId` | `app.js` resolves it once; views are *shown* the record |
| Which verification is open, and its code | `mock-identity.js` (`openVerifications`) | the intake, only through the service |
| Patient facts, admission, history | `mock/patients.js` | Profile, Dashboard |
| Current state | **derived** by `patientStateOf` | Profile, and the Dashboard's admission filter |
| The step (ABHA vs OTP), form values | `<patient-intake>` itself | nothing else |
| Doctor identity | `sessionStorage` via `js/auth/session.js` | `app.js` → workspace |

Nothing subscribes to anything to stay in sync, so there is no path from a view
back into the router and no cycle. The intake emits one event and never calls
`navigate`; the views never import the session or the raw record list.

## 4. Why the seam is shaped this way

`identifyPatient` returns a `requestId` instead of a patient, and `verifyPatientOtp`
returns a `patientId` instead of a record. Both are deliberate:

- **Patient context rule.** A name, age or allergy must not be reachable before the
  patient is verified, so identification hands back a masked ABHA and nothing
  else. The Profile is the first place the record is read.
- **No duplicated state.** If the panel held “the patient I am verifying”, a
  re-render or refresh would make that its own truth. The transaction lives in the
  implementation, exactly where a real ABDM auth request would live.
- **Replaceable.** `setPatientIdentityService(createAbdmIdentityService(fetch))` is
  the whole integration point. `getDemoAbha` / `getDemoOtp` are capability-checked,
  so a real implementation that omits them simply shows no hint — the same
  convention login already uses.

Result contracts, both additive like `auth-service.js`:

| Call | `status` | UI |
| --- | --- | --- |
| `identifyPatient` | `otp-required` | advance to the OTP step |
| `identifyPatient` | `abha-not-recognized` | inline error, field stays |
| `verifyPatientOtp` | `verified` | navigate into patient context |
| `verifyPatientOtp` | `otp-invalid` | inline error, code re-selectable |

A failed code leaves the verification open, so a mistyped digit is corrected rather
than restarted. A succeeded one consumes it.

## 5. The three records

Exactly three, as specified. They are the three names the merged Dashboard already
showed, so nothing was invented, and each state the data can actually represent
appears once:

| Record | State shown | Also demonstrates |
| --- | --- | --- |
| `p-01` Amit Kumar, `23-4567-8912-3401` | Admitted — Ward B / Bed 3 | allergies, two conditions, markers, an active IPD encounter with prescription and results, two patient notes |
| `p-02` Priya Patel, `34-5678-9123-4502` | Discharged 8 Sep 2026 | an empty allergy list and empty notes → “None recorded” |
| `p-03` Rahul Sharma, `45-6789-1234-5603` | Outpatient | no admission, so no bed is claimed for them |

No ABHA here reuses the Patient **login** account's ABHA (`12-3456-7891-2345`,
Ramesh Kulkarni): a login identity and a clinical record are different concerns,
and one must not silently impersonate the other. `mock-auth.js` still holds no
patient data, and `patients.js` holds no credentials.

There is no `clinicianId` on encounters, no `queuePosition`, no vitals-without-an-
encounter, and no insurance/billing field. When a screen exists that needs one, the
field is added with it.

## 6. Deliberate absences

Recorded so the next reviewer does not read them as oversights:

- **No encounter entry** on the Profile (decision 4), so also no Encounter view,
  no disposition picker and no “save” state. Prescription and investigation
  **content** appears only as recorded history.
- **No patient queue, counters, stats or charts** on any screen.
- **Dashboard admission rows are still not links.** Reaching a patient from their
  bed belongs to the Admissions milestone; the ABHA route is this milestone's only
  entry into patient context.
- **Patients / History / Admissions remain** “This destination is not designed yet.”
- **No bed roster.** The Dashboard lists who is admitted, not which beds are free.
  Ward → bed → patient needs a facility model, which is Admissions' decision.
- **No OTP expiry, resend, lockout or attempt counting**, no loading spinners, no
  confirm dialogs. None of these can occur in the prototype, and each would be a
  fake guarantee about a mocked step.
- **Nothing was added to `roles.js`, `js/auth/`, or the Tailwind theme.** No new
  colours, radii, spacing or type; the views reuse the existing button, field,
  heading, rule and error treatments verbatim.

## 7. Accessibility and responsive behaviour

- Each step is one `<form>` with a real `<label for>`; **Enter submits**, so no
  control is required twice. `novalidate` keeps messaging ours, not a browser bubble.
- Errors are `role="alert"`, `hidden` until needed, wired through
  `aria-describedby` + `aria-invalid`, and cleared as soon as the field is edited.
- Focus lands on the field that matters at each step; the OTP field is
  `autocomplete="one-time-code"`, `inputmode="numeric"`, `maxlength="6"`.
- The submit button is disabled with `aria-busy` while awaiting the service, which
  blocks duplicate submissions, and the panel ignores a late result if it was
  replaced meanwhile.
- One `<h1>` per view, `<h2>` per section, `<h3>` per encounter; every section is
  `aria-labelledby` its own heading. `<dl>` carries each label/value pair, so the
  label is read with the value instead of being decoration.
- The workspace nav keeps `aria-label` and stays reachable inside patient context,
  where no destination is marked current (correct: the patient is not a destination).
- Values stack under `sm` (`grid-cols-[11rem_1fr]` above it), the identity header
  wraps, and nothing is hidden by viewport. There are deliberately no wide tables
  in the Profile, so a phone never has to scroll sideways to read an allergy.

## 8. Verification

Sandbox has no browser, so the render was not pixel-checked; the CDN requests come
from the reviewer's own preview. Everything else was checked mechanically with a
throwaway harness in `/tmp` (not committed — the project keeps no test toolchain):
copy `frontend/src` to a directory containing `{"type":"module"}`, then run a
script that installs a minimal DOM/custom-element/session shim, imports the real
modules, and drives them.

**188 checks, 0 failures.** Coverage:

| Group | Checked |
| --- | --- |
| Router | `patient/<id>` parsed; `patients` still its own section; `patient` with no id; five segments and `queue/x` rejected as `unknown`; every path builder |
| Records | exactly three; unique ids and ABHAs; no ABHA equal to the login account's; dispositions within the defined set; unknown/missing id → `null` |
| Derivations | admitted / discharged / outpatient derived correctly; one active admission (name, ward, bed from the record); markers deduplicated per test with the newest value winning |
| Identity mock | formatted, unformatted and `@abdm` ABHAs all match; unknown and empty rejected; **no name in the pre-verification result**; masking keeps the full ABHA out; wrong code invalid and retryable; right code verifies; a verification cannot be reused; demo code is six digits; the offered example ABHA actually works |
| Intake | titled New Patient; example offered *by the service*; focus lands on the field; **no patient name at either step**; masked ABHA quoted; empty vs unrecognised messages distinct; `aria-invalid` set and cleared on edit; wrong code selects for retyping; hint states no message was sent; emits only `{ patientId }`; “Use a different ABHA” returns to step 1 and drops the OTP field |
| Profile | identity, ABHA, state line, allergy, medication, marker, prescription and note all rendered; “None recorded” only where genuinely empty; **no `<button>` and no “Encounter” string at all**; no `<table>`; one `<h1>`, ≥5 `<h2>`; no queue/consultation widget |
| Whole app via `app.js` | deep link with no session → `#/login/doctor` with nothing patient-specific; Dashboard identity from `session.name` (verified by changing the session, not by reading a literal); exactly one admission row and neither other patient present; no `—` empty-bed row; New Patient links the flow; admission rows are not links; four nav items with one current; three placeholders still admit they are undesigned and fabricate nothing; `jap:patient-identified` → correct URL → profile rendered with the routed patient; unknown id → “Unable to load patient” with the previous patient gone; no empty profile mounted; Pharmacy's own route gains no doctor views; sign-out empties the workspace and restores the public view; reload inside the flow restarts it; garbage hash falls back |
| Non-goals | no billing / insurance / caregiver / analytics / emergency-identity strings in the new views; no `alert()`; no `setTimeout` used to fake latency; no `localStorage`; intake imports neither the session nor `patients.js`; profile never navigates |

Structural checks on the generated markup: every tag balanced, no `<ul>`/`<div>`
inside a `<p>`, all `id`s unique per view, every `<label for>` matched to an
`<input id>`.

### Manual walkthrough for a reviewer

1. Preview → Login → **Doctor** → `HP-1001` → Enter.
2. Dashboard: **Dr. Aroha Deshpande**, **New Patient**, and one Active Admissions row — Ward B / Bed 3 / Amit Kumar.
3. **New Patient** → field is focused and pre-hinted with `23-4567-8912-3401`. Type garbage → “ABHA not recognized.”
4. Enter the example (or `amit.kumar@abdm`) → OTP step. No name yet; the ABHA is masked; the code is shown as a prototype note.
5. Enter a wrong code → “OTP invalid”, and the same code then works. Enter the shown code → URL becomes `#/dashboard/doctor/patient/p-01`.
6. Profile: identity → safety → clinically important → current state → contact → notes → history. **Back to Dashboard** returns; the nav has no current item here.
7. Reload on that URL → the same patient. Edit the id to `p-99` → “Unable to load patient”, nothing else.
8. Sign out → public landing; the patient markup is gone from the DOM.
9. Narrow to ~360 px → nav reachable, values stack, nothing scrolls sideways.

## 9. Handoff notes

**To the Encounter milestone.** `patient-profile.js` is where “what can I do next”
belongs; it currently has no control because none was approved. An encounter needs
its own route under `patient/<id>` (a context inside a context), and Disposition
must write to `admission`/`dischargedOn` — **not** to a state field, because state
is derived here and that is what keeps the Dashboard honest. Prescription and
investigation ordering are encounter functions, so they belong to the encounter
record, and `latestInvestigationResults` is the existing consumer of the results.

**To the Admissions milestone.** `activeAdmissions()` is the current
ward/bed/patient source. If Admissions must show empty beds, that needs a bed
roster referencing patient ids — a new decision, deliberately not started here.
Linking Dashboard rows into `patient/<id>` is a one-line change per row and was
held back by decision 1.

**To the History milestone.** Doctor History answers “which encounters have I
handled?”, so it flattens `encounters` across records and sorts by date. That will
need an attribution field (no encounter currently records who handled it) — add it
then, with the screen that reads it.

**Known gaps, not defects.** Patient state cannot show *In consultation*,
*Transferred* or *DAMA* because no data represents them yet; a real ABHA flow also
needs consent scope, which this prototype does not model; and the login Patient
account (`12-3456-7891-2345`) has no clinical record, so a doctor looking it up
correctly sees “ABHA not recognized”.

## 10. Supersedes

`log.md` remains the record of the Shell + Dashboard milestone. Two of its lines
are now historical: `js/mock/active-admissions.js` no longer exists (derived here),
and `#/dashboard/doctor/new-patient` is no longer a placeholder.
