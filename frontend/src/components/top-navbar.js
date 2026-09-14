/**
 * TopNavBar Component
 * Primary navigation with the ecosystem role login menu.
 *
 * The Login dropdown is where a role is chosen, so it is the entry point of the
 * whole authentication flow. Role names, their order and their login routes all
 * come from the role registry (js/roles.js) rather than being written out here,
 * which keeps this menu and the login form from disagreeing about the roles.
 *
 * When a session exists, the menu is replaced by the signed-in identity and a
 * sign-out action, so the current user is always visible in the page chrome.
 */

import { getRole, ROLE_KEYS } from "../js/roles.js";
import { loginPathFor } from "../js/router.js";
import { readSession } from "../js/auth/session.js";

// Shared by the generated role items; the existing class string of the approved
// design, kept verbatim so the menu looks exactly as it did.
const ROLE_ITEM =
  "block px-4 py-3 text-sm text-on-surface hover:bg-surface-container-low hover:text-primary transition-colors border-b border-outline-variant/50";

class TopNavbar extends HTMLElement {
  #globalListenersAdded = false;

  connectedCallback() {
    this.render();

    // Document-level listeners are added once for the lifetime of the element,
    // even though the markup inside it is re-rendered on sign-in and sign-out.
    // They look the menu up lazily, so a re-render cannot orphan them.
    if (!this.#globalListenersAdded) {
      this.#globalListenersAdded = true;
      window.addEventListener("jap:session-change", () => this.render());

      document.addEventListener("click", (event) => {
        if (!event.target.closest(".dropdown-container")) {
          this.#setRoleMenuOpen(false);
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          this.#setRoleMenuOpen(false);
        }
      });
    }
  }

  render() {
    const session = readSession();
    const publicNavClass = session ? "hidden" : "hidden md:flex";
    const mobileToggleClass = session ? "hidden" : "md:hidden p-2 text-on-surface-variant";

    this.innerHTML = `
      <nav class="bg-surface-container-lowest dark:bg-inverse-surface border-b border-outline-variant dark:border-outline docked full-width top-0 z-50">
        <div class="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto h-16">
          <a class="text-title-lg font-title-lg font-bold text-primary dark:text-inverse-primary flex items-center gap-2" href="#/">
            Jan Arogya Portal
          </a>

          <!-- Desktop Nav Links (public landing only; clinical workspace has its own shell) -->
          <div class="${publicNavClass} gap-8 items-center h-full">
            <a class="text-primary dark:text-inverse-primary border-b-2 border-secondary font-bold pb-1 h-full flex items-center hover:bg-surface-container-high dark:hover:bg-surface-container transition-colors px-2" href="#/">
              <span class="font-label-md text-label-md">Home</span>
            </a>
            <a class="text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-inverse-primary transition-colors h-full flex items-center hover:bg-surface-container-high dark:hover:bg-surface-container px-2" href="#">
              <span class="font-label-md text-label-md">About</span>
            </a>
            <a class="text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-inverse-primary transition-colors h-full flex items-center hover:bg-surface-container-high dark:hover:bg-surface-container px-2" href="#">
              <span class="font-label-md text-label-md">Services</span>
            </a>
            <a class="text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-inverse-primary transition-colors h-full flex items-center hover:bg-surface-container-high dark:hover:bg-surface-container px-2" href="#">
              <span class="font-label-md text-label-md">FAQs</span>
            </a>
            <a class="text-on-surface-variant dark:text-outline-variant hover:text-primary dark:hover:text-inverse-primary transition-colors h-full flex items-center hover:bg-surface-container-high dark:hover:bg-surface-container px-2" href="#">
              <span class="font-label-md text-label-md">Contact</span>
            </a>
          </div>

          <!-- Trailing Actions -->
          <div class="flex items-center gap-4 text-primary dark:text-inverse-primary">
            <button aria-label="Select language" class="hover:bg-surface-container-high dark:hover:bg-surface-container p-2 rounded-full transition-colors">
              <span class="material-symbols-outlined">language</span>
            </button>
            <button aria-label="Accessibility options" class="hover:bg-surface-container-high dark:hover:bg-surface-container p-2 rounded-full transition-colors">
              <span class="material-symbols-outlined">accessibility</span>
            </button>
            ${this.#authArea()}
          </div>

          <!-- Mobile Menu Toggle (visible only on mobile) -->
          <button class="${mobileToggleClass}" aria-label="Open menu">
            <span class="material-symbols-outlined">menu</span>
          </button>
        </div>
      </nav>
    `;

    this.#wireRoleMenu();
  }

  /**
   * Role-specific login entries. Every role JAP recognises appears here; the
   * route carries the role so the login form never has to ask for it again.
   */
  #authArea() {
    const session = readSession();

    if (session) {
      const definition = getRole(session.role);
      return `
        <div class="flex items-center gap-2">
          <span class="hidden md:flex flex-col items-end leading-tight">
            <span class="font-label-md text-label-md text-on-surface">${session.name}</span>
            <span class="font-caption text-caption text-on-surface-variant">${definition.audience}</span>
          </span>
          <button class="bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant transition-colors focus:outline-none focus:ring-2 focus:ring-secondary" data-action="sign-out" type="button">
            Sign out
          </button>
        </div>
      `;
    }

    const items = ROLE_KEYS.map((roleKey, index) => {
      const definition = getRole(roleKey);
      // Government keeps the existing emphasis treatment from the approved design.
      const emphasis = index === ROLE_KEYS.length - 1 ? " bg-surface-container-highest/20 font-medium" : "";
      return `
            <a class="${ROLE_ITEM}${emphasis}" href="${loginPathFor(roleKey)}" data-role="${roleKey}">${definition.label}</a>`;
    }).join("");

    return `
      <div class="relative dropdown-container h-full flex items-center">
        <button class="bg-primary text-on-primary px-4 py-2 rounded font-label-md text-label-md hover:bg-on-primary-fixed-variant transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-secondary" data-action="role-menu" aria-haspopup="true" aria-expanded="false" aria-controls="jap-role-menu" type="button">
          Login
          <span class="material-symbols-outlined text-sm">arrow_drop_down</span>
        </button>
        <div class="dropdown-menu absolute top-full right-0 mt-1 w-48 bg-surface-container-lowest border border-outline-variant rounded shadow-md z-50 overflow-hidden" id="jap-role-menu">
          ${items}
        </div>
      </div>
    `;
  }

  /**
   * Wired after each render because the markup inside this component is
   * replaced whenever the session changes.
   */
  #wireRoleMenu() {
    this.querySelector('[data-action="role-menu"]')?.addEventListener("click", () => {
      const container = this.querySelector(".dropdown-container");
      this.#setRoleMenuOpen(!container?.classList.contains("is-open"));
    });

    const container = this.querySelector(".dropdown-container");
    if (container) {
      // Choosing a role closes the menu; the modal that opens takes focus.
      container.addEventListener("click", (event) => {
        if (event.target.closest("[data-role]")) {
          this.#setRoleMenuOpen(false);
        }
      });
    }

    this.querySelector('[data-action="sign-out"]')?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("jap:sign-out"));
    });
  }

  /**
   * Hover and keyboard focus already reveal the menu (see custom.css), but a
   * click toggle is needed for touch, and it keeps aria-expanded truthful for
   * screen readers instead of permanently "false".
   */
  #setRoleMenuOpen(isOpen) {
    const container = this.querySelector(".dropdown-container");
    if (!container) return;

    container.classList.toggle("is-open", isOpen);
    container
      .querySelector('[data-action="role-menu"]')
      ?.setAttribute("aria-expanded", String(isOpen));
  }
}

customElements.define("top-navbar", TopNavbar);
