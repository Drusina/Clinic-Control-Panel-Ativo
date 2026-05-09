import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import multer, { MulterError } from "multer";
import * as XLSX from "xlsx";
import { db, teamTable, clinicsTable } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { CreateTeamMemberBody, UpdateTeamMemberBody, UpdateTeamMemberResponse } from "@workspace/api-zod";
import { generateInviteCode, assertClinicAccess, type AuthenticatedRequest as AuthRequest } from "../middleware/auth";
import { sendEmail, buildInviteEmail, buildPushSetupEmail, resolveAppUrl } from "../lib/email.js";

const router: IRouter = Router();

function isDuplicateEmailError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; constraint?: string; constraint_name?: string; message?: string };
  if (e.code !== "23505") return false;
  const c = e.constraint ?? e.constraint_name ?? "";
  if (c === "equipe_interna_clinic_email_uniq") return true;
  return typeof e.message === "string" && e.message.includes("equipe_interna_clinic_email_uniq");
}

function mapTeamMember(t: typeof teamTable.$inferSelect) {
  return {
    id: t.id,
    clinicId: t.clinicId,
    nome: t.nome,
    funcao: t.funcao,
    area: t.area,
    vinculo: t.vinculo,
    tipoJornada: t.tipoJornada ?? null,
    email: t.email,
    whatsapp: t.whatsapp,
    cpf: t.cpf ?? null,
    dataAdmissao: t.dataAdmissao ?? null,
    respondeA: t.respondeA ?? null,
    observacoes: t.observacoes ?? null,
    temAcessoPlataforma: t.temAcessoPlataforma ?? false,
    inviteStatus: t.inviteStatus ?? null,
    lastAccessAt: t.lastAccessAt ? t.lastAccessAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

async function dispatchSupabaseInvite(email: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const res = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  return res.ok;
}

export async function sendPushSetupEmail(member: typeof teamTable.$inferSelect, req?: Request): Promise<void> {
  if (!member.email) return;
  const appUrl = await resolveAppUrl(req);

  const { code, hash, expiresAt } = generateInviteCode();

  await db.update(teamTable).set({
    inviteCodeHash: hash,
    inviteCodeExpiresAt: expiresAt,
    inviteRedeemedAt: null,
  }).where(eq(teamTable.id, member.id));

  const activationLink = `${appUrl}/convite?code=${encodeURIComponent(code)}`;

  await sendEmail({
    to: member.email,
    subject: `[IONEX360] Ative suas notificações push`,
    html: buildPushSetupEmail({ nome: member.nome ?? "Usuário", activationLink }),
  });
}

async function dispatchPlatformInvite(member: typeof teamTable.$inferSelect, req?: Request): Promise<string> {
  if (!member.email) return "no_email";

  const supabaseInvited = await dispatchSupabaseInvite(member.email);

  if (supabaseInvited) {
    sendPushSetupEmail(member, req).catch(() => {});
    return "sent";
  }

  const appUrl = await resolveAppUrl(req);
  const { code, hash, expiresAt } = generateInviteCode();

  try {
    await db.update(teamTable).set({
      inviteCodeHash: hash,
      inviteCodeExpiresAt: expiresAt,
    }).where(eq(teamTable.id, member.id));
  } catch {
    return "pending";
  }

  const inviteLink = `${appUrl}/convite?code=${encodeURIComponent(code)}`;

  const sent = await sendEmail({
    to: member.email,
    subject: `Você foi convidado para a plataforma IONEX360`,
    html: buildInviteEmail({
      email: member.email,
      role: member.funcao ?? "colaborador",
      magicLink: inviteLink,
    }),
  });

  return sent ? "sent" : "pending";
}

// /team/all is a super-admin overview (it lists members across every clinic).
// Mounted under requireAuth in routes/index.ts; we gate it inline because the
// router also serves clinic-scoped paths that any team_member with access can use.
router.get("/team/all", async (req, res): Promise<void> => {
  const user = (req as AuthRequest).user;
  if (!user || user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const members = await db
    .select()
    .from(teamTable)
    .orderBy(teamTable.nome);
  res.json(
    members.map((m) => ({
      ...mapTeamMember(m),
      notificationPreferences: m.notificationPreferences ?? { emailEnabled: true, whatsappEnabled: true },
    }))
  );
});

router.get("/clinics/:clinicId/team", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;
  const members = await db.select().from(teamTable).where(eq(teamTable.clinicId, clinicId));
  res.json(members.map(mapTeamMember));
});

router.post("/clinics/:clinicId/team", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;
  const parsed = CreateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let member: typeof teamTable.$inferSelect;
  try {
    [member] = await db
      .insert(teamTable)
      .values({
        clinicId,
        nome: parsed.data.nome,
        funcao: parsed.data.funcao ?? null,
        area: parsed.data.area ?? null,
        vinculo: parsed.data.vinculo ?? null,
        tipoJornada: parsed.data.tipoJornada ?? null,
        email: parsed.data.email ? parsed.data.email.trim().toLowerCase() || null : null,
        whatsapp: parsed.data.whatsapp ?? null,
        cpf: parsed.data.cpf ? String(parsed.data.cpf).replace(/\D/g, "") || null : null,
        dataAdmissao: parsed.data.dataAdmissao ?? null,
        respondeA: parsed.data.respondeA ?? null,
        observacoes: parsed.data.observacoes ?? null,
        temAcessoPlataforma: parsed.data.temAcessoPlataforma ?? false,
      })
      .returning();
  } catch (err) {
    if (isDuplicateEmailError(err)) {
      res.status(409).json({ error: "Já existe um membro com este e-mail nesta clínica." });
      return;
    }
    throw err;
  }

  if (parsed.data.temAcessoPlataforma && parsed.data.email) {
    try {
      const status = await dispatchPlatformInvite(member, req);
      await db.update(teamTable).set({ inviteStatus: status, inviteRedeemedAt: null }).where(eq(teamTable.id, member.id));
      member.inviteStatus = status;
    } catch {
      member.inviteStatus = "error";
    }
  }

  res.status(201).json(mapTeamMember(member));
});

router.patch("/team/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(teamTable).where(eq(teamTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  // Look up the member first, then enforce clinic access. We cannot use the
  // route-level middleware because the URL only carries the member id, not
  // the clinic id.
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const updates: Partial<typeof teamTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.nome != null) updates.nome = d.nome;
  if (d.funcao !== undefined) updates.funcao = d.funcao;
  if (d.area !== undefined) updates.area = d.area;
  if (d.vinculo !== undefined) updates.vinculo = d.vinculo;
  if (d.email !== undefined) updates.email = d.email ? d.email.trim().toLowerCase() || null : null;
  if (d.whatsapp !== undefined) updates.whatsapp = d.whatsapp;
  if (d.tipoJornada !== undefined) updates.tipoJornada = d.tipoJornada;
  if (d.cpf !== undefined) updates.cpf = d.cpf ? String(d.cpf).replace(/\D/g, "") || null : null;
  if (d.dataAdmissao !== undefined) updates.dataAdmissao = d.dataAdmissao;
  if (d.respondeA !== undefined) updates.respondeA = d.respondeA;
  if (d.observacoes !== undefined) updates.observacoes = d.observacoes;

  const enablingAccess = d.temAcessoPlataforma === true && !existing.temAcessoPlataforma;
  if (d.temAcessoPlataforma != null) updates.temAcessoPlataforma = d.temAcessoPlataforma;

  if (enablingAccess) {
    const emailToUse = d.email ?? existing.email;
    if (emailToUse) {
      try {
        const memberForInvite = { ...existing, ...updates, email: emailToUse } as typeof teamTable.$inferSelect;
        const status = await dispatchPlatformInvite(memberForInvite, req);
        updates.inviteStatus = status;
        updates.inviteRedeemedAt = null;
      } catch {
        updates.inviteStatus = "error";
      }
    } else {
      updates.inviteStatus = "no_email";
    }
  } else if (d.temAcessoPlataforma === false && existing.temAcessoPlataforma) {
    updates.inviteStatus = null;
    updates.inviteRedeemedAt = null;
    updates.inviteCodeHash = null;
    updates.inviteCodeExpiresAt = null;
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.teamMemberId, id));
  }

  let member: typeof teamTable.$inferSelect | undefined;
  try {
    [member] = await db.update(teamTable).set(updates).where(eq(teamTable.id, id)).returning();
  } catch (err) {
    if (isDuplicateEmailError(err)) {
      res.status(409).json({ error: "Já existe um membro com este e-mail nesta clínica." });
      return;
    }
    throw err;
  }
  if (!member) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  res.json(UpdateTeamMemberResponse.parse(mapTeamMember(member)));
});

router.delete("/team/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  // Look up clinic id of the member first to authorise the action.
  const [existing] = await db.select({ clinicId: teamTable.clinicId }).from(teamTable).where(eq(teamTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }
  if (await assertClinicAccess(req, res, existing.clinicId)) return;

  const [member] = await db.delete(teamTable).where(eq(teamTable.id, id)).returning();
  if (!member) {
    res.status(404).json({ error: "Team member not found" });
    return;
  }

  res.sendStatus(204);
});

// ─── IMPORT QUADRO FUNCIONAL (xlsx) ─────────────────────────────────────────

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

function importUploadHandler(req: Request, res: Response, next: NextFunction): void {
  importUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: `Planilha excede o limite de ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)}MB` });
        return;
      }
      const message = err instanceof Error ? err.message : "Falha ao processar upload";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}

const HEADER_ALIASES: Record<string, string> = {
  numero: "n",
  no: "n",
  "nº": "n",
  "n°": "n",
  nomecompleto: "nome",
  nome: "nome",
  funcao: "funcao",
  cargo: "funcao",
  funcaocargo: "funcao",
  area: "area",
  vinculo: "vinculo",
  tipodejornada: "tipoJornada",
  jornada: "tipoJornada",
  email: "email",
  "e-mail": "email",
  telefone: "whatsapp",
  whatsapp: "whatsapp",
  telefonewhatsapp: "whatsapp",
  cpf: "cpf",
  dataadmissao: "dataAdmissao",
  dataadmissão: "dataAdmissao",
  respondea: "respondeA",
  respondeagestordireto: "respondeA",
  gestordireto: "respondeA",
  observacoes: "observacoes",
  observacao: "observacoes",
};

function normalizeHeader(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeVinculo(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const norm = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (norm === "clt") return "CLT";
  if (norm === "pj") return "PJ";
  if (norm === "socio" || norm.startsWith("socio")) return "Socio";
  if (norm === "terceirizado" || norm.startsWith("terceir")) return "Terceirizado";
  return null;
}

function normalizeArea(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

function normalizeEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return s || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeCpf(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

function isValidCpfDigits(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(digits[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(digits[10], 10);
}

function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return excelSerialToISODate(raw);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (!s) return null;
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) {
    const dd = br[1].padStart(2, "0");
    const mm = br[2].padStart(2, "0");
    let yyyy = br[3];
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) > 50 ? "19" : "20") + yyyy;
    return `${yyyy}-${mm}-${dd}`;
  }
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  return null;
}

function normalizeText(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportError[];
}

async function importClinicAccessGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;
  next();
}

router.post(
  "/clinics/:clinicId/team/import",
  importClinicAccessGuard,
  importUploadHandler,
  async (req: Request, res): Promise<void> => {
    const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "Arquivo (campo 'file') é obrigatório" });
      return;
    }

    const ALLOWED_MIME = new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
      "application/octet-stream", // some browsers don't set the proper MIME
    ]);
    const filename = file.originalname || "";
    const hasXlsxExt = /\.xlsx$/i.test(filename);
    if (!hasXlsxExt) {
      res.status(400).json({ error: "Envie um arquivo .xlsx (Excel)." });
      return;
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      res.status(400).json({ error: `Tipo de arquivo não suportado: ${file.mimetype}. Envie um .xlsx.` });
      return;
    }
    // xlsx magic bytes: PK\x03\x04 (ZIP container)
    if (file.buffer.length < 4 || !(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04)) {
      res.status(400).json({ error: "Arquivo não é um .xlsx válido (assinatura inválida)." });
      return;
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer", cellDates: false });
    } catch {
      res.status(400).json({ error: "Não foi possível ler o arquivo. Envie um .xlsx válido." });
      return;
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: "Planilha vazia." });
      return;
    }
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });

    // Find header row by scanning for "nome" column. The template has headers
    // on row 6 (index 5), but be tolerant if the user shifts things.
    let headerRowIdx = -1;
    let headerMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] ?? [];
      const map: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const key = HEADER_ALIASES[normalizeHeader(row[c])];
        if (key && map[key] === undefined) map[key] = c;
      }
      if (map.nome !== undefined) {
        headerRowIdx = i;
        headerMap = map;
        break;
      }
    }

    if (headerRowIdx === -1) {
      res.status(400).json({ error: "Cabeçalho não encontrado. Use o template Quadro Funcional (coluna 'Nome completo' obrigatória)." });
      return;
    }

    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      await db.transaction(async (tx) => {
    // Pre-load existing members for this clinic for matching
    const existing = await tx.select().from(teamTable).where(eq(teamTable.clinicId, clinicId));
    const byCpf = new Map<string, typeof teamTable.$inferSelect>();
    const byEmail = new Map<string, typeof teamTable.$inferSelect>();
    for (const m of existing) {
      if (m.cpf) byCpf.set(m.cpf, m);
      if (m.email) byEmail.set(m.email.toLowerCase(), m);
    }

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const xlsxRow = i + 1; // 1-indexed for user-facing messages
      const row = rows[i] ?? [];
      if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

      const get = (key: string): unknown => {
        const idx = headerMap[key];
        return idx === undefined ? null : row[idx];
      };

      const nome = normalizeText(get("nome"));
      if (!nome) {
        // Likely a blank or note row; skip silently
        continue;
      }

      const email = normalizeEmail(get("email"));
      if (email && !EMAIL_RE.test(email)) {
        summary.errors.push({ row: xlsxRow, field: "email", message: `E-mail inválido: ${email}` });
        summary.skipped++;
        continue;
      }

      const cpf = normalizeCpf(get("cpf"));
      if (cpf && !isValidCpfDigits(cpf)) {
        summary.errors.push({ row: xlsxRow, field: "cpf", message: `CPF inválido na linha ${xlsxRow}` });
        summary.skipped++;
        continue;
      }

      const vinculoRaw = get("vinculo");
      const vinculo = normalizeVinculo(vinculoRaw);
      if (vinculoRaw && !vinculo) {
        summary.errors.push({ row: xlsxRow, field: "vinculo", message: `Vínculo desconhecido: "${vinculoRaw}". Use CLT, PJ, Sócio ou Terceirizado.` });
        summary.skipped++;
        continue;
      }

      const dataAdmissaoRaw = get("dataAdmissao");
      const dataAdmissao = normalizeDate(dataAdmissaoRaw);
      if (dataAdmissaoRaw && !dataAdmissao) {
        summary.errors.push({ row: xlsxRow, field: "dataAdmissao", message: `Data de admissão inválida: "${dataAdmissaoRaw}"` });
        summary.skipped++;
        continue;
      }

      const values = {
        clinicId,
        nome,
        funcao: normalizeText(get("funcao")),
        area: normalizeArea(get("area")),
        vinculo,
        tipoJornada: normalizeText(get("tipoJornada")),
        email,
        whatsapp: normalizeText(get("whatsapp")),
        cpf,
        dataAdmissao,
        respondeA: normalizeText(get("respondeA")),
        observacoes: normalizeText(get("observacoes")),
      };

      try {
        // Email is now unique per clinic (DB partial unique index), so the
        // email map is unambiguous and can be trusted as a fallback when CPF
        // is missing.
        const emailMatch = email ? byEmail.get(email) : undefined;
        const match = (cpf ? byCpf.get(cpf) : undefined) ?? emailMatch;

        if (match) {
          // Merge: only overwrite when planilha has a non-null value
          const updates: Partial<typeof teamTable.$inferInsert> = {};
          for (const [k, v] of Object.entries(values)) {
            if (k === "clinicId") continue;
            if (v != null && v !== "") {
              (updates as Record<string, unknown>)[k] = v;
            }
          }
          if (Object.keys(updates).length > 0) {
            await tx.update(teamTable).set(updates).where(eq(teamTable.id, match.id));
          }
          summary.updated++;
          // Refresh maps to handle dup rows in the same import
          if (cpf) byCpf.set(cpf, { ...match, ...updates } as typeof teamTable.$inferSelect);
          if (email) byEmail.set(email, { ...match, ...updates } as typeof teamTable.$inferSelect);
        } else {
          const [created] = await tx.insert(teamTable).values(values).returning();
          summary.created++;
          if (created.cpf) byCpf.set(created.cpf, created);
          if (created.email) byEmail.set(created.email.toLowerCase(), created);
        }
      } catch (err) {
        // Per-row error: record + rollback the entire batch by throwing.
        const message = err instanceof Error ? err.message : "Erro ao gravar linha";
        summary.errors.push({ row: xlsxRow, message });
        summary.skipped++;
        throw new Error("__import_row_failed__");
      }
    }
      });
    } catch (err) {
      // If we aborted because of a per-row failure, the per-row error is
      // already in summary.errors. Reset created/updated since the tx rolled
      // back and report skipped totals + a top-level note.
      if (err instanceof Error && err.message === "__import_row_failed__") {
        const totalRows = summary.created + summary.updated + summary.skipped;
        summary.created = 0;
        summary.updated = 0;
        summary.skipped = totalRows;
        res.status(409).json({
          ...summary,
          error: "Importação revertida: uma ou mais linhas falharam. Corrija os erros e reenvie.",
        });
        return;
      }
      throw err;
    }

    res.json(summary);
  },
);

router.get("/clinics/:clinicId/team/template", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;

  const [clinic] = await db
    .select({ nome: clinicsTable.nome, cnpj: clinicsTable.cnpj, cidade: clinicsTable.cidade, uf: clinicsTable.uf })
    .from(clinicsTable)
    .where(eq(clinicsTable.id, clinicId));

  if (!clinic) {
    res.status(404).json({ error: "Clínica não encontrada" });
    return;
  }

  const headers = [
    "Nº",
    "Nome completo",
    "Função / Cargo",
    "Área",
    "Vínculo",
    "Tipo de jornada",
    "E-mail",
    "Telefone / WhatsApp",
    "CPF",
    "Data de admissão",
    "Responde a (gestor direto)",
    "Observações",
  ];

  const localPart = [clinic.cidade, clinic.uf].filter(Boolean).join("/");
  const titleLine = `QUADRO FUNCIONAL — ${clinic.nome}`;
  const subtitleLine = `${clinic.cnpj}${localPart ? "  ·  " + localPart : ""}`;
  const instructions =
    "PREENCHIMENTO: inclua TODAS as pessoas que trabalham na clínica, inclusive sócios atuantes. " +
    "VÍNCULO: CLT, PJ, Sócio ou Terceirizado. ÁREA: agrupe por função (Diretoria, Médicos, Enfermagem, Recepção, Financeiro, Administrativo, Limpeza).";

  const aoa: unknown[][] = [
    [titleLine],
    [subtitleLine],
    [],
    [instructions],
    [],
    headers,
  ];
  // 3 blank example rows so user sees a few prefilled numbers
  for (let n = 1; n <= 3; n++) {
    aoa.push([n, "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 11 } },
  ];
  ws["!cols"] = [
    { wch: 5 }, { wch: 30 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 18 },
    { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 25 }, { wch: 30 },
  ];
  ws["!freeze"] = { xSplit: 1, ySplit: 6 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Quadro Funcional");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeName = clinic.nome.replace(/[^\w\-]+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Quadro_Funcional_${safeName}.xlsx"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});

export default router;
