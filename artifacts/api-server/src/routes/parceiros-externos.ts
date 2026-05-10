import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import multer, { MulterError } from "multer";
import * as XLSX from "xlsx";
import { db, parceirosExternosTable, clinicsTable } from "@workspace/db";
import {
  CreateParceiroExternoBody,
  UpdateParceiroExternoBody,
} from "@workspace/api-zod";
import { assertClinicAccess } from "../middleware/auth";

const router: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function mapParceiro(p: typeof parceirosExternosTable.$inferSelect) {
  return {
    id: p.id,
    clinicId: p.clinicId,
    tipo: p.tipo,
    nomeEmpresa: p.nomeEmpresa ?? null,
    responsavel: p.responsavel ?? null,
    cnpjCpf: p.cnpjCpf ?? null,
    registroProfissional: p.registroProfissional ?? null,
    email: p.email ?? null,
    telefone: p.telefone ?? null,
    site: p.site ?? null,
    temContratoFormal: p.temContratoFormal ?? null,
    ondeContrato: p.ondeContrato ?? null,
    frequenciaContato: p.frequenciaContato ?? null,
    observacoes: p.observacoes ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

function normCnpjCpf(raw: unknown): string | null {
  if (raw == null) return null;
  const d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  return d;
}

function isValidCpfDigits(d: string): boolean {
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i], 10) * (10 - i);
  let c1 = (s * 10) % 11;
  if (c1 === 10) c1 = 0;
  if (c1 !== parseInt(d[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i], 10) * (11 - i);
  let c2 = (s * 10) % 11;
  if (c2 === 10) c2 = 0;
  return c2 === parseInt(d[10], 10);
}

function isValidCnpjDigits(d: string): boolean {
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let s = 0;
  for (let i = 0; i < 12; i++) s += parseInt(d[i], 10) * w1[i];
  let c1 = s % 11;
  c1 = c1 < 2 ? 0 : 11 - c1;
  if (c1 !== parseInt(d[12], 10)) return false;
  s = 0;
  for (let i = 0; i < 13; i++) s += parseInt(d[i], 10) * w2[i];
  let c2 = s % 11;
  c2 = c2 < 2 ? 0 : 11 - c2;
  return c2 === parseInt(d[13], 10);
}

/**
 * Validates a normalized CNPJ/CPF (digits only). Returns:
 * - "ok" → valid CPF (11 d) or CNPJ (14 d)
 * - "invalid_length" → length is not 11 or 14
 * - "invalid_dv" → length ok but check digit fails
 */
function validateCnpjCpf(d: string): "ok" | "invalid_length" | "invalid_dv" {
  if (d.length !== 11 && d.length !== 14) return "invalid_length";
  if (d.length === 11) return isValidCpfDigits(d) ? "ok" : "invalid_dv";
  return isValidCnpjDigits(d) ? "ok" : "invalid_dv";
}

function normText(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

function normEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return s || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normBoolean(raw: unknown): boolean | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  const s = String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["sim", "s", "yes", "y", "true", "1", "x"].includes(s)) return true;
  if (["nao", "n", "no", "false", "0", "-"].includes(s)) return false;
  return null;
}

function formatCnpjCpfBR(digits: string | null): string {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

router.get("/clinics/:clinicId/parceiros-externos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(parceirosExternosTable)
    .where(eq(parceirosExternosTable.clinicId, clinicId))
    .orderBy(parceirosExternosTable.tipo);

  res.json(rows.map(mapParceiro));
});

function isDuplicateCnpjCpfError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; constraint?: string; constraint_name?: string; message?: string };
  if (e.code !== "23505") return false;
  const c = e.constraint ?? e.constraint_name ?? "";
  if (c === "parceiros_externos_clinic_cnpj_cpf_uniq") return true;
  return typeof e.message === "string" && e.message.includes("parceiros_externos_clinic_cnpj_cpf_uniq");
}

router.post("/clinics/:clinicId/parceiros-externos", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateParceiroExternoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const tipoTrim = d.tipo.trim();
  if (!tipoTrim) {
    res.status(400).json({ error: "Categoria (tipo) é obrigatória." });
    return;
  }
  const cnpjCpfNorm = normCnpjCpf(d.cnpjCpf);
  if (cnpjCpfNorm) {
    const v = validateCnpjCpf(cnpjCpfNorm);
    if (v !== "ok") {
      res.status(400).json({
        error: v === "invalid_length"
          ? "CNPJ/CPF deve ter 11 dígitos (CPF) ou 14 (CNPJ)."
          : "CNPJ/CPF inválido (dígito verificador não confere).",
      });
      return;
    }
  }

  try {
    const [parceiro] = await db
      .insert(parceirosExternosTable)
      .values({
        clinicId,
        tipo: tipoTrim,
        nomeEmpresa: d.nomeEmpresa ?? null,
        responsavel: d.responsavel ?? null,
        cnpjCpf: cnpjCpfNorm,
        registroProfissional: d.registroProfissional ?? null,
        email: d.email ? d.email.trim().toLowerCase() || null : null,
        telefone: d.telefone ?? null,
        site: d.site ?? null,
        temContratoFormal: d.temContratoFormal ?? null,
        ondeContrato: d.ondeContrato ?? null,
        frequenciaContato: d.frequenciaContato ?? null,
        observacoes: d.observacoes ?? null,
      })
      .returning();
    res.status(201).json(mapParceiro(parceiro));
  } catch (err) {
    if (isDuplicateCnpjCpfError(err)) {
      res.status(409).json({ error: "Já existe um parceiro com este CNPJ/CPF nesta clínica." });
      return;
    }
    throw err;
  }
});

router.patch("/clinics/:clinicId/parceiros-externos/:parceiroId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parceiroId = Array.isArray(req.params.parceiroId) ? req.params.parceiroId[0] : req.params.parceiroId;
  const parsed = UpdateParceiroExternoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const updates: Partial<typeof parceirosExternosTable.$inferInsert> = {};
  if (d.tipo != null) {
    const t = d.tipo.trim();
    if (!t) {
      res.status(400).json({ error: "Categoria (tipo) não pode ser vazia." });
      return;
    }
    updates.tipo = t;
  }
  if (d.nomeEmpresa !== undefined) updates.nomeEmpresa = d.nomeEmpresa;
  if (d.responsavel !== undefined) updates.responsavel = d.responsavel;
  if (d.cnpjCpf !== undefined) {
    const norm = normCnpjCpf(d.cnpjCpf);
    if (norm) {
      const v = validateCnpjCpf(norm);
      if (v !== "ok") {
        res.status(400).json({
          error: v === "invalid_length"
            ? "CNPJ/CPF deve ter 11 dígitos (CPF) ou 14 (CNPJ)."
            : "CNPJ/CPF inválido (dígito verificador não confere).",
        });
        return;
      }
    }
    updates.cnpjCpf = norm;
  }
  if (d.registroProfissional !== undefined) updates.registroProfissional = d.registroProfissional;
  if (d.email !== undefined) updates.email = d.email ? d.email.trim().toLowerCase() || null : null;
  if (d.telefone !== undefined) updates.telefone = d.telefone;
  if (d.site !== undefined) updates.site = d.site;
  if (d.temContratoFormal !== undefined) updates.temContratoFormal = d.temContratoFormal;
  if (d.ondeContrato !== undefined) updates.ondeContrato = d.ondeContrato;
  if (d.frequenciaContato !== undefined) updates.frequenciaContato = d.frequenciaContato;
  if (d.observacoes !== undefined) updates.observacoes = d.observacoes;

  try {
    const [parceiro] = await db
      .update(parceirosExternosTable)
      .set(updates)
      .where(and(eq(parceirosExternosTable.id, parceiroId), eq(parceirosExternosTable.clinicId, clinicId)))
      .returning();
    if (!parceiro) {
      res.status(404).json({ error: "Parceiro not found" });
      return;
    }
    res.json(mapParceiro(parceiro));
  } catch (err) {
    if (isDuplicateCnpjCpfError(err)) {
      res.status(409).json({ error: "Já existe um parceiro com este CNPJ/CPF nesta clínica." });
      return;
    }
    throw err;
  }
});

router.delete("/clinics/:clinicId/parceiros-externos/:parceiroId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parceiroId = Array.isArray(req.params.parceiroId) ? req.params.parceiroId[0] : req.params.parceiroId;

  const [parceiro] = await db
    .delete(parceirosExternosTable)
    .where(and(eq(parceirosExternosTable.id, parceiroId), eq(parceirosExternosTable.clinicId, clinicId)))
    .returning();

  if (!parceiro) {
    res.status(404).json({ error: "Parceiro not found" });
    return;
  }
  res.sendStatus(204);
});

// ─── XLSX TEMPLATE / EXPORT / IMPORT ────────────────────────────────────────

const HEADERS = [
  "Nº",
  "Categoria",
  "Nome / Empresa",
  "Responsável",
  "CNPJ / CPF",
  "Registro profissional",
  "E-mail",
  "Telefone / WhatsApp",
  "Site / endereço",
  "Tem contrato formal?",
  "Onde está o contrato?",
  "Frequência de contato",
  "Observações",
];

const COL_WIDTHS = [
  { wch: 5 }, { wch: 22 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 20 },
  { wch: 28 }, { wch: 18 }, { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 30 },
];

const COMMON_CATEGORIES = [
  "Contador",
  "Jurídico Trabalhista",
  "Jurídico Cível",
  "Marketing",
  "Sistema TI",
  "Manutenção predial",
  "Manutenção de equipamentos",
  "PGRSS",
  "Vigilância sanitária",
  "Seguros",
  "Banco / Maquininha",
];

function buildSheet(aoa: unknown[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: HEADERS.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: HEADERS.length - 1 } },
  ];
  ws["!cols"] = COL_WIDTHS;
  ws["!freeze"] = { xSplit: 1, ySplit: 6 };
  return ws;
}

router.get("/clinics/:clinicId/parceiros-externos/template", async (req, res): Promise<void> => {
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

  const localPart = [clinic.cidade, clinic.uf].filter(Boolean).join("/");
  const titleLine = `REDE EXTERNA — ${clinic.nome}`;
  const subtitleLine = `${clinic.cnpj}${localPart ? "  ·  " + localPart : ""}`;
  const instructions =
    "PREENCHIMENTO: cadastre TODOS os parceiros externos (contador, jurídico, marketing, TI, manutenção, PGRSS, vigilância, seguros, bancos, etc). " +
    `CATEGORIAS COMUNS: ${COMMON_CATEGORIES.join(", ")}. ` +
    "TEM CONTRATO FORMAL?: responda Sim ou Não. CNPJ/CPF é a chave de upsert (use só dígitos ou formato BR).";

  const aoa: unknown[][] = [
    [titleLine],
    [subtitleLine],
    [],
    [instructions],
    [],
    HEADERS,
  ];
  // Pre-fill one row per common category so the operator only has to
  // complete the remaining columns. Extra blank rows allow custom entries.
  COMMON_CATEGORIES.forEach((cat, idx) => {
    aoa.push([idx + 1, cat, "", "", "", "", "", "", "", "", "", "", ""]);
  });
  for (let n = 1; n <= 5; n++) {
    aoa.push([COMMON_CATEGORIES.length + n, "", "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const ws = buildSheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rede Externa");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = clinic.nome.replace(/[^\w\-]+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Rede_Externa_${safeName}.xlsx"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});

router.get("/clinics/:clinicId/parceiros-externos/export", async (req, res): Promise<void> => {
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

  const partners = await db
    .select()
    .from(parceirosExternosTable)
    .where(eq(parceirosExternosTable.clinicId, clinicId))
    .orderBy(parceirosExternosTable.tipo, parceirosExternosTable.nomeEmpresa);

  const localPart = [clinic.cidade, clinic.uf].filter(Boolean).join("/");
  const titleLine = `REDE EXTERNA — ${clinic.nome}`;
  const subtitleLine = `${clinic.cnpj}${localPart ? "  ·  " + localPart : ""}`;
  const instructions =
    "EDIÇÃO OFFLINE: atualize os dados abaixo e reimporte pela aba Rede Externa. " +
    "A correspondência usa CNPJ/CPF (preferencial) e fallback Nome+Responsável; mantenha esses campos para evitar duplicidades.";

  const aoa: unknown[][] = [
    [titleLine],
    [subtitleLine],
    [],
    [instructions],
    [],
    HEADERS,
  ];
  partners.forEach((p, idx) => {
    aoa.push([
      idx + 1,
      p.tipo ?? "",
      p.nomeEmpresa ?? "",
      p.responsavel ?? "",
      formatCnpjCpfBR(p.cnpjCpf ?? null),
      p.registroProfissional ?? "",
      p.email ?? "",
      p.telefone ?? "",
      p.site ?? "",
      p.temContratoFormal == null ? "" : p.temContratoFormal ? "Sim" : "Não",
      p.ondeContrato ?? "",
      p.frequenciaContato ?? "",
      p.observacoes ?? "",
    ]);
  });

  const ws = buildSheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rede Externa");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = clinic.nome.replace(/[^\w\-]+/g, "_").slice(0, 60);
  const dateStamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Rede_Externa_${safeName}_${dateStamp}.xlsx"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});

// ── IMPORT ──────────────────────────────────────────────────────────────────

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

async function importClinicAccessGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  if (await assertClinicAccess(req, res, clinicId)) return;
  next();
}

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
  categoria: "tipo",
  tipo: "tipo",
  nome: "nomeEmpresa",
  nomeempresa: "nomeEmpresa",
  empresa: "nomeEmpresa",
  responsavel: "responsavel",
  responsavelcontato: "responsavel",
  contato: "responsavel",
  cnpj: "cnpjCpf",
  cpf: "cnpjCpf",
  cnpjcpf: "cnpjCpf",
  registroprofissional: "registroProfissional",
  registro: "registroProfissional",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  whatsapp: "telefone",
  telefonewhatsapp: "telefone",
  telewhats: "telefone",
  site: "site",
  endereco: "site",
  siteendereco: "site",
  temcontratoformal: "temContratoFormal",
  contratoformal: "temContratoFormal",
  ondeestaocontrato: "ondeContrato",
  ondeestacontrato: "ondeContrato",
  ondeocontrato: "ondeContrato",
  ondecontrato: "ondeContrato",
  frequenciadecontato: "frequenciaContato",
  frequenciacontato: "frequenciaContato",
  frequencia: "frequenciaContato",
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

router.post(
  "/clinics/:clinicId/parceiros-externos/import",
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
      "application/octet-stream",
    ]);
    const filename = file.originalname || "";
    if (!/\.xlsx$/i.test(filename)) {
      res.status(400).json({ error: "Envie um arquivo .xlsx (Excel)." });
      return;
    }
    if (file.mimetype && !ALLOWED_MIME.has(file.mimetype)) {
      res.status(400).json({ error: `Tipo de arquivo não suportado: ${file.mimetype}. Envie um .xlsx.` });
      return;
    }
    if (
      file.buffer.length < 4 ||
      !(file.buffer[0] === 0x50 && file.buffer[1] === 0x4b && file.buffer[2] === 0x03 && file.buffer[3] === 0x04)
    ) {
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

    let headerRowIdx = -1;
    let headerMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i] ?? [];
      const map: Record<string, number> = {};
      for (let c = 0; c < row.length; c++) {
        const key = HEADER_ALIASES[normalizeHeader(row[c])];
        if (key && map[key] === undefined) map[key] = c;
      }
      // Strict header detection: require both 'Categoria' (tipo) and
      // 'Nome / Empresa' (nomeEmpresa) plus at least one identifier column
      // (CNPJ/CPF or Responsável). This rejects arbitrary sheets and
      // mistakenly uploaded workbooks (e.g. the Equipe/Quadro Funcional one).
      const hasCore = map.tipo !== undefined && map.nomeEmpresa !== undefined;
      const hasIdentifier = map.cnpjCpf !== undefined || map.responsavel !== undefined;
      if (hasCore && hasIdentifier) {
        headerRowIdx = i;
        headerMap = map;
        break;
      }
    }

    if (headerRowIdx === -1) {
      res.status(400).json({
        error:
          "Cabeçalho não encontrado. Use o template Rede Externa: são obrigatórias as colunas 'Categoria', 'Nome / Empresa' e ao menos uma de 'CNPJ / CPF' ou 'Responsável'.",
      });
      return;
    }

    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(parceirosExternosTable)
          .where(eq(parceirosExternosTable.clinicId, clinicId));

        const byCnpjCpf = new Map<string, typeof parceirosExternosTable.$inferSelect>();
        const byNomeResp = new Map<string, typeof parceirosExternosTable.$inferSelect>();
        const fallbackKey = (nome: string | null, resp: string | null) =>
          `${(nome ?? "").toLowerCase().trim()}|${(resp ?? "").toLowerCase().trim()}`;

        for (const p of existing) {
          if (p.cnpjCpf) byCnpjCpf.set(p.cnpjCpf, p);
          if (p.nomeEmpresa) byNomeResp.set(fallbackKey(p.nomeEmpresa, p.responsavel), p);
        }

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const xlsxRow = i + 1;
          const row = rows[i] ?? [];
          if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

          const get = (key: string): unknown => {
            const idx = headerMap[key];
            return idx === undefined ? null : row[idx];
          };

          const tipo = normText(get("tipo"));
          const nomeEmpresa = normText(get("nomeEmpresa"));

          // Skip blank rows quietly (templates ship with 3 numbered empty rows)
          if (!tipo && !nomeEmpresa) continue;

          if (!tipo) {
            summary.errors.push({ row: xlsxRow, field: "tipo", message: "Categoria é obrigatória" });
            summary.skipped++;
            continue;
          }

          const cnpjCpf = normCnpjCpf(get("cnpjCpf"));
          if (cnpjCpf) {
            const v = validateCnpjCpf(cnpjCpf);
            if (v === "invalid_length") {
              summary.errors.push({
                row: xlsxRow,
                field: "cnpjCpf",
                message: `CNPJ/CPF inválido (use 11 dígitos para CPF ou 14 para CNPJ)`,
              });
              summary.skipped++;
              continue;
            }
            if (v === "invalid_dv") {
              summary.errors.push({
                row: xlsxRow,
                field: "cnpjCpf",
                message: `CNPJ/CPF inválido (dígito verificador não confere): ${cnpjCpf}`,
              });
              summary.skipped++;
              continue;
            }
          }

          const email = normEmail(get("email"));
          if (email && !EMAIL_RE.test(email)) {
            summary.errors.push({ row: xlsxRow, field: "email", message: `E-mail inválido: ${email}` });
            summary.skipped++;
            continue;
          }

          const temContratoRaw = get("temContratoFormal");
          const temContrato = normBoolean(temContratoRaw);
          if (temContratoRaw != null && String(temContratoRaw).trim() !== "" && temContrato === null) {
            summary.errors.push({
              row: xlsxRow,
              field: "temContratoFormal",
              message: `Valor não reconhecido para 'Tem contrato formal?': "${temContratoRaw}". Use Sim ou Não.`,
            });
            summary.skipped++;
            continue;
          }

          const responsavel = normText(get("responsavel"));

          const values = {
            clinicId,
            tipo,
            nomeEmpresa,
            responsavel,
            cnpjCpf,
            registroProfissional: normText(get("registroProfissional")),
            email,
            telefone: normText(get("telefone")),
            site: normText(get("site")),
            temContratoFormal: temContrato,
            ondeContrato: normText(get("ondeContrato")),
            frequenciaContato: normText(get("frequenciaContato")),
            observacoes: normText(get("observacoes")),
          };

          try {
            const cnpjMatch = cnpjCpf ? byCnpjCpf.get(cnpjCpf) : undefined;
            const fbMatch = !cnpjMatch ? byNomeResp.get(fallbackKey(nomeEmpresa, responsavel)) : undefined;
            const match = cnpjMatch ?? fbMatch;

            if (match) {
              const updates: Partial<typeof parceirosExternosTable.$inferInsert> = {};
              for (const [k, v] of Object.entries(values)) {
                if (k === "clinicId") continue;
                if (v != null && v !== "") {
                  (updates as Record<string, unknown>)[k] = v;
                }
              }
              if (Object.keys(updates).length > 0) {
                await tx.update(parceirosExternosTable).set(updates).where(eq(parceirosExternosTable.id, match.id));
              }
              summary.updated++;
              const merged = { ...match, ...updates } as typeof parceirosExternosTable.$inferSelect;
              if (cnpjCpf) byCnpjCpf.set(cnpjCpf, merged);
              if (merged.nomeEmpresa) byNomeResp.set(fallbackKey(merged.nomeEmpresa, merged.responsavel), merged);
            } else {
              const [created] = await tx.insert(parceirosExternosTable).values(values).returning();
              summary.created++;
              if (created.cnpjCpf) byCnpjCpf.set(created.cnpjCpf, created);
              if (created.nomeEmpresa) byNomeResp.set(fallbackKey(created.nomeEmpresa, created.responsavel), created);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : "Erro ao gravar linha";
            summary.errors.push({ row: xlsxRow, message });
            summary.skipped++;
            throw new Error("__import_row_failed__");
          }
        }
      });
    } catch (err) {
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

export default router;
