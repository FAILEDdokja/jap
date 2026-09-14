/**
 * PatientProfile Component
 *
 * The patient context view: one identified patient's clinical summary, ordered by
 * what a doctor needs first rather than by record layout.
 *
 *   who is this person  →  anything unsafe  →  clinically important  →  what is
 *   happening now  →  contact  →  persistent notes  →  what has happened before
 *
 * Design constraints this component honours:
 *   - It receives a record through show() and reads nothing else. It cannot
 *     remember a previous patient, so the route decides who is displayed.
 *   - Current state and health markers are derived from the record, never stored
 *     twice, so nothing here can contradict the admission or the results.
 *   - "What can I do next" (encounter entry) is intentionally absent: the
 *     Encounter Workspace is a later milestone, and this view is not allowed to
 *     imply a workflow that does not exist yet.
 *   - Empty values are stated as "None recorded", because in a clinical record an
 *     absent allergy list and an unrecorded one must not look the same.
 */

import { workspacePathFor } from "../js/router.js";
import { ROLE } from "../js/roles.js";
import { latestInvestigationResults, patientStateOf } from "../js/mock/patients.js";

const SECTION_TITLE_CLASSES = "font-title-lg text-title-lg text-on-surface mb-stack-sm";
const ROW_CLASSES = "grid gap-x-gutter gap-y-1 sm:grid-cols-[11rem_1fr] py-2 border-b border-outline-variant/60";
const LABEL_CLASSES = "font-label-md text-label-md text-on-surface-variant";
const VALUE_CLASSES = "font-body-md text-body-md text-on-surface";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-07" -> "7 Sep 2026". Parsed by part so the date is not shifted by a timezone. */
function formatDate(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function ageFromDob(dob, today = new Date()) {
  const [year, month, day] = String(dob).split("-").map(Number);
  let years = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) years -= 1;
  return years;
}

function listItems(entries, render) {
  if (!entries || entries.length === 0) return null;
  return `<ul class="space-y-1">${entries.map((entry) => `<li>${render(entry)}</li>`).join("")}</ul>`;
}

class PatientProfile extends HTMLElement {
  #patient = null;

  show(patient) {
    this.#patient = patient;
    this.render();
  }

  render() {
    const patient = this.#patient;
    if (!patient) return;

    this.innerHTML = `
      <div class="max-w-3xl">
        ${this.#identity(patient)}
        ${this.#safety(patient)}
        ${this.#clinicallyImportant(patient)}
        ${this.#currentState(patient)}
        ${this.#contact(patient)}
        ${this.#notes(patient)}
        ${this.#history(patient)}
      </div>
    `;
  }

  /** WHO IS THIS PERSON? Identity is the canonical ABHA, shown in full here. */
  #identity(patient) {
    return `
      <header class="mb-stack-md">
        <div class="flex flex-wrap items-start justify-between gap-base">
          <div>
            <p class="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-2">Patient record</p>
            <h1 class="font-headline-md text-headline-md text-primary">${patient.name}</h1>
          </div>
          <a class="${LABEL_CLASSES} hover:text-primary focus:outline-none focus:underline rounded pt-1" href="${workspacePathFor(ROLE.DOCTOR, "dashboard")}">Back to Dashboard</a>
        </div>
        <div class="h-px w-24 bg-secondary my-stack-md" aria-hidden="true"></div>
        <dl>
          ${this.#row("ABHA number", patient.abha.number)}
          ${this.#row("ABHA address", patient.abha.address)}
          ${this.#row("Age", `${ageFromDob(patient.dob)} years`)}
          ${this.#row("Date of birth", formatDate(patient.dob))}
          ${this.#row("Gender", patient.gender)}
        </dl>
      </header>
    `;
  }

  #safety(patient) {
    const allergies =
      listItems(patient.allergies, (allergy) =>
        `<span class="font-medium">${allergy.substance}</span>${allergy.reaction ? ` — ${allergy.reaction}` : ""}`
      ) ?? this.#noneRecorded();

    const medications =
      listItems(patient.currentMedications, (medication) =>
        `${medication.name} ${medication.dosage} · ${medication.frequency}`
      ) ?? this.#noneRecorded();

    return this.#section("Safety", `
      <dl>
        ${this.#row("Allergies", allergies)}
        ${this.#row("Current medications", medications)}
      </dl>
    `);
  }

  #clinicallyImportant(patient) {
    const conditions =
      listItems(patient.chronicConditions, (condition) => condition) ?? this.#noneRecorded();

    // Read from the recorded results instead of a second field, so a marker can
    // never disagree with the investigation that produced it.
    const markers =
      listItems(latestInvestigationResults(patient), (item) =>
        `${item.test} — ${item.result} <span class="text-on-surface-variant">(${formatDate(item.asOf)})</span>`
      ) ?? this.#noneRecorded();

    return this.#section("Clinically important", `
      <dl>
        ${this.#row("Blood group", patient.bloodGroup)}
        ${this.#row("Height", `${patient.heightCm} cm`)}
        ${this.#row("Weight", `${patient.weightKg} kg`)}
        ${this.#row("Chronic conditions", conditions)}
        ${this.#row("Health markers", markers)}
      </dl>
    `);
  }

  /** WHAT IS HAPPENING NOW? Only the state the record actually represents. */
  #currentState(patient) {
    const state = patientStateOf(patient);
    let detail = "";

    if (state.kind === "admitted") {
      detail = `Admitted — ${state.ward} / ${state.bed} · since ${formatDate(state.admittedOn)}`;
    } else if (state.kind === "discharged") {
      detail = `Discharged ${formatDate(state.dischargedOn)} · was admitted ${formatDate(state.admittedOn)}`;
    } else {
      detail = "Outpatient";
    }

    return this.#section("Current state", `
      <p class="inline-block bg-surface-container-high text-on-surface rounded px-base py-2 font-label-md text-label-md">${detail}</p>
    `);
  }

  #contact(patient) {
    const emergency = patient.emergencyContact;

    return this.#section("Address and contact", `
      <dl>
        ${this.#row("Address", patient.contact.address)}
        ${this.#row("Phone", patient.contact.phone)}
        ${this.#row(
          "Emergency contact",
          emergency
            ? `${emergency.name} (${emergency.relation}) · ${emergency.phone}`
            : this.#noneRecorded(),
        )}
      </dl>
    `);
  }

  /**
   * Patient-level notes only. Encounter-specific clinical notes belong to the
   * encounter they were written in, and appear under Clinical history.
   */
  #notes(patient) {
    const notes =
      listItems(
        patient.notes,
        (note) =>
          `${note.text} <span class="text-on-surface-variant">— ${note.author}, ${formatDate(note.date)}</span>`
      ) ?? this.#noneRecorded();

    // A div, not a p: a note list is block content.
    return this.#section("Patient notes", `<div class="${VALUE_CLASSES}">${notes}</div>`);
  }

  /** WHAT HAS HAPPENED BEFORE? Encounters, with the prescription and results each one issued. */
  #history(patient) {
    const encounters = patient.encounters.map((encounter) => `
      <article class="mt-stack-sm first:mt-0">
        <h3 class="font-body-lg text-body-lg text-on-surface mb-2">
          ${formatDate(encounter.date)} · ${encounter.setting} · ${encounter.disposition}
        </h3>
        <dl class="mb-stack-sm">
          ${this.#row("Reason for visit", encounter.reason)}
          ${this.#row("Assessment", encounter.assessment)}
          ${this.#row("Prescription", this.#prescription(encounter))}
          ${this.#row("Investigations", this.#investigations(encounter))}
        </dl>
      </article>
    `);

    const body = encounters.length > 0 ? encounters.join("") : this.#noneRecorded();
    return this.#section("Clinical history", body);
  }

  #prescription(encounter) {
    const items = encounter.prescription?.items ?? [];
    if (items.length === 0) return this.#noneRecorded();

    const list = items
      .map(
        (item) => `
        <li>
          <span class="font-medium">${item.name}</span> ${item.dosage} · ${item.frequency} · ${item.duration}
          <span class="block font-caption text-caption text-on-surface-variant">${item.instructions} — issued ${formatDate(encounter.prescription.issuedOn)}</span>
        </li>`
      )
      .join("");

    return `<ul class="space-y-2">${list}</ul>`;
  }

  #investigations(encounter) {
    const items = encounter.investigations ?? [];
    if (items.length === 0) return this.#noneRecorded();

    const list = items
      .map(
        (item) => `
        <li>
          ${item.test} — ${item.result}
          <span class="block font-caption text-caption text-on-surface-variant">Ordered ${formatDate(item.orderedOn)} · reported ${formatDate(item.asOf)}</span>
        </li>`
      )
      .join("");

    return `<ul class="space-y-2">${list}</ul>`;
  }

  #section(title, body) {
    const headingId = `jap-profile-${title.toLowerCase().replace(/ /g, "-")}`;
    return `
      <section class="mt-stack-md" aria-labelledby="${headingId}">
        <h2 class="${SECTION_TITLE_CLASSES}" id="${headingId}">${title}</h2>
        ${body}
      </section>
    `;
  }

  #row(label, value) {
    return `
      <div class="${ROW_CLASSES}">
        <dt class="${LABEL_CLASSES}">${label}</dt>
        <dd class="${VALUE_CLASSES}">${value}</dd>
      </div>
    `;
  }

  #noneRecorded() {
    return `<span class="text-on-surface-variant">None recorded</span>`;
  }
}

customElements.define("patient-profile", PatientProfile);
