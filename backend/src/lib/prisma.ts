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
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
