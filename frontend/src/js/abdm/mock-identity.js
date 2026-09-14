/**
 * Mock patient identity implementation
 *
 * The only file that knows how a prototype ABHA is matched and what makes a
 * one-time password correct. It is not a fake backend: there is no persistence
 * beyond the open verifications below, no OTP delivery, no expiry, and no
 * patient data of its own (records live in js/mock/patients.js).
 *
 * Nothing here is a security guarantee. The code is generated so that it is
 * genuinely checked, and shown to the doctor by the UI through getDemoOtp() so
 * the flow can be demonstrated - the same honesty the login mock uses.
 */

import { MOCK_PATIENTS } from "../mock/patients.js";

/**
 * Open verifications, keyed by request id.
 *
 * This map is the owner of "which patient is being verified, and with what code".
 * A component holding the same facts would be a second source of truth, and one
 * that a re-render or a refresh could silently invalidate.
 */
const openVerifications = new Map();
let verificationCount = 0;

/**
 * ABHA values are matched ignoring case, spaces and dashes, so a formatted
 * number and the same digits typed quickly reach the same patient. This is a
 * display convention, not a data rule, and it is why no ABHA string is
 * duplicated here: the records in js/mock/patients.js are the only source.
 */
function normalizeAbha(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, "");
}

/** ABHA number and ABHA address both identify a patient, as in ABDM. */
const PATIENTS_BY_ABHA = MOCK_PATIENTS.reduce((index, patient) => {
  index[normalizeAbha(patient.abha.number)] = patient;
  index[normalizeAbha(patient.abha.address)] = patient;
  return index;
}, {});

function sixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Only the tail of the ABHA is handed back for display. The doctor typed it, so
 * this repeats nothing, and the Profile is the first place the full identity -
 * including the patient's name - appears.
 */
function maskedAbha(number) {
  const digits = String(number).replace(/\D/g, "");
  return `ABHA •••• ${digits.slice(-4)}`;
}

export function createMockIdentityService() {
  return {
    identifyPatient({ abha }) {
      const patient = PATIENTS_BY_ABHA[normalizeAbha(abha)];

      if (!patient) {
        return Promise.resolve({ status: "abha-not-recognized" });
      }

      const requestId = `verify-${++verificationCount}`;
      const otp = sixDigitCode();
      openVerifications.set(requestId, { patientId: patient.id, otp });

      return Promise.resolve({
        status: "otp-required",
        requestId,
        maskedAbha: maskedAbha(patient.abha.number),
      });
    },

    verifyOtp({ requestId, otp }) {
      const open = openVerifications.get(requestId);
      const candidate = String(otp || "").trim();

      // A missing verification (a code from an earlier render) is not something
      // the doctor can act on differently from a wrong one, so both report the
      // same honest thing: this code did not verify.
      if (!open || candidate !== open.otp) {
        return Promise.resolve({ status: "otp-invalid" });
      }

      openVerifications.delete(requestId);
      return Promise.resolve({ status: "verified", patientId: open.patientId });
    },

    getDemoAbha() {
      const example = MOCK_PATIENTS[0];
      return Promise.resolve(example ? example.abha.number : null);
    },

    getDemoOtp({ requestId }) {
      const open = openVerifications.get(requestId);
      return Promise.resolve(open ? open.otp : null);
    },
  };
}
