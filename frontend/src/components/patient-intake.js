/**
 * PatientIntake Component
 *
 * The New Patient workflow: ABHA identification, then the one-time password.
 *
 *   ABHA submitted → identity service opens a verification → OTP step
 *   → verified → jap:patient-identified { patientId }
 *
 * Design constraints this component honours:
 *   - It is an *operation*, so it is a workspace view reached from the Dashboard
 *     button, never a sidebar destination.
 *   - It reports success and lets the app decide where that goes. It knows
 *     nothing about routes, sessions or patient records, which keeps it as thin
 *     as the login panel it follows.
 *   - Nothing patient-specific is shown before the patient is identified: the
 *     step-1 error names the problem, and step 2 quotes back only the masked
 *     ABHA the doctor just typed. The name appears once verification succeeds.
 *   - The two steps are one view, not two URLs: the step is local UI state.
 *
 * Events emitted:
 *   jap:patient-identified  detail: { patientId }
 */

import {
  getDemoAbha,
  getDemoOtp,
  identifyPatient,
  verifyPatientOtp,
} from "../js/abdm/identity-service.js";

const FIELD_CLASSES =
  "block w-full bg-surface-container-lowest border border-outline-variant rounded px-base py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-secondary focus:border-outline";

const PRIMARY_BUTTON_CLASSES =
  "mt-stack-md w-full bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant transition-colors focus:outline-none focus:ring-2 focus:ring-secondary";

const TEXT_ACTION_CLASSES =
  "font-label-md text-label-md text-on-surface-variant hover:text-primary focus:outline-none focus:underline rounded";

class PatientIntake extends HTMLElement {
  #requestId = null;
  #maskedAbha = "";
  #pending = false;

  connectedCallback() {
    this.#renderAbhaStep();
  }

  /**
   * Re-rendering the whole step (rather than patching parts) keeps the markup and
   * the listeners in the same place, the way the login panel does.
   */
  #renderAbhaStep() {
    this.#requestId = null;
    this.#maskedAbha = "";
    this.#pending = false;

    this.innerHTML = `
      <section class="max-w-md" aria-labelledby="jap-new-patient-title">
        <h1 class="font-headline-md text-headline-md text-primary mb-1" id="jap-new-patient-title">New Patient</h1>
        <div class="h-px w-16 bg-secondary mb-stack-md" aria-hidden="true"></div>
        <p class="font-body-md text-body-md text-on-surface-variant mb-stack-md">
          Identify the patient with their ABHA number or ABHA address, then confirm the
          one-time password sent to the mobile number linked to it.
        </p>

        <form novalidate>
          <label class="block font-label-md text-label-md text-on-surface mb-2" for="jap-abha">ABHA number or ABHA address</label>
          <input
            class="${FIELD_CLASSES}"
            id="jap-abha"
            name="abha"
            type="text"
            inputmode="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            aria-required="true"
          />
          <p class="mt-2 bg-error-container text-on-error-container rounded px-3 py-2 text-caption font-caption" id="jap-abha-error" role="alert" hidden></p>
          <button class="${PRIMARY_BUTTON_CLASSES}" type="submit" data-action="request-otp">Send one-time password</button>
        </form>
      </section>
    `;

    this.querySelector("form").addEventListener("submit", (event) => this.#submitAbha(event));

    const input = this.querySelector("#jap-abha");
    input.addEventListener("input", () => this.#setError("#jap-abha-error", "#jap-abha", ""));

    // Land the doctor on the field they need, and offer the example the mock
    // discloses; a real implementation returns null and shows nothing.
    input.focus();
    getDemoAbha().then((example) => {
      if (example && this.querySelector("#jap-abha") === input) {
        input.placeholder = example;
      }
    });
  }

  #renderOtpStep() {
    this.innerHTML = `
      <section class="max-w-md" aria-labelledby="jap-otp-title">
        <h1 class="font-headline-md text-headline-md text-primary mb-1" id="jap-otp-title">Confirm one-time password</h1>
        <div class="h-px w-16 bg-secondary mb-stack-md" aria-hidden="true"></div>
        <p class="font-body-md text-body-md text-on-surface-variant mb-stack-md">
          A one-time password was sent to the mobile number linked to <span class="font-medium text-on-surface">${this.#maskedAbha}</span>.
        </p>
        <p class="font-caption text-caption text-on-surface-variant mb-stack-md" id="jap-otp-hint" hidden></p>

        <form novalidate>
          <label class="block font-label-md text-label-md text-on-surface mb-2" for="jap-otp">One-time password</label>
          <input
            class="${FIELD_CLASSES}"
            id="jap-otp"
            name="otp"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            spellcheck="false"
            aria-required="true"
          />
          <p class="mt-2 bg-error-container text-on-error-container rounded px-3 py-2 text-caption font-caption" id="jap-otp-error" role="alert" hidden></p>
          <button class="${PRIMARY_BUTTON_CLASSES}" type="submit" data-action="verify-otp">Verify and open patient record</button>
        </form>

        <p class="mt-stack-md">
          <button class="${TEXT_ACTION_CLASSES}" type="button" data-action="restart">Use a different ABHA</button>
        </p>
      </section>
    `;

    this.querySelector("form").addEventListener("submit", (event) => this.#submitOtp(event));
    this.querySelector('[data-action="restart"]').addEventListener("click", () => this.#renderAbhaStep());

    const input = this.querySelector("#jap-otp");
    input.addEventListener("input", () => this.#setError("#jap-otp-error", "#jap-otp", ""));
    input.focus();

    // The prototype has no message to deliver, so the code is stated plainly
    // instead of pretending a send happened.
    getDemoOtp({ requestId: this.#requestId }).then((otp) => {
      const hint = this.querySelector("#jap-otp-hint");
      if (!otp || !hint) return;
      hint.textContent = `Prototype check — no message was sent. The code for this verification is ${otp}.`;
      hint.hidden = false;
    });
  }

  async #submitAbha(event) {
    event.preventDefault();
    if (this.#pending) return;

    const input = this.querySelector("#jap-abha");
    const abha = input.value.trim();

    if (!abha) {
      this.#setError("#jap-abha-error", "#jap-abha", "Enter the patient's ABHA number or ABHA address.");
      input.focus();
      return;
    }

    this.#setPending(true);
    const result = await identifyPatient({ abha });
    // The panel can have been replaced by a workspace re-render while awaiting.
    if (!this.isConnected) return;
    this.#setPending(false);

    if (result.status === "otp-required") {
      this.#requestId = result.requestId;
      this.#maskedAbha = result.maskedAbha;
      this.#renderOtpStep();
      return;
    }

    this.#setError("#jap-abha-error", "#jap-abha", "ABHA not recognized. Check the number or address and try again.");
    input.focus();
  }

  async #submitOtp(event) {
    event.preventDefault();
    if (this.#pending) return;

    const input = this.querySelector("#jap-otp");
    const otp = input.value.trim();

    if (!otp) {
      this.#setError("#jap-otp-error", "#jap-otp", "Enter the one-time password.");
      input.focus();
      return;
    }

    this.#setPending(true);
    const result = await verifyPatientOtp({ requestId: this.#requestId, otp });
    if (!this.isConnected) return;
    this.#setPending(false);

    if (result.status === "verified") {
      this.dispatchEvent(
        new CustomEvent("jap:patient-identified", {
          bubbles: true,
          detail: { patientId: result.patientId },
        })
      );
      return;
    }

    this.#setError("#jap-otp-error", "#jap-otp", "OTP invalid. Check the code and try again.");
    input.select();
    input.focus();
  }

  #setPending(isPending) {
    this.#pending = isPending;
    const button = this.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = isPending;
    button.setAttribute("aria-busy", String(isPending));
  }

  /** Same error mechanics as the login panel: adjacent, announced, cleared on edit. */
  #setError(errorSelector, inputSelector, message) {
    const error = this.querySelector(errorSelector);
    const input = this.querySelector(inputSelector);
    if (!error || !input) return;

    if (message) {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
    } else {
      error.textContent = "";
      error.hidden = true;
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }
}

customElements.define("patient-intake", PatientIntake);
