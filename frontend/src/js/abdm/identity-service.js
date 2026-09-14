/**
 * Patient identity service
 *
 * The seam between the Doctor Workspace and however a patient is identified and
 * consented. It is deliberately separate from js/auth/, which authenticates the
 * *signed-in professional*: identifying a patient at the point of care is a
 * different transaction, and in production it is an ABDM one.
 *
 * The project brief requires ABDM to be treated as an external dependency from
 * the beginning, so today's implementation is the mock and a real integration
 * replaces exactly one line:
 *
 *   setPatientIdentityService(createAbdmIdentityService(fetch))
 *
 * Result contract of identifyPatient({ abha }):
 *   { status: "otp-required", requestId, maskedAbha }  a verification is open
 *   { status: "abha-not-recognized" }
 *
 * Result contract of verifyPatientOtp({ requestId, otp }):
 *   { status: "verified", patientId }
 *   { status: "otp-invalid" }
 *
 * The open verification is owned by the implementation and named by `requestId`,
 * so no component has to remember which patient a code belongs to. `patientId`
 * is the only thing the application then carries, and it carries it in the route.
 *
 * A patient's record is never returned here: identification is not consent.
 */

import { createMockIdentityService } from "./mock-identity.js";

let service = createMockIdentityService();

export function setPatientIdentityService(nextService) {
  if (
    !nextService ||
    typeof nextService.identifyPatient !== "function" ||
    typeof nextService.verifyOtp !== "function"
  ) {
    throw new TypeError("Patient identity service must provide identifyPatient() and verifyOtp()");
  }
  service = nextService;
}

/** Opens a verification for the patient an ABHA resolves to, if any. */
export function identifyPatient({ abha }) {
  return service.identifyPatient({ abha });
}

/** Confirms the one-time password against the open verification. */
export function verifyPatientOtp({ requestId, otp }) {
  return service.verifyOtp({ requestId, otp });
}

/**
 * Example ABHA for the input field, when the active implementation will disclose
 * one (same dev-only convention as getDemoIdentifier in the auth service).
 * Resolves to null otherwise, and the form simply shows no example.
 */
export function getDemoAbha() {
  if (typeof service.getDemoAbha !== "function") {
    return Promise.resolve(null);
  }
  return service.getDemoAbha();
}

/**
 * The code for an open verification, for the same reason. A production
 * implementation omits this method, the UI shows no hint, and the code arrives
 * on the patient's linked mobile instead.
 */
export function getDemoOtp({ requestId }) {
  if (typeof service.getDemoOtp !== "function") {
    return Promise.resolve(null);
  }
  return service.getDemoOtp({ requestId });
}
