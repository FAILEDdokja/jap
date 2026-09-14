/**
 * Server bootstrap.
 *
 * Builds the app, binds the listener, and wires graceful shutdown so in-flight
 * requests drain on SIGINT/SIGTERM before the process exits.
 */
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

async function main(): Promise<void> {
  const app = await buildApp();

  // The client is null when `prisma generate` has not run (it needs network
  // access for the engine binaries). Every route served today is DB-free, so
  // the API boots and answers normally — say so once, loudly, and carry on.
  if (!prisma) {
    app.log.warn(
      "Prisma client unavailable — running without the data layer. Run `npm run prisma:generate` (see src/lib/prisma.ts).",
    );
  }

  try {
    await app.listen({ port: app.env.PORT, host: app.env.HOST });
  } catch (err) {
    app.log.fatal(err, "failed to start server");
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "shutting down gracefully");
    try {
      await prisma?.$disconnect();
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    app.log.fatal({ err: reason }, "unhandled rejection");
    void shutdown("unhandledRejection");
  });
}

void main();
