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
import { resolveOwnedPerguntaIds } from "../lib/scope/delegation-ownership.js";
import { ne, desc } from "drizzle-orm";
// NOTE: respondents intentionally do NOT trigger recalculateScores. That helper
// auto-promotes the diagnostic to status='concluido' when every question is
// answered, which would let the *last* respondent to finish their pilar
// inadvertently lock the whole diagnostic before the manager has reviewed it.
// Scores are recalculated on demand via the manager-side
// `POST /diagnostics/:id/calculate-scores` endpoint.

const router: IRouter = Router();

const RESPONDENT_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Claims do token de respondente.
 *
 *  - v:1 (legado): amarrado a UMA delegação fixa via `delegacaoId` + `pilarSlug`
 *    (e opcionalmente `perguntaIds` para N3+). Continuam válidos até expirarem
 *    e seguem sendo aceitos pelo middleware.
 *  - v:2 (atual, task #225): amarrado à IDENTIDADE (`email + clinicId +
 *    diagnosticoId`). Sem `delegacaoId` fixo — cada endpoint que opera sobre
 *    uma delegação específica recebe `delegacaoId` por query/body e a
 *    propriedade é validada server-side via `resolveDelegacaoScope`.
 */
interface RespondentClaims {
  role: "diagnostic_respondent";
  clinicId: string;
  diagnosticoId: string;
  email: string;
  nome?: string;
  // v:1 apenas:
  delegacaoId?: string;
  pilarSlug?: string;
  perguntaIds?: string[];
  // v ausente == v:1.
  v?: number;
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
  if (!claims.email || !claims.clinicId || !claims.diagnosticoId) {
    res.status(401).json({ error: "Token de respondente incompleto" });
    return;
  }
  // v:1 tokens carregam delegacaoId/pilarSlug fixos. v:2 nÃO carrega — o
  // escopo é resolvido por requisição via resolveDelegacaoScope.
  const isV2 = claims.v === 2;
  if (!isV2 && (!claims.delegacaoId || !claims.pilarSlug)) {
    res.status(401).json({ error: "Token de respondente legado incompleto" });
    return;
  }
  req.respondent = claims;
  next();
}

/**
 * Escopo resolvido por requisição. Equivalente em forma a um claim v:1, mas
 * derivado da combinação (token de identidade) + (delegacaoId vinda da
 * query/body), validado contra o banco.
 */
interface ResolvedScope {
  delegacaoId: string;
  clinicId: string;
  diagnosticoId: string;
  pilarSlug: string;
  email: string;
  nome?: string;
  perguntaIds?: string[];
}

/**
 * Resolve a delegação alvo da requisição atual. Retorna `null` (e envia 4xx
 * em `res`) quando faltar `delegacaoId` ou quando a delegação não pertencer
 * à identidade do token. Usa o `delegacaoId` do token quando v:1 e a query
 * vier vazia (compat).
 */
async function resolveDelegacaoScope(
  req: Request,
  res: Response,
): Promise<ResolvedScope | null> {
  const r = req.respondent!;
  const fromQuery =
    (typeof req.query.delegacaoId === "string" ? req.query.delegacaoId : undefined) ??
    (typeof (req.body as { delegacaoId?: unknown })?.delegacaoId === "string"
      ? ((req.body as { delegacaoId?: string }).delegacaoId as string)
      : undefined);

  // v:1 está amarrado: query override só é aceita quando bate com o token.
  let delegacaoId: string | undefined;
  if (r.delegacaoId) {
    if (fromQuery && fromQuery !== r.delegacaoId) {
      res.status(403).json({ error: "Token v:1 não autoriza outra delegação." });
      return null;
    }
    delegacaoId = r.delegacaoId;
  } else {
    delegacaoId = fromQuery;
  }
  if (!delegacaoId) {
    res.status(400).json({ error: "delegacaoId é obrigatório" });
    return null;
  }

  const [deleg] = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, delegacaoId))
    .limit(1);
  if (!deleg) {
    res.status(404).json({ error: "Delegação não encontrada." });
    return null;
  }
  // Validação de propriedade por identidade.
  if (deleg.clinicId !== r.clinicId) {
    res.status(403).json({ error: "Delegação fora do escopo." });
    return null;
  }
  if (
    !deleg.responsavelEmail ||
    deleg.responsavelEmail.toLowerCase() !== r.email.toLowerCase()
  ) {
    res.status(403).json({ error: "Delegação não pertence a esta identidade." });
    return null;
  }
  // O ciclo de diagnóstico do token e o vínculo da delegação devem bater
  // (quando a delegação tem inviteDiagnosticoId definido). Delegações sem
  // vínculo (criadas no fluxo de sub-delegação interna que ainda não emitiu
  // convite) ficam liberadas — o pai já validou identidade.
  if (deleg.inviteDiagnosticoId && deleg.inviteDiagnosticoId !== r.diagnosticoId) {
    res.status(403).json({ error: "Delegação pertence a outro ciclo de diagnóstico." });
    return null;
  }

  // Resolve perguntaIds da chain (N3+).
  const perguntaRows = await db
    .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
    .from(delegacoesPerguntasTable)
    .where(eq(delegacoesPerguntasTable.delegacaoId, deleg.id));
  const perguntaIds = perguntaRows.length > 0 ? perguntaRows.map((p) => p.perguntaId) : undefined;

  return {
    delegacaoId: deleg.id,
    clinicId: r.clinicId,
    diagnosticoId: r.diagnosticoId,
    pilarSlug: deleg.pilarSlug,
    email: r.email,
    nome: r.nome ?? deleg.responsavelNome ?? undefined,
    perguntaIds,
  };
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

  // task #225: token v:2 — por identidade (email + clinic + diagnostico),
  // SEM delegacaoId/pilarSlug fixos. A delegação alvo é resolvida por
  // requisição via resolveDelegacaoScope. perguntaIds não fazem mais parte
  // do token (consultados via delegacoes_perguntas no escopo resolvido).
  void perguntaIds; // silencia warning; mantido a leitura por intenção/diagnóstico.
  const token = signToken(
    {
      role: "diagnostic_respondent",
      clinicId: deleg.clinicId,
      diagnosticoId: activeDiag.id,
      email: deleg.responsavelEmail,
      nome: deleg.responsavelNome ?? undefined,
      v: 2,
    },
    RESPONDENT_TTL_SECONDS,
  );

  res.json({
    token,
    // Identidade resolvida — usada pelo hub no client.
    clinicId: deleg.clinicId,
    clinicNome: clinic?.nome ?? null,
    diagnosticoId: activeDiag.id,
    diagnosticoStatus: activeDiag.status,
    responsavelNome: deleg.responsavelNome,
    responsavelEmail: deleg.responsavelEmail,
    // Compatibilidade com clients antigos que esperavam a delegação inicial
    // no payload do redeem. O frontend novo usa o hub.
    delegacaoId: deleg.id,
    pilarSlug: deleg.pilarSlug,
    pilarNome: deleg.pilarNome,
    prazo: deleg.prazo,
  });
});

/**
 * Hub do respondente — lista TODAS as delegações ativas para a identidade
 * autenticada (mesmo e-mail + clínica + ciclo de diagnóstico). Cada item traz
 * progresso por pilar/escopo, prazo e status, para o frontend renderizar
 * cards.
 */
router.get("/respondent/hub", requireRespondent, async (req, res): Promise<void> => {
  const r = req.respondent!;
  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, r.clinicId))
    .limit(1);
  const [diag] = await db
    .select({ id: diagnosticsTable.id, status: diagnosticsTable.status })
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, r.diagnosticoId))
    .limit(1);

  // Delegações ativas (não concluídas) para esta identidade neste diagnóstico.
  // Aceitamos delegações que: (a) têm inviteDiagnosticoId === r.diagnosticoId,
  // OU (b) ainda não foram vinculadas mas foram criadas dentro da clínica
  // (caso de delegações herdadas — sem invite_code emitido ainda).
  // Task #225: incluímos TODOS os status (pendente, em_andamento, concluido).
  // O frontend renderiza o card com badge de status — esconder "concluido" do
  // hub confunde o respondente que quer revisar o que já fechou.
  const delegs = await db
    .select()
    .from(delegacoesTable)
    .where(
      and(
        eq(delegacoesTable.clinicId, r.clinicId),
        sql`lower(${delegacoesTable.responsavelEmail}) = ${r.email.toLowerCase()}`,
      ),
    )
    .orderBy(delegacoesTable.createdAt);

  const filtered = delegs.filter(
    (d) => !d.inviteDiagnosticoId || d.inviteDiagnosticoId === r.diagnosticoId,
  );

  if (filtered.length === 0) {
    res.json({
      clinicId: r.clinicId,
      clinicNome: clinic?.nome ?? null,
      diagnosticoId: r.diagnosticoId,
      diagnosticoStatus: diag?.status ?? null,
      responsavelNome: r.nome ?? null,
      responsavelEmail: r.email,
      delegacoes: [],
    });
    return;
  }

  const delegIds = filtered.map((d) => d.id);
  const allPerguntaLinks = await db
    .select()
    .from(delegacoesPerguntasTable)
    .where(inArray(delegacoesPerguntasTable.delegacaoId, delegIds));
  const perguntasByDeleg = new Map<string, string[]>();
  for (const l of allPerguntaLinks) {
    const arr = perguntasByDeleg.get(l.delegacaoId) ?? [];
    arr.push(l.perguntaId);
    perguntasByDeleg.set(l.delegacaoId, arr);
  }

  // Contadores de progresso por delegação.
  const cards = await Promise.all(
    filtered.map(async (d) => {
      const explicit = perguntasByDeleg.get(d.id);
      let scopeIds: string[];
      if (explicit && explicit.length > 0) {
        scopeIds = explicit;
      } else {
        const rows = await db
          .select({ id: perguntasTable.id })
          .from(perguntasTable)
          .where(eq(perguntasTable.pilarSlug, d.pilarSlug));
        scopeIds = rows.map((p) => p.id);
      }
      const total = scopeIds.length;
      const answered = total === 0 ? 0 : await db
        .select({ value: count() })
        .from(respostasTable)
        .where(
          and(
            eq(respostasTable.diagnosticoId, r.diagnosticoId),
            inArray(respostasTable.perguntaId, scopeIds),
          ),
        ).then((rows) => rows[0]?.value ?? 0);

      // Perguntas sub-delegadas adiante por ESTA delegação (filhos diretos).
      const childDelegs = await db
        .select({ id: delegacoesTable.id })
        .from(delegacoesTable)
        .where(eq(delegacoesTable.parentId, d.id));
      let delegated = 0;
      if (childDelegs.length > 0) {
        const childIds = childDelegs.map((c) => c.id);
        const childLinks = await db
          .select({ perguntaId: delegacoesPerguntasTable.perguntaId })
          .from(delegacoesPerguntasTable)
          .where(inArray(delegacoesPerguntasTable.delegacaoId, childIds));
        const scopeSet = new Set(scopeIds);
        delegated = childLinks.filter((l) => scopeSet.has(l.perguntaId)).length;
      }
      const pending = Math.max(0, total - answered - delegated);

      return {
        delegacaoId: d.id,
        pilarSlug: d.pilarSlug,
        pilarNome: d.pilarNome,
        nivel: d.nivel,
        prazo: d.prazo,
        status: d.status,
        kind: explicit && explicit.length > 0 ? ("perguntas" as const) : ("pilar" as const),
        total,
        answered,
        delegated,
        pending,
      };
    }),
  );

  res.json({
    clinicId: r.clinicId,
    clinicNome: clinic?.nome ?? null,
    diagnosticoId: r.diagnosticoId,
    diagnosticoStatus: diag?.status ?? null,
    responsavelNome: r.nome ?? null,
    responsavelEmail: r.email,
    delegacoes: cards,
  });
});

router.get("/respondent/context", requireRespondent, async (req, res): Promise<void> => {
  const scope = await resolveDelegacaoScope(req, res);
  if (!scope) return;
  const [diag] = await db
    .select({
      id: diagnosticsTable.id,
      status: diagnosticsTable.status,
      iniciadoEm: diagnosticsTable.iniciadoEm,
    })
    .from(diagnosticsTable)
    .where(eq(diagnosticsTable.id, scope.diagnosticoId))
    .limit(1);
  const [clinic] = await db
    .select({ nome: clinicsTable.nome })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, scope.clinicId))
    .limit(1);
  const [deleg] = await db
    .select()
    .from(delegacoesTable)
    .where(eq(delegacoesTable.id, scope.delegacaoId))
    .limit(1);
  if (!diag || !deleg) {
    res.status(404).json({ error: "Contexto não encontrado" });
    return;
  }
  res.json({
    delegacaoId: deleg.id,
    clinicId: scope.clinicId,
    clinicNome: clinic?.nome ?? null,
    diagnosticoId: diag.id,
    diagnosticoStatus: diag.status,
    pilarSlug: deleg.pilarSlug,
    pilarNome: deleg.pilarNome,
    responsavelNome: deleg.responsavelNome,
    responsavelEmail: deleg.responsavelEmail,
    prazo: deleg.prazo,
    nivel: deleg.nivel,
    perguntaIds: scope.perguntaIds ?? null,
  });
});

router.get("/respondent/questions", requireRespondent, async (req, res): Promise<void> => {
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
      .where(inArray(delegacoesPerguntasTable.delegacaoId, childIds));
    excluded = new Set(childPerguntas.map((p) => p.perguntaId));
  }

  const perguntas = await db
    .select()
    .from(perguntasTable)
    .where(
      baseIds && baseIds.length > 0
        ? inArray(perguntasTable.id, baseIds)
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
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
 * Returns the set of perguntaIds the current respondent is allowed to answer.
 * Delega para o helper compartilhado `resolveOwnedPerguntaIds`, que implementa
 * a regra de "deepest leaf" (escopo declarado MENOS perguntas já sub-delegadas
 * adiante). Mesmo helper usado em qualquer caminho server-side que precise
 * resolver propriedade efetiva dentro de uma cadeia indefinida.
 */
async function allowedPerguntaIds(r: ResolvedScope): Promise<Set<string>> {
  return resolveOwnedPerguntaIds({
    delegacaoId: r.delegacaoId,
    explicitPerguntaIds: r.perguntaIds ?? null,
    pilarSlug: r.pilarSlug,
  });
}

router.put("/respondent/respostas/:perguntaId", requireRespondent, async (req, res): Promise<void> => {
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
      .where(inArray(delegacoesPerguntasTable.delegacaoId, childIds));
    delegatedIds = new Set(child.map((c) => c.perguntaId).filter((id) => scopeIds.includes(id)));
  }

  const answeredRows = pilarTotal === 0 ? [] : await db
    .select({ perguntaId: respostasTable.perguntaId })
    .from(respostasTable)
    .where(
      and(
        eq(respostasTable.diagnosticoId, r.diagnosticoId),
        inArray(respostasTable.perguntaId, scopeIds),
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
  try {
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
    .where(inArray(perguntasTable.id, perguntaIds));
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
  } catch (err) {
    req.log?.error({ err }, "Falha inesperada em POST /respondent/delegate");
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno ao criar a delegação. Tente novamente." });
    }
  }
});

// Lista as sub-delegações que ESTE respondente fez (para mostrar status na UI).
router.get("/respondent/delegated-out", requireRespondent, async (req, res): Promise<void> => {
  const r = await resolveDelegacaoScope(req, res);
  if (!r) return;
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
    .where(inArray(delegacoesPerguntasTable.delegacaoId, childIds));
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
