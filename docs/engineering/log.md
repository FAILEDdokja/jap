# Implementation Log — Doctor Workspace Dashboard

- **Date:** 2026-09-10
- **Task:** Doctor Workspace shell + Dashboard only
- **Status:** Complete for this milestone

> **Superseded in two places** by `patient-identity-implementation-log.md`
> (same date): `js/mock/active-admissions.js` has been deleted — Dashboard
> admissions are now derived from `js/mock/patients.js`, so the table shows the
> one patient actually in a bed rather than four rows — and
> `#/dashboard/doctor/new-patient` is the real ABHA → OTP flow rather than a
> placeholder. Everything else here still describes the code.

## Done

- Login still lands on `#/dashboard/doctor`. Doctor role now renders `<doctor-workspace>` instead of the generic placeholder.
- Persistent sidebar: Dashboard, Patients, History, Admissions.
- Dashboard content only: session identity (name + audience from `roles.js`), **New Patient**, Active Admissions (ward / bed / patient).
- Patients, History, Admissions, New Patient are **placeholders** (“This destination is not designed yet.”). No forms, no fake workflows.
- Public Home/About/Services/FAQs/Contact (and the unused mobile hamburger) are hidden while signed in. Government header + footer unchanged.
- Auth/session/login untouched. Identity is `session.name`, not a hardcoded string.

## Routes

| Hash | View |
| --- | --- |
| `#/dashboard/doctor` | Dashboard (active) |
| `#/dashboard/doctor/patients` | Patients placeholder |
| `#/dashboard/doctor/history` | History placeholder |
| `#/dashboard/doctor/admissions` | Admissions placeholder |
| `#/dashboard/doctor/new-patient` | New Patient placeholder |
| `#/dashboard/<other-role>` | Existing `<role-dashboard>` placeholder |

Path builders live in `router.js` (`workspacePathFor`). Components do not concatenate hashes.

## Files

| File | Role |
| --- | --- |
| `frontend/src/components/doctor-workspace.js` | Shell + Dashboard + placeholders |
| `frontend/src/js/mock/active-admissions.js` | Isolated prototype rows (one ward) |
| `frontend/src/js/router.js` | Optional third segment `section` |
| `frontend/src/js/app.js` | Doctor → workspace; other roles unchanged |
| `frontend/index.html` | `<doctor-workspace>` |
| `frontend/src/components/top-navbar.js` | Hide public nav when session exists |

## Decisions / conflicts resolved

1. **New Patient “setup page” vs PRD “do not invent registration UI”**  
   New Patient is a **navigation affordance** to a blank placeholder. No ABHA form, no identity capture.

2. **Admissions on Dashboard vs Admissions page not designed**  
   Dashboard shows a compact table. Rows are **not links** (patient context does not exist yet). Occupied beds show a name; empty beds show “—”. No age/gender (would imply a patient model).

3. **Mock data**  
   Four beds in Ward B, in `js/mock/active-admissions.js` only. Not mixed into the component. Not persistence.

4. **No queue, no current consultation, no Find Patient, no stats, no patient history on Dashboard.**

## Not this milestone

Patients page, History page, Admissions page, patient record, encounter, ABHA lookup, vitals/allergies.

## Verify

1. Login as Doctor (`HP-1001`) → identity **Dr. Aroha Deshpande** / Healthcare Professional.
2. Sidebar four items; Dashboard marked current.
3. New Patient → placeholder. Patients / History / Admissions → placeholders.
4. Sign out → public landing + public nav restored.
5. Patient/Pharmacy dashboards still use the old placeholder.
