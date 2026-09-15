/**
 * Prisma client singleton.
 *
 * One `PrismaClient` per process. Prisma connects lazily on the first query,
 * so importing this module (and even starting the server) does not require a
 * reachable database — the liveness probe stays dependency-free.
 *
 * ## Why construction is guarded
 *
 * `prisma generate` must fetch platform-specific engine binaries, which is not
 * possible in every environment (see
 * docs/engineering/backend-phase2-database-log.md). When the generated client
 * is missing or un-initialised, constructing it throws at import time and takes
 * the whole process down — including the routes that need no database at all.
 *
 * So construction is wrapped, and `prismaAvailable()` reports the outcome.
 * Callers that need a database (the Postgres audit store) fall back to a direct
 * `pg` pool, which runs the same parameterized SQL. Nothing silently pretends a
 * database is present: `GET /health/ready` still fails if it is not.
 *
 * Run `npm run prisma:generate` after `npm install`, and `npm run db:migrate`
 * against a running Postgres (see docker-compose.yml).
 */

// @ts-ignore — @prisma/client has no exported member until `prisma generate` succeeds
import { PrismaClient } from "@prisma/client";

type AnyPrisma = {
  $queryRawUnsafe?: unknown;
  $disconnect?: () => Promise<void>;
};

function createClient(): AnyPrisma {
  try {
    return new (PrismaClient as unknown as new () => AnyPrisma)();
  } catch (error) {
    // Logged once, at import, so the reason is visible in the boot output
    // rather than surfacing later as a confusing query failure.
    console.warn(
      "[prisma] generated client unavailable — database-backed features will use the direct pg driver.",
      (error as Error).message,
    );
    return { $disconnect: async () => {} };
  }
}

export const prisma = createClient();

/** True when the generated client can actually issue queries. */
export function prismaAvailable(): boolean {
  return typeof prisma.$queryRawUnsafe === "function";
}
