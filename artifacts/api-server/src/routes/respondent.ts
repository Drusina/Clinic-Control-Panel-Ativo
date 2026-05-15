import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHash } from "crypto";
import { and, eq, count, inArray, sql } from "drizzle-orm";
import {
  db,
  delegacoesTable,
  delegacoesPerguntasTable,
  perguntasTable,
  respostasTable,
  diagnosticsTable,
  clinicsTable,
} from "@workspace/db";
import { signToken, verifyToken, extractToken, generateInviteCode } from "../middleware/auth.js";
import { sendEmail, buildRespondentInviteEmail, resolveAppUrl } from "../lib/email.js";
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
  // Quando presente, o respondente está restrito a este conjunto de perguntas
  // (delegação nível 3 — perguntas ad-hoc, possivelmente sub-delegada por outro
  // respondente). Quando ausente, o escopo é o pilar inteiro (N1).
  perguntaIds?: string[];
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

  // Cadeia indefinida: qualquer delegação que tenha linhas em
  // delegacoes_perguntas é tratada como question-scoped, independentemente do
  // nivel (3, 4, 5, …). Isso garante que sub-delegações profundas continuam
  // restringindo o escopo corretamente.
  const perguntaRows = await db
    .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
    .from(delegacoesPerguntasTable)
    .where(eq(delegacoesPerguntasTable.delegacaoId, deleg.id));
  const perguntaIds: string[] | undefined =
    perguntaRows.length > 0 ? perguntaRows.map((r) => r.perguntaId) : undefined;

  const token = signToken(
    {
      role: "diagnostic_respondent",
      delegacaoId: deleg.id,
      clinicId: deleg.clinicId,
      diagnosticoId: activeDiag.id,
      pilarSlug: deleg.pilarSlug,
      email: deleg.responsavelEmail,
      nome: deleg.responsavelNome ?? undefined,
      ...(perguntaIds && perguntaIds.length > 0 ? { perguntaIds } : {}),
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
    nivel: deleg.nivel,
    perguntaIds: r.perguntaIds ?? null,
  });
});

router.get("/respondent/questions", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  // Base set: pilar inteiro OU subset ad-hoc (N3).
  let baseIds: string[] | null = null;
  if (r.perguntaIds && r.perguntaIds.length > 0) {
    baseIds = r.perguntaIds;
  }
  // Excluir perguntas que ESTE respondente já delegou adiante (sub-delegações
  // criadas a partir da delegação dele, parentId === r.delegacaoId).
  const childDelegs = await db
    .select({ id: delegacoesTable.id })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.parentId, r.delegacaoId));
  let excluded: Set<string> = new Set();
  if (childDelegs.length > 0) {
    const childIds = childDelegs.map((d) => d.id);
    const childPerguntas = await db
      .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
      .from(delegacoesPerguntasTable)
      .where(sql`${delegacoesPerguntasTable.delegacaoId} = ANY(${childIds})`);
    excluded = new Set(childPerguntas.map((p) => p.perguntaId));
  }

  const perguntas = await db
    .select()
    .from(perguntasTable)
    .where(
      baseIds
        ? sql`${perguntasTable.id} = ANY(${baseIds})`
        : eq(perguntasTable.pilarSlug, r.pilarSlug),
    )
    .orderBy(perguntasTable.ordem);

  const filtered = perguntas.filter((p) => !excluded.has(p.id));
  res.json(
    filtered.map((p) => ({
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
  // Only return answers for questions in this respondent's allowed scope
  // (pillar minus questions delegated forward, or — for N3 tokens — only
  // the explicitly assigned perguntaIds).
  const allowed = await allowedPerguntaIds(r);
  if (allowed.size === 0) {
    res.json([]);
    return;
  }
  const rows = await db
    .select({
      id: respostasTable.id,
      perguntaId: respostasTable.perguntaId,
      valor: respostasTable.valor,
      respondidoEm: respostasTable.respondidoEm,
    })
    .from(respostasTable)
    .where(eq(respostasTable.diagnosticoId, r.diagnosticoId));
  res.json(
    rows
      .filter((row) => allowed.has(row.perguntaId))
      .map((row) => ({
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

/**
 * Returns the set of perguntaIds the current respondent is allowed to answer:
 * the explicit perguntaIds claim (N3) ∩ pilar OR the entire pilar (N1) MINUS
 * questions already sub-delegated forward by this respondent.
 */
async function allowedPerguntaIds(r: RespondentClaims): Promise<Set<string>> {
  let base: string[];
  if (r.perguntaIds && r.perguntaIds.length > 0) {
    base = r.perguntaIds;
  } else {
    const rows = await db
      .select({ id: perguntasTable.id })
      .from(perguntasTable)
      .where(eq(perguntasTable.pilarSlug, r.pilarSlug));
    base = rows.map((p) => p.id);
  }
  const childDelegs = await db
    .select({ id: delegacoesTable.id })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.parentId, r.delegacaoId));
  if (childDelegs.length === 0) return new Set(base);
  const childIds = childDelegs.map((d) => d.id);
  const child = await db
    .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
    .from(delegacoesPerguntasTable)
    .where(sql`${delegacoesPerguntasTable.delegacaoId} = ANY(${childIds})`);
  const excluded = new Set(child.map((c) => c.perguntaId));
  return new Set(base.filter((id) => !excluded.has(id)));
}

router.put("/respondent/respostas/:perguntaId", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const perguntaId = Array.isArray(req.params.perguntaId) ? req.params.perguntaId[0] : req.params.perguntaId;
  const { valor } = req.body as { valor?: unknown };
  if (valor === undefined || valor === null) {
    res.status(400).json({ error: "valor é obrigatório" });
    return;
  }
  // Para tokens N1 (pilar inteiro), reforça o filtro por pilar; para tokens
  // question-scoped (N3+), pulamos esse check — o escopo correto é
  // allowedPerguntaIds, e o pilarSlug pode ser "misto" em batches cross-pilar.
  if (!r.perguntaIds && !(await assertPerguntaInPilar(perguntaId, r.pilarSlug))) {
    res.status(403).json({ error: "Pergunta fora do escopo do pilar do respondente" });
    return;
  }
  const allowed = await allowedPerguntaIds(r);
  if (!allowed.has(perguntaId)) {
    res.status(403).json({ error: "Pergunta fora do escopo do respondente (delegada adiante ou não atribuída)." });
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

  // Validate ALL perguntas estão no escopo permitido (pilar OU subset ad-hoc),
  // descontando o que o respondente já delegou adiante.
  const ids = respostas.map((x) => x.perguntaId);
  const allowed = await allowedPerguntaIds(r);
  for (const id of ids) {
    if (!allowed.has(id)) {
      res.status(403).json({ error: "Uma ou mais perguntas estão fora do escopo do respondente." });
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

  // Escopo TOTAL do respondente = pilar inteiro (N1) ou perguntaIds explícitos (N3),
  // SEM remover o que ele já delegou — para a UI mostrar respondidas/delegadas/pendentes.
  let scopeIds: string[];
  if (r.perguntaIds && r.perguntaIds.length > 0) {
    scopeIds = r.perguntaIds;
  } else {
    const rows = await db
      .select({ id: perguntasTable.id })
      .from(perguntasTable)
      .where(eq(perguntasTable.pilarSlug, r.pilarSlug));
    scopeIds = rows.map((p) => p.id);
  }
  const pilarTotal = scopeIds.length;

  // Perguntas delegadas adiante por este respondente (filhos diretos)
  const childDelegs = await db
    .select({ id: delegacoesTable.id })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.parentId, r.delegacaoId));
  let delegatedIds = new Set<string>();
  if (childDelegs.length > 0) {
    const childIds = childDelegs.map((d) => d.id);
    const child = await db
      .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
      .from(delegacoesPerguntasTable)
      .where(sql`${delegacoesPerguntasTable.delegacaoId} = ANY(${childIds})`);
    delegatedIds = new Set(child.map((c) => c.perguntaId).filter((id) => scopeIds.includes(id)));
  }

  const answeredRows = pilarTotal === 0 ? [] : await db
    .select({ perguntaId: respostasTable.perguntaId })
    .from(respostasTable)
    .where(
      and(
        eq(respostasTable.diagnosticoId, r.diagnosticoId),
        sql`${respostasTable.perguntaId} = ANY(${scopeIds})`,
      ),
    );
  const answeredIds = new Set(answeredRows.map((r) => r.perguntaId));

  const pilarAnswered = answeredIds.size;
  const pilarDelegated = Array.from(delegatedIds).filter((id) => !answeredIds.has(id)).length;
  const pilarPending = Math.max(0, pilarTotal - pilarAnswered - pilarDelegated);

  res.json({
    totalGlobal,
    answeredGlobal,
    pilarTotal,
    pilarAnswered,
    pilarDelegated,
    pilarPending,
  });
});

// ─── Sub-delegação a partir do respondente ──────────────────────────────────
//
// O respondente pode delegar adiante perguntas do seu próprio escopo. A nova
// delegação é nivel=3, parent_id = sua delegação, herda o pilar e (se quiser)
// dispara um convite por e-mail para o sub-respondente.
router.post("/respondent/delegate", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const { perguntaIds, responsavelNome, responsavelEmail, prazo, observacoes, enviarConvite } =
    req.body as {
      perguntaIds?: string[];
      responsavelNome?: string;
      responsavelEmail?: string;
      prazo?: string | null;
      observacoes?: string | null;
      enviarConvite?: boolean;
    };

  if (!Array.isArray(perguntaIds) || perguntaIds.length === 0) {
    res.status(400).json({ error: "perguntaIds é obrigatório" });
    return;
  }
  if (!responsavelEmail || !responsavelNome) {
    res.status(400).json({ error: "Nome e e-mail do responsável são obrigatórios." });
    return;
  }
  if (responsavelEmail.toLowerCase() === r.email.toLowerCase()) {
    res.status(400).json({ error: "Você não pode delegar para o seu próprio e-mail." });
    return;
  }

  const allowed = await allowedPerguntaIds(r);
  for (const id of perguntaIds) {
    if (!allowed.has(id)) {
      res.status(403).json({ error: "Uma ou mais perguntas estão fora do seu escopo ou já foram delegadas." });
      return;
    }
  }

  // Resolve pilar(es) a partir das perguntas escolhidas; cross-pilar é permitido.
  const perguntasInfo = await db
    .select({ id: perguntasTable.id, pilarSlug: perguntasTable.pilarSlug, pilarNome: perguntasTable.pilarNome })
    .from(perguntasTable)
    .where(sql`${perguntasTable.id} = ANY(${perguntaIds})`);
  if (perguntasInfo.length !== perguntaIds.length) {
    res.status(400).json({ error: "Uma ou mais perguntas inválidas." });
    return;
  }
  const distinctPilars = Array.from(new Set(perguntasInfo.map((p) => p.pilarSlug)));
  const childPilarSlug = distinctPilars.length > 1 ? "misto" : distinctPilars[0];
  const childPilarNome =
    distinctPilars.length > 1
      ? `${perguntasInfo.length} perguntas em ${distinctPilars.length} pilares`
      : perguntasInfo[0].pilarNome;

  // Sub-delegação: nivel = nivel(parent) + 1 — preserva profundidade da cadeia.
  const [parentDeleg] = await db
    .select({ nivel: delegacoesTable.nivel })
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, r.delegacaoId))
    .limit(1);
  const childNivel = (parentDeleg?.nivel ?? 2) + 1;

  const [novaDeleg] = await db
    .insert(delegacoesTable)
    .values({
      clinicId: r.clinicId,
      pilarSlug: childPilarSlug,
      pilarNome: childPilarNome,
      nivel: childNivel,
      responsavelNome,
      responsavelEmail,
      prazo: prazo ?? null,
      status: "pendente",
      questaoInicio: null,
      questaoFim: null,
      parentId: r.delegacaoId,
      observacoes: observacoes ?? null,
    })
    .returning();

  await db
    .insert(delegacoesPerguntasTable)
    .values(perguntaIds.map((pid) => ({ delegacaoId: novaDeleg.id, perguntaId: pid })));

  let inviteLink: string | null = null;
  if (enviarConvite) {
    try {
      const TTL_MS = 30 * 24 * 60 * 60 * 1000;
      const { code, hash } = generateInviteCode();
      const expiresAt = new Date(Date.now() + TTL_MS);
      await db
        .update(delegacoesTable)
        .set({
          inviteCodeHash: hash,
          inviteCodeExpiresAt: expiresAt,
          inviteSentAt: new Date(),
          inviteRedeemedAt: null,
          inviteDiagnosticoId: r.diagnosticoId,
          updatedAt: new Date(),
        })
        .where(eq(delegacoesTable.id, novaDeleg.id));
      const appUrl = await resolveAppUrl(req);
      inviteLink = `${appUrl}/responder?code=${encodeURIComponent(code)}`;
      const [clinic] = await db
        .select({ nome: clinicsTable.nome })
        .from(clinicsTable)
        .where(eq(clinicsTable.id, r.clinicId))
        .limit(1);
      const html = buildRespondentInviteEmail({
        responsavelNome,
        pilarNome: `${childPilarNome} (${perguntaIds.length} pergunta${perguntaIds.length > 1 ? "s" : ""})`,
        clinicName: clinic?.nome ?? undefined,
        prazo: prazo ?? null,
        link: inviteLink,
      });
      sendEmail({
        to: responsavelEmail,
        subject: `[IONEX360] Convite — Diagnóstico 360°: ${childPilarNome}`,
        html,
      }).catch(() => {});
    } catch (err) {
      req.log?.error({ err }, "Falha ao enviar convite de sub-delegação");
    }
  }

  res.status(201).json({
    delegacaoId: novaDeleg.id,
    id: novaDeleg.id,
    nivel: novaDeleg.nivel,
    pilarSlug: novaDeleg.pilarSlug,
    pilarNome: novaDeleg.pilarNome,
    responsavelNome: novaDeleg.responsavelNome,
    responsavelEmail: novaDeleg.responsavelEmail,
    perguntaIds,
    prazo: novaDeleg.prazo,
    parentId: novaDeleg.parentId,
    inviteLink,
    inviteEnviadoPara: enviarConvite ? responsavelEmail : null,
  });
});

// Lista as sub-delegações que ESTE respondente fez (para mostrar status na UI).
router.get("/respondent/delegated-out", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const childDelegs = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.parentId, r.delegacaoId));
  if (childDelegs.length === 0) {
    res.json([]);
    return;
  }
  const childIds = childDelegs.map((d) => d.id);
  const links = await db
    .select()
    .from(delegacoesPerguntasTable)
    .where(sql`${delegacoesPerguntasTable.delegacaoId} = ANY(${childIds})`);
  const byDeleg = new Map<string, string[]>();
  for (const l of links) {
    const arr = byDeleg.get(l.delegacaoId) ?? [];
    arr.push(l.perguntaId);
    byDeleg.set(l.delegacaoId, arr);
  }
  res.json(
    childDelegs.map((d) => ({
      id: d.id,
      responsavelNome: d.responsavelNome,
      responsavelEmail: d.responsavelEmail,
      prazo: d.prazo,
      status: d.status,
      perguntaIds: byDeleg.get(d.id) ?? [],
      inviteSentAt: d.inviteSentAt ? d.inviteSentAt.toISOString() : null,
      inviteRedeemedAt: d.inviteRedeemedAt ? d.inviteRedeemedAt.toISOString() : null,
    })),
  );
});

export default router;
