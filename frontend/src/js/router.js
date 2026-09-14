/**
 * Router
 *
 * A hash router, because JAP is a static no-build frontend: `#/...` paths work
 * from `file://`-free static hosting (and any plain static server) without the
 * URL-rewrite rules a real path-based router would need.
 *
 * The router deliberately knows nothing about roles, auth or views. It only
 * reads the hash into a small descriptor and lets the app decide what a route
 * means. That keeps this file reusable once a real router or backend routing
 * replaces it.
 */

/** Route paths. Kept in one place so no component builds URLs by hand. */
export function publicPath() {
  return "#/";
}

export function loginPathFor(roleKey) {
  return `#/login/${roleKey}`;
}

export function dashboardPathFor(roleKey) {
  return `#/dashboard/${roleKey}`;
}

/** Doctor workspace destinations. `dashboard` is the login landing (no extra segment). */
export function workspacePathFor(roleKey, section = "dashboard") {
  if (!section || section === "dashboard") {
    return dashboardPathFor(roleKey);
  }
  return `#/dashboard/${roleKey}/${section}`;
}

/**
 * Doctor patient context.
 *
 * The `patient` segment occupies the workspace's section slot, and the record id
 * follows it. The id is the internal record id and deliberately not the ABHA: a
 * patient identifier does not belong in URLs, history entries or shared
 * screenshots when an opaque id resolves just as well.
 */
export function patientPathFor(roleKey, patientId) {
  return `${workspacePathFor(roleKey, "patient")}/${patientId}`;
}

/**
 * Turns a location hash into a route descriptor:
 *   "" / "#/"                         -> { name: "public" }
 *   "#/login/doctor"                  -> { name: "login", role: "doctor" }
 *   "#/dashboard/doctor"              -> { name: "dashboard", role: "doctor", section: "dashboard" }
 *   "#/dashboard/doctor/patients"     -> { name: "dashboard", role: "doctor", section: "patients" }
 *   "#/dashboard/doctor/patient/p-01" -> { name: "dashboard", role: "doctor", section: "patient", patientId: "p-01" }
 *   anything else                     -> { name: "unknown" }
 *
 * Role validity is intentionally not decided here, and neither is whether a
 * patient id exists: resolving it belongs to the app, so an unknown id can be
 * reported instead of rendering someone else's record.
 */
export function parseRoute(hash) {
  const segments = String(hash || "")
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) {
    return { name: "public" };
  }

  if (segments.length === 2 && segments[0] === "login") {
    return { name: "login", role: segments[1] };
  }

  // Read before the section rule, so a fourth segment is only ever accepted as a
  // patient id and every other four-part path still falls back to the landing.
  if (segments.length === 4 && segments[0] === "dashboard" && segments[2] === "patient") {
    return {
      name: "dashboard",
      role: segments[1],
      section: "patient",
      patientId: segments[3],
    };
  }

  if (segments.length >= 2 && segments.length <= 3 && segments[0] === "dashboard") {
    return {
      name: "dashboard",
      role: segments[1],
      section: segments[2] || "dashboard",
    };
  }

  return { name: "unknown" };
}

export function currentRoute() {
  return parseRoute(window.location.hash);
}

export function navigate(path, { replace = false } = {}) {
  if (replace) {
    // Keep the history stack clean: correcting an invalid URL should not create
    // a history entry the user has to step back through.
    window.location.replace(`${window.location.pathname}${window.location.search}${path}`);
  } else if (window.location.hash !== path) {
    window.location.hash = path;
  }
}

/**
 * Starts route notifications. `onRoute` runs immediately for the current hash
 * and then on every change, so the app only needs one place to react to URLs.
 */
export function startRouter(onRoute) {
  const handle = () => onRoute(currentRoute());
  window.addEventListener("hashchange", handle);
  handle();
}
