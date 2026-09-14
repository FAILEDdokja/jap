/**
 * Authentication service
 *
 * The seam between the UI and however a user is authenticated. Components call
 * these functions and never inspect mock data, and they never contain
 * credential checks of their own.
 *
 * Today the implementation is the mock. Replacing it later is one line here:
 *
 *   setAuthenticationService(createApiAuthService(fetch))
 *
 * Result contract of authenticate():
 *   { status: "authenticated", user }      user = { id, role, name }
 *   { status: "identifier-not-found" }
 *   { status: "role-unavailable" }
 *
 * A future implementation may add states (for example "requires-credential" for
 * an OTP or password step). The UI switches on `status`, so new states are
 * additive rather than a rewrite.
 */

import { isValidRole } from "../roles.js";
import { createMockAuthService } from "./mock-auth.js";

let service = createMockAuthService();

export function setAuthenticationService(nextService) {
  if (!nextService || typeof nextService.authenticate !== "function") {
    throw new TypeError("Authentication service must provide authenticate()");
  }
  service = nextService;
}

/**
 * Authenticates an identifier within a role.
 * An unknown role is treated as unavailable rather than thrown, so a hand-typed
 * or stale URL cannot break the page.
 */
export function authenticate({ role, identifier }) {
  if (!isValidRole(role)) {
    return Promise.resolve({ status: "role-unavailable" });
  }
  return service.authenticate({ role, identifier });
}

/**
 * Example identifier for the login field, when the active implementation is
 * willing to disclose one. Resolves to null otherwise (production auth has no
 * demo identities to advertise), which the login form handles by showing no
 * example.
 */
export function getDemoIdentifier(role) {
  if (typeof service.getDemoIdentifier !== "function") {
    return Promise.resolve(null);
  }
  return service.getDemoIdentifier({ role });
}
