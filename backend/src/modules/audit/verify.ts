/**
 * Audit chain integrity verification.
 *
 * Recomputes every event's digest from its stored fields and walks the chain,
 * so it detects all four tamper classes named in the Phase 4 brief:
 *
 *   `hash_mismatch`   — an event's stored fields no longer produce its hash
 *                       (i.e. the row was edited)
 *   `broken_link`     — `prevEventId`/`prevHash` do not match the actual
 *                       predecessor (an event was removed, replaced or
 *                       re-pointed)
 *   `sequence_gap`    — sequence numbers are not contiguous (rows deleted, or
 *                       written outside the chain writer)
 *   `duplicate_sequence` / `out_of_order` — ordering violated
 *
 * Verification is read-only. It never repairs: a failing chain is an incident,
 * not something software should silently fix.
 */
import { hashEvent, type AuditEvent } from "./types.js";

export type AuditIntegrityIssueKind =
  | "hash_mismatch"
  | "broken_link"
  | "sequence_gap"
  | "duplicate_sequence"
  | "out_of_order"
  | "genesis_not_first";

export interface AuditIntegrityIssue {
  kind: AuditIntegrityIssueKind;
  eventId: string;
  sequence: number;
  detail: string;
}

export interface AuditIntegrityReport {
  ok: boolean;
  checked: number;
  firstSequence: number | null;
  lastSequence: number | null;
  issues: AuditIntegrityIssue[];
}

/**
 * @param events the chain in ascending sequence order (as `AuditStore.chain()`
 *               returns it). Order is re-checked rather than assumed.
 */
export function verifyAuditChain(events: readonly AuditEvent[]): AuditIntegrityReport {
  const issues: AuditIntegrityIssue[] = [];
  const seenSequences = new Set<number>();

  let previous: AuditEvent | null = null;

  for (const event of events) {
    const at = { eventId: event.id, sequence: event.sequence };

    // --- ordering ------------------------------------------------------
    if (seenSequences.has(event.sequence)) {
      issues.push({ ...at, kind: "duplicate_sequence", detail: `sequence ${event.sequence} appears more than once` });
    }
    seenSequences.add(event.sequence);

    if (previous) {
      if (event.sequence <= previous.sequence) {
        issues.push({ ...at, kind: "out_of_order", detail: `sequence ${event.sequence} follows ${previous.sequence}` });
      } else if (event.sequence !== previous.sequence + 1) {
        issues.push({
          ...at,
          kind: "sequence_gap",
          detail: `expected sequence ${previous.sequence + 1}, found ${event.sequence}`,
        });
      }
    }

    // --- linkage -------------------------------------------------------
    if (!previous) {
      if (event.prevEventId !== null || event.prevHash !== null) {
        issues.push({
          ...at,
          kind: "broken_link",
          detail: "first event in the verified range references a predecessor that is not present",
        });
      }
    } else {
      if (event.prevEventId !== previous.id) {
        issues.push({
          ...at,
          kind: "broken_link",
          detail: `prevEventId does not reference the preceding event (${previous.id})`,
        });
      }
      if (event.prevHash !== previous.hash) {
        issues.push({ ...at, kind: "broken_link", detail: "prevHash does not match the preceding event's hash" });
      }
      if (event.prevEventId === null && event.prevHash === null) {
        issues.push({ ...at, kind: "genesis_not_first", detail: "a second genesis event exists inside the chain" });
      }
    }

    // --- content -------------------------------------------------------
    const { hash, ...draft } = event;
    const recomputed = hashEvent(draft);
    if (recomputed !== hash) {
      issues.push({ ...at, kind: "hash_mismatch", detail: "stored hash does not match the event contents" });
    }

    previous = event;
  }

  return {
    ok: issues.length === 0,
    checked: events.length,
    firstSequence: events[0]?.sequence ?? null,
    lastSequence: previous ? previous.sequence : null,
    issues,
  };
}
