import app from "./app";
import { logger } from "./lib/logger";
import { initVapid, isPushConfigured } from "./lib/push.js";
import { startScheduler, stopScheduler } from "./lib/scheduler.js";
import { initTokenSigningSecret } from "./lib/token-secret.js";
import { bootstrapContratadaDefaults } from "./lib/config.js";
import { seedPerguntasIfEmpty } from "./lib/perguntas-seed.js";
import { backfillTrilha } from "./lib/trilha.js";
import { backfillAcaoChecklistToTarefas } from "./lib/tarefa-backfill.js";
import { normalizeLegacyFaturaStatuses } from "./lib/faturas-status.js";
import { backfillRiskStatuses } from "./lib/risk-lifecycle.js";

if (!process.env.SUPER_ADMIN_SECRET || process.env.SUPER_ADMIN_SECRET.length === 0) {
  throw new Error(
    [
      "SUPER_ADMIN_SECRET is required but is not set (or is empty).",
      "",
      "What it is: the shared password used to log in as the platform Super Admin.",
      "",
      "How to fix:",
      "  1. Generate a strong random value (32+ chars). For example:",
      "       node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
      "  2. In the Replit Deployments panel, open Secrets and add SUPER_ADMIN_SECRET with that value.",
      "  3. (Optional but recommended) Also set TOKEN_SIGNING_SECRET to a *different* random value of the",
      "     same strength. If you skip TOKEN_SIGNING_SECRET, the server will bootstrap one automatically",
      "     into the database on first boot — but it must NOT equal SUPER_ADMIN_SECRET.",
      "  4. Re-deploy.",
    ].join("\n"),
  );
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
      [
        "Fatal: failed to initialize token signing secret — exiting so the process is restarted.",
        "",
        "The server tried to load TOKEN_SIGNING_SECRET from the environment and, when that was unset",
        "or matched SUPER_ADMIN_SECRET, fell back to bootstrapping a value into the server_config table.",
        "Both paths failed — most commonly because the database is unreachable.",
        "",
        "To unblock the deploy without depending on the DB, set TOKEN_SIGNING_SECRET in the Deployments",
        "Secrets panel to a strong random value (32+ chars) that is DIFFERENT from SUPER_ADMIN_SECRET.",
        "Generate one with:",
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
      ].join("\n"),
    );
    process.exit(1);
  }

  // Bootstrap default Contratada (BLU SOLLUTTIONS) values into server_config
  // so a brand-new database renders LGPD documents coherently from day one.
  // Idempotent (ON CONFLICT DO NOTHING) — operator overrides are preserved.
  await bootstrapContratadaDefaults().catch((e) =>
    logger.error({ err: e }, "Failed to bootstrap contratada defaults — admin will need to fill them manually"),
  );

  // Seed the diagnostic question bank (8 ICS pilares, ~93 perguntas) on a
  // fresh database. Idempotent — existing rows are kept untouched so a
  // super-admin can edit/import perguntas via the CRUD endpoints without
  // having edits overwritten on next boot.
  await seedPerguntasIfEmpty().catch((e) =>
    logger.error({ err: e }, "Failed to seed perguntas — diagnostic page will start empty"),
  );

  // Reconcile Trilha de Implementação rows for every clinic: materialize
  // missing stages, auto-conclude the data-detectable ones, reopen any whose
  // signal lapsed, and recompute clinics.etapa/progresso so cards reflect the
  // trilha-derived model. Runs BEFORE app.listen so it cannot race the GET
  // reconciler. Idempotent (writes only on a real transition) and non-fatal.
  await backfillTrilha()
    .then((n) => {
      if (n > 0) logger.info({ clinics: n }, "Trilha reconciled clinics");
    })
    .catch((e) =>
      logger.error({ err: e }, "Failed to backfill trilha — stages will materialize lazily on first GET"),
    );

  // Migrate legacy action checklist items into `acao_tarefas` (Fase 3). The
  // original checklist rows are preserved; this only fills tarefas that don't
  // exist yet (idempotent via origem_checklist_id). Non-fatal.
  await backfillAcaoChecklistToTarefas()
    .then((n) => {
      if (n > 0) logger.info({ tarefas: n }, "Migrated checklist items into acao_tarefas");
    })
    .catch((e) =>
      logger.error({ err: e }, "Failed to backfill checklist→tarefas"),
    );

  // Normalize any legacy fatura statuses (pendente/pago/atrasado/cancelado) to
  // the canonical Central Comercial vocabulary. Idempotent and non-fatal.
  await normalizeLegacyFaturaStatuses()
    .then((n) => {
      if (n > 0) logger.info({ faturas: n }, "Normalized legacy fatura statuses");
    })
    .catch((e) =>
      logger.error({ err: e }, "Failed to normalize legacy fatura statuses"),
    );

  // Re-derive every board-linked risk's status from the Kanban (source of
  // truth). Heals rows that predate the board-driven "aceito" status — e.g. a
  // risk whose only card sits in `backlog` that was stuck on legacy
  // "identificado". Idempotent and non-fatal.
  await backfillRiskStatuses()
    .then((n) => {
      if (n > 0) logger.info({ risks: n }, "Backfilled board-driven risk statuses");
    })
    .catch((e) =>
      logger.error({ err: e }, "Failed to backfill board-driven risk statuses"),
    );

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
