import app from "./app";
import { logger } from "./lib/logger";
import { initVapid, isPushConfigured } from "./lib/push.js";
import { startScheduler, stopScheduler } from "./lib/scheduler.js";

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
