import app from "./app";
import { logger } from "./lib/logger";
import { runExpiryCheck } from "./lib/expiry-check.js";
import { initVapid, isPushConfigured } from "./lib/push.js";

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

async function scheduledExpiryCheck(): Promise<void> {
  try {
    const { sent, skipped, total } = await runExpiryCheck();
    logger.info({ sent, skipped, total }, "Expiry check completed");
  } catch (err) {
    logger.error({ err }, "Expiry check failed");
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  setInterval(() => {
    scheduledExpiryCheck();
  }, MS_PER_DAY);
});
