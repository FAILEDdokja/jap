# Project Brief v1 — Jan Arogya Portal

## Purpose

Jan Arogya Portal is a government-focused healthcare coordination platform for the Indian healthcare ecosystem.

Its purpose is not simply to digitize paper records or hospital data. Its purpose is to digitize and coordinate the relationships that exist between every participant in healthcare.

The platform models healthcare as a network of interacting participants rather than isolated organizations. Every interaction, communication, workflow, approval, document, prescription, report, payment, consent, and responsibility should eventually become part of a connected digital workflow.

The long-term objective is to improve continuity of care, accountability, transparency, discoverability of medical information, and coordination across the Indian healthcare ecosystem.

## Vision

Jan Arogya Portal is intended to become a single coordination platform that connects every major participant in healthcare while respecting the responsibilities and permissions of each participant.

The project is designed specifically for India and is intended to align with the country's digital healthcare ecosystem.

The platform should make healthcare interactions continuous rather than fragmented.

Instead of patients carrying information between independent organizations, authorized participants should be able to collaborate through a shared digital workflow.

The project should always prioritize clarity, maintainability, and long-term evolution over short-term implementation speed.

## Healthcare Ecosystem

Jan Arogya Portal serves multiple independent participants.

These include, but are not limited to:

- Patients
- Doctors
- Hospitals
- Clinics
- Pharmacies
- Laboratories
- Insurance providers
- Government organizations
- Future healthcare participants introduced later

Each participant represents a different role within the healthcare ecosystem.

These roles are **not** interchangeable.

Each role will eventually have:

- different responsibilities,
- different permissions,
- different workflows,
- different interfaces,
- different capabilities,
- different views of the system,
- different authorization requirements,
- and different interactions with other participants.

The platform should always model these differences explicitly rather than treating every participant as the same type of user.

## Relationship-Centered Design

The primary responsibility of Jan Arogya Portal is coordinating relationships.

Examples include:

- patient ↔ doctor
- doctor ↔ laboratory
- doctor ↔ pharmacy
- patient ↔ insurer
- hospital ↔ government
- laboratory ↔ patient

The project is fundamentally about coordinating these interactions through trustworthy digital workflows.

Documents, records, prescriptions, reports and certificates are consequences of these relationships rather than the primary focus of the system.

## Government Context

Jan Arogya Portal is designed as a government-oriented healthcare platform.

Engineering decisions should favour:

- reliability,
- correctness,
- auditability,
- maintainability,
- accessibility,
- security,
- and long-term sustainability.

The project should be engineered as public digital infrastructure rather than a short-lived prototype.

## ABDM Integration

Jan Arogya Portal is built to participate in the Ayushman Bharat Digital Mission (ABDM) ecosystem.

ABDM provides foundational national healthcare capabilities.

Jan Arogya Portal builds healthcare workflows and coordination on top of those capabilities rather than replacing them.

The project currently does **not** have access to production ABDM APIs.

Development will therefore use realistic mock implementations that simulate documented ABDM behaviour.

The architecture should treat ABDM as an external dependency from the beginning so that replacing mock implementations with real integrations requires minimal application changes.

## Development Philosophy

The project is developed incrementally.

Engineering decisions are made before implementation.

Implementation follows accepted engineering decisions.

Large speculative implementations are discouraged.

Every implementation task should remain as small, focused and reviewable as reasonably possible.

The objective is to build the system through many small, well-understood engineering decisions rather than large batches of code.

## Current Stage

The project is currently establishing its engineering foundations.

Current work focuses on:

- defining the project,
- understanding the problem domain,
- building engineering documentation,
- establishing development workflows,
- and preparing the project for incremental implementation.

Production architecture, frameworks and implementation details should not be assumed unless they have been explicitly accepted through engineering decisions.

## Assumptions

Current engineering assumptions include:

- ABDM will eventually become available for production integration.
- Public ABDM documentation is sufficient for creating realistic mock implementations.
- Mock implementations exist only to support development and should closely resemble real integrations.
- The project will continue to evolve through documented engineering decisions.
- This document is a living engineering artifact and will be updated as the project evolves.

## Role of this Document

This Project Brief provides the high-level understanding of Jan Arogya Portal for every engineer joining the project.

It explains **what the project is**, **why it exists**, and **the principles that guide its development**.

It does **not** define architecture, implementation details, technology choices, or engineering decisions beyond the current stage of the project.

---

The project brief is not final, it exists as a document on the workspace to be continually updated as things progress.
