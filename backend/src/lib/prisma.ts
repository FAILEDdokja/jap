/**
 * Prisma client singleton.
 *
 * One `PrismaClient` per process. Prisma connects lazily on the first query,
 * so importing this module (and even starting the server) does not require a
 * reachable database — the health probe stays dependency-free. Shutdown calls
 * `prisma?.$disconnect()` (see server.ts).
 *
 * Constructing the client *does* require the generated client to be present:
 * `npm run prisma:generate` (or `npx prisma generate`) after `npm install`, and
 * `npm run db:migrate` to apply the schema against a running Postgres (see
 * docker-compose.yml).
 *
 * `prisma generate` downloads a query/schema engine binary, so it fails on a
 * machine without access to `binaries.prisma.sh` (the sandboxed CI is one). The
 * generated stub then throws on construction — `@prisma/client did not
 * initialize yet` — which used to take `npm run dev` down with it, even though
 * every runtime path in the API (health, auth, patients) is DB-free.
 *
 * So construction is tolerant and explicit about it:
 *
 *   - `prisma` is `null` when the generated client is unavailable. Booting,
 *     serving and testing continue to work; `server.ts` logs the reason.
 *   - code that genuinely needs the data layer calls `requirePrisma()`, which
 *     fails loudly with an actionable message instead of surfacing the stub's.
 *
 * This module deliberately imports no logger: it is on the boot path, and the
 * warning belongs to the server that owns the logging config.
 *
 * See docs/engineering/backend-phase2-database-log.md and
 * docs/engineering/backend-phase4-patients-log.md §2.
 */
// @ts-ignore — @prisma/client has no exported member until `prisma generate` succeeds
import { PrismaClient } from "@prisma/client";

// @ts-ignore — see above
export type PrismaClientLike = InstanceType<typeof PrismaClient>;

/** The generated stub's complaint, kept for `requirePrisma()` to surface. */
let constructionError: string | null = null;

function createClientOrNull(): PrismaClientLike | null {
  try {
    // @ts-ignore — see above
    return new (PrismaClient as unknown as new () => PrismaClientLike)();
  } catch (err) {
    constructionError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

/** The process-wide client, or `null` when it could not be constructed. */
export const prisma: PrismaClientLike | null = createClientOrNull();

/**
 * For code that needs the data layer. Throws a single, actionable message
 * rather than letting the ungenerated-client stub's error escape mid-request.
 */
export function requirePrisma(): PrismaClientLike {
  if (!prisma) {
    throw new Error(
      `Prisma client unavailable${constructionError ? ` (${constructionError})` : ""}. Run \`npm run prisma:generate\` — it downloads the engine binaries.`,
    );
  }
  return prisma;
}
