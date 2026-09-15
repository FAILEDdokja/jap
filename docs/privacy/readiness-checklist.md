# Privacy readiness checklist (technical)

**Status: NOT COMPLETE. The system is in synthetic-data mode.**

This is a technical readiness checklist produced by engineering in Phase 4. It
is **not** a compliance assessment, and it is **not** legal advice.

> **No DPDP Act 2023 legal review has been performed.**
> **No ABDM Health Data Management Policy conformance assessment has been performed.**
> **No Data Protection Impact Assessment has been performed.**
>
> The accurate claim is: *technical controls are prepared for privacy and legal
> review.* Nothing here should be read as a claim of compliance.

See `docs/decisions/0009-privacy-and-real-data-gate.md` for the decision record.

---

## 0. The gate

**No real patient data may be stored in any environment until every item in
§7 is signed off.**

Every patient record currently in the system is a synthetic seed fixture
(doc 05 §2). This is enforced by process, not by code — which is itself an item
in §7.

---

## 1. Legal review — NOT DONE

| Item | Status | Owner |
| --- | --- | --- |
| DPDP Act 2023 review of the data lifecycle | ❌ not started | external counsel |
| Lawful basis identified per flow (consent / legitimate use) | ❌ not started | counsel + product |
| ABDM Health Data Management Policy conformance review | ❌ not started | counsel + Dhishan/Linus |
| Data fiduciary / processor roles established | ❌ not started | product |
| Notice and consent artifacts drafted for patients | ❌ not started | product + counsel |
| Grievance officer appointed and published | ❌ not started | product |
| Data Protection Impact Assessment | ❌ not started | counsel |

---

## 2. Data inventory

What the system stores today. All synthetic.

| Category | Data | Where | Notes |
| --- | --- | --- | --- |
| Account | name, email, role, org, title, phone | `users` | No passwords stored — no credential step exists yet. |
| Patient demographics | name, gender, DOB, contacts, address | `patients` | Sensitive personal data under DPDP. |
| Patient identity | ABHA number / address, verification state | `patient_identities` | The **only** place external identifiers live. Never inline on the patient row. |
| Clinical | encounters, records, diagnoses, prescriptions, lab orders/results | `encounters`, `clinical_records`, … | Health data — the most sensitive category. |
| Consent | purpose, record types, validity, decisions | `consents`, `consent_records` | Evidence of authorization. |
| Access control | decisions, requests | `access_decisions`, `access_requests` | |
| Audit | actor/org/patient **references**, action, purpose, grant, result, requestId, truncated network, device class | `audit_events` | Metadata only. Never clinical content, credentials or full ABHA. |
| Session | user id, role, name, org | process memory | Not persisted. Cleared on restart. |
| Logs | requestId, method, route template, status, duration, actor/org id | log sink | No patient ids, no names, no clinical content. |
| Metrics | counters/histograms with low-cardinality labels | `/metrics` | No identifiers of any kind. |
| ABDM transactions | masked identifier, OTP **hash** only, attempts, expiry | `abdm_transactions` | Table exists; no integration is implemented. |

**Gap:** this inventory is engineering's view. It has not been reviewed or
signed off by a data fiduciary.

---

## 3. Data minimization — implemented

- [x] Endpoints return only what a designed screen reads (doc 05 §7).
- [x] No speculative columns or endpoints for undesigned milestones.
- [x] Patient references are opaque UUIDs; ABHA never appears in a URL.
- [x] Masked identifiers only, pre-authorization (doc 04 §3).
- [x] Audit records are metadata; screened against credential/ABHA patterns.
- [x] Client IPs truncated to /24 (IPv4) or /48 (IPv6); user agent reduced to
      one of three device classes.
- [x] Logs carry route templates, never raw URLs with ids.
- [x] Metrics labels are server-chosen and low-cardinality.

---

## 4. Purpose limitation — implemented

- [x] Access evaluation takes an explicit `purpose`; the decision records it.
- [x] Consents are scoped by purpose, record type and validity period.
- [x] Default-deny: no purpose, no access.
- [x] The audit event records the purpose and the authorizing grant, so "why
      was this record read?" is answerable after the fact.
- [ ] Purpose vocabulary reviewed against the ABDM HDM Policy — **pending §1**.

---

## 5. Retention and deletion — BLOCKED

- [ ] Audit retention period — **DECISION REQUIRED**, see
      `docs/decisions/0003-audit-retention.md`.
- [ ] Clinical record retention period — not decided.
- [ ] Account data retention after deactivation — not decided.
- [ ] Erasure (DPDP right to erasure) mechanism — **not implemented**, and
      deliberately so: building a deletion path before the retention decision
      would be a guess with irreversible consequences. Note the tension to
      resolve in §1 — erasure of a patient record versus the append-only audit
      obligation. The likely answer is that audit *references* survive while
      the referenced personal data is erased, but that is a legal call.
- [x] No deletion path exists today, so nothing can be destroyed prematurely.

---

## 6. Breach readiness — PARTIAL

- [x] Tamper-evident audit: the hash chain detects changed, removed or
      reordered events (`GET /api/v1/audit/integrity`).
- [x] Access history per patient exists as data (`/api/v1/patients/:id/audit`),
      so "whose data was touched" is answerable during an incident.
- [x] Structured logs with request correlation.
- [x] Alert conditions defined (`docs/decisions/0008-observability.md`).
- [ ] Breach notification runbook with named responsibilities and statutory
      timelines — **not written** (needs §1 and an on-call rota).
- [ ] Alert routing / on-call rota — **not established**.
- [ ] Incident severity classification — not defined.

---

## 7. Real-patient-data gate — ALL ITEMS BLOCKING

Every item must be complete before any real patient record is stored.

- [ ] §1 legal review complete and signed off
- [ ] Retention decided (0003) and implemented
- [ ] Erasure mechanism designed, reviewed and implemented
- [ ] Deployment and India-region residency confirmed in a real environment (0005)
- [ ] Backups encrypted, and a restore **actually rehearsed** (0007)
- [ ] RPO/RTO accepted by the product owner (0007)
- [ ] Breach notification runbook written; on-call rota established
- [ ] Grievance-redressal process live, with the data it needs supported
- [ ] Security review / penetration test performed by a qualified third party
- [ ] Consent notice and artifacts approved
- [ ] Production configuration verified against `config/env.ts` (this is
      automated: production refuses to boot on unsafe defaults)

**Until every box above is ticked, the correct statement is: the system holds
synthetic data only.**

---

## 8. De-identification for aggregate reporting

- [x] Not implemented, and not needed yet: no aggregate reporting endpoint
      exists.
- [x] The seam is preserved — programme reporting will work on aggregates;
      row-level identifiable access will require explicit purpose plus consent
      design (doc 07 §2, §5).
- [ ] De-identification technique (k-anonymity threshold, suppression rules)
      to be decided **with** the first reporting milestone, not before.

---

## 9. No ABDM registry cloning — implemented

- [x] `abdm_identities` stores a reference and a verification outcome; it is
      not a copy of registry data (doc 07 §3).
- [x] No HPR or HFR mirror tables exist.
- [x] `organizations.facility_id` is a reference to an HFR id, not a copy of
      the facility's registry record.

---

## 10. Logging minimization — implemented

- [x] Fixed log field set; no request/response bodies.
- [x] `redact`: `cookie`, `authorization`, `set-cookie`, `body.identifier`,
      `body.otp`, `body.password`.
- [x] Never logged: OTP, password, session id/secret, full ABHA, clinical
      content, patient name.
- [x] Failed sign-ins do not log or persist the submitted identifier
      (asserted in `backend/tests/audit-service.test.ts`).
- [ ] Log retention period and access control at the log sink — depends on the
      hosting decision (0005).
