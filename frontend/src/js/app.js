/**
 * App entry
 *
 * Three responsibilities, and no more:
 *   1. Register the reusable components that make up the page.
 *   2. Own the wiring between routes, the login modal, the session and the
 *      dashboard, which is the only place allowed to decide what a route shows.
 *   3. Resolve what a route is *about* - today, the patient record a patient
 *      route names - and hand it down. Components are shown their data; they do
 *      not go and find it.
 *
 * Authentication itself is not here (it is behind src/js/auth/auth-service.js),
 * patient identification is not here either (src/js/abdm/identity-service.js),
 * and no component contains a credential check or builds a URL by hand.
 */

import "../components/government-header.js";
import "../components/top-navbar.js";
import "../components/announcement-ticker.js";
import "../components/main-section.js";
import "../components/site-footer.js";
import "../components/login-modal.js";
import "../components/role-dashboard.js";
import "../components/doctor-workspace.js";
import "../components/patient-intake.js";
import "../components/patient-profile.js";

import { getRole, ROLE } from "./roles.js";
import {
  dashboardPathFor,
  loginPathFor,
  navigate,
  patientPathFor,
  publicPath,
  startRouter,
  workspacePathFor,
} from "./router.js";
import { clearSession, readSession, writeSession } from "./auth/session.js";
import { getPatientById } from "./mock/patients.js";

const publicView = document.getElementById("public-view");
const loginModal = document.querySelector("login-modal");
const dashboard = document.querySelector("role-dashboard");
const doctorWorkspace = document.querySelector("doctor-workspace");

/** Lets chrome (the navbar) react to a sign-in or sign-out. */
function announceSessionChange() {
  window.dispatchEvent(new CustomEvent("jap:session-change"));
}

function showLanding() {
  dashboard.hide();
  doctorWorkspace.hide();
  publicView.hidden = false;
}

function showDashboard(roleKey, session, section, patient) {
  loginModal.close();
  publicView.hidden = true;

  if (roleKey === ROLE.DOCTOR) {
    dashboard.hide();
    doctorWorkspace.show(session, section, patient);
    return;
  }

  doctorWorkspace.hide();
  dashboard.show(roleKey, session);
}

/**
 * The single route -> view mapping.
 *
 * A login route keeps the public page mounted behind the modal, so the portal
 * identity stays visible while the user authenticates.
 */
function applyRoute(route) {
  const definition = getRole(route.role);

  if (route.name === "login" && definition) {
    dashboard.hide();
    doctorWorkspace.hide();
    publicView.hidden = false;
    loginModal.openFor(route.role);
    return;
  }

  if (route.name === "dashboard" && definition) {
    const session = readSession();

    if (!session || session.role !== route.role) {
      // Typed or stale URL: ask for that role's credentials instead of showing
      // an empty dashboard, and without adding a history entry to undo it.
      navigate(loginPathFor(route.role), { replace: true });
      return;
    }

    // Patient context is resolved here, once, from the route. Components never
    // look a patient up themselves, so a stale URL reports "not available"
    // instead of leaving the previous patient on screen.
    if (route.section === "patient" && route.role === ROLE.DOCTOR && !route.patientId) {
      navigate(workspacePathFor(route.role), { replace: true });
      return;
    }

    showDashboard(route.role, session, route.section, getPatientById(route.patientId));
    return;
  }

  // Public landing, plus any hash this milestone has no view for yet.
  loginModal.close();
  showLanding();
}

// The modal reports success; storing the session and choosing the destination
// stays here so the component itself never depends on routing or session state.
loginModal.addEventListener("jap:authenticated", (event) => {
  const { user } = event.detail;
  writeSession(user);
  announceSessionChange();
  navigate(dashboardPathFor(user.role));
});

loginModal.addEventListener("jap:cancel", () => {
  navigate(publicPath());
});

// The intake panel reports a successful verification. Entering patient context is
// navigation, so it stays here rather than in the panel - the panel never builds
// a path, exactly like the login modal.
document.addEventListener("jap:patient-identified", (event) => {
  navigate(patientPathFor(ROLE.DOCTOR, event.detail.patientId));
});

window.addEventListener("jap:sign-out", () => {
  clearSession();
  announceSessionChange();
  navigate(publicPath());
});

startRouter(applyRoute);

console.log("Jan Arogya Portal - components registered");
