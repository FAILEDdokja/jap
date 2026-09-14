# 01 — Product Vision and Direction

Source: `docs/engineering/project-brief.md` (v1, the project's living PRD).
This doc restates it for backend engineers and draws out what it demands of the
backend. If this doc and the brief ever disagree, **the brief wins**.

## 1. What Jan Arogya Portal is

A **government-focused healthcare coordination platform for the Indian
healthcare ecosystem**. Its purpose is not to digitize paper records — it is to
digitize and coordinate the **relationships** between every participant in
healthcare.

> Every interaction, communication, workflow, approval, document, prescription,
> report, payment, consent, and responsibility should eventually become part of
> a connected digital workflow.

The long-term objective: continuity of care, accountability, transparency,
discoverability of medical information, and coordination across the Indian
healthcare ecosystem.

**Backend implication:** model relationships as first-class data, not as
afterthoughts. A prescription is not a row in a table — it is an artifact of a
doctor–patient encounter, issued at a facility, potentially dispensed by a
pharmacy and paid by an insurer. The schema should make those links explicit
and auditable from day one (see doc 05).

## 2. Vision: one coordination platform, continuous care

JAP should become a **single coordination platform connecting every major
participant**, making healthcare interactions **continuous rather than
fragmented**. Instead of patients carrying information between independent
organizations, authorized participants collaborate through a shared digital
workflow.

**Backend implications:**

- Identity must be **federated and national**, not per-hospital usernames.
  This is why patient identity is ABHA and professional identity is HPID —
  the backend must not invent parallel identity schemes (see docs 03, 04, 07).
- Authorization must be **relationship- and consent-aware**, not just
  role-based. Today's frontend only needs role checks, but the backend's authz
  model must have room to grow into consent-scoped, relationship-scoped access
  (see doc 07, §7).
- Prioritize **clarity, maintainability, and long-term evolution over
  short-term implementation speed.** Boring, well-documented backend design
  beats clever design here.

## 3. The ecosystem: roles are not interchangeable

Participants include, but are not limited to: patients, doctors, hospitals,
clinics, pharmacies, laboratories, insurance providers, government
organizations, and future participants added later.

Each role will eventually have different responsibilities, permissions,
workflows, interfaces, capabilities, views, authorization requirements, and
interactions. **The platform must model these differences explicitly.**

**Backend implications:**

- One `users` table with a `role` string is acceptable as a starting point
  **only if** role-specific identity and permission logic branches explicitly
  per role. Never treat an identifier valid for one role as valid for another —
  the frontend already enforces this (a doctor's HPID does not sign in on the
  patient screen) and the backend must enforce it too (see doc 03, §4).
- Keep the role registry extensible. Clinics and insurers exist in the brief
  but not yet in `frontend/src/js/roles.js`. Adding a role should be a data +
  policy change, not a rewrite (see doc 07, §6).
- Government is a first-class participant (programme oversight, public-health
  coordination), not an admin backdoor. Its access patterns need explicit
  design, not blanket superuser rights.

## 4. Relationship-centered design

The primary responsibility is coordinating relationships:

- patient ↔ doctor
- doctor ↔ laboratory
- doctor ↔ pharmacy
- patient ↔ insurer
- hospital ↔ government
- laboratory ↔ patient

Documents, records, prescriptions, reports, and certificates are **consequences
of these relationships**, not the primary focus.

**Backend implications:**

- The encounter (a patient–doctor interaction) is the unit of clinical work.
  Prescriptions and investigations live **inside** encounters, never as
  top-level objects (the frontend already structures records this way).
- Future workflows (lab orders, pharmacy dispensing, insurance claims,
  government reporting) are **edges between participants**, each with its own
  lifecycle and audit trail. Design the API and schema so new relationship
  types can be added incrementally (see doc 08).

## 5. Government context: public digital infrastructure

Engineering decisions must favour **reliability, correctness, auditability,
maintainability, accessibility, security, and long-term sustainability.** JAP is
built as public digital infrastructure, not a short-lived prototype.

**Backend implications** (expanded in doc 09):

- Every clinical read and write must be **auditable**: who accessed whose
  record, under what authorization, when.
- Correctness over convenience: no fake guarantees. The frontend mocks
  deliberately omit OTP expiry, resend, and lockout rather than fake them —
  the backend must implement these **for real** or explicitly defer them, never
  simulate them.
- Accessibility and i18n readiness (India's languages, low-bandwidth devices)
  constrain API design: small payloads, server-renderable data, no
  chatty multi-round-trip flows where one call suffices.

## 6. ABDM posture: build on top, treat as external

JAP **participates in** the ABDM ecosystem; ABDM provides foundational national
capabilities (identity, registries, consent-driven sharing), and JAP builds
coordination workflows on top. The project currently has **no production ABDM
access**, so development uses realistic mocks of documented ABDM behavior —
and ABDM must be treated as an **external dependency from the beginning** so
that swapping mocks for real integrations requires minimal application changes.

**Backend implications:**

- The frontend already honors this: `js/abdm/` is a seam with a mock behind
  it. The backend must mirror the pattern — an **ABDM adapter layer** behind a
  stable internal interface — so sandbox → production ABDM migration touches
  one module, not the whole codebase (see doc 04, §6).
- Path: ABDM sandbox (`sandbox.abdm.gov.in`) first, certification, then
  production. Backend owns this entire track.
- Never cache or clone ABDM registry data (HPR/HFR) as a shadow source of
  truth. Verify against ABDM; store only references and verification outcomes.

## 7. Development philosophy: incremental, decision-led

- Engineering decisions are made **before** implementation; implementation
  follows accepted decisions.
- Large speculative implementations are discouraged. Tasks stay small, focused,
  reviewable.
- The system grows through many small, well-understood decisions.

**Backend implications:**

- Build the backend in the same increments as the frontend milestones (doc 08):
  auth + identity + record reads first; encounter writes, admissions, and
  history when those frontend milestones are designed. Do not pre-build
  pharmacy/lab/insurer workflows speculatively.
- Do not widen the data model beyond what a designed screen reads. The patient
  record has no billing, insurance, vitals-without-encounter, or queue fields
  **on purpose** — adding them early creates unowned, untested surface area
  (see doc 05, §7).
- When a backend need reveals a missing product decision (e.g., OTP expiry
  window, consent scope wording), **escalate for a decision** per the charter —
  do not silently invent one. Mark the choice PROPOSAL in code review until
  accepted.

## 8. Current stage and assumptions

The project is establishing engineering foundations. Standing assumptions:

- ABDM will eventually be available for production integration.
- Public ABDM documentation suffices for realistic mocks.
- Mocks exist only to support development and must closely resemble real
  integrations.
- The brief is a living document — expect it to evolve, and evolve the backend
  with it.

## 9. Direction of travel (for backend planning)

Putting the brief together with the frontend's handoff notes, the backend is
heading toward:

1. **Identity plane** — ABDM-backed verification for patients (ABHA),
   professionals (HPID/HPR), facilities (HFR), and eventually departments.
2. **Care plane** — encounters, prescriptions, investigations, admissions as
   relationship artifacts with full audit trails.
3. **Coordination plane** — cross-participant workflows: lab orders and
   results, pharmacy dispensing, referrals, insurer claims, government
   reporting and programme dashboards.
4. **Consent plane** — ABDM consent-manager-aligned, purpose-scoped,
   time-bounded access to health data across the ecosystem.

Today's backend scope is plane 1 plus the read side of plane 2. Everything
else is designed incrementally per doc 08. The architecture must keep all four
planes separable so each can evolve on its own cadence.
