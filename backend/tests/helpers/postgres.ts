/**
 * Real PostgreSQL for the audit integration suite.
 *
 * Phase 4 requires evidence — not assertions against a mock — that the audit
 * table really is append-only, that the hash chain survives a process restart,
 * and that concurrent writers cannot fork the chain. Those are all properties
 * of PostgreSQL + the migration, so the test must run against PostgreSQL.
 *
 * Strategy:
 *   - if `TEST_DATABASE_URL` is set, use that server (CI service container)
 *   - otherwise start `embedded-postgres`, a real postgres binary, on a
 *     scratch directory
 *   - if neither is possible, the suite SKIPS loudly rather than passing
 *     silently (`describe.skipIf`), so a green run never implies coverage that
 *     did not execute
 *
 * The schema is applied by executing the repository's own migration SQL, so
 * the tests exercise the migrations rather than a hand-written test schema.
 * `prisma migrate` cannot run here (the Prisma engine binaries are not
 * downloadable in the sandbox — see docs/engineering/backend-phase2-database-log.md),
 * so the files are applied in order with `pg`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "..", "prisma", "migrations");

export interface TestDatabase {
  pool: Pool;
  url: string;
  /** Re-open a fresh pool — used to prove persistence across a "restart". */
  reconnect(): Promise<Pool>;
  stop(): Promise<void>;
}

/** Statements in the init migration that need the pgcrypto extension present. */
const PRELUDE = `CREATE EXTENSION IF NOT EXISTS pgcrypto;`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => /^\d/.test(entry))
    .sort()
    .map((entry) => join(MIGRATIONS_DIR, entry, "migration.sql"));
}

export async function applyMigrations(pool: Pool): Promise<void> {
  const check = await pool.query("SELECT to_regclass('audit_events') AS exists;");
  if (check.rows[0]?.exists) {
    return;
  }
  await pool.query(PRELUDE);
  for (const file of migrationFiles()) {
    const sql = readFileSync(file, "utf8");
    await pool.query(sql);
  }
}

/**
 * Start (or connect to) a PostgreSQL suitable for the integration suite.
 * Returns null when no database is available, so callers can skip.
 */
export async function startTestDatabase(): Promise<TestDatabase | null> {
  const external = process.env.TEST_DATABASE_URL;

  if (external) {
    let pool = new Pool({ connectionString: external });
    try {
      await pool.query("SELECT 1");
    } catch {
      await pool.end().catch(() => undefined);
      return null;
    }
    return {
      pool,
      url: external,
      async reconnect() {
        await pool.end();
        pool = new Pool({ connectionString: external });
        this.pool = pool;
        return pool;
      },
      async stop() {
        await pool.end().catch(() => undefined);
      },
    };
  }

  let embedded: { start(): Promise<void>; stop(): Promise<void>; initialise(): Promise<void>; createDatabase(name: string): Promise<void> };
  try {
    const module = await import("embedded-postgres");
    const EmbeddedPostgres = (module.default ?? module) as new (options: unknown) => typeof embedded;
    const port = 55_400 + Math.floor(Math.random() * 120);
    embedded = new EmbeddedPostgres({
      databaseDir: `/tmp/jap-audit-pg-${port}`,
      user: "postgres",
      password: "postgres",
      port,
      persistent: false,
      // The server's own log lines are noise in test output; failures surface
      // through the driver's errors, which are what the assertions read.
      onLog: () => {},
      onError: () => {},
    });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase("jap_test");

    const url = `postgresql://postgres:postgres@127.0.0.1:${port}/jap_test`;
    let pool = new Pool({ connectionString: url });
    await pool.query("SELECT 1");

    return {
      pool,
      url,
      async reconnect() {
        await pool.end();
        pool = new Pool({ connectionString: url });
        this.pool = pool;
        return pool;
      },
      async stop() {
        await pool.end().catch(() => undefined);
        await embedded.stop().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}
