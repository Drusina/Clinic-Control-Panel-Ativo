import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { CondicoesComerciaisSnapshot } from "@workspace/db";
import { sha256Hex, formatBRDate } from "./lgpd-pdf.js";
import type { ContratadaInfo, ContratanteInfo } from "./lgpd-pdf.js";

/**
 * Renderizador de PDFs comerciais CLINIONEX360 (Proposta / Contrato),
 * espelhado no padrão de `lgpd-pdf.ts` mas com identidade própria.
 *
 * Diferenças relevantes em relação ao renderizador de LGPD:
 *   - Paleta CLINIONEX360 (#0B1F33 / #0F5F8F / #00A3D9 / #F4F7FA / #4A5568).
 *   - Parser markdown-ish estendido: além de `## ### `, listas e `**negrito**`,
 *     entende `# h1`, `---` (régua) e os marcadores estruturados
 *     `[[CONDICOES_COMERCIAIS]]` (tabela) e `[[ASSINATURAS]]` (blocos de
 *     assinatura). Cada linha não vazia é um parágrafo próprio (sem junção),
 *     preservando enumerações (I., II., ...) e pares "rótulo: valor".
 *   - Substituição de placeholders específica do domínio comercial.
 *
 * Reaproveita `sha256Hex` e `formatBRDate` de `lgpd-pdf.ts`.
 */

export type CommercialTipo = "proposta" | "contrato";

export interface RenderCommercialOptions {
  tipo: CommercialTipo;
  titulo: string;
  corpo: string;
  versao: number;
  contratada: ContratadaInfo;
  contratante: ContratanteInfo;
  conditions: CondicoesComerciaisSnapshot;
  data?: Date;
}

// ─── Paleta CLINIONEX360 ───────────────────────────────────────────────────

const NAVY = rgb(0.043, 0.122, 0.2); // #0B1F33
const PRIMARY = rgb(0.059, 0.373, 0.561); // #0F5F8F
const ACCENT = rgb(0, 0.639, 0.851); // #00A3D9
const LIGHT = rgb(0.957, 0.969, 0.98); // #F4F7FA
const GRAY = rgb(0.29, 0.333, 0.408); // #4A5568
const TEXT = rgb(0.13, 0.17, 0.24);
const BORDER = rgb(0.8, 0.84, 0.88);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const LINE_HEIGHT = 14;
const PARAGRAPH_GAP = 6;
const BODY_SIZE = 10;

const FORMA_LABELS: Record<string, string> = {
  boleto: "Boleto Bancário",
  pix: "PIX",
  cartao: "Cartão de Crédito",
  transferencia: "Transferência Bancária",
};

// ─── Renderizador público ──────────────────────────────────────────────────

export async function renderCommercialPdf(
  opts: RenderCommercialOptions,
): Promise<{ bytes: Uint8Array; hash: string }> {
  const data = opts.data ?? new Date();
  const map = buildPlaceholderMap(opts, data);
  const corpoFinal = substituteCommercialPlaceholders(opts.corpo, map);
  const conditionsRows = buildConditionsRows(opts.conditions);
  const especiaisText = opts.conditions.condicoesEspeciais?.trim() || null;
  const signatureBlocks = buildSignatureBlocks(opts, map);

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const ctx: RenderCtx = {
    doc,
    bold,
    regular,
    italic,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_TOP,
  };

  drawHeader(ctx, opts.titulo);
  drawBody(ctx, corpoFinal, { conditionsRows, especiaisText, signatureBlocks });
  drawDocumentFooter(ctx, opts.versao, data);

  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    drawPageFooter(p, regular, i + 1, doc.getPageCount(), opts.titulo);
  }

  const bytes = await doc.save();
  const hash = sha256Hex(bytes);
  return { bytes, hash };
}

// ─── Contexto de renderização ──────────────────────────────────────────────

interface RenderCtx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  bold: PDFFont;
  regular: PDFFont;
  italic: PDFFont;
}

function newPage(ctx: RenderCtx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function ensureSpace(ctx: RenderCtx, needed: number) {
  if (ctx.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

// ─── Primitivas de desenho ─────────────────────────────────────────────────

function drawHeader(ctx: RenderCtx, title: string) {
  // Wordmark CLINIONEX360
  ctx.page.drawText("CLINIONEX", {
    x: MARGIN_X,
    y: ctx.y,
    font: ctx.bold,
    size: 21,
    color: PRIMARY,
  });
  const w = ctx.bold.widthOfTextAtSize("CLINIONEX", 21);
  ctx.page.drawText("360", {
    x: MARGIN_X + w,
    y: ctx.y,
    font: ctx.bold,
    size: 21,
    color: ACCENT,
  });

  ctx.page.drawText(
    "Inteligência Empresarial através de Assessoria Consultiva",
    { x: MARGIN_X, y: ctx.y - 14, font: ctx.regular, size: 8.5, color: GRAY },
  );

  ctx.y -= 32;

  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y,
    width: CONTENT_W,
    height: 2.2,
    color: ACCENT,
  });
  ctx.y -= 18;

  const titleLines = wrapByMeasure(title, ctx.bold, 16, CONTENT_W);
  for (const line of titleLines) {
    ensureSpace(ctx, 22);
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y,
      font: ctx.bold,
      size: 16,
      color: NAVY,
    });
    ctx.y -= 22;
  }
  ctx.y -= 4;
}

interface BodyExtras {
  conditionsRows: KvRow[];
  especiaisText: string | null;
  signatureBlocks: SignatureBlock[];
}

function drawBody(ctx: RenderCtx, body: string, extras: BodyExtras) {
  ctx.y -= 4;
  const blocks = parseBlocks(body);

  for (const block of blocks) {
    if (block.kind === "h1") {
      ensureSpace(ctx, 30);
      ctx.y -= 8;
      for (const line of wrapByMeasure(block.text, ctx.bold, 14, CONTENT_W)) {
        ensureSpace(ctx, 20);
        ctx.page.drawText(line, {
          x: MARGIN_X,
          y: ctx.y,
          font: ctx.bold,
          size: 14,
          color: PRIMARY,
        });
        ctx.y -= 19;
      }
      ctx.y -= 4;
    } else if (block.kind === "h2") {
      ensureSpace(ctx, 24);
      ctx.y -= 5;
      for (const line of wrapByMeasure(block.text, ctx.bold, 12, CONTENT_W)) {
        ensureSpace(ctx, 18);
        ctx.page.drawText(line, {
          x: MARGIN_X,
          y: ctx.y,
          font: ctx.bold,
          size: 12,
          color: NAVY,
        });
        ctx.y -= 16;
      }
      ctx.y -= 3;
    } else if (block.kind === "h3") {
      ensureSpace(ctx, 20);
      ctx.y -= 2;
      for (const line of wrapByMeasure(block.text, ctx.bold, 10.5, CONTENT_W)) {
        ensureSpace(ctx, 15);
        ctx.page.drawText(line, {
          x: MARGIN_X,
          y: ctx.y,
          font: ctx.bold,
          size: 10.5,
          color: GRAY,
        });
        ctx.y -= 15;
      }
      ctx.y -= 2;
    } else if (block.kind === "hr") {
      ensureSpace(ctx, 12);
      ctx.y -= 4;
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: ctx.y,
        width: CONTENT_W,
        height: 0.6,
        color: BORDER,
      });
      ctx.y -= 8;
    } else if (block.kind === "conditions") {
      drawConditionsTable(ctx, extras.conditionsRows);
    } else if (block.kind === "especiais") {
      drawEspeciais(ctx, extras.especiaisText);
    } else if (block.kind === "signatures") {
      drawSignatureBlocks(ctx, extras.signatureBlocks);
    } else if (block.kind === "bullet") {
      for (const item of block.items) {
        ensureSpace(ctx, BODY_SIZE + 6);
        const textX = MARGIN_X + 18;
        ctx.page.drawText("•", {
          x: MARGIN_X + 6,
          y: ctx.y,
          font: ctx.regular,
          size: BODY_SIZE,
          color: ACCENT,
        });
        const lines = wrapByMeasure(item, ctx.regular, BODY_SIZE, CONTENT_W - 18);
        for (const line of lines) {
          ensureSpace(ctx, LINE_HEIGHT);
          ctx.page.drawText(line, {
            x: textX,
            y: ctx.y,
            font: ctx.regular,
            size: BODY_SIZE,
            color: TEXT,
          });
          ctx.y -= LINE_HEIGHT;
        }
      }
      ctx.y -= 4;
    } else {
      // parágrafo (com **negrito** inline)
      const segments = parseInlineBold(block.text);
      const wrapped = wrapMixed(segments, ctx.regular, ctx.bold, BODY_SIZE, CONTENT_W);
      for (const lineSegs of wrapped) {
        ensureSpace(ctx, LINE_HEIGHT);
        let x = MARGIN_X;
        for (const seg of lineSegs) {
          const f = seg.bold ? ctx.bold : ctx.regular;
          ctx.page.drawText(seg.text, {
            x,
            y: ctx.y,
            font: f,
            size: BODY_SIZE,
            color: TEXT,
          });
          x += f.widthOfTextAtSize(seg.text, BODY_SIZE);
        }
        ctx.y -= LINE_HEIGHT;
      }
      ctx.y -= PARAGRAPH_GAP;
    }
  }
}

interface KvRow {
  label: string;
  value: string;
}

function drawConditionsTable(ctx: RenderCtx, rows: KvRow[]) {
  if (rows.length === 0) return;
  const rowH = 18;
  const labelColW = CONTENT_W * 0.42;
  ensureSpace(ctx, rows.length * rowH + 12);
  ctx.y -= 2;

  const startBaseline = ctx.y;
  const tableTop = startBaseline + 13;

  for (const r of rows) {
    const baseline = ctx.y;
    const rectY = baseline - 5;
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: rectY,
      width: labelColW,
      height: rowH,
      color: LIGHT,
    });
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: rectY },
      end: { x: MARGIN_X + CONTENT_W, y: rectY },
      thickness: 0.5,
      color: BORDER,
    });
    ctx.page.drawText(r.label, {
      x: MARGIN_X + 8,
      y: baseline,
      font: ctx.bold,
      size: 9.5,
      color: NAVY,
    });
    const valX = MARGIN_X + labelColW + 8;
    const valW = CONTENT_W - labelColW - 16;
    const vlines = wrapByMeasure(r.value || "—", ctx.regular, 9.5, valW);
    ctx.page.drawText(vlines[0] ?? "—", {
      x: valX,
      y: baseline,
      font: ctx.regular,
      size: 9.5,
      color: TEXT,
    });
    ctx.y -= rowH;
  }

  const tableBottom = ctx.y + 13;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: tableTop },
    end: { x: MARGIN_X + CONTENT_W, y: tableTop },
    thickness: 0.5,
    color: BORDER,
  });
  for (const vx of [MARGIN_X, MARGIN_X + labelColW, MARGIN_X + CONTENT_W]) {
    ctx.page.drawLine({
      start: { x: vx, y: tableTop },
      end: { x: vx, y: tableBottom },
      thickness: 0.5,
      color: BORDER,
    });
  }
  ctx.y -= 8;
}

function drawEspeciais(ctx: RenderCtx, text: string | null) {
  if (!text) return;
  ctx.y -= 6;

  // Subtítulo
  ensureSpace(ctx, 20);
  for (const line of wrapByMeasure("Condições Especiais", ctx.bold, 10.5, CONTENT_W)) {
    ensureSpace(ctx, 15);
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: ctx.y,
      font: ctx.bold,
      size: 10.5,
      color: NAVY,
    });
    ctx.y -= 15;
  }
  ctx.y -= 2;

  // Corpo (preserva quebras de linha do operador; cada linha vira parágrafo)
  for (const para of text.split(/\r?\n/)) {
    const trimmed = para.trim();
    if (trimmed === "") {
      ctx.y -= PARAGRAPH_GAP;
      continue;
    }
    const segments = parseInlineBold(trimmed);
    const wrapped = wrapMixed(segments, ctx.regular, ctx.bold, BODY_SIZE, CONTENT_W);
    for (const lineSegs of wrapped) {
      ensureSpace(ctx, LINE_HEIGHT);
      let x = MARGIN_X;
      for (const seg of lineSegs) {
        const f = seg.bold ? ctx.bold : ctx.regular;
        ctx.page.drawText(seg.text, {
          x,
          y: ctx.y,
          font: f,
          size: BODY_SIZE,
          color: TEXT,
        });
        x += f.widthOfTextAtSize(seg.text, BODY_SIZE);
      }
      ctx.y -= LINE_HEIGHT;
    }
  }
  ctx.y -= PARAGRAPH_GAP;
}

interface SignatureBlock {
  papel: string;
  linhas: KvRow[];
}

function drawSignatureBlocks(ctx: RenderCtx, blocks: SignatureBlock[]) {
  if (blocks.length === 0) return;
  ctx.y -= 10;
  const colGap = 24;
  const colW = (CONTENT_W - colGap) / 2;

  for (let i = 0; i < blocks.length; i += 2) {
    const pair = [blocks[i], blocks[i + 1]].filter(Boolean) as SignatureBlock[];
    const maxLinhas = Math.max(...pair.map((b) => b.linhas.length));
    const blockH = 14 + 14 + maxLinhas * 12 + 14;
    ensureSpace(ctx, blockH);
    const rowTop = ctx.y;

    pair.forEach((b, idx) => {
      const x = MARGIN_X + idx * (colW + colGap);
      let yy = rowTop;
      // Linha de assinatura
      ctx.page.drawLine({
        start: { x, y: yy },
        end: { x: x + colW - 12, y: yy },
        thickness: 0.8,
        color: GRAY,
      });
      yy -= 12;
      ctx.page.drawText(b.papel, {
        x,
        y: yy,
        font: ctx.bold,
        size: 9,
        color: PRIMARY,
      });
      yy -= 12;
      for (const ln of b.linhas) {
        const txt = ln.label ? `${ln.label}: ${ln.value}` : ln.value;
        ctx.page.drawText(truncate(txt, 58), {
          x,
          y: yy,
          font: ctx.regular,
          size: 9,
          color: TEXT,
        });
        yy -= 12;
      }
    });

    ctx.y = rowTop - blockH;
  }
}

function drawDocumentFooter(ctx: RenderCtx, versao: number, data: Date) {
  ensureSpace(ctx, 30);
  ctx.y -= 8;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y,
    width: CONTENT_W,
    height: 0.8,
    color: GRAY,
  });
  ctx.y -= 12;
  ctx.page.drawText(
    `Versão ${versao} · Documento gerado em ${formatBRDate(data)}`,
    { x: MARGIN_X, y: ctx.y, font: ctx.italic, size: 8.5, color: GRAY },
  );
  ctx.y -= 12;
}

function drawPageFooter(
  page: PDFPage,
  font: PDFFont,
  current: number,
  total: number,
  title: string,
) {
  const t = `${title}  ·  Página ${current} de ${total}`;
  page.drawText(truncate(t, 80), { x: MARGIN_X, y: 22, font, size: 8, color: GRAY });
  const right = "CLINIONEX360 — clinionex.com.br";
  const w = font.widthOfTextAtSize(right, 8);
  page.drawText(right, { x: PAGE_W - MARGIN_X - w, y: 22, font, size: 8, color: GRAY });
}

// ─── Condições / assinaturas (a partir dos dados) ──────────────────────────

function buildConditionsRows(c: CondicoesComerciaisSnapshot): KvRow[] {
  return [
    { label: "Valor de implantação", value: `R$ ${formatBRLNumber(c.valorImplantacao)}` },
    { label: "Valor mensal recorrente", value: `R$ ${formatBRLNumber(c.valorRecorrente)}` },
    {
      label: "Prazo inicial contratado",
      value: c.prazoContratoMeses != null ? `${c.prazoContratoMeses} meses` : "—",
    },
    { label: "Data prevista para início", value: formatDateBR(c.dataPrevistaInicio) },
    { label: "Início da recorrência", value: formatDateBR(c.inicioRecorrencia) },
    { label: "Forma de pagamento", value: formaLabel(c.formaPagamento) },
    {
      label: "Vencimento mensal",
      value: c.diaVencimento != null ? `dia ${c.diaVencimento} de cada mês` : "—",
    },
    { label: "Índice de reajuste", value: c.reajusteIndice || "—" },
    {
      label: "Validade desta proposta",
      value: c.validadePropostaDias != null ? `${c.validadePropostaDias} dias` : "—",
    },
  ];
}

function buildSignatureBlocks(
  opts: RenderCommercialOptions,
  map: Record<string, string>,
): SignatureBlock[] {
  const blank = "____________________";
  if (opts.tipo === "proposta") {
    return [
      {
        papel: "CONTRATANTE",
        linhas: [
          { label: "", value: map["nome_cliente"] || "—" },
          { label: "Representante", value: map["representante_cliente"] || blank },
          { label: "CPF", value: blank },
          { label: "Data", value: blank },
        ],
      },
      {
        papel: "CONTRATADA — IONEX360",
        linhas: [
          { label: "", value: opts.contratada.razao_social || "IONEX360" },
          { label: "Representante", value: map["responsavel_ionex360"] || blank },
          { label: "CPF", value: opts.contratada.representante_cpf || blank },
          { label: "Data", value: blank },
        ],
      },
    ];
  }
  return [
    {
      papel: "CONTRATANTE",
      linhas: [
        { label: "", value: map["razao_social_cliente"] || "—" },
        { label: "Representante", value: map["representante_cliente"] || blank },
        { label: "CPF", value: blank },
      ],
    },
    {
      papel: "CONTRATADA",
      linhas: [
        { label: "", value: map["razao_social_ionex360"] || "IONEX360" },
        { label: "Representante", value: map["representante_ionex360"] || blank },
        { label: "CPF", value: opts.contratada.representante_cpf || blank },
      ],
    },
    {
      papel: "TESTEMUNHA 1",
      linhas: [
        { label: "Nome", value: blank },
        { label: "CPF", value: blank },
      ],
    },
    {
      papel: "TESTEMUNHA 2",
      linhas: [
        { label: "Nome", value: blank },
        { label: "CPF", value: blank },
      ],
    },
  ];
}

// ─── Substituição de placeholders ──────────────────────────────────────────

function buildPlaceholderMap(
  opts: RenderCommercialOptions,
  data: Date,
): Record<string, string> {
  const { contratada, contratante, conditions } = opts;
  const blank = "____________________";

  const enderecoCompletoCliente = [
    contratante.endereco,
    contratante.cidade_uf,
    contratante.cep ? `CEP ${contratante.cep}` : "",
  ]
    .filter((s) => s && s.trim() !== "")
    .join(", ");

  const enderecoIonex = [
    contratada.endereco,
    contratada.cidade_uf,
    contratada.cep ? `CEP ${contratada.cep}` : "",
  ]
    .filter((s) => s && s.trim() !== "")
    .join(", ");

  return {
    // Proposta
    nome_cliente: contratante.nome_fantasia || contratante.razao_social || "—",
    cnpj_cliente: contratante.cnpj || "—",
    cidade_uf: contratante.cidade_uf || "—",
    data_emissao: formatBRDate(data),
    validade_proposta:
      conditions.validadePropostaDias != null
        ? String(conditions.validadePropostaDias)
        : "—",
    responsavel_comercial: conditions.responsavelComercial || "—",
    valor_implantacao: formatBRLNumber(conditions.valorImplantacao),
    valor_mensal: formatBRLNumber(conditions.valorRecorrente),
    prazo_contrato:
      conditions.prazoContratoMeses != null
        ? String(conditions.prazoContratoMeses)
        : "—",
    data_inicio: formatDateBR(conditions.dataPrevistaInicio),
    data_inicio_recorrencia: formatDateBR(conditions.inicioRecorrencia),
    forma_pagamento: formaLabel(conditions.formaPagamento),
    dia_vencimento:
      conditions.diaVencimento != null ? String(conditions.diaVencimento) : "—",
    indice_reajuste: conditions.reajusteIndice || "—",
    representante_cliente: contratante.responsavel || "",
    responsavel_ionex360: contratada.representante_nome || "",
    cpf_representante: blank,
    data_aceite: blank,

    // Contrato
    razao_social_cliente: contratante.razao_social || "—",
    endereco_completo_cliente: enderecoCompletoCliente || "—",
    cpf_representante_cliente: blank,
    razao_social_ionex360: contratada.razao_social || "—",
    cnpj_ionex360: contratada.cnpj || "—",
    endereco_ionex360: enderecoIonex || "—",
    representante_ionex360: contratada.representante_nome || "",
    cpf_representante_ionex360: contratada.representante_cpf || blank,
    prazo_contrato_meses:
      conditions.prazoContratoMeses != null
        ? String(conditions.prazoContratoMeses)
        : "—",
    foro_contrato: contratante.cidade_uf || "—",
    cidade_assinatura: contratante.cidade_uf || "—",
    data_assinatura: blank,
  };
}

function substituteCommercialPlaceholders(
  body: string,
  map: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) =>
    map[key] !== undefined ? map[key] : `[${key}]`,
  );
}

// ─── Formatação ────────────────────────────────────────────────────────────

function formatBRLNumber(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const datePart = iso.split("T")[0];
  const [y, m, d] = datePart.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function formaLabel(v: string | null): string {
  if (!v) return "—";
  return FORMA_LABELS[v] ?? v;
}

// ─── Utilitários de texto ──────────────────────────────────────────────────

function wrapByMeasure(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (!para.trim()) {
      result.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cur = candidate;
      } else {
        if (cur) result.push(cur);
        cur = w;
      }
    }
    if (cur) result.push(cur);
  }
  return result;
}

interface Segment {
  text: string;
  bold: boolean;
}

function parseInlineBold(s: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  if (out.length === 0) out.push({ text: s, bold: false });
  return out;
}

function wrapMixed(
  segs: Segment[],
  regular: PDFFont,
  bold: PDFFont,
  size: number,
  maxWidth: number,
): Segment[][] {
  const tokens: Segment[] = [];
  for (const seg of segs) {
    const words = seg.text.split(/(\s+)/);
    for (const w of words) {
      if (w.length === 0) continue;
      tokens.push({ text: w, bold: seg.bold });
    }
  }
  const lines: Segment[][] = [];
  let line: Segment[] = [];
  let lineW = 0;
  const measure = (s: Segment) =>
    (s.bold ? bold : regular).widthOfTextAtSize(s.text, size);
  for (const tk of tokens) {
    const w = measure(tk);
    if (lineW + w > maxWidth && line.length > 0) {
      while (line.length && line[line.length - 1].text.trim() === "") line.pop();
      lines.push(line);
      line = [];
      lineW = 0;
      if (tk.text.trim() === "") continue;
    }
    line.push(tk);
    lineW += w;
  }
  if (line.length) {
    while (line.length && line[line.length - 1].text.trim() === "") line.pop();
    lines.push(line);
  }
  return lines;
}

interface MdBlock {
  kind:
    | "h1"
    | "h2"
    | "h3"
    | "hr"
    | "bullet"
    | "paragraph"
    | "conditions"
    | "especiais"
    | "signatures";
  text: string;
  items: string[];
}

function parseBlocks(body: string): MdBlock[] {
  const lines = body.split("\n");
  const blocks: MdBlock[] = [];
  let bulletBuf: string[] = [];

  function flushBullets() {
    if (bulletBuf.length > 0) {
      blocks.push({ kind: "bullet", text: "", items: bulletBuf });
      bulletBuf = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushBullets();
      continue;
    }
    if (line === "[[CONDICOES_COMERCIAIS]]") {
      flushBullets();
      blocks.push({ kind: "conditions", text: "", items: [] });
    } else if (line === "[[CONDICOES_ESPECIAIS]]") {
      flushBullets();
      blocks.push({ kind: "especiais", text: "", items: [] });
    } else if (line === "[[ASSINATURAS]]") {
      flushBullets();
      blocks.push({ kind: "signatures", text: "", items: [] });
    } else if (line === "---" || /^-{3,}$/.test(line)) {
      flushBullets();
      blocks.push({ kind: "hr", text: "", items: [] });
    } else if (line.startsWith("### ")) {
      flushBullets();
      blocks.push({ kind: "h3", text: line.slice(4).trim(), items: [] });
    } else if (line.startsWith("## ")) {
      flushBullets();
      blocks.push({ kind: "h2", text: line.slice(3).trim(), items: [] });
    } else if (line.startsWith("# ")) {
      flushBullets();
      blocks.push({ kind: "h1", text: line.slice(2).trim(), items: [] });
    } else if (/^[-*]\s+/.test(line)) {
      bulletBuf.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushBullets();
      blocks.push({ kind: "paragraph", text: line, items: [] });
    }
  }
  flushBullets();
  return blocks;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
