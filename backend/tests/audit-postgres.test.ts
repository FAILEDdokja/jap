/**
 * Phase 4.2 — persistent audit, against a REAL PostgreSQL.
 *
 * Everything here is a property of the database + the migration, so a mock
 * would prove nothing:
 *
 *   - events survive a process restart (new pool, new store instance)
 *   - UPDATE and DELETE are refused by the database itself
 *   - the hash chain links, and verification detects tampering
 *   - sequences are monotonic with no gaps
 *   - concurrent writers cannot fork the chain
 *   - no credential / ABHA value can be written
 *
 * If no PostgreSQL is reachable the suite SKIPS loudly instead of passing.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresAuditStore } from "../src/modules/audit/store.js";
import { pgExecutor } from "../src/modules/audit/sql.js";
import { verifyAuditChain } from "../src/modules/audit/verify.js";
import { SensitiveAuditValueError } from "../src/modules/audit/types.js";
import { applyMigrations, startTestDatabase, type TestDatabase } from "./helpers/postgres.js";

// Started at module load, not in `beforeAll`: vitest evaluates `describe.skipIf`
// during collection, which happens before any hook runs.
const db: TestDatabase | null = await startTestDatabase();
if (db) await applyMigrations(db.pool);

afterAll(async () => {
  await db?.stop();
});

const hasDb = db !== null;

function draft(overrides: Record<string, unknown> = {}) {
  return {
    actorId: "u-aroha",
    actorName: "Dr. Aroha Deshpande",
    actorRole: "DOCTOR",
    organizationId: "org-nmc",
    patientId: "p-001",
    action: "VIEW_RECORD",
    resourceType: "PATIENT",
    resourceId: "p-001",
    purpose: "TREATMENT",
    authorizationId: null,
    requestId: "req-1",
    status: "success" as const,
    sourceIp: "203.0.113.0/24",
    deviceClass: "desktop",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe.skipIf(!hasDb)("Phase 4.2 — persistent audit (PostgreSQL)", () => {
  beforeEach(async () => {
    // The append-only triggers block DELETE, so the fixture resets by
    // TRUNCATE (a DDL-level operation the trigger does not see) — which is
    // itself proof that row deletion is the thing being blocked.
    await db!.pool.query('TRUNCATE TABLE "audit_events" RESTART IDENTITY CASCADE');
  });

  it("persists events and reads them back after a reconnect (process restart)", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const written = await store.append(draft({ action: "LOGIN", resourceType: "SESSION" }));
    expect(written.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(written.sequence).toBe(1);

    // Drop the pool and open a new one: nothing survives in process memory.
    const pool = await db!.reconnect();
    const afterRestart = new PostgresAuditStore(pgExecutor(pool));
    const page = await afterRestart.list({ limit: 50, offset: 0 });

    expect(page.total).toBe(1);
    expect(page.events[0]).toMatchObject({
      id: written.id,
      action: "LOGIN",
      hash: written.hash,
      sequence: 1,
    });
  });

  it("chains events: prevEventId, prevHash and a monotonic sequence", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const first = await store.append(draft({ action: "LOGIN", resourceType: "SESSION" }));
    const second = await store.append(draft({ action: "VIEW_RECORD" }));
    const third = await store.append(draft({ action: "CREATE_RECORD" }));

    expect(first.prevEventId).toBeNull();
    expect(first.prevHash).toBeNull();
    expect(second.prevEventId).toBe(first.id);
    expect(second.prevHash).toBe(first.hash);
    expect(third.prevEventId).toBe(second.id);
    expect(third.prevHash).toBe(second.hash);
    expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 3]);

    const report = verifyAuditChain(await store.chain());
    expect(report).toMatchObject({ ok: true, checked: 3, firstSequence: 1, lastSequence: 3 });
  });

  it("refuses UPDATE at the database level (append-only)", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const event = await store.append(draft());

    await expect(
      db!.pool.query(`UPDATE audit_events SET action = 'TAMPERED' WHERE id = $1`, [event.id]),
    ).rejects.toThrow(/append-only/i);

    const [row] = (await db!.pool.query(`SELECT action FROM audit_events WHERE id = $1`, [event.id])).rows;
    expect(row.action).toBe("VIEW_RECORD");
  });

  it("refuses DELETE at the database level (append-only)", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const event = await store.append(draft());

    await expect(
      db!.pool.query(`DELETE FROM audit_events WHERE id = $1`, [event.id]),
    ).rejects.toThrow(/append-only/i);

    const { rows } = await db!.pool.query(`SELECT count(*)::int AS n FROM audit_events`);
    expect(rows[0].n).toBe(1);
  });

  it("exposes no update or delete method on the store API", () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    expect((store as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((store as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect(Object.keys(Object.getPrototypeOf(store) as object).concat(
      Object.getOwnPropertyNames(Object.getPrototypeOf(store) as object),
    )).toEqual(expect.not.arrayContaining(["update", "remove", "delete"]));
  });

  it("detects a tampered event (hash mismatch) even though the row was changed out of band", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    await store.append(draft({ action: "LOGIN", resourceType: "SESSION" }));
    const target = await store.append(draft({ action: "VIEW_RECORD" }));
    await store.append(draft({ action: "CREATE_RECORD" }));

    // Simulate an attacker with direct DB access who disables the guard.
    await db!.pool.query('ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_no_update"');
    await db!.pool.query(`UPDATE audit_events SET action = 'ACCESS_ALLOWED' WHERE id = $1`, [target.id]);
    await db!.pool.query('ALTER TABLE "audit_events" ENABLE TRIGGER "audit_events_no_update"');

    const report = verifyAuditChain(await store.chain());
    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.kind)).toContain("hash_mismatch");
    expect(report.issues.some((issue) => issue.eventId === target.id)).toBe(true);
  });

  it("detects a removed event as a sequence gap and a broken link", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    await store.append(draft({ action: "LOGIN", resourceType: "SESSION" }));
    const middle = await store.append(draft({ action: "VIEW_RECORD" }));
    await store.append(draft({ action: "CREATE_RECORD" }));

    await db!.pool.query('ALTER TABLE "audit_events" DISABLE TRIGGER "audit_events_no_delete"');
    // The successor references the row being removed, so drop the link first.
    await db!.pool.query('ALTER TABLE "audit_events" DISABLE TRIGGER ALL');
    await db!.pool.query(`DELETE FROM audit_events WHERE id = $1`, [middle.id]);
    await db!.pool.query('ALTER TABLE "audit_events" ENABLE TRIGGER ALL');

    const report = verifyAuditChain(await store.chain());
    expect(report.ok).toBe(false);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).toContain("sequence_gap");
    expect(kinds).toContain("broken_link");
  });

  it("keeps the chain intact under concurrent writers", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const CONCURRENCY = 25;

    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        store.append(draft({ action: "VIEW_RECORD", resourceId: `p-${i}`, requestId: `req-${i}` })),
      ),
    );

    const chain = await store.chain();
    expect(chain).toHaveLength(CONCURRENCY);
    expect(chain.map((event) => event.sequence)).toEqual(
      Array.from({ length: CONCURRENCY }, (_, i) => i + 1),
    );
    // No two events share a predecessor — the chain did not fork.
    const predecessors = chain.slice(1).map((event) => event.prevEventId);
    expect(new Set(predecessors).size).toBe(CONCURRENCY - 1);
    expect(verifyAuditChain(chain).ok).toBe(true);
  });

  it("refuses to persist a credential or a full ABHA value", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));

    await expect(store.append(draft({ resourceId: "12-3456-7891-2345" }))).rejects.toBeInstanceOf(
      SensitiveAuditValueError,
    );
    await expect(store.append(draft({ resourceId: "amit@abdm" }))).rejects.toBeInstanceOf(
      SensitiveAuditValueError,
    );
    await expect(store.append(draft({ purpose: "otp 483920" }))).rejects.toBeInstanceOf(
      SensitiveAuditValueError,
    );

    const { rows } = await db!.pool.query(`SELECT count(*)::int AS n FROM audit_events`);
    expect(rows[0].n).toBe(0);
  });

  it("stores only truncated network provenance, never a full client IP", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    await store.append(draft({ sourceIp: "203.0.113.0/24" }));
    const { rows } = await db!.pool.query(`SELECT source_ip, device_class FROM audit_events`);
    expect(rows[0].source_ip).toBe("203.0.113.0/24");
    expect(rows[0].source_ip).not.toMatch(/\d+\.\d+\.\d+\.[1-9]\d*$/);
    expect(rows[0].device_class).toBe("desktop");
  });

  it("rejects a row whose hash is not a sha-256 digest (schema constraint)", async () => {
    await expect(
      db!.pool.query(
        `INSERT INTO audit_events (id, actor_ref, action, resource_type, status, hash)
         VALUES (gen_random_uuid(), 'u-x', 'LOGIN', 'SESSION', 'success', 'not-a-hash')`,
      ),
    ).rejects.toThrow(/audit_events_hash_format/);
  });

  it("rejects a half-linked row (prev_event_id without prev_hash)", async () => {
    const store = new PostgresAuditStore(pgExecutor(db!.pool));
    const first = await store.append(draft());
    await expect(
      db!.pool.query(
        `INSERT INTO audit_events (id, actor_ref, action, resource_type, status, hash, prev_event_id)
         VALUES (gen_random_uuid(), 'u-x', 'LOGIN', 'SESSION', 'success', repeat('a', 64), $1)`,
        [first.id],
      ),
    ).rejects.toThrow(/audit_events_prev_link_consistent/);
  });
});

describe.skipIf(hasDb)("Phase 4.2 — persistent audit (PostgreSQL)", () => {
  it("SKIPPED: no PostgreSQL available (set TEST_DATABASE_URL)", () => {
    // Deliberately visible: a green run must never imply this suite ran.
    expect(db).toBeNull();
  });
});
