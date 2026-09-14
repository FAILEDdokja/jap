/**
 * Frontend session state
 *
 * Holds the current user for this browser tab. It is the only module that
 * touches storage, so the rest of the app reads and writes a plain user object.
 *
 * This is presentation state, not security: sessionStorage keeps the demo
 * signed in across a reload, and nothing here is trusted as authorization. The
 * real session boundary will be the backend.
 */

import { isValidRole } from "../roles.js";

const STORAGE_KEY = "jap.session";

/** A session is only usable if it is the shape the app agreed to persist. */
function isUsableSession(candidate) {
  return Boolean(
    candidate &&
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      isValidRole(candidate.role)
  );
}

export function readSession() {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (!isUsableSession(parsed)) {
      // Shape drifted (edited storage, older milestone): start clean.
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    // Unavailable storage (private mode) or malformed JSON both mean "signed out".
    return null;
  }
}

export function writeSession(user) {
  if (!isUsableSession(user)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    // Storage full or blocked: the in-memory app still renders the session.
  }
}

export function clearSession() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Nothing to do if storage is unavailable.
  }
}
