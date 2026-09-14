# 08 — Roadmap and Handoffs

What is not built yet, what each pending milestone will demand of the backend,
and the handoff notes the frontend milestones left for exactly these moments.
Source: the frontend implementation logs' "Handoff notes" and "Not this
milestone" sections — restated here with backend implications drawn out.

Order below follows the frontend's stated milestone sequence. Sequencing
decisions belong to Dhishan/Linus; backend should track, not dictate.

## 1. Encounter Workspace (next clinical milestone)

**Frontend handoff (locked direction):** "what can I do next" belongs on the
patient profile; the encounter needs **its own route under `patient/<id>`**
(a context inside a context). Prescription and investigation **ordering** are
encounter functions; content appears on the profile only as recorded history.

Backend implications:

| Requirement | Detail |
| --- | --- |
| Encounter write API | `POST /patients/{id}/encounters` with reason, assessment, disposition, prescription items, investigation orders. Idempotent (idempotency keys). |
| Disposition writes admission | `Admit` creates/updates the open admission; `Discharge` sets `dischargedOn`; `Continue OPD` leaves admission untouched. **Disposition is the only writer of admission facts** (doc 05, §3) — transactional with encounter creation. |
| No state field | Do not add a writable patient-state field to support encounters. State stays derived. |
| Vitals? | Only if the milestone designs a vitals capture UI. No vitals-without-encounter storage. |
| Attribution | Decide whether encounters record `clinicianId` at creation (recommended: yes — History needs it, §3) or defer strictly. Either way, decide explicitly. |
| Ordering vs resulting | Investigations have `orderedOn` vs `asOf` (reported) dates. Lab-result writes arrive with lab integration (§6) — design the order object so results can attach later. |
| Validation | Required fields, disposition vocabulary, date sanity — server-side, always. |

## 2. Admissions

**Frontend handoff (locked direction):** `activeAdmissions()` is the current
ward/bed/patient source. Showing empty beds needs a **bed roster referencing
patient ids** — a new decision, deliberately not started. Linking Dashboard
rows into `patient/<id>` is a one-line change held back for this milestone.

Backend implications:

| Requirement | Detail |
| --- | --- |
| Facility model | Facility → wards → beds, with occupancy referencing patient records. First persistent model beyond the patient record — needs design review. |
| Occupancy integrity | A bed holds at most one admitted patient; an admitted patient holds exactly one bed. Enforce at the database level, not just the API. |
| Row → patient navigation | Clicking an admission row enters patient context — under the **same verification-grant rule** as ABHA lookup, or an explicit policy exception (decision required: does seeing the bed list imply verification?). Recommended: entering the record still requires verification; decide explicitly. |
| Transfer support | Bed/ward changes are encounter-disposition or admission-write events with history — never silent updates. |
| Scope | Per-facility rosters; cross-facility visibility is a policy decision (doc 07, §5). |

## 3. Doctor History

**Frontend handoff (locked direction):** Doctor History answers "which
encounters have I handled?" — flatten `encounters` across records, sort by
date. Needs an **attribution field** (no encounter records who handled it) —
added with the screen that reads it.

Backend implications:

| Requirement | Detail |
| --- | --- |
| Attribution | `encounters.clinician_id` (or handled-by) added with this milestone. Backfill policy for pre-attribution seed/demo data: decide (options: attribute to seed doctor, leave unattributed and exclude, mark explicitly). |
| Query API | `GET /doctors/me/encounters?sort=-date` with pagination. Cross-patient query — authorization is "handled by me", enforced server-side. |
| No new encounter content | History displays existing encounter data; it adds no clinical fields. |

## 4. Patients page, remaining roles, patient dashboard

- **Patients page** (doctor): list/search of patients the doctor may access.
  Search semantics, scoping (facility? relationship? all verified-ever?), and
  pagination need design. Must not become a national patient directory —
  scoping decision is a privacy-critical product decision.
- **Hospital / Laboratory / Government sign-in**: structurally present,
  functionally absent (doc 03, §6). Each needs identity design (HFR/staff
  model; department IdP) before any backend work.
- **Patient dashboard**: the patient role signs in (mock) and lands on a
  placeholder. Real content (own record, consent management, access log) is a
  major future milestone and the home of the patient-visible consent plane
  (doc 04, §7).
- **Pharmacy dashboard**: signs in (mock), placeholder. Dispensing workflows
  arrive with e-prescription design.
- **Clinics, insurers**: in the brief, not in the role registry. Added per
  doc 07, §6 when designed.

## 5. Consent plane (cross-cutting, ABDM-aligned)

The known gap (doc 04, §7): verification currently implies full record access.
The consent plane separates them. Backend must not build it now, but must
keep it buildable:

- Verification transactions, record reads, and audit events stay separate
  tables/services.
- Record reads take a **grant** parameter (verification grant today, consent
  grant tomorrow) — design the read path with this seam from the start.
- Future: purpose declaration, consent-request/artifact flow per ABDM HIE-CM,
  time-bounded purpose-scoped grants, patient-visible access log, revocation
  propagation.

## 6. Coordination plane (lab, pharmacy, referral, claims, reporting)

Per the brief's relationship list and vision (doc 01, §9), the long arc:

| Workflow | Edge | Backend shape (directional only) |
| --- | --- | --- |
| Lab orders + results | doctor ↔ lab ↔ patient | Order object on encounter; result events attach; lab role API; result notification |
| E-prescription + dispensing | doctor ↔ pharmacy ↔ patient | Signed prescription artifact; dispense records; refill policy |
| Referrals | doctor ↔ doctor/hospital | Referral object with state machine + handoff notes |
| Insurance claims | patient ↔ insurer (+ provider) | Claim objects; insurer role; eligibility/coverage checks |
| Government reporting | hospital ↔ government | Aggregate, de-identified reporting pipelines; programme dashboards |

None of this is designed. It is listed so the backend's early choices
(id scheme, audit model, API versioning, service boundaries) don't foreclose
it. Revisit per milestone.

## 7. Backend readiness checklist (roadmap)

- [ ] Encounter write path designed against §1 (when milestone is accepted)
- [ ] Facility/bed model designed against §2 (when milestone is accepted)
- [ ] Attribution + history query per §3 (when milestone is accepted)
- [ ] Verification-grant seam on record reads (enables §5 later)
- [ ] Patient search scoping decision obtained before any Patients-page API
- [ ] No speculative tables/APIs for §4–§6 until their milestones are designed
- [ ] Roadmap reviewed with Dhishan/Linus whenever the brief or logs gain a milestone
