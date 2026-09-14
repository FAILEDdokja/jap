/**
 * Doctor Workspace
 *
 * Authenticated clinical shell for the doctor role: persistent navigation +
 * Dashboard / Patients / History / Admissions, the New Patient workflow, and the
 * patient context view.
 *
 * Dashboard, New Patient and the patient record are designed; Patients, History
 * and Admissions are intentional empty placeholders. Identity comes from the
 * session passed into show(), and the patient comes from the record the app
 * resolved from the route - this component looks neither up itself.
 */

import { getRole, ROLE } from "../js/roles.js";
import { workspacePathFor } from "../js/router.js";
import { activeAdmissions } from "../js/mock/patients.js";

// Same treatment as the login panel's Cancel control. Kept per file, as the
// workspace's button classes already are, rather than shared by a new module.
const TEXT_ACTION_CLASSES =
  "font-label-md text-label-md text-on-surface-variant hover:text-primary focus:outline-none focus:underline rounded";

const NAV_ITEMS = [
  { section: "dashboard", label: "Dashboard" },
  { section: "patients", label: "Patients" },
  { section: "history", label: "History" },
  { section: "admissions", label: "Admissions" },
];

// Destinations that exist but have no designed content yet. New Patient and the
// patient record are real views now, so they are deliberately absent here.
const PLACEHOLDERS = {
  patients: "Patients",
  history: "History",
  admissions: "Admissions",
};

class DoctorWorkspace extends HTMLElement {
  show(session, section, patient) {
    this.session = session;
    this.section = section || "dashboard";
    this.patient = patient ?? null;
    this.hidden = false;
    this.render();
  }

  hide() {
    this.hidden = true;
    this.innerHTML = "";
  }

  render() {
    if (!this.session) return;

    const definition = getRole(this.session.role);
    const section = this.section;

    this.innerHTML = `
      <div class="w-full max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-md md:py-stack-lg">
        <nav class="mb-stack-md border-b border-outline-variant" aria-label="Doctor workspace">
          <ul class="flex w-full">
            ${NAV_ITEMS.map((item) => this.#navLink(item, section)).join("")}
          </ul>
        </nav>
        <main>
          ${this.#main(section, definition)}
        </main>
      </div>
    `;

    // The record is handed over after mounting rather than read by the view, so
    // the patient shown is always the one the current route named.
    if (section === "patient" && this.patient) {
      this.querySelector("patient-profile")?.show(this.patient);
    }
  }

  /**
   * One place decides which view a section gets. `patient` is a context rather
   * than a destination, so it never appears in the navigation above.
   */
  #main(section, definition) {
    if (section === "dashboard") return this.#dashboard(definition);
    if (section === "new-patient") return `<patient-intake></patient-intake>`;
    if (section === "patient") {
      return this.patient ? `<patient-profile></patient-profile>` : this.#patientUnavailable();
    }
    return this.#placeholder(section);
  }

  #navLink(item, section) {
    const active = item.section === section;
    const href = workspacePathFor(ROLE.DOCTOR, item.section);
    const classes = active
      ? "flex flex-1 items-center justify-center px-2 py-2 text-center font-label-md text-label-md text-primary border-b-2 border-secondary"
      : "flex flex-1 items-center justify-center px-2 py-2 text-center font-label-md text-label-md text-on-surface-variant hover:text-primary hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-secondary";
    const current = active ? ' aria-current="page"' : "";
    return `<li class="flex flex-1 min-w-0"><a class="${classes}" href="${href}"${current}>${item.label}</a></li>`;
  }

  #dashboard(definition) {
    const name = this.session.name;
    const audience = definition ? definition.audience : "";
    const newPatientHref = workspacePathFor(ROLE.DOCTOR, "new-patient");

    return `
      <section aria-labelledby="jap-doctor-identity">
        <p class="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-2">${audience}</p>
        <h1 class="font-headline-md text-headline-md text-primary mb-2" id="jap-doctor-identity">${name}</h1>
        <div class="h-px w-24 bg-secondary mb-stack-md"></div>
        <p>
          <a class="inline-block bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant transition-colors focus:outline-none focus:ring-2 focus:ring-secondary" href="${newPatientHref}">
            New Patient
          </a>
        </p>
      </section>
      <section class="mt-stack-lg" aria-labelledby="jap-active-admissions">
        <h2 class="font-title-lg text-title-lg text-on-surface mb-stack-sm" id="jap-active-admissions">Active Admissions</h2>
        ${this.#admissionsTable()}
      </section>
    `;
  }

  /**
   * Rows come from the patient records themselves (see js/mock/patients.js), so a
   * bed cannot be shown as occupied by someone whose record says otherwise.
   * Names are not links yet: reaching an admitted patient from their bed is the
   * Admissions milestone, not this one.
   */
  #admissionsTable() {
    const admissions = activeAdmissions();

    if (admissions.length === 0) {
      return `<p class="font-body-md text-body-md text-on-surface-variant">No active admissions</p>`;
    }

    const rows = admissions
      .map(
        (row) => `
        <tr class="border-b border-outline-variant">
          <td class="py-2 pr-4 font-body-md text-body-md text-on-surface">${row.ward}</td>
          <td class="py-2 pr-4 font-body-md text-body-md text-on-surface">${row.bed}</td>
          <td class="py-2 font-body-md text-body-md text-on-surface">${row.name}</td>
        </tr>`
      )
      .join("");

    return `
      <div class="overflow-x-auto">
        <table class="w-full text-left border-t border-outline-variant">
          <caption class="sr-only">Currently admitted patients by ward and bed</caption>
          <thead>
            <tr class="border-b border-outline-variant">
              <th class="py-2 pr-4 font-label-md text-label-md text-on-surface-variant" scope="col">Ward</th>
              <th class="py-2 pr-4 font-label-md text-label-md text-on-surface-variant" scope="col">Bed</th>
              <th class="py-2 font-label-md text-label-md text-on-surface-variant" scope="col">Patient</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * A patient route that resolves to nothing - a stale bookmark, or an id from
   * another session. Stating it beats rendering whatever was last on screen.
   */
  #patientUnavailable() {
    return `
      <section class="max-w-md" aria-labelledby="jap-patient-unavailable">
        <h1 class="font-headline-md text-headline-md text-primary mb-1" id="jap-patient-unavailable">Unable to load patient</h1>
        <div class="h-px w-16 bg-secondary mb-stack-md" aria-hidden="true"></div>
        <p class="font-body-md text-body-md text-on-surface-variant mb-stack-md">
          No patient record matches this page. No clinical information is shown.
        </p>
        <a class="${TEXT_ACTION_CLASSES}" href="${workspacePathFor(ROLE.DOCTOR, "dashboard")}">Back to Dashboard</a>
      </section>
    `;
  }


  #placeholder(section) {
    const title = PLACEHOLDERS[section] || "Doctor Workspace";
    return `
      <section aria-labelledby="jap-placeholder-title">
        <h1 class="font-headline-md text-headline-md text-primary mb-2" id="jap-placeholder-title">${title}</h1>
        <div class="h-px w-24 bg-secondary mb-4"></div>
        <p class="font-body-md text-body-md text-on-surface-variant">This destination is not designed yet.</p>
      </section>
    `;
  }
}

customElements.define("doctor-workspace", DoctorWorkspace);
