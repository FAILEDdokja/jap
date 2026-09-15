/**
 * `SqlExecutor` adapters.
 *
 * `prismaExecutor` is the production path: it runs the audit chain SQL through
 * the existing Prisma client so the application keeps one connection pool and
 * one migration story. Every statement is **parameterized** — the SQL text is
 * a constant in `store.ts` and values travel as bind parameters, so there is
 * no interpolation and no injection surface (docs/backend/09 §4, Injection).
 *
 * `pgExecutor` wraps a `pg` Pool. It exists for tests and for any future
 * deployment that wants the audit writer on its own connection, and keeps the
 * store honest: the same SQL is exercised by both.
 */
import type { SqlExecutor } from "./store.js";

/** Structural type for the bits of PrismaClient we use — avoids a hard import. */
interface PrismaLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
}

function prismaExecutorFor(client: PrismaLike): SqlExecutor {
  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await client.$queryRawUnsafe<T[]>(text, ...params);
      return Array.isArray(rows) ? rows : [];
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      return client.$transaction(async (tx) => fn(prismaExecutorFor(tx)));
    },
  };
}

export function prismaExecutor(client: unknown): SqlExecutor {
  return prismaExecutorFor(client as PrismaLike);
}

/** Structural type for a `pg` Pool / PoolClient. */
interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
interface PgPoolLike extends PgQueryable {
  connect(): Promise<PgQueryable & { release(): void }>;
}

export function pgExecutor(pool: PgPoolLike): SqlExecutor {
  const wrap = (client: PgQueryable): SqlExecutor => ({
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      // Nested transaction: reuse the current connection (already in one).
      return fn(wrap(client));
    },
  });

  return {
    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(text, params);
      return result.rows as T[];
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await fn(wrap(client));
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* the connection is already broken — the original error matters more */
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
