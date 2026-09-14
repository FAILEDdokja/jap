/**
 * RoleDashboard Component
 *
 * The signed-in destination for a role, and nothing more. Only the Doctor
 * Dashboard is designed, and that happens in the next milestone, so every role
 * renders the same short placeholder.
 *
 * The component receives its data through `show()` and never reads the session
 * or the mock layer itself, so it cannot accidentally become the place where
 * role logic starts to live.
 */

import { getRole } from "../js/roles.js";

class RoleDashboard extends HTMLElement {
  connectedCallback() {
    if (!this.hasAttribute("hidden")) {
      this.render();
    }
  }

  show(roleKey, session) {
    this.session = session;
    this.roleKey = roleKey;
    this.hidden = false;
    this.render();
  }

  hide() {
    this.hidden = true;
    this.innerHTML = "";
  }

  render() {
    const definition = getRole(this.roleKey);
    if (!definition || !this.session) return;

    this.innerHTML = `
      <main class="w-full max-w-container-max mx-auto py-stack-lg px-margin-mobile md:px-margin-desktop" aria-labelledby="jap-dashboard-title">
        <p class="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-2">${definition.audience}</p>
        <h1 class="font-headline-md text-headline-md text-primary mb-2" id="jap-dashboard-title">${definition.destinationLabel}</h1>
        <div class="h-px w-24 bg-secondary mb-4"></div>
        <p class="font-body-md text-body-md text-on-surface-variant">
          Signed in as <span class="font-medium text-on-surface">${this.session.name}</span>.
        </p>
      </main>
    `;
  }
}

customElements.define("role-dashboard", RoleDashboard);
