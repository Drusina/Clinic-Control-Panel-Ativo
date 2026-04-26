import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ContratadaInfo {
  razao_social: string;
  cnpj: string;
  endereco: string;
  cidade_uf: string;
  cep: string;
  representante_nome: string;
  representante_cpf: string;
  representante_cargo: string;
}

export interface ContratanteInfo {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  endereco: string;
  cidade_uf: string;
  cep: string;
  responsavel: string;
}

export interface RenderTermoOptions {
  titulo: string;
  corpo: string;
  versao: number;
  contratada: ContratadaInfo;
  contratante: ContratanteInfo;
  data?: Date;
}

export interface SignatureMetadata {
  signerName: string;
  signerEmail: string;
  signerCpf: string;
  signerCargo?: string | null;
  signedAt: Date;
  signerIp: string;
  signerUserAgent: string;
  docHash: string;
  verificationCode: string;
}

// ─── Colors / layout constants ─────────────────────────────────────────────

const PRIMARY = rgb(0.043, 0.239, 0.569); // #0b3d91 — IONEX brand blue
const DARK = rgb(0.07, 0.09, 0.15);
const TEXT = rgb(0.12, 0.16, 0.23);
const GRAY = rgb(0.42, 0.45, 0.5);
const LIGHT = rgb(0.94, 0.96, 0.98);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const LINE_HEIGHT = 14;
const PARAGRAPH_GAP = 8;
const HEADING_SIZE = 13;
const BODY_SIZE = 10.5;

// ─── Public renderers ──────────────────────────────────────────────────────

/**
 * Renders a multi-page A4 PDF for the given termo template body, substituting
 * placeholders and using a Markdown-ish layout for headings and bullet lists.
 *
 * The hash returned is the SHA-256 of the rendered PDF bytes — used later to
 * stamp the signature page with proof that the signed copy refers to exactly
 * this version of the document.
 */
export async function renderTermoPdf(opts: RenderTermoOptions): Promise<{ bytes: Uint8Array; hash: string }> {
  const data = opts.data ?? new Date();
  const corpoFinal = substitutePlaceholders(opts.corpo, opts.contratada, opts.contratante, data);

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
  drawIdentification(ctx, opts.contratada, opts.contratante, data);
  drawBody(ctx, corpoFinal);
  drawDocumentFooter(ctx, opts.versao, data);

  // Apply the running footer to every page.
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = doc.getPage(i);
    drawPageFooter(p, regular, i + 1, doc.getPageCount(), opts.titulo);
  }

  const bytes = await doc.save();
  const hash = sha256Hex(bytes);
  return { bytes, hash };
}

/**
 * Appends a signature page to a previously-rendered termo PDF and returns the
 * new bytes. The signature page records all electronic-signature metadata
 * required by Lei 14.063/2020 (assinatura simples).
 */
export async function stampSignedPdf(originalBytes: Uint8Array, sig: SignatureMetadata): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalBytes);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: RenderCtx = {
    doc,
    bold,
    regular,
    italic: regular,
    page,
    y: PAGE_H - MARGIN_TOP,
  };

  drawHeader(ctx, "Comprovante de Assinatura Eletrônica");

  ctx.y -= 4;
  drawText(ctx, "Este documento eletrônico foi assinado pelo signatário abaixo identificado, " +
    "nos termos da Lei nº 14.063/2020 (assinatura eletrônica simples). " +
    "Os dados de auditoria a seguir comprovam a autenticidade do aceite.",
    { font: ctx.regular, size: BODY_SIZE, color: TEXT });

  ctx.y -= 8;

  // Signer info box
  drawSectionTitle(ctx, "Identificação do Signatário");
  drawKv(ctx, "Nome completo", sig.signerName);
  drawKv(ctx, "CPF", sig.signerCpf);
  drawKv(ctx, "E-mail", sig.signerEmail);
  if (sig.signerCargo) drawKv(ctx, "Cargo / Função", sig.signerCargo);

  ctx.y -= 12;

  // Audit info box
  drawSectionTitle(ctx, "Dados de Auditoria");
  drawKv(ctx, "Data e hora", formatBRT(sig.signedAt));
  drawKv(ctx, "Endereço IP", sig.signerIp || "—");
  drawKv(ctx, "User-Agent", truncate(sig.signerUserAgent || "—", 88));
  drawKv(ctx, "Hash do documento (SHA-256)", sig.docHash);
  drawKv(ctx, "Código de verificação", sig.verificationCode);

  ctx.y -= 14;

  // Legal footer
  drawWrapped(ctx,
    "A combinação dos dados acima — identificação inequívoca do signatário, " +
    "registro temporal, endereço IP, user-agent e hash criptográfico do documento — " +
    "constitui evidência da manifestação de vontade do signatário e da integridade " +
    "do conteúdo assinado, conforme o art. 4º, inciso II da Lei nº 14.063/2020.",
    { font: ctx.italic, size: 9, color: GRAY });

  ctx.y -= 10;
  drawWrapped(ctx,
    "Para verificar a autenticidade desta assinatura, o destinatário pode " +
    "comparar o hash SHA-256 acima com o hash recalculado do PDF original — " +
    "se forem idênticos, o conteúdo do documento não foi alterado após a assinatura.",
    { font: ctx.italic, size: 9, color: GRAY });

  // Re-draw the running footer for the new page so numbering stays consistent.
  const total = doc.getPageCount();
  for (let i = 0; i < total; i++) {
    const p = doc.getPage(i);
    // Clear is not possible; just overwrite with a white rectangle then redraw.
    p.drawRectangle({ x: MARGIN_X, y: 18, width: CONTENT_W, height: 18, color: rgb(1, 1, 1) });
    drawPageFooter(p, regular, i + 1, total, "Comprovante e Termo Assinado");
  }

  return doc.save();
}

// ─── Internal: render context ──────────────────────────────────────────────

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
  if (ctx.y - needed < MARGIN_BOTTOM) {
    newPage(ctx);
  }
}

// ─── Internal: drawing primitives ─────────────────────────────────────────

function drawHeader(ctx: RenderCtx, title: string) {
  // Brand strip
  ctx.page.drawText("IONEX", { x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 22, color: PRIMARY });
  const ionexW = ctx.bold.widthOfTextAtSize("IONEX", 22);
  ctx.page.drawText("360", { x: MARGIN_X + ionexW, y: ctx.y, font: ctx.bold, size: 22, color: DARK });

  ctx.page.drawText("Plataforma de Gestão de Clínicas Estéticas", {
    x: MARGIN_X, y: ctx.y - 14, font: ctx.regular, size: 8.5, color: GRAY,
  });

  ctx.y -= 32;

  // Divider
  ctx.page.drawRectangle({
    x: MARGIN_X, y: ctx.y, width: CONTENT_W, height: 2, color: PRIMARY,
  });
  ctx.y -= 18;

  // Title
  const titleLines = wrapByMeasure(title, ctx.bold, 16, CONTENT_W);
  for (const line of titleLines) {
    ensureSpace(ctx, 22);
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 16, color: DARK });
    ctx.y -= 22;
  }
  ctx.y -= 6;
}

function drawIdentification(ctx: RenderCtx, contratada: ContratadaInfo, contratante: ContratanteInfo, data: Date) {
  ensureSpace(ctx, 100);
  // Boxed metadata block
  const boxTop = ctx.y;
  const padding = 10;
  const boxX = MARGIN_X;
  const boxW = CONTENT_W;

  // Compute height after drawing content
  const startY = ctx.y;
  ctx.y -= padding;

  drawBoxLine(ctx, "Contratada (Plataforma): ",
    `${contratada.razao_social || "—"}, CNPJ ${contratada.cnpj || "—"}, com sede em ${contratada.endereco || "—"}, ${contratada.cidade_uf || "—"}, CEP ${contratada.cep || "—"}.`);
  drawBoxLine(ctx, "Contratante (Clínica): ",
    `${contratante.razao_social || "—"}, CNPJ ${contratante.cnpj || "—"}, com sede em ${contratante.endereco || "—"}, ${contratante.cidade_uf || "—"}, CEP ${contratante.cep || "—"}.`);
  drawBoxLine(ctx, "Data de vigência: ", formatBRDate(data));

  ctx.y -= padding;
  const boxBottom = ctx.y;
  const boxH = startY - boxBottom;

  // Draw the box behind (on the same page as the content — note: if content
  // wrapped to a new page, the box only covers what's on the original page,
  // which is fine for the typical short-info case).
  ctx.page.drawRectangle({
    x: boxX, y: boxBottom, width: boxW, height: boxH,
    color: LIGHT, opacity: 1,
  });
  ctx.page.drawRectangle({
    x: boxX, y: boxBottom, width: 3, height: boxH,
    color: PRIMARY,
  });

  // Re-draw text on top of the box
  ctx.y = startY;
  ctx.y -= padding;
  drawBoxLine(ctx, "Contratada (Plataforma): ",
    `${contratada.razao_social || "—"}, CNPJ ${contratada.cnpj || "—"}, com sede em ${contratada.endereco || "—"}, ${contratada.cidade_uf || "—"}, CEP ${contratada.cep || "—"}.`);
  drawBoxLine(ctx, "Contratante (Clínica): ",
    `${contratante.razao_social || "—"}, CNPJ ${contratante.cnpj || "—"}, com sede em ${contratante.endereco || "—"}, ${contratante.cidade_uf || "—"}, CEP ${contratante.cep || "—"}.`);
  drawBoxLine(ctx, "Data de vigência: ", formatBRDate(data));

  ctx.y -= padding + 4;
  void boxTop;
}

function drawBoxLine(ctx: RenderCtx, label: string, value: string) {
  const innerX = MARGIN_X + 12;
  const innerW = CONTENT_W - 24;
  const labelWidth = ctx.bold.widthOfTextAtSize(label, 9.5);
  const firstLineW = innerW - labelWidth;

  // Wrap value such that the first line fits next to the label, subsequent lines use full width
  const allLines = wrapByMeasure(value, ctx.regular, 9.5, innerW);
  // Re-do to ensure first line fits in firstLineW
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  let widthBudget = firstLineW;
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (ctx.regular.widthOfTextAtSize(candidate, 9.5) <= widthBudget) {
      cur = candidate;
    } else {
      lines.push(cur);
      cur = w;
      widthBudget = innerW;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push(...allLines);

  // Draw label + first line
  ctx.page.drawText(label, { x: innerX, y: ctx.y, font: ctx.bold, size: 9.5, color: DARK });
  ctx.page.drawText(lines[0] ?? "", { x: innerX + labelWidth, y: ctx.y, font: ctx.regular, size: 9.5, color: TEXT });
  ctx.y -= 13;
  for (let i = 1; i < lines.length; i++) {
    ensureSpace(ctx, 13);
    ctx.page.drawText(lines[i], { x: innerX, y: ctx.y, font: ctx.regular, size: 9.5, color: TEXT });
    ctx.y -= 13;
  }
  ctx.y -= 2;
}

function drawSectionTitle(ctx: RenderCtx, title: string) {
  ensureSpace(ctx, 24);
  ctx.page.drawText(title.toUpperCase(), {
    x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 9, color: PRIMARY,
  });
  ctx.y -= 6;
  ctx.page.drawRectangle({
    x: MARGIN_X, y: ctx.y, width: 36, height: 1.2, color: PRIMARY,
  });
  ctx.y -= 10;
}

function drawKv(ctx: RenderCtx, key: string, value: string) {
  ensureSpace(ctx, 16);
  const keyText = `${key}:`;
  ctx.page.drawText(keyText, { x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 9.5, color: DARK });
  const keyW = ctx.bold.widthOfTextAtSize(keyText, 9.5);
  const valX = MARGIN_X + keyW + 6;
  const lines = wrapByMeasure(value, ctx.regular, 9.5, CONTENT_W - (keyW + 6));
  ctx.page.drawText(lines[0] ?? "", { x: valX, y: ctx.y, font: ctx.regular, size: 9.5, color: TEXT });
  ctx.y -= 14;
  for (let i = 1; i < lines.length; i++) {
    ensureSpace(ctx, 14);
    ctx.page.drawText(lines[i], { x: MARGIN_X, y: ctx.y, font: ctx.regular, size: 9.5, color: TEXT });
    ctx.y -= 14;
  }
}

function drawText(ctx: RenderCtx, str: string, opts: { font: PDFFont; size: number; color: ReturnType<typeof rgb> }) {
  drawWrapped(ctx, str, opts);
}

function drawWrapped(ctx: RenderCtx, str: string, opts: { font: PDFFont; size: number; color: ReturnType<typeof rgb> }) {
  const lines = wrapByMeasure(str, opts.font, opts.size, CONTENT_W);
  for (const line of lines) {
    ensureSpace(ctx, opts.size + 4);
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, font: opts.font, size: opts.size, color: opts.color });
    ctx.y -= opts.size + 4;
  }
}

function drawBody(ctx: RenderCtx, body: string) {
  ctx.y -= 4;

  const blocks = parseMarkdownishBlocks(body);
  for (const block of blocks) {
    if (block.kind === "h2") {
      ensureSpace(ctx, 28);
      ctx.y -= 6;
      const lines = wrapByMeasure(block.text, ctx.bold, HEADING_SIZE, CONTENT_W);
      for (const line of lines) {
        ensureSpace(ctx, HEADING_SIZE + 6);
        ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, font: ctx.bold, size: HEADING_SIZE, color: PRIMARY });
        ctx.y -= HEADING_SIZE + 4;
      }
      ctx.y -= 4;
    } else if (block.kind === "h3") {
      ensureSpace(ctx, 22);
      const lines = wrapByMeasure(block.text, ctx.bold, 11, CONTENT_W);
      for (const line of lines) {
        ensureSpace(ctx, 16);
        ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 11, color: DARK });
        ctx.y -= 16;
      }
      ctx.y -= 2;
    } else if (block.kind === "bullet") {
      for (const item of block.items) {
        ensureSpace(ctx, BODY_SIZE + 6);
        const bulletX = MARGIN_X + 6;
        const textX = MARGIN_X + 18;
        ctx.page.drawText("•", { x: bulletX, y: ctx.y, font: ctx.regular, size: BODY_SIZE, color: PRIMARY });
        const lines = wrapByMeasure(item, ctx.regular, BODY_SIZE, CONTENT_W - 18);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(ctx, LINE_HEIGHT);
          ctx.page.drawText(lines[i], { x: textX, y: ctx.y, font: ctx.regular, size: BODY_SIZE, color: TEXT });
          ctx.y -= LINE_HEIGHT;
        }
      }
      ctx.y -= 4;
    } else {
      // paragraph (with inline bold via **text**)
      const segments = parseInlineBold(block.text);
      // Wrap segments together
      const wrapped = wrapMixed(segments, ctx.regular, ctx.bold, BODY_SIZE, CONTENT_W);
      for (const lineSegs of wrapped) {
        ensureSpace(ctx, LINE_HEIGHT);
        let x = MARGIN_X;
        for (const seg of lineSegs) {
          const f = seg.bold ? ctx.bold : ctx.regular;
          ctx.page.drawText(seg.text, { x, y: ctx.y, font: f, size: BODY_SIZE, color: TEXT });
          x += f.widthOfTextAtSize(seg.text, BODY_SIZE);
        }
        ctx.y -= LINE_HEIGHT;
      }
      ctx.y -= PARAGRAPH_GAP;
    }
  }
}

function drawDocumentFooter(ctx: RenderCtx, versao: number, data: Date) {
  ensureSpace(ctx, 30);
  ctx.y -= 8;
  ctx.page.drawRectangle({ x: MARGIN_X, y: ctx.y, width: CONTENT_W, height: 0.8, color: GRAY });
  ctx.y -= 12;
  ctx.page.drawText(`Versão ${versao} · Documento gerado em ${formatBRDate(data)}`, {
    x: MARGIN_X, y: ctx.y, font: ctx.italic, size: 8.5, color: GRAY,
  });
  ctx.y -= 12;
}

function drawPageFooter(page: PDFPage, font: PDFFont, current: number, total: number, title: string) {
  const t = `${title}  ·  Página ${current} de ${total}`;
  page.drawText(t, { x: MARGIN_X, y: 22, font, size: 8, color: GRAY });
  const right = "IONEX360 — clinionex.com.br";
  const w = font.widthOfTextAtSize(right, 8);
  page.drawText(right, { x: PAGE_W - MARGIN_X - w, y: 22, font, size: 8, color: GRAY });
}

// ─── Internal: text utilities ──────────────────────────────────────────────

function wrapByMeasure(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

interface Segment { text: string; bold: boolean }

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

function wrapMixed(segs: Segment[], regular: PDFFont, bold: PDFFont, size: number, maxWidth: number): Segment[][] {
  // Tokenize segments into per-word chunks while preserving bold flag
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
  const measure = (s: Segment) => (s.bold ? bold : regular).widthOfTextAtSize(s.text, size);
  for (const tk of tokens) {
    const w = measure(tk);
    if (lineW + w > maxWidth && line.length > 0) {
      // flush; trim trailing whitespace
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
  kind: "h2" | "h3" | "bullet" | "paragraph";
  text: string;
  items: string[];
}

function parseMarkdownishBlocks(body: string): MdBlock[] {
  const lines = body.split("\n");
  const blocks: MdBlock[] = [];
  let buf: string[] = [];
  let bulletBuf: string[] = [];

  function flushPara() {
    if (buf.length > 0) {
      blocks.push({ kind: "paragraph", text: buf.join(" "), items: [] });
      buf = [];
    }
  }
  function flushBullets() {
    if (bulletBuf.length > 0) {
      blocks.push({ kind: "bullet", text: "", items: bulletBuf });
      bulletBuf = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushBullets();
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara(); flushBullets();
      blocks.push({ kind: "h2", text: line.slice(3).trim(), items: [] });
    } else if (line.startsWith("### ")) {
      flushPara(); flushBullets();
      blocks.push({ kind: "h3", text: line.slice(4).trim(), items: [] });
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      bulletBuf.push(line.replace(/^[-*]\s+/, ""));
    } else {
      flushBullets();
      buf.push(line);
    }
  }
  flushPara();
  flushBullets();
  return blocks;
}

// ─── Public helpers ────────────────────────────────────────────────────────

export function substitutePlaceholders(
  body: string,
  contratada: ContratadaInfo,
  contratante: ContratanteInfo,
  data: Date,
): string {
  const map: Record<string, string> = {
    "contratada.razao_social": contratada.razao_social || "",
    "contratada.cnpj": contratada.cnpj || "",
    "contratada.endereco": contratada.endereco || "",
    "contratada.cidade_uf": contratada.cidade_uf || "",
    "contratada.cep": contratada.cep || "",
    "contratada.representante_nome": contratada.representante_nome || "",
    "contratada.representante_cpf": contratada.representante_cpf || "",
    "contratada.representante_cargo": contratada.representante_cargo || "",
    "contratante.razao_social": contratante.razao_social || "",
    "contratante.nome_fantasia": contratante.nome_fantasia || "",
    "contratante.cnpj": contratante.cnpj || "",
    "contratante.endereco": contratante.endereco || "",
    "contratante.cidade_uf": contratante.cidade_uf || "",
    "contratante.cep": contratante.cep || "",
    "contratante.responsavel": contratante.responsavel || "",
    "data": formatBRDate(data),
  };
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => map[key] ?? `[${key}]`);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function formatBRDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric",
    timeZone: "America/Cuiaba",
  });
}

export function formatBRT(d: Date): string {
  // Cuiabá / Sorriso are in America/Cuiaba (UTC-4, no DST currently).
  const datePart = d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    timeZone: "America/Cuiaba",
  });
  const timePart = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "America/Cuiaba",
  });
  return `${datePart} ${timePart} (BRT)`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
