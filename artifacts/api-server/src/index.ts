import app from "./app";
import { logger } from "./lib/logger";
import { initVapid, isPushConfigured } from "./lib/push.js";
import { startScheduler, stopScheduler } from "./lib/scheduler.js";
import { initTokenSigningSecret } from "./lib/token-secret.js";

if (!process.env.SUPER_ADMIN_SECRET) {
  throw new Error("SUPER_ADMIN_SECRET is required but not set. Configure it before starting the server.");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received, stopping scheduler");
  await stopScheduler().catch((e) => logger.error({ err: e }, "Error stopping scheduler"));
  process.exit(0);
}

process.on("SIGTERM", () => { shutdown("SIGTERM"); });
process.on("SIGINT", () => { shutdown("SIGINT"); });

async function main(): Promise<void> {
  // Bootstrap the JWT signing secret BEFORE accepting any HTTP traffic. If
  // this fails (e.g. DB unreachable) we exit and let the orchestrator restart
  // us — never serve requests with broken auth.
  try {
    await initTokenSigningSecret();
  } catch (e) {
    logger.error(
      { err: e },
      "Fatal: failed to initialize token signing secret — exiting so the process is restarted",
    );
    process.exit(1);
  }

  app.listen(port, async (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    await initVapid().catch((e) => logger.error({ err: e }, "VAPID init failed"));
    if (isPushConfigured()) {
      logger.info("VAPID push notifications initialized");
    } else {
      logger.warn("VAPID push notifications not configured — push will be disabled");
    }

    try {
      await startScheduler();
    } catch (e) {
      logger.error({ err: e }, "Job scheduler failed to start — scheduled digests will not run");
    }
  });
}

main().catch((e) => {
  logger.error({ err: e }, "Unhandled error during startup");
  process.exit(1);
});
