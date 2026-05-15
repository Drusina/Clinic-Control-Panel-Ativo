import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHash } from "crypto";
import { and, eq, count, inArray } from "drizzle-orm";
import {
  db,
  delegacoesTable,
  perguntasTable,
  respostasTable,
  diagnosticsTable,
  clinicsTable,
} from "@workspace/db";
import { signToken, verifyToken, extractToken } from "../middleware/auth.js";
// NOTE: respondents intentionally do NOT trigger recalculateScores. That helper
// auto-promotes the diagnostic to status='concluido' when every question is
// answered, which would let the *last* respondent to finish their pilar
// inadvertently lock the whole diagnostic before the manager has reviewed it.
// Scores are recalculated on demand via the manager-side
// `POST /diagnostics/:id/calculate-scores` endpoint.

const router: IRouter = Router();

const RESPONDENT_TTL_SECONDS = 30 * 24 * 60 * 60;

interface RespondentClaims {
  role: "diagnostic_respondent";
  delegacaoId: string;
  clinicId: string;
  diagnosticoId: string;
  pilarSlug: string;
  email: string;
  nome?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      respondent?: RespondentClaims;
    }
  }
}

function requireRespondent(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Token de respondente ausente" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== "diagnostic_respondent") {
    res.status(401).json({ error: "Token de respondente inválido" });
    return;
  }
  const claims = payload as unknown as RespondentClaims;
  if (!claims.delegacaoId || !claims.diagnosticoId || !claims.pilarSlug) {
    res.status(401).json({ error: "Token de respondente incompleto" });
    return;
  }
  req.respondent = claims;
  next();
}

/**
 * Redeem an invite code emailed to a per-pillar respondent. Returns a session
 * token (role=diagnostic_respondent) scoped to the single delegação.
 *
 * Multi-use: the code is not invalidated on first redeem (only marked
 * `inviteRedeemedAt` once); the responder can come back via the email link
 * until `inviteCodeExpiresAt` passes.
 */
router.post("/auth/responder", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "code é obrigatório" });
    return;
  }
  const codeHash = createHash("sha256").update(code).digest("hex");

  const [deleg] = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.inviteCodeHash, codeHash))
    .limit(1);

  if (!deleg) {
    res.status(401).json({ error: "Link inválido ou expirado." });
    return;
  }
  if (!deleg.inviteCodeExpiresAt || deleg.inviteCodeExpiresAt < new Date()) {
    res.status(401).json({ error: "Link expirado. Solicite um novo ao gestor." });
    return;
  }
  if (!deleg.responsavelEmail) {
    res.status(400).json({ error: "Delegação sem e-mail de responsável." });
    return;
  }

  // The invite is bound to a specific diagnostic (`inviteDiagnosticoId`),
  // pinned at send time. Old invites do NOT redeem into newer cycles —
  // the manager must explicitly re-send to refresh the binding.
  if (!deleg.inviteDiagnosticoId) {
    res.status(409).json({ error: "Convite legado sem diagnóstico vinculado. Solicite um novo link." });
    return;
  }
  const [activeDiag] = await db
    .select()
    .from(diagnosticsTable)
    .where(
      and(
        eq(diagnosticsTable.id, deleg.inviteDiagnosticoId),
        eq(diagnosticsTable.clinicId, deleg.clinicId),
      ),
    )
    .limit(1);

  if (!activeDiag) {
    res.status(404).json({ error: "Diagnóstico vinculado ao convite não encontrado." });
    return;
  }

  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, deleg.clinicId))
    .limit(1);

  if (!deleg.inviteRedeemedAt) {
    await db
      .update(delegacoesTable)
      .set({ inviteRedeemedAt: new Date(), updatedAt: new Date() })
      .where(eq(delegacoesTable.id, deleg.id));
  }

  const token = signToken(
    {
      role: "diagnostic_respondent",
      delegacaoId: deleg.id,
      clinicId: deleg.clinicId,
      diagnosticoId: activeDiag.id,
      pilarSlug: deleg.pilarSlug,
      email: deleg.responsavelEmail,
      nome: deleg.responsavelNome ?? undefined,
    },
    RESPONDENT_TTL_SECONDS,
  );

  res.json({
    token,
    delegacaoId: deleg.id,
    clinicId: deleg.clinicId,
    clinicNome: clinic?.nome ?? null,
    diagnosticoId: activeDiag.id,
    diagnosticoStatus: activeDiag.status,
    pilarSlug: deleg.pilarSlug,
    pilarNome: deleg.pilarNome,
    responsavelNome: deleg.responsavelNome,
    responsavelEmail: deleg.responsavelEmail,
    prazo: deleg.prazo,
  });
});

router.get("/respondent/context", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const [diag] = await db
    .select({
      id: diagnosticsTable.id,
      status: diagnosticsTable.status,
      iniciadoEm: diagnosticsTable.iniciadoEm,
    })
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, r.diagnosticoId))
    .limit(1);
  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, r.clinicId))
    .limit(1);
  const [deleg] = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, r.delegacaoId))
    .limit(1);
  if (!diag || !deleg) {
    res.status(404).json({ error: "Contexto não encontrado" });
    return;
  }
  res.json({
    delegacaoId: deleg.id,
    clinicId: r.clinicId,
    clinicNome: clinic?.nome ?? null,
    diagnosticoId: diag.id,
    diagnosticoStatus: diag.status,
    pilarSlug: deleg.pilarSlug,
    pilarNome: deleg.pilarNome,
    responsavelNome: deleg.responsavelNome,
    responsavelEmail: deleg.responsavelEmail,
    prazo: deleg.prazo,
  });
});

router.get("/respondent/questions", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const perguntas = await db
    .select()
    .from(perguntasTable)
    .where(eq(perguntasTable.pilarSlug, r.pilarSlug))
    .orderBy(perguntasTable.ordem);
  res.json(
    perguntas.map((p) => ({
      id: p.id,
      pilarSlug: p.pilarSlug,
      pilarNome: p.pilarNome,
      pilarOrdem: p.pilarOrdem,
      texto: p.texto,
      tipo: p.tipo,
      peso: Number(p.peso),
      ordem: p.ordem,
      dica: p.dica,
      valorMin: p.valorMin != null ? Number(p.valorMin) : null,
      valorMax: p.valorMax != null ? Number(p.valorMax) : null,
      inverso: p.inverso,
    })),
  );
});

router.get("/respondent/respostas", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  // Only return answers for questions in this respondent's pilar.
  const rows = await db
    .select({
      id: respostasTable.id,
      perguntaId: respostasTable.perguntaId,
      valor: respostasTable.valor,
      respondidoEm: respostasTable.respondidoEm,
    })
    .from(respostasTable)
    .innerJoin(perguntasTable, eq(perguntasTable.id, respostasTable.perguntaId))
    .where(
      and(
        eq(respostasTable.diagnosticoId, r.diagnosticoId),
        eq(perguntasTable.pilarSlug, r.pilarSlug),
      ),
    );
  res.json(
    rows.map((row) => ({
      id: row.id,
      perguntaId: row.perguntaId,
      valor: row.valor,
      respondidoEm: row.respondidoEm.toISOString(),
    })),
  );
});

async function ensureDiagnosticOpen(diagnosticoId: string, res: Response): Promise<boolean> {
  const [d] = await db
    .select({ status: diagnosticsTable.status })
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, diagnosticoId))
    .limit(1);
  if (!d) {
    res.status(404).json({ error: "Diagnóstico não encontrado" });
    return false;
  }
  if (d.status === "concluido") {
    res.status(409).json({ error: "Diagnóstico concluído — respostas estão bloqueadas." });
    return false;
  }
  return true;
}

async function assertPerguntaInPilar(perguntaId: string, pilarSlug: string): Promise<boolean> {
  const [p] = await db
    .select({ pilarSlug: perguntasTable.pilarSlug })
    .from(perguntasTable)
    .where(eq(perguntasTable.id, perguntaId))
    .limit(1);
  return !!p && p.pilarSlug === pilarSlug;
}

router.put("/respondent/respostas/:perguntaId", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const perguntaId = Array.isArray(req.params.perguntaId) ? req.params.perguntaId[0] : req.params.perguntaId;
  const { valor } = req.body as { valor?: unknown };
  if (valor === undefined || valor === null) {
    res.status(400).json({ error: "valor é obrigatório" });
    return;
  }
  if (!(await assertPerguntaInPilar(perguntaId, r.pilarSlug))) {
    res.status(403).json({ error: "Pergunta fora do escopo do pilar do respondente" });
    return;
  }
  if (!(await ensureDiagnosticOpen(r.diagnosticoId, res))) return;

  const now = new Date();
  const [resposta] = await db
    .insert(respostasTable)
    .values({ diagnosticoId: r.diagnosticoId, perguntaId, valor: String(valor), respondidoEm: now })
    .onConflictDoUpdate({
      target: [respostasTable.diagnosticoId, respostasTable.perguntaId],
      set: { valor: String(valor), respondidoEm: now, updatedAt: now },
    })
    .returning();

  res.json({
    id: resposta.id,
    perguntaId: resposta.perguntaId,
    valor: resposta.valor,
    respondidoEm: resposta.respondidoEm.toISOString(),
  });
});

router.post("/respondent/respostas/batch", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const { respostas } = req.body as { respostas?: Array<{ perguntaId: string; valor: string }> };
  if (!Array.isArray(respostas) || respostas.length === 0) {
    res.status(400).json({ error: "respostas array é obrigatório" });
    return;
  }
  if (!(await ensureDiagnosticOpen(r.diagnosticoId, res))) return;

  // Validate ALL perguntas are in the respondent's pilar.
  const ids = respostas.map((x) => x.perguntaId);
  const found = await db
    .select({ id: perguntasTable.id, pilarSlug: perguntasTable.pilarSlug })
    .from(perguntasTable);
  const allowed = new Set(found.filter((p) => p.pilarSlug === r.pilarSlug).map((p) => p.id));
  for (const id of ids) {
    if (!allowed.has(id)) {
      res.status(403).json({ error: "Uma ou mais perguntas estão fora do escopo do pilar." });
      return;
    }
  }

  const now = new Date();
  const saved = await Promise.all(
    respostas.map(({ perguntaId, valor }) =>
      db
        .insert(respostasTable)
        .values({ diagnosticoId: r.diagnosticoId, perguntaId, valor: String(valor), respondidoEm: now })
        .onConflictDoUpdate({
          target: [respostasTable.diagnosticoId, respostasTable.perguntaId],
          set: { valor: String(valor), respondidoEm: now, updatedAt: now },
        })
        .returning(),
    ),
  );

  res.json(
    saved.flat().map((row) => ({
      id: row.id,
      perguntaId: row.perguntaId,
      valor: row.valor,
      respondidoEm: row.respondidoEm.toISOString(),
    })),
  );
});

router.get("/respondent/progress", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const [{ value: totalGlobal }] = await db.select({ value: count() }).from(perguntasTable);
  const [{ value: answeredGlobal }] = await db
    .select({ value: count() })
    .from(respostasTable)
    .where(eq(respostasTable.diagnosticoId, r.diagnosticoId));
  const [{ value: pilarTotal }] = await db
    .select({ value: count() })
    .from(perguntasTable)
    .where(eq(perguntasTable.pilarSlug, r.pilarSlug));
  const pilarAnsweredRows = await db
    .select({ id: respostasTable.id })
    .from(respostasTable)
    .innerJoin(perguntasTable, eq(perguntasTable.id, respostasTable.perguntaId))
    .where(
      and(
        eq(respostasTable.diagnosticoId, r.diagnosticoId),
        eq(perguntasTable.pilarSlug, r.pilarSlug),
      ),
    );
  res.json({
    totalGlobal,
    answeredGlobal,
    pilarTotal,
    pilarAnswered: pilarAnsweredRows.length,
  });
});

export default router;
