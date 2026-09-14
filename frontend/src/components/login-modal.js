/**
 * LoginModal Component
 *
 * Role-specific authentication over the public landing page.
 *
 * Design constraints this component honours:
 *   - The role is chosen *before* the modal opens (public Login dropdown), so
 *     there is no role selector in here. The role only swaps the copy and the
 *     identity field; the layout and logic never branch.
 *   - One field on the first screen. Progressive authentication: identifying
 *     the account is the whole first step.
 *   - Compact rectangular panel, flat and sharp, over a subtly dimmed/blurred
 *     page (see `.login-overlay` in custom.css). No illustration, gradient or
 *     marketing copy.
 *   - It calls the authentication service and reports what happened. It does not
 *     know about routes or sessions, which keeps the UI independent of the mock
 *     layer it currently talks to.
 *
 * Events emitted:
 *   jap:authenticated  detail: { user }  — the app stores the session and routes
 *   jap:cancel         — the app leaves the login route
 */

import { getRole } from "../js/roles.js";
import { authenticate, getDemoIdentifier } from "../js/auth/auth-service.js";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

class LoginModal extends HTMLElement {
  #roleKey = null;
  #definition = null;
  #pending = false;
  #returnFocusTo = null;

  get isOpen() {
    return this.#roleKey !== null;
  }

  connectedCallback() {
    // Listeners live on the host, not the inner markup, so re-rendering the
    // panel never leaves stale handlers behind.
    this.addEventListener("keydown", (event) => this.#handleKeydown(event));
    this.addEventListener("click", (event) => {
      // Clicking the dimmed page outside the panel dismisses the form.
      if (event.target === this.#overlay()) {
        this.#cancel();
      }
    });
  }

  /** Opens the login form for a role. Unknown roles are ignored by the router. */
  async openFor(roleKey) {
    const definition = getRole(roleKey);
    if (!definition) return;

    this.#returnFocusTo = document.activeElement;
    this.#roleKey = roleKey;
    this.#definition = definition;
    this.#pending = false;
    this.render();

    document.body.classList.add("login-overlay-open");

    // Land the user on the field they need; no extra click or Tab to start.
    this.querySelector("#jap-login-identifier")?.focus();

    // The example identifier is offered by the auth implementation rather than
    // hard-coded here, so credentials never live inside UI files.
    const example = await getDemoIdentifier(roleKey);
    if (this.#roleKey !== roleKey) return; // closed or re-opened while awaiting

    const input = this.querySelector("#jap-login-identifier");
    if (input && example) {
      input.placeholder = example;
    }
  }

  close() {
    if (!this.isOpen) return;
    this.#teardown();
  }

  #teardown() {
    this.#roleKey = null;
    this.#definition = null;
    this.#pending = false;
    this.innerHTML = "";
    document.body.classList.remove("login-overlay-open");

    // Return the user exactly where they left off in the page.
    if (this.#returnFocusTo?.isConnected) {
      this.#returnFocusTo.focus();
    }
    this.#returnFocusTo = null;
  }

  #cancel() {
    this.#teardown();
    this.dispatchEvent(new CustomEvent("jap:cancel", { bubbles: true }));
  }

  #overlay() {
    return this.querySelector(".login-overlay");
  }

  #handleKeydown(event) {
    if (!this.isOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.#cancel();
      return;
    }

    if (event.key === "Tab") {
      this.#trapFocus(event);
    }
  }

  /** `aria-modal="true"` is only honest if focus cannot leave the dialog. */
  #trapFocus(event) {
    const focusable = [...this.querySelectorAll(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !this.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  render() {
    const definition = this.#definition;
    if (!definition) return;

    this.innerHTML = `
      <div class="login-overlay">
        <div class="bg-surface-container-lowest border border-outline-variant rounded-lg shadow-md w-full max-w-md p-margin-mobile md:p-stack-md" role="dialog" aria-modal="true" aria-labelledby="jap-login-title">
          <div class="flex items-start justify-between gap-base mb-base">
            <p class="font-caption text-caption text-on-surface-variant uppercase tracking-wider pt-1">${definition.audience}</p>
            <button type="button" class="font-label-md text-label-md text-on-surface-variant hover:text-primary focus:outline-none focus:underline rounded" data-action="cancel">Cancel</button>
          </div>

          <h2 class="font-headline-md text-headline-md text-primary mb-1" id="jap-login-title">${definition.title}</h2>
          <div class="h-px w-16 bg-secondary mb-stack-md" aria-hidden="true"></div>

          <form novalidate>
            <label class="block font-label-md text-label-md text-on-surface mb-2" for="jap-login-identifier">${definition.identifierLabel}</label>
            <input
              class="block w-full bg-surface-container-lowest border border-outline-variant rounded px-base py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-secondary focus:border-outline"
              id="jap-login-identifier"
              name="identifier"
              type="text"
              inputmode="${definition.inputMode}"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              aria-required="true"
            />
            <p class="mt-2 bg-error-container text-on-error-container rounded px-3 py-2 text-caption font-caption" id="jap-login-error" role="alert" hidden></p>
            <button
              class="mt-stack-md w-full bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant transition-colors focus:outline-none focus:ring-2 focus:ring-secondary"
              type="submit"
              data-action="continue"
            >Continue</button>
          </form>
        </div>
      </div>
    `;

    const form = this.querySelector("form");
    form.addEventListener("submit", (event) => this.#handleSubmit(event));
    this.querySelector('[data-action="cancel"]').addEventListener("click", () => this.#cancel());

    const input = this.querySelector("#jap-login-identifier");
    // Clearing the error as soon as the user edits keeps feedback adjacent to
    // the interaction without leaving a stale warning on screen.
    input.addEventListener("input", () => this.#setError(""));
  }

  async #handleSubmit(event) {
    event.preventDefault();
    if (this.#pending) return;

    const input = this.querySelector("#jap-login-identifier");
    const value = input.value.trim();

    if (!value) {
      this.#setError(`Enter your ${this.#definition.fieldName}.`);
      input.focus();
      return;
    }

    this.#setPending(true);
    let result;
    try {
      result = await authenticate({ role: this.#roleKey, identifier: value });
    } finally {
      // The modal may have been closed while waiting on the service.
      if (this.isOpen) this.#setPending(false);
    }
    if (!this.isOpen) return;

    switch (result.status) {
      case "authenticated":
        this.dispatchEvent(
          new CustomEvent("jap:authenticated", {
            bubbles: true,
            detail: { user: result.user },
          })
        );
        break;
      case "role-unavailable":
        this.#setError("Sign-in for this role is not available yet.");
        break;
      case "identifier-not-found":
      default:
        // Deliberately vague: no hint about which part of an identity matched.
        this.#setError("No account matches that identifier. Check it and try again.");
        input.focus();
        break;
    }
  }

  #setPending(isPending) {
    this.#pending = isPending;
    const button = this.querySelector('[data-action="continue"]');
    if (!button) return;
    button.disabled = isPending;
    if (isPending) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
  }

  #setError(message) {
    const error = this.querySelector("#jap-login-error");
    const input = this.querySelector("#jap-login-identifier");
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

customElements.define("login-modal", LoginModal);
