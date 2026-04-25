import { PgBoss } from "pg-boss";
import { logger } from "./logger.js";
import { runExpiryCheck } from "./expiry-check.js";

const EXPIRY_JOB_NAME = "expiry-digest";
const EXPIRY_CRON = "0 7 * * *";

let boss: PgBoss | null = null;

export async function startScheduler(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required for the job scheduler");
  }

  boss = new PgBoss({ connectionString });

  boss.on("error", (err: unknown) => {
    logger.error({ err }, "pg-boss error");
  });

  await boss.start();
  logger.info("Job scheduler started");

  await boss.createQueue(EXPIRY_JOB_NAME);

  await boss.work(EXPIRY_JOB_NAME, async () => {
    logger.info("Running scheduled expiry check");
    const result = await runExpiryCheck();
    logger.info(result, "Scheduled expiry check completed");
    return result;
  });

  await boss.schedule(EXPIRY_JOB_NAME, EXPIRY_CRON, {}, { tz: "America/Sao_Paulo" });
  logger.info({ cron: EXPIRY_CRON }, "Expiry digest job scheduled");
}

export async function stopScheduler(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    logger.info("Job scheduler stopped");
  }
}
