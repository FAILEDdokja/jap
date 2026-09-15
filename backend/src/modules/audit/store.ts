/**
 * Audit stores.
 *
 * Two implementations behind one interface (`AuditStore`):
 *
 *   - `MemoryAuditStore`  — process-local; unit tests and DB-less local runs.
 *                            Rejected in production by `parseEnv`.
 *   - `PostgresAuditStore` — the real store: the append-only, hash-chained
 *                            `audit_events` table.
 *
 * Both are append-only *by API*: there is no update or delete method anywhere
 * in the application. In PostgreSQL that is additionally enforced by BEFORE
 * UPDATE / BEFORE DELETE triggers (migration 20260915120000_audit_hardening).
 *
 * ## Why the Postgres store speaks SQL through an executor
 *
 * The chain write must be atomic *and* serialized: reading "the last event",
 * computing a hash from it, and inserting the successor has to happen with no
 * interleaving writer, or two concurrent requests would both chain onto the
 * same predecessor. We therefore run it inside a transaction that takes a
 * `pg_advisory_xact_lock`, which Prisma's model API cannot express. The
 * `SqlExecutor` seam lets the same SQL run through Prisma (`$queryRawUnsafe`,
 * parameterized — never string interpolation) in the application, and through
 * a `pg` pool in the integration tests. See
 * docs/decisions/0002-audit-failure-policy.md.
 */
import { randomUUID } from "node:crypto";
import {
  assertNoSensitiveValues,
  hashEvent,
  type AuditEvent,
  type AuditEventDraft,
} from "./types.js";

/**
 * What a caller supplies. The store owns identity (`id`), ordering
 * (`sequence`) and chaining (`prevEventId`, `prevHash`, `hash`) — a caller can
 * never choose them, which is what makes the chain trustworthy.
 */
export type AuditAppendInput = Omit<
  AuditEventDraft,
  "id" | "sequence" | "prevEventId" | "prevHash"
>;

export interface AuditQuery {
  patientId?: string;
  actorId?: string;
  action?: string;
  limit: number;
  offset: number;
}

export interface AuditPage {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

/** What the rest of the application is allowed to do to the audit log. */
export interface AuditStore {
  readonly kind: "memory" | "postgres";
  /** Append one event, chained to the current tail. Never updates anything. */
  append(draft: AuditAppendInput): Promise<AuditEvent>;
  list(query: AuditQuery): Promise<AuditPage>;
  /** Whole chain in sequence order — used by the integrity verifier. */
  chain(): Promise<AuditEvent[]>;
  /** Cheap liveness probe for the readiness endpoint. */
  ping(): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────────
// Memory store
// ───────────────────────────────────────────────────────────────────────────

export class MemoryAuditStore implements AuditStore {
  readonly kind = "memory" as const;
  private events: AuditEvent[] = [];
  /** Serializes appends so concurrent callers cannot share a predecessor. */
  private tail: Promise<unknown> = Promise.resolve();

  async append(draft: AuditAppendInput): Promise<AuditEvent> {
    const run = this.tail.then(() => {
      assertNoSensitiveValues(draft);
      const previous = this.events.at(-1) ?? null;
      const full: AuditEventDraft = {
        ...draft,
        id: randomUUID(),
        sequence: (previous?.sequence ?? 0) + 1,
        prevEventId: previous?.id ?? null,
        prevHash: previous?.hash ?? null,
      };
      const event: AuditEvent = { ...full, hash: hashEvent(full) };
      this.events.push(event);
      return event;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    const filtered = this.events
      .filter(
        (event) =>
          (!query.patientId || event.patientId === query.patientId) &&
          (!query.actorId || event.actorId === query.actorId) &&
          (!query.action || event.action === query.action),
      )
      .slice()
      .reverse();
    return {
      events: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async chain(): Promise<AuditEvent[]> {
    return this.events.slice();
  }

  async ping(): Promise<void> {
    /* always available */
  }

  /** Tests only. There is no production path that empties the audit log. */
  reset(): void {
    this.events = [];
    this.tail = Promise.resolve();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Postgres store
// ───────────────────────────────────────────────────────────────────────────

/** Minimal parameterized-SQL seam. Implemented by Prisma and by `pg`. */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run `fn` inside a single transaction/connection. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** Advisory-lock key for the audit chain (arbitrary but stable). */
const AUDIT_CHAIN_LOCK = 8_140_255_001;

const SELECT_COLUMNS = `
  id,
  sequence,
  actor_ref        AS "actorId",
  actor_name       AS "actorName",
  actor_role_ref   AS "actorRole",
  org_ref          AS "organizationId",
  patient_ref      AS "patientId",
  action,
  resource_type    AS "resourceType",
  resource_id      AS "resourceId",
  purpose,
  authorization_id AS "authorizationId",
  request_id       AS "requestId",
  status,
  source_ip        AS "sourceIp",
  device_class     AS "deviceClass",
  prev_event_id    AS "prevEventId",
  prev_hash        AS "prevHash",
  hash,
  ts
`;

interface AuditRow {
  id: string;
  sequence: string | number | bigint;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  organizationId: string | null;
  patientId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: string | null;
  authorizationId: string | null;
  requestId: string | null;
  status: string;
  sourceIp: string | null;
  deviceClass: string | null;
  prevEventId: string | null;
  prevHash: string | null;
  hash: string;
  ts: Date | string;
}

function rowToEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    sequence: Number(row.sequence),
    actorId: row.actorId,
    actorName: row.actorName,
    actorRole: row.actorRole,
    organizationId: row.organizationId,
    patientId: row.patientId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    purpose: row.purpose,
    authorizationId: row.authorizationId,
    requestId: row.requestId,
    status: row.status === "blocked" ? "blocked" : "success",
    sourceIp: row.sourceIp,
    deviceClass: row.deviceClass,
    prevEventId: row.prevEventId,
    prevHash: row.prevHash,
    hash: row.hash,
    timestamp: (row.ts instanceof Date ? row.ts : new Date(row.ts)).toISOString(),
  };
}

export class PostgresAuditStore implements AuditStore {
  readonly kind = "postgres" as const;

  constructor(private readonly sql: SqlExecutor) {}

  /**
   * Append one event.
   *
   * Atomicity + ordering: the whole read-tail → hash → insert runs in ONE
   * transaction guarded by a transaction-scoped advisory lock, so concurrent
   * writers queue instead of forking the chain. The row is written with the
   * hash already computed, so a partially-chained row can never be committed.
   */
  async append(draft: AuditAppendInput): Promise<AuditEvent> {
    assertNoSensitiveValues(draft);
    return this.sql.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_CHAIN_LOCK]);
      const [previous] = await tx.query<{ id: string; hash: string; sequence: string }>(
        `SELECT id, hash, sequence FROM audit_events ORDER BY sequence DESC LIMIT 1`,
      );

      const id = randomUUID();
      // `sequence` is a bigserial; we read the value the sequence generator
      // will assign so the hash covers the same number the row is stored with.
      const nextvalRows = await tx.query<{ nextval: string }>(
        `SELECT nextval(pg_get_serial_sequence('audit_events', 'sequence')) AS nextval`,
      );
      const nextval = nextvalRows[0]?.nextval;
      if (nextval === undefined) throw new Error("audit sequence generator returned no value");

      const full: AuditEventDraft = {
        ...draft,
        id,
        sequence: Number(nextval),
        prevEventId: previous?.id ?? null,
        prevHash: previous?.hash ?? null,
      };
      const hash = hashEvent(full);

      await tx.query(
        `INSERT INTO audit_events (
           id, sequence, actor_ref, actor_name, actor_role_ref, org_ref, patient_ref,
           action, resource_type, resource_id, purpose, authorization_id, request_id,
           status, source_ip, device_class, prev_event_id, prev_hash, hash, ts
         ) VALUES (
           $1::uuid, $2::bigint, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12::uuid, $13,
           $14::"AuditStatus", $15, $16, $17::uuid, $18, $19, $20::timestamptz
         )`,
        [
          full.id,
          full.sequence,
          full.actorId,
          full.actorName,
          full.actorRole,
          full.organizationId,
          full.patientId,
          full.action,
          full.resourceType,
          full.resourceId,
          full.purpose,
          full.authorizationId,
          full.requestId,
          full.status,
          full.sourceIp,
          full.deviceClass,
          full.prevEventId,
          full.prevHash,
          hash,
          full.timestamp,
        ],
      );

      return { ...full, hash };
    });
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.patientId) {
      params.push(query.patientId);
      where.push(`patient_ref = $${params.length}`);
    }
    if (query.actorId) {
      params.push(query.actorId);
      where.push(`actor_ref = $${params.length}`);
    }
    if (query.action) {
      params.push(query.action);
      where.push(`action = $${params.length}`);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await this.sql.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events ${clause}`,
      params,
    );
    const count = countRows[0]?.count ?? "0";

    const rows = await this.sql.query<AuditRow>(
      `SELECT ${SELECT_COLUMNS} FROM audit_events ${clause}
       ORDER BY sequence DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.limit, query.offset],
    );

    return {
      events: rows.map(rowToEvent),
      total: Number(count),
      limit: query.limit,
      offset: query.offset,
    };
  }

  async chain(): Promise<AuditEvent[]> {
    const rows = await this.sql.query<AuditRow>(
      `SELECT ${SELECT_COLUMNS} FROM audit_events ORDER BY sequence ASC`,
    );
    return rows.map(rowToEvent);
  }

  async ping(): Promise<void> {
    await this.sql.query("SELECT 1");
  }
}
