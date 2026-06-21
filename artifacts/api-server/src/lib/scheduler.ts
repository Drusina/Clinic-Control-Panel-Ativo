import { type JobWithMetadata, PgBoss } from "pg-boss";
import { logger } from "./logger.js";
import { runExpiryCheck } from "./expiry-check.js";
import { runReminderCheck } from "./reminder-check.js";
import { runTarefaDeadlineCheck } from "./tarefa-deadline-check.js";

const EXPIRY_JOB_NAME = "expiry-digest";
const EXPIRY_CRON = "0 7 * * *";
const REMINDER_JOB_NAME = "compromisso-reminder";
const REMINDER_CRON = "*/15 * * * *";
const TAREFA_DEADLINE_JOB_NAME = "acao-tarefa-deadline-reminder";
const TAREFA_DEADLINE_CRON = "0 8 * * *";
const RETRY_LIMIT = 3;
const RETRY_DELAY_SECONDS = 300;

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

  const queueOptions = {
    retryLimit: RETRY_LIMIT,
    retryDelay: RETRY_DELAY_SECONDS,
  };

  await boss.createQueue(EXPIRY_JOB_NAME, queueOptions);
  await boss.updateQueue(EXPIRY_JOB_NAME, queueOptions);

  const effectiveQueue = await boss.getQueue(EXPIRY_JOB_NAME);
  logger.info(
    {
      retryLimit: effectiveQueue?.retryLimit,
      retryDelay: effectiveQueue?.retryDelay,
    },
    "Expiry digest queue effective retry configuration"
  );

  await boss.work(
    EXPIRY_JOB_NAME,
    { includeMetadata: true },
    async (jobs: JobWithMetadata[]) => {
      const job = jobs[0];
      if (!job) return;

      const retryCount = job.retryCount;
      const retryLimit = job.retryLimit;
      const retryDelay = job.retryDelay;
      logger.info({ jobId: job.id, retryCount, retryLimit }, "Running scheduled expiry check");

      try {
        const result = await runExpiryCheck();
        logger.info({ jobId: job.id, retryCount, retryLimit, result }, "Scheduled expiry check completed");
        return result;
      } catch (err: unknown) {
        const isPermanentFailure = retryCount >= retryLimit;

        if (isPermanentFailure) {
          logger.error(
            { err, jobId: job.id, retryCount, retryLimit },
            "Expiry digest job permanently failed after all retries exhausted — no digest email will be sent today"
          );
        } else {
          logger.warn(
            { err, jobId: job.id, retryCount, retryLimit, retryDelaySecs: retryDelay },
            "Expiry digest job attempt failed; will retry"
          );
        }

        throw err;
      }
    }
  );

  await boss.schedule(EXPIRY_JOB_NAME, EXPIRY_CRON, {}, { tz: "America/Sao_Paulo" });
  logger.info({ cron: EXPIRY_CRON }, "Expiry digest job scheduled");

  await boss.createQueue(REMINDER_JOB_NAME, queueOptions);
  await boss.updateQueue(REMINDER_JOB_NAME, queueOptions);

  await boss.work(
    REMINDER_JOB_NAME,
    { includeMetadata: true },
    async (jobs: JobWithMetadata[]) => {
      const job = jobs[0];
      if (!job) return;

      const retryCount = job.retryCount;
      const retryLimit = job.retryLimit;
      logger.info({ jobId: job.id, retryCount, retryLimit }, "Running scheduled compromisso reminder check");

      try {
        const result = await runReminderCheck();
        logger.info({ jobId: job.id, retryCount, retryLimit, result }, "Scheduled compromisso reminder check completed");
        return result;
      } catch (err: unknown) {
        const isPermanentFailure = retryCount >= retryLimit;
        if (isPermanentFailure) {
          logger.error(
            { err, jobId: job.id, retryCount, retryLimit },
            "Compromisso reminder job permanently failed after all retries exhausted"
          );
        } else {
          logger.warn(
            { err, jobId: job.id, retryCount, retryLimit },
            "Compromisso reminder job attempt failed; will retry"
          );
        }
        throw err;
      }
    }
  );

  await boss.schedule(REMINDER_JOB_NAME, REMINDER_CRON, {}, { tz: "America/Sao_Paulo" });
  logger.info({ cron: REMINDER_CRON }, "Compromisso reminder job scheduled");

  await boss.createQueue(TAREFA_DEADLINE_JOB_NAME, queueOptions);
  await boss.updateQueue(TAREFA_DEADLINE_JOB_NAME, queueOptions);

  await boss.work(
    TAREFA_DEADLINE_JOB_NAME,
    { includeMetadata: true },
    async (jobs: JobWithMetadata[]) => {
      const job = jobs[0];
      if (!job) return;

      const retryCount = job.retryCount;
      const retryLimit = job.retryLimit;
      logger.info({ jobId: job.id, retryCount, retryLimit }, "Running scheduled tarefa deadline check");

      try {
        const result = await runTarefaDeadlineCheck();
        logger.info({ jobId: job.id, retryCount, retryLimit, result }, "Scheduled tarefa deadline check completed");
        return result;
      } catch (err: unknown) {
        const isPermanentFailure = retryCount >= retryLimit;
        if (isPermanentFailure) {
          logger.error(
            { err, jobId: job.id, retryCount, retryLimit },
            "Tarefa deadline job permanently failed after all retries exhausted"
          );
        } else {
          logger.warn(
            { err, jobId: job.id, retryCount, retryLimit },
            "Tarefa deadline job attempt failed; will retry"
          );
        }
        throw err;
      }
    }
  );

  await boss.schedule(TAREFA_DEADLINE_JOB_NAME, TAREFA_DEADLINE_CRON, {}, { tz: "America/Sao_Paulo" });
  logger.info({ cron: TAREFA_DEADLINE_CRON }, "Tarefa deadline job scheduled");
}

export async function stopScheduler(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
    logger.info("Job scheduler stopped");
  }
}
