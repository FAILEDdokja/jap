/**
 * Role registry
 *
 * Single source of truth for the ecosystem participants JAP recognises.
 * The public Login dropdown, the login modal and the dashboard destination all
 * read from this file, so a role can never drift out of sync between them.
 *
 * Insertion order is meaningful: it is the order the roles appear in the
 * existing public navigation (Patient, Doctor, Hospital, Pharmacy, Laboratory,
 * Government).
 *
 * Only presentation facts live here. Identity *values* (demo IDs) belong to the
 * mock authentication layer, and authentication *rules* belong to the service.
 */

export const ROLE = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  HOSPITAL: "hospital",
  PHARMACY: "pharmacy",
  LABORATORY: "laboratory",
  GOVERNMENT: "government",
};

const ROLE_DEFINITIONS = {
  [ROLE.PATIENT]: {
    label: "Patient",
    title: "Patient Login",
    audience: "Citizen",
    // ABHA is the patient-facing national health identity; "ABHA Number" is
    // deliberately used instead of a generic "Patient ID".
    identifierLabel: "ABHA Number",
    fieldName: "ABHA number or ABHA address",
    inputMode: "text",
    destinationLabel: "Patient Dashboard",
  },
  [ROLE.DOCTOR]: {
    label: "Doctor",
    title: "Doctor Login",
    audience: "Healthcare Professional",
    // HPID (healthcare professional identity) is separate from a medical
    // registration number, so "Doctor ID" must not be used here.
    identifierLabel: "HPID / Username / Mobile Number",
    fieldName: "HPID, username or mobile number",
    inputMode: "text",
    destinationLabel: "Doctor Dashboard",
  },
  [ROLE.HOSPITAL]: {
    label: "Hospital",
    title: "Hospital Login",
    audience: "Health Facility",
    // ABDM registers hospitals and pharmacies under one facility registry, so
    // "Facility ID" is the existing term rather than an invented one.
    identifierLabel: "Facility ID / Username",
    fieldName: "facility ID or username",
    inputMode: "text",
    destinationLabel: "Hospital Dashboard",
  },
  [ROLE.PHARMACY]: {
    label: "Pharmacy",
    title: "Pharmacy Login",
    audience: "Pharmacy Facility",
    identifierLabel: "Facility ID / Username",
    fieldName: "facility ID or username",
    inputMode: "text",
    destinationLabel: "Pharmacy Dashboard",
  },
  [ROLE.LABORATORY]: {
    label: "Laboratory",
    title: "Laboratory Login",
    audience: "Diagnostic Facility",
    identifierLabel: "Facility ID / Username",
    fieldName: "facility ID or username",
    inputMode: "text",
    destinationLabel: "Laboratory Dashboard",
  },
  [ROLE.GOVERNMENT]: {
    label: "Government",
    title: "Government Login",
    audience: "Government Department",
    identifierLabel: "Department User ID",
    fieldName: "department user ID",
    inputMode: "text",
    destinationLabel: "Programme Dashboard",
  },
};

/** Role keys in the order they should be presented to the public. */
export const ROLE_KEYS = Object.freeze(Object.keys(ROLE_DEFINITIONS));

export function isValidRole(roleKey) {
  return Object.prototype.hasOwnProperty.call(ROLE_DEFINITIONS, roleKey);
}

/** Returns the definition for a role key, or null for anything unrecognised. */
export function getRole(roleKey) {
  return isValidRole(roleKey) ? ROLE_DEFINITIONS[roleKey] : null;
}
