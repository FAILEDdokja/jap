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
      await prisma.$disconnect();
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
