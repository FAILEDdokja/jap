# 05 — Data Model

The patient record schema as the frontend defines it today, the derivations
the backend must reproduce exactly, the constraints it must never violate, and
guidance for turning the prototype shape into persistent storage.

Source of truth for field shapes: `frontend/src/js/mock/patients.js`
(334 lines — read it in full; this doc summarizes and constrains, it does not
replace the file).

## 1. Design principles (locked)

1. **Narrow by design.** Only fields a designed screen reads. No speculative
   columns.
2. **State is derived, never stored.** Anything computable from other facts
   (current state, active admissions, latest markers) is computed, so two
   surfaces can never disagree.
3. **Clinical record ≠ login account.** Records hold no credentials; accounts
   hold no clinical data (doc 03, §7).
4. **Prescriptions and investigations live inside encounters.** They are
   artifacts of a care interaction, not top-level entities.
5. **Empty ≠ unrecorded.** An explicitly empty list (`allergies: []`) renders
   as "None recorded" — a clinical statement. `null`/missing means unknown.
   The backend must preserve this three-way distinction (value / recorded-none
   / unknown), especially for allergies and medications.

## 2. Patient record schema (locked shape)

Top-level record (one per patient):

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string, opaque (`p-01`) | **Internal record id.** Non-sequential, non-PII, URL-safe. Backend must mint ids with the same properties (PROPOSAL: UUIDv4 or prefixed nanoid — never auto-increment, never ABHA-derived). |
| `name` | string | Full name. PII. |
| `gender` | string (`Male`/`Female`) | PROPOSAL: backend should accept the full set the product later decides (needs decision); today only these occur. |
| `dob` | ISO date (`1991-03-14`) | Age is **derived** client-side (`ageFromDob`); never store age. Date parsing is timezone-naive by part — backend must treat DOB as a calendar date, not a timestamp. |
| `abha.number` | formatted 14-digit string (`23-4567-8912-3401`) | Display format with dashes; match ignoring dashes/spaces/case. Canonical storage PROPOSAL: bare digits + verified flag + verified-at. |
| `abha.address` | string (`amit.kumar@abdm`) | ABHA address; equally valid identifier. |
| `contact.phone` | string | Display-formatted; PII. |
| `contact.address` | free-text string | Single free-text field today — no structured address parts. Do not over-normalize until a screen needs parts. |
| `emergencyContact` | `{ name, relation, phone }` | Nullable semantics: profile handles missing contact ("None recorded"). |
| `bloodGroup` | string (`B+`) | |
| `heightCm` / `weightKg` | numbers | Latest known; no history array today. History arrives with a vitals design (doc 08) — do not invent one. |
| `chronicConditions` | string[] | Reconciled list (empty = none recorded). |
| `allergies` | `{ substance, reaction }[]` | **Empty = recorded none.** Reaction may be empty string. See §1.5. |
| `currentMedications` | `{ name, dosage, frequency }[]` | **Reconciled active list**, explicitly NOT a copy of prescriptions: a medicine can be current without a recent encounter and stop without a new record. Backend must store this as its own list with its own update path (a future medication-reconciliation write — not this milestone). |
| `notes` | `{ text, author, date }[]` | Patient-level persistent notes only. Encounter-specific notes belong to encounters. |
| `admission` | object \| null | See §3. |
| `encounters` | encounter[] | See §4. Authored **newest-first**. |

### The three prototype records (for seed/reference data)

| id | Name | ABHA | State | Demonstrates |
| --- | --- | --- | --- | --- |
| `p-01` | Amit Kumar | `23-4567-8912-3401` / `amit.kumar@abdm` | Admitted — Ward B / Bed 3 | allergies, 2 conditions, markers, active IPD encounter with prescription + results, 2 notes |
| `p-02` | Priya Patel | `34-5678-9123-4502` / `priya.patel@abdm` | Discharged 8 Sep 2026 | empty allergies + empty notes → "None recorded" |
| `p-03` | Rahul Sharma | `45-6789-1234-5603` / `rahul.sharma@abdm` | Outpatient | `admission: null` — claims no bed |

Keep these three as backend seed data for development/staging so frontend and
backend verify against identical fixtures.

## 3. Admission (locked shape + derivation)

```js
admission: { ward: "Ward B", bed: "Bed 3", admittedOn: "2026-09-07", dischargedOn: null } | null
```

Derivation `patientStateOf` (backend must reproduce **exactly**):

| Condition | State |
| --- | --- |
| `admission === null` | `{ kind: "outpatient" }` |
| `admission.dischargedOn` set | `{ kind: "discharged", admittedOn, dischargedOn }` |
| otherwise | `{ kind: "admitted", ward, bed, admittedOn }` |

Locked constraints:

- **No stored state field.** Not `status`, not `isAdmitted`, not an enum
  column. Any stored copy can drift from `admission`/`dischargedOn` — that
  drift is precisely what the derivation exists to prevent. (The Dashboard
  went from 4 rows to 1 row when this rule was enforced; that shrinkage was
  the bug being fixed.)
- **Disposition is the only writer.** `admission`/`dischargedOn` change only
  via an encounter's disposition (doc 08, §1). No direct admission edits.
- States `In consultation`, `Transferred`, `DAMA` **cannot be represented
  yet** — no data exists for them. Do not add them until the Encounter
  milestone designs them.
- There is **no bed roster**. "Ward B / Bed 3" is a label on the admission,
  not a foreign key into a facility model. Bed occupancy conflicts, transfers,
  and empty-bed listings need the Admissions milestone's facility model
  (doc 08, §2).

## 4. Encounter (locked shape)

```js
{
  id: "enc-1041", date: "2026-09-07", setting: "IPD" | "OPD",
  reason: string,              // reason for visit
  assessment: string,          // clinical assessment
  disposition: "Admit" | "Discharge" | "Continue OPD",
  prescription: { issuedOn: ISO-date, items: [
    { name, dosage, frequency, duration, instructions }
  ]},
  investigations: [
    { test, orderedOn: ISO-date, result: string, asOf: ISO-date }
  ]
}
```

Locked constraints:

- `setting` ∈ {`OPD`, `IPD`} today. Day-care/surgery/ER settings arrive only
  with a designed need.
- `disposition` ∈ {`Admit`, `Discharge`, `Continue OPD`} today — and it is the
  encounter outcome vocabulary, not a patient-state vocabulary.
- Prescription `instructions` is free text ("IV, through ward nursing");
  `duration` is free text ("5 days"). Structured dosing/route arrives with
  e-prescription design — do not pre-structure.
- Investigation `result` is free text ("Right lower-zone consolidation",
  "8.4 %"). No value/unit split, no reference ranges — those arrive with lab
  integration (doc 08).
- **No `clinicianId` on encounters today.** Attribution ("which encounters
  have I handled?") is added with the History milestone that reads it
  (doc 08, §3). Backend: leave the column for then; backfilling attribution
  for seed data is a decision for that milestone.
- No vitals object, no `queuePosition`, no billing/insurance fields. Same
  rule: added with the screen that reads them.

## 5. Derivations the backend must reproduce (locked logic)

### a) `activeAdmissions()` — Dashboard feed

- Filter: `patientStateOf(p).kind === "admitted"`.
- Row: `{ id, name, ward, bed, admittedOn }` (ward/bed/admittedOn from the
  record's admission).
- Sort: ward ascending, then bed ascending with **numeric-aware** comparison
  (`Bed 3` before `Bed 12`).
- Empty beds are not admissions — absent, not null-named rows.

PROPOSAL: serve as `GET /api/v1/admissions?status=active` computed from the
same admission facts (doc 06). Never a separate table that can disagree.

### b) `latestInvestigationResults(patient)` — health markers

- Across all encounters, group investigations by `test`; keep the row with the
  greatest `asOf` (ISO dates compare lexicographically).
- Sort surviving rows by `asOf` descending.
- Markers are never stored separately — they stay inside the encounters that
  recorded them.

PROPOSAL: compute server-side in the record read, or ship encounters and
compute client-side as today. Either way, one implementation of the rule.

### c) Age

Derived from `dob` at render. Backend must never store age.

## 6. Suggested persistent model (PROPOSAL)

Technology choice is the backend team's with Dhishan/Linus — but the shape
should mirror the locked frontend shape, not a fresh invention:

```
accounts (authN — separate store/schema from records)
  id, role, display_name, aliases[] (normalized), credential_ref, status, created_at
  UNIQUE(normalized_alias, role)   -- cross-role duplicates allowed, same-role forbidden

patients (clinical records)
  id (opaque PK), full_name, gender, dob (DATE), blood_group,
  height_cm, weight_kg,
  abha_number (UNIQUE, canonical digits), abha_address (UNIQUE, nullable),
  abha_verified_at, contact_phone, contact_address_text,
  emergency_contact_{name,relation,phone} (nullable group),
  created_at, updated_at

patient_allergies        patient_id FK → patients, substance, reaction
patient_medications      patient_id FK → patients, name, dosage, frequency   (reconciled list)
patient_conditions       patient_id FK → patients, condition
patient_notes            patient_id FK → patients, text, author, date

admissions               patient_id FK → patients, ward, bed, admitted_on, discharged_on NULLABLE
  CHECK (discharged_on IS NULL OR discharged_on >= admitted_on)
  -- at most one open admission per patient (partial unique index)

encounters               id (opaque PK), patient_id FK → patients, date, setting, reason,
                         assessment, disposition, created_by, created_at
prescription_items       encounter_id FK → encounters, name, dosage, frequency, duration, instructions
investigations           encounter_id FK → encounters, test, ordered_on, result_text, as_of

identity_verifications   id (requestId), requested_by (account), abha_ref, abdm_txn_ref,
                         attempts, resend_count, expires_at, status, created_at  (doc 04, §6)
audit_events             actor, action, object_type, object_ref, purpose, result, at  (doc 09, §2)
```

Notes:

- Opaque ids: PROPOSAL is UUIDv4 (or prefixed ids like `pat_…`) for
  patients/encounters/verifications. Never sequential integers externally.
- The `allergies: []` vs missing distinction (§1.5): represent as "row set may
  be empty" + a `history_taken_at`-style marker if the product later needs to
  distinguish "asked, none" from "never asked" — needs a product decision;
  today, empty means recorded-none.
- `encounters` newest-first is a read-order concern (`ORDER BY date DESC, id`),
  not a storage concern.
- Date fields are calendar dates (`DATE`), not timestamps. `dob` especially.

## 7. Fields that must NOT be added yet (locked absences)

Do not add: billing, insurance, caregiver, analytics, emergency-identity
objects, vitals-without-encounter, `clinicianId`, `queuePosition`, stored
patient state/status, bed roster/facility tables, consent tables (until
doc 08 milestones design them). Each has a named future milestone; adding any
early creates unowned surface the frontend cannot display or verify.

## 8. Backend checklist (data)

- [ ] Schema mirrors the locked record shape; seed data = the 3 prototype records
- [ ] Opaque, non-sequential, URL-safe ids for patients/encounters
- [ ] State/admissions/markers derived per §5 — byte-identical semantics
- [ ] No stored state column; disposition-only admission writes (write path comes with Encounter milestone)
- [ ] Recorded-none vs unknown preserved for allergies/medications/notes
- [ ] DOB/encounter dates as calendar dates; age never stored
- [ ] Accounts and records in separate stores/schemas with explicit linkage only
- [ ] Technology + migration + backup strategy decided and documented
