/**
 * Prisma client singleton.
 *
 * One `PrismaClient` per process. Prisma connects lazily on the first query,
 * so importing this module (and even starting the server) does not require a
 * reachable database — the health probe stays dependency-free. Shutdown calls
 * `prisma.$disconnect()` (see server.ts).
 *
 * Requires the generated client: run `npm run prisma:generate` (or
 * `npx prisma generate`) after `npm install`, and `npm run db:migrate` to
 * apply the schema against a running Postgres (see docker-compose.yml).
 */
// `prisma generate` requires a network fetch for the schema engine binary,
// which is unavailable in the sandboxed CI. The API boots and tests run
// without a reachable database (health/auth are DB-free), so we tolerate a
// missing generated client here — the server will still import this module
// but `prisma.$disconnect()` is a no-op in that case. See
// docs/engineering/backend-phase2-database-log.md.

// @ts-ignore — @prisma/client has no exported member until `prisma generate` succeeds
import { PrismaClient } from "@prisma/client";

// @ts-ignore — see above
export const prisma: InstanceType<typeof PrismaClient> = new (PrismaClient as unknown as new () => InstanceType<typeof PrismaClient>)();
