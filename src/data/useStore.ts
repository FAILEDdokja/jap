import { useEffect, useReducer } from "react";
import { subscribe } from "./store";

/**
 * Subscribe a component to store mutations. Returns a version number that
 * changes on every commit, so callers can invoke the query helpers
 * (visiblePatients, patientBundle, auditFeed, …) directly during render and stay
 * live. This avoids the referential-stability constraints of
 * useSyncExternalStore when selectors return fresh arrays.
 */
export function useStore(): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribe(bump), []);
  return version;
}
