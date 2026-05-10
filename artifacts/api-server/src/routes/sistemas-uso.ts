import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import multer, { MulterError } from "multer";
import * as XLSX from "xlsx";
import { db, sistemasUsoTable, clinicsTable } from "@workspace/db";
import {
  CreateSistemaUsoBody,
  UpdateSistemaUsoBody,
} from "@workspace/api-zod";
import { assertClinicAccess } from "../middleware/auth";

const router: IRouter = Router();

// ─── helpers ────────────────────────────────────────────────────────────────

function mapSistema(s: typeof sistemasUsoTable.$inferSelect) {
  return {
    id: s.id,
    clinicId: s.clinicId,
    nome: s.nome,
    fornecedor: s.fornecedor ?? null,
    tipo: s.tipo ?? null,
    site: s.site ?? null,
    responsavelInterno: s.responsavelInterno ?? null,
    emailResponsavel: s.emailResponsavel ?? null,
    telefoneResponsavel: s.telefoneResponsavel ?? null,
    suporteExterno: s.suporteExterno ?? null,
    criticidade: s.criticidade ?? null,
    apiDisponivel: s.apiDisponivel ?? null,
    integrado: s.integrado ?? false,
    quemTemAcesso: s.quemTemAcesso ?? null,
    observacoes: s.observacoes ?? null,
    createdAt: s.createdAt.toISOString(),
  };
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

function normCriticidade(raw: unknown): string | null {
  const s = normText(raw);
  if (!s) return null;
  const k = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (k.startsWith("alta") || k === "a") return "Alta";
  if (k.startsWith("med") || k === "m") return "Média";
  if (k.startsWith("baix") || k === "b") return "Baixa";
  return s;
}

function normApiDisponivel(raw: unknown): string | null {
  const s = normText(raw);
  if (!s) return null;
  const k = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (k === "sim" || k === "s" || k === "yes" || k === "y" || k === "true" || k === "1") return "Sim";
  if (k === "nao" || k === "n" || k === "no" || k === "false" || k === "0") return "Não";
  if (k.includes("valid") || k.includes("avaliar") || k.includes("verific") || k === "?") return "A validar";
  return s;
}

const composedKey = (nome: string | null, fornecedor: string | null, tipo: string | null) =>
  `${(nome ?? "").toLowerCase().trim()}|${(fornecedor ?? "").toLowerCase().trim()}|${(tipo ?? "").toLowerCase().trim()}`;

// ─── CRUD ───────────────────────────────────────────────────────────────────

router.get("/clinics/:clinicId/sistemas-uso", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;

  const rows = await db
    .select()
    .from(sistemasUsoTable)
    .where(eq(sistemasUsoTable.clinicId, clinicId))
    .orderBy(sistemasUsoTable.tipo, sistemasUsoTable.nome);

  res.json(rows.map(mapSistema));
});

router.post("/clinics/:clinicId/sistemas-uso", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const parsed = CreateSistemaUsoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const nomeTrim = d.nome.trim();
  if (!nomeTrim) {
    res.status(400).json({ error: "Nome do sistema é obrigatório." });
    return;
  }
  const email = d.emailResponsavel ? d.emailResponsavel.trim().toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "E-mail do responsável inválido." });
    return;
  }

  const [sistema] = await db
    .insert(sistemasUsoTable)
    .values({
      clinicId,
      nome: nomeTrim,
      fornecedor: d.fornecedor ?? null,
      tipo: d.tipo ?? null,
      site: d.site ?? null,
      responsavelInterno: d.responsavelInterno ?? null,
      emailResponsavel: email,
      telefoneResponsavel: d.telefoneResponsavel ?? null,
      suporteExterno: d.suporteExterno ?? null,
      criticidade: normCriticidade(d.criticidade),
      apiDisponivel: normApiDisponivel(d.apiDisponivel),
      integrado: d.integrado ?? false,
      quemTemAcesso: d.quemTemAcesso ?? null,
      observacoes: d.observacoes ?? null,
    })
    .returning();

  res.status(201).json(mapSistema(sistema));
});

router.patch("/clinics/:clinicId/sistemas-uso/:sistemaId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const sistemaId = Array.isArray(req.params.sistemaId) ? req.params.sistemaId[0] : req.params.sistemaId;
  const parsed = UpdateSistemaUsoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;

  const updates: Partial<typeof sistemasUsoTable.$inferInsert> = {};
  if (d.nome != null) {
    const t = d.nome.trim();
    if (!t) {
      res.status(400).json({ error: "Nome do sistema não pode ser vazio." });
      return;
    }
    updates.nome = t;
  }
  if (d.fornecedor !== undefined) updates.fornecedor = d.fornecedor;
  if (d.tipo !== undefined) updates.tipo = d.tipo;
  if (d.site !== undefined) updates.site = d.site;
  if (d.responsavelInterno !== undefined) updates.responsavelInterno = d.responsavelInterno;
  if (d.emailResponsavel !== undefined) {
    const email = d.emailResponsavel ? d.emailResponsavel.trim().toLowerCase() || null : null;
    if (email && !EMAIL_RE.test(email)) {
      res.status(400).json({ error: "E-mail do responsável inválido." });
      return;
    }
    updates.emailResponsavel = email;
  }
  if (d.telefoneResponsavel !== undefined) updates.telefoneResponsavel = d.telefoneResponsavel;
  if (d.suporteExterno !== undefined) updates.suporteExterno = d.suporteExterno;
  if (d.criticidade !== undefined) updates.criticidade = normCriticidade(d.criticidade);
  if (d.apiDisponivel !== undefined) updates.apiDisponivel = normApiDisponivel(d.apiDisponivel);
  if (d.integrado !== undefined) updates.integrado = d.integrado ?? false;
  if (d.quemTemAcesso !== undefined) updates.quemTemAcesso = d.quemTemAcesso;
  if (d.observacoes !== undefined) updates.observacoes = d.observacoes;

  const [sistema] = await db
    .update(sistemasUsoTable)
    .set(updates)
    .where(and(eq(sistemasUsoTable.id, sistemaId), eq(sistemasUsoTable.clinicId, clinicId)))
    .returning();

  if (!sistema) {
    res.status(404).json({ error: "Sistema not found" });
    return;
  }
  res.json(mapSistema(sistema));
});

router.delete("/clinics/:clinicId/sistemas-uso/:sistemaId", async (req, res): Promise<void> => {
  const clinicId = Array.isArray(req.params.clinicId) ? req.params.clinicId[0] : req.params.clinicId;
  const sistemaId = Array.isArray(req.params.sistemaId) ? req.params.sistemaId[0] : req.params.sistemaId;

  const [sistema] = await db
    .delete(sistemasUsoTable)
    .where(and(eq(sistemasUsoTable.id, sistemaId), eq(sistemasUsoTable.clinicId, clinicId)))
    .returning();

  if (!sistema) {
    res.status(404).json({ error: "Sistema not found" });
    return;
  }
  res.sendStatus(204);
});

// ─── XLSX TEMPLATE / EXPORT / IMPORT ────────────────────────────────────────

const HEADERS = [
  "Nº",
  "Nome do Sistema",
  "Fornecedor",
  "Tipo",
  "Site / URL",
  "Responsável Interno",
  "E-mail",
  "Telefone",
  "Suporte Externo",
  "Criticidade",
  "API Disponível",
  "Integrado ao IONEX360",
  "Quem tem acesso",
  "Observações",
];

const COL_WIDTHS = [
  { wch: 5 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 30 }, { wch: 22 },
  { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
  { wch: 26 }, { wch: 32 },
];

const COMMON_TIPOS = [
  "Prontuário",
  "Agenda",
  "ERP",
  "Faturamento",
  "Comunicação",
  "Mídia social",
  "E-mail / Drive",
  "Contábil",
  "Pagamento",
  "Site",
  "Planilhas Excel/ICS",
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

router.get("/clinics/:clinicId/sistemas-uso/template", async (req, res): Promise<void> => {
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
  const titleLine = `SISTEMAS E ACESSOS — ${clinic.nome}`;
  const subtitleLine = `${clinic.cnpj}${localPart ? "  ·  " + localPart : ""}`;
  const instructions =
    "PREENCHIMENTO: liste TODOS os sistemas em uso na clínica (prontuário, agenda, ERP, faturamento, comunicação, mídia social, e-mail, contábil, pagamento, site, planilhas críticas etc). " +
    `TIPOS COMUNS: ${COMMON_TIPOS.join(", ")}. ` +
    "CRITICIDADE: Alta, Média ou Baixa. API DISPONÍVEL: Sim, Não ou A validar. INTEGRADO AO IONEX360: Sim ou Não. " +
    "Chave de upsert: (Nome + Fornecedor + Tipo).";

  const aoa: unknown[][] = [
    [titleLine],
    [subtitleLine],
    [],
    [instructions],
    [],
    HEADERS,
  ];
  // Pre-fill one row per common tipo so the operator only completes
  // remaining columns. Extra blank rows allow custom entries.
  COMMON_TIPOS.forEach((tipo, idx) => {
    aoa.push([idx + 1, "", "", tipo, "", "", "", "", "", "", "", "Não", "", ""]);
  });
  for (let n = 1; n <= 5; n++) {
    aoa.push([COMMON_TIPOS.length + n, "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const ws = buildSheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sistemas e Acessos");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = clinic.nome.replace(/[^\w\-]+/g, "_").slice(0, 60);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Sistemas_e_Acessos_${safeName}.xlsx"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buf);
});

router.get("/clinics/:clinicId/sistemas-uso/export", async (req, res): Promise<void> => {
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

  const sistemasRaw = await db
    .select()
    .from(sistemasUsoTable)
    .where(eq(sistemasUsoTable.clinicId, clinicId));

  // Required order: criticidade (Alta → Média → Baixa → outras) then nome.
  const critRank = (c: string | null): number => {
    if (!c) return 4;
    const k = c.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (k.startsWith("alta")) return 0;
    if (k.startsWith("med")) return 1;
    if (k.startsWith("baix")) return 2;
    return 3;
  };
  const sistemas = sistemasRaw.slice().sort((a, b) => {
    const ra = critRank(a.criticidade);
    const rb = critRank(b.criticidade);
    if (ra !== rb) return ra - rb;
    return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
  });

  const localPart = [clinic.cidade, clinic.uf].filter(Boolean).join("/");
  const titleLine = `SISTEMAS E ACESSOS — ${clinic.nome}`;
  const subtitleLine = `${clinic.cnpj}${localPart ? "  ·  " + localPart : ""}`;
  const instructions =
    "EDIÇÃO OFFLINE: atualize os dados abaixo e reimporte pela aba Sistemas e Acessos. " +
    "A correspondência usa Nome + Fornecedor + Tipo; mantenha esses campos para evitar duplicidades.";

  const aoa: unknown[][] = [
    [titleLine],
    [subtitleLine],
    [],
    [instructions],
    [],
    HEADERS,
  ];
  sistemas.forEach((s, idx) => {
    aoa.push([
      idx + 1,
      s.nome ?? "",
      s.fornecedor ?? "",
      s.tipo ?? "",
      s.site ?? "",
      s.responsavelInterno ?? "",
      s.emailResponsavel ?? "",
      s.telefoneResponsavel ?? "",
      s.suporteExterno ?? "",
      s.criticidade ?? "",
      s.apiDisponivel ?? "",
      s.integrado ? "Sim" : "Não",
      s.quemTemAcesso ?? "",
      s.observacoes ?? "",
    ]);
  });

  const ws = buildSheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sistemas e Acessos");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const safeName = clinic.nome.replace(/[^\w\-]+/g, "_").slice(0, 60);
  const dateStamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Sistemas_e_Acessos_${safeName}_${dateStamp}.xlsx"`);
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
  nomedosistema: "nome",
  nomesistema: "nome",
  sistema: "nome",
  nome: "nome",
  fornecedor: "fornecedor",
  empresafornecedora: "fornecedor",
  tipo: "tipo",
  categoria: "tipo",
  site: "site",
  siteurl: "site",
  url: "site",
  endereco: "site",
  responsavelinterno: "responsavelInterno",
  responsavel: "responsavelInterno",
  email: "emailResponsavel",
  "e-mail": "emailResponsavel",
  emailresponsavel: "emailResponsavel",
  telefone: "telefoneResponsavel",
  telefoneresponsavel: "telefoneResponsavel",
  whatsapp: "telefoneResponsavel",
  suporteexterno: "suporteExterno",
  suporte: "suporteExterno",
  criticidade: "criticidade",
  apidisponivel: "apiDisponivel",
  api: "apiDisponivel",
  integrado: "integrado",
  integradoaoionex360: "integrado",
  integradoionex: "integrado",
  integradoionex360: "integrado",
  quemtemacesso: "quemTemAcesso",
  acessos: "quemTemAcesso",
  acesso: "quemTemAcesso",
  observacoes: "observacoes",
  observacao: "observacoes",
  obs: "observacoes",
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
  "/clinics/:clinicId/sistemas-uso/import",
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
      // Strict header detection: require 'Nome do Sistema' plus at least one
      // of (Fornecedor / Tipo) so we reject arbitrary sheets and mistakenly
      // uploaded workbooks (e.g. Equipe / Rede Externa).
      const hasNome = map.nome !== undefined;
      const hasComplement = map.fornecedor !== undefined || map.tipo !== undefined;
      if (hasNome && hasComplement) {
        headerRowIdx = i;
        headerMap = map;
        break;
      }
    }

    if (headerRowIdx === -1) {
      res.status(400).json({
        error:
          "Cabeçalho não encontrado. Use o template Sistemas e Acessos: são obrigatórias as colunas 'Nome do Sistema' e ao menos uma de 'Fornecedor' ou 'Tipo'.",
      });
      return;
    }

    const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(sistemasUsoTable)
          .where(eq(sistemasUsoTable.clinicId, clinicId));

        const byKey = new Map<string, typeof sistemasUsoTable.$inferSelect>();
        for (const s of existing) {
          byKey.set(composedKey(s.nome, s.fornecedor, s.tipo), s);
        }

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const xlsxRow = i + 1;
          const row = rows[i] ?? [];
          if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

          const get = (key: string): unknown => {
            const idx = headerMap[key];
            return idx === undefined ? null : row[idx];
          };

          const nome = normText(get("nome"));
          if (!nome) {
            // Fully blank row (template ships with prefilled blank rows) → skip silently.
            const tipoMaybe = normText(get("tipo"));
            const fornMaybe = normText(get("fornecedor"));
            if (!tipoMaybe && !fornMaybe) continue;
            summary.errors.push({ row: xlsxRow, field: "nome", message: "Nome do sistema é obrigatório" });
            summary.skipped++;
            continue;
          }

          const fornecedor = normText(get("fornecedor"));
          const tipo = normText(get("tipo"));

          const email = normEmail(get("emailResponsavel"));
          if (email && !EMAIL_RE.test(email)) {
            summary.errors.push({ row: xlsxRow, field: "emailResponsavel", message: `E-mail inválido: ${email}` });
            summary.skipped++;
            continue;
          }

          const integradoRaw = get("integrado");
          const integrado = normBoolean(integradoRaw);
          if (integradoRaw != null && String(integradoRaw).trim() !== "" && integrado === null) {
            summary.errors.push({
              row: xlsxRow,
              field: "integrado",
              message: `Valor não reconhecido para 'Integrado ao IONEX360': "${integradoRaw}". Use Sim ou Não.`,
            });
            summary.skipped++;
            continue;
          }

          const values = {
            clinicId,
            nome,
            fornecedor,
            tipo,
            site: normText(get("site")),
            responsavelInterno: normText(get("responsavelInterno")),
            emailResponsavel: email,
            telefoneResponsavel: normText(get("telefoneResponsavel")),
            suporteExterno: normText(get("suporteExterno")),
            criticidade: normCriticidade(get("criticidade")),
            apiDisponivel: normApiDisponivel(get("apiDisponivel")),
            integrado: integrado ?? false,
            quemTemAcesso: normText(get("quemTemAcesso")),
            observacoes: normText(get("observacoes")),
          };

          const key = composedKey(nome, fornecedor, tipo);
          // Duplicates within the same spreadsheet (same nome+fornecedor+tipo)
          // are merged/updated against the in-memory `byKey` map — last
          // non-null value wins, matching the upsert behavior used for
          // existing database matches.

          try {
            const match = byKey.get(key);
            if (match) {
              const updates: Partial<typeof sistemasUsoTable.$inferInsert> = {};
              for (const [k, v] of Object.entries(values)) {
                if (k === "clinicId") continue;
                if (k === "integrado") {
                  // Only overwrite integrado when the spreadsheet provided a
                  // recognizable value. integradoRaw was validated above; if
                  // null/blank we keep the existing flag.
                  if (integradoRaw != null && String(integradoRaw).trim() !== "") {
                    (updates as Record<string, unknown>)[k] = v;
                  }
                  continue;
                }
                if (v != null && v !== "") {
                  (updates as Record<string, unknown>)[k] = v;
                }
              }
              if (Object.keys(updates).length > 0) {
                await tx.update(sistemasUsoTable).set(updates).where(eq(sistemasUsoTable.id, match.id));
              }
              summary.updated++;
              const merged = { ...match, ...updates } as typeof sistemasUsoTable.$inferSelect;
              byKey.set(composedKey(merged.nome, merged.fornecedor, merged.tipo), merged);
            } else {
              const [created] = await tx.insert(sistemasUsoTable).values(values).returning();
              summary.created++;
              byKey.set(composedKey(created.nome, created.fornecedor, created.tipo), created);
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
