import type { Request } from "express";
import { eq, and, gt, sql } from "drizzle-orm";
import {
  db,
  documentosComerciaisTable,
  clinicsTable,
  clinicActivityTable,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage.js";
import { getConfig } from "./config.js";
import { stampSignedPdf, formatBRT, sha256Hex } from "./lgpd-pdf.js";
import {
  sendEmail,
  buildSigningConfirmationEmail,
  buildComercialSignatureNotificationEmail,
  resolveAppUrl,
} from "./email.js";
import { reconcileTrilha } from "./trilha.js";
import {
  generateVerificationCode,
  formatCpf,
  clientIp,
} from "./signing-utils.js";

/**
 * Domain logic for the INTERNAL "Assinatura Eletrônica Simples"
 * (Lei 14.063/2020) flow applied to COMMERCIAL documents (proposta/contrato).
 *
 * This module is the public-side counterpart to `routes/comercial.ts`
 * (which sends documents for signature). The three public `/assinar/*`
 * endpoints in `routes/lgpd-signing.ts` fall back to these functions when a
 * token does not match an LGPD termo, so the same `AssinarPage` serves both
 * surfaces without changes.
 *
 *   - Proposta  → single signer, stored in the document's single-signer columns
 *                 (`signing_token` + `signatario_*` + `status` gate), mirrors LGPD.
 *   - Contrato  → multiple signatários in the `signatarios` JSONB array, each
 *                 with its own token. Only marked "assinado" once ALL required
 *                 parties sign. Signatures are stamped PROGRESSIVELY onto the
 *                 latest cumulative copy (`signed_storage_path`), and the
 *                 original contract terms are always integrity-checked against
 *                 the immutable `doc_hash`.
 */

const objectStorage = new ObjectStorageService();

type DocRow = typeof documentosComerciaisTable.$inferSelect;

export interface PublicResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PdfResult {
  status: number;
  error?: string;
  buffer?: Buffer;
  filename?: string;
}

// ─── Storage helpers (mirror routes/lgpd-signing.ts + routes/comercial.ts) ──

async function downloadPdfBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [buf] = await file.download();
  return buf;
}

async function uploadPdfToPath(
  bytes: Uint8Array,
  relativePath: string,
): Promise<string> {
  const { uploadUrl, objectPath } =
    await objectStorage.getCustomEntityUploadURL(relativePath);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from(bytes),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload PDF failed: ${res.status} ${txt}`);
  }
  return objectPath;
}

function objectPathToServingUrl(objectPath: string): string {
  return `/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
}

function buildSignedPath(clinicId: string, docId: string, key: string): string {
  return `clinics/${clinicId}/comercial/assinados/${docId}-${key}-${Date.now()}.pdf`;
}

function tipoLabel(tipo: string): string {
  return tipo === "proposta" ? "Proposta" : "Contrato";
}

function papelLabel(papel: string | null | undefined): string {
  switch (papel) {
    case "contratante":
      return "Contratante";
    case "contratada":
      return "Contratada (CLINIONEX360)";
    case "testemunha":
      return "Testemunha";
    default:
      return "Signatário";
  }
}

function isExpired(ts: Date | string | null | undefined): boolean {
  if (!ts) return false;
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts.getTime();
  return t < Date.now();
}

// ─── Token resolution ──────────────────────────────────────────────────────

type Resolution =
  | { kind: "proposta"; doc: DocRow }
  | { kind: "contrato"; doc: DocRow; idx: number };

async function resolveByToken(token: string): Promise<Resolution | null> {
  // Proposta: single-signer unique column.
  const [single] = await db
    .select()
    .from(documentosComerciaisTable)
    .where(eq(documentosComerciaisTable.signingToken, token))
    .limit(1);
  if (single) return { kind: "proposta", doc: single };

  // Contrato: JSONB array containment on `signatarios[*].signingToken`.
  const rows = await db
    .select()
    .from(documentosComerciaisTable)
    .where(
      sql`${documentosComerciaisTable.signatarios} @> ${JSON.stringify([
        { signingToken: token },
      ])}::jsonb`,
    )
    .limit(1);
  const doc = rows[0];
  if (!doc) return null;
  const idx = (doc.signatarios ?? []).findIndex(
    (s) => s.signingToken === token,
  );
  if (idx < 0) return null;
  return { kind: "contrato", doc, idx };
}

// ─── Public: GET /assinar/info/:token (commercial fallback) ────────────────

export async function getComercialSignInfo(
  token: string,
): Promise<PublicResult | null> {
  const r = await resolveByToken(token);
  if (!r) return null;
  const { doc } = r;
  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.id, doc.clinicId));
  const clinicNome = clinic?.fantasia ?? clinic?.nome ?? "—";
  const termoNome = doc.titulo ?? tipoLabel(doc.tipo);

  if (r.kind === "proposta") {
    if (isExpired(doc.signingTokenExpiresAt))
      return {
        status: 410,
        body: {
          error: "expired",
          message: "Este link expirou. Solicite um novo à clínica.",
        },
      };
    if (doc.status !== "enviado")
      return {
        status: 410,
        body: {
          error: "already_used",
          message:
            "Este link já foi utilizado. Verifique seu e-mail para o comprovante assinado.",
        },
      };
    return {
      status: 200,
      body: {
        token,
        termoNome,
        termoDescricao: "Proposta comercial CLINIONEX360",
        clinicNome,
        signatarioNome: doc.signatarioNome ?? "",
        signatarioEmail: doc.signatarioEmail ?? "",
        signatarioCargo: doc.signatarioCargo ?? null,
        status: doc.status,
        alreadySigned: false,
        expiresAt: doc.signingTokenExpiresAt?.toISOString() ?? null,
        documentoTipo: "proposta",
      },
    };
  }

  const sigs = doc.signatarios ?? [];
  const sig = sigs[r.idx];
  if (isExpired(sig.signingTokenExpiresAt))
    return {
      status: 410,
      body: {
        error: "expired",
        message: "Este link expirou. Solicite um novo à clínica.",
      },
    };
  if (sig.status !== "enviado")
    return {
      status: 410,
      body: {
        error: "already_used",
        message:
          "Este link já foi utilizado. Verifique seu e-mail para o comprovante assinado.",
      },
    };
  const requiredCount = sigs.length;
  const signedCount = sigs.filter((s) => s.status === "assinado").length;
  return {
    status: 200,
    body: {
      token,
      termoNome,
      termoDescricao: `Assinatura como ${papelLabel(sig.papel)} — ${signedCount} de ${requiredCount} já assinaram`,
      clinicNome,
      signatarioNome: sig.nome ?? "",
      signatarioEmail: sig.email ?? "",
      signatarioCargo: sig.cargo ?? null,
      status: sig.status,
      alreadySigned: false,
      expiresAt: sig.signingTokenExpiresAt ?? null,
      documentoTipo: "contrato",
      papel: sig.papel ?? null,
      signedCount,
      requiredCount,
    },
  };
}

// ─── Public: GET /assinar/pdf/:token (commercial fallback) ─────────────────

export async function getComercialSignPdf(
  token: string,
): Promise<PdfResult | null> {
  const r = await resolveByToken(token);
  if (!r) return null;
  const { doc } = r;

  if (r.kind === "proposta") {
    if (isExpired(doc.signingTokenExpiresAt))
      return { status: 410, error: "Link expirado" };
    if (doc.status !== "enviado")
      return { status: 410, error: "Link já utilizado" };
    if (!doc.pdfPath) return { status: 404, error: "PDF não disponível" };
    const buffer = await downloadPdfBytes(doc.pdfPath);
    return { status: 200, buffer, filename: `${doc.tipo}-v${doc.versao}.pdf` };
  }

  const sigs = doc.signatarios ?? [];
  const sig = sigs[r.idx];
  if (isExpired(sig.signingTokenExpiresAt))
    return { status: 410, error: "Link expirado" };
  if (sig.status !== "enviado")
    return { status: 410, error: "Link já utilizado" };
  // Serve the latest cumulative copy so each signer sees prior Comprovantes.
  const path = doc.signedStoragePath ?? doc.pdfPath;
  if (!path) return { status: 404, error: "PDF não disponível" };
  const buffer = await downloadPdfBytes(path);
  return { status: 200, buffer, filename: `${doc.tipo}-v${doc.versao}.pdf` };
}

// ─── Public: POST /assinar/submit/:token (commercial fallback) ─────────────

export async function submitComercialSignature(
  token: string,
  input: { signerName: string; cleanCpf: string },
  req: Request,
): Promise<PublicResult | null> {
  const r = await resolveByToken(token);
  if (!r) return null;
  if (r.kind === "proposta")
    return submitProposta(r.doc.id, token, input, req);
  return submitContrato(r.doc.id, token, input, req);
}

async function submitProposta(
  docId: string,
  token: string,
  input: { signerName: string; cleanCpf: string },
  req: Request,
): Promise<PublicResult> {
  // Atomic single-use claim (mirrors LGPD): enviado → assinando.
  const claimed = await db
    .update(documentosComerciaisTable)
    .set({ status: "assinando", updatedAt: new Date() })
    .where(
      and(
        eq(documentosComerciaisTable.signingToken, token),
        eq(documentosComerciaisTable.status, "enviado"),
        gt(documentosComerciaisTable.signingTokenExpiresAt, new Date()),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(documentosComerciaisTable)
      .where(eq(documentosComerciaisTable.id, docId));
    if (!existing) return { status: 404, body: { error: "Link inválido" } };
    if (existing.status === "assinado" || existing.status === "assinando")
      return { status: 409, body: { error: "Documento já foi assinado" } };
    if (isExpired(existing.signingTokenExpiresAt))
      return {
        status: 410,
        body: { error: "Link expirado — solicite um novo à clínica" },
      };
    return {
      status: 409,
      body: { error: "Link não disponível para assinatura" },
    };
  }

  const doc = claimed[0];
  if (!doc.pdfPath || !doc.docHash) {
    await db
      .update(documentosComerciaisTable)
      .set({ status: "enviado", updatedAt: new Date() })
      .where(eq(documentosComerciaisTable.id, doc.id));
    return {
      status: 500,
      body: { error: "Documento original ausente — solicite reenvio" },
    };
  }

  try {
    const originalBytes = await downloadPdfBytes(doc.pdfPath);
    if (sha256Hex(originalBytes) !== doc.docHash) {
      await db
        .update(documentosComerciaisTable)
        .set({ status: "enviado", updatedAt: new Date() })
        .where(eq(documentosComerciaisTable.id, doc.id));
      return {
        status: 409,
        body: {
          error:
            "Falha de integridade do documento. Solicite reenvio à clínica.",
        },
      };
    }

    const verificationCode = generateVerificationCode();
    const signedAt = new Date();
    const ip = clientIp(req);
    const ua = (req.headers["user-agent"] as string | undefined) ?? "";

    const signedBytes = await stampSignedPdf(originalBytes, {
      signerName: input.signerName,
      signerEmail: doc.signatarioEmail ?? "",
      signerCpf: formatCpf(input.cleanCpf),
      signerCargo: doc.signatarioCargo,
      signedAt,
      signerIp: ip,
      signerUserAgent: ua,
      docHash: doc.docHash,
      verificationCode,
    });

    const signedPath = await uploadPdfToPath(
      signedBytes,
      buildSignedPath(doc.clinicId, doc.id, "proposta"),
    );

    await db
      .update(documentosComerciaisTable)
      .set({
        status: "assinado",
        signerCpf: formatCpf(input.cleanCpf),
        signerIp: ip,
        signerUserAgent: ua,
        verificationCode,
        signedStoragePath: signedPath,
        aceitoEm: signedAt,
        updatedAt: new Date(),
      })
      .where(eq(documentosComerciaisTable.id, doc.id));

    // Upgrade the clinic's propostaUrl to the SIGNED copy (gerar had set it to
    // the unsigned generated PDF). Trilha keeps the "proposta" marco lit.
    await db
      .update(clinicsTable)
      .set({
        propostaUrl: objectPathToServingUrl(signedPath),
        updatedAt: new Date(),
      })
      .where(eq(clinicsTable.id, doc.clinicId));

    await db.insert(clinicActivityTable).values({
      clinicId: doc.clinicId,
      tipo: "comercial",
      titulo: "Proposta assinada",
      descricao: `Proposta v${doc.versao} assinada eletronicamente por ${input.signerName}.`,
      autorNome: "Sistema (assinatura eletrônica)",
    });

    await sendSignatureEmails({
      req,
      doc,
      documentoTipo: "proposta",
      termoNome: doc.titulo ?? tipoLabel(doc.tipo),
      clinicId: doc.clinicId,
      signerName: input.signerName,
      signerEmail: doc.signatarioEmail ?? "",
      signerCpf: formatCpf(input.cleanCpf),
      signedAt,
      ip,
      verificationCode,
      signedBytes,
      fullySigned: true,
      signedCount: 1,
      requiredCount: 1,
    });
    await reconcileTrilha(doc.clinicId).catch(() => {});

    return {
      status: 200,
      body: {
        success: true,
        verificationCode,
        signedAt: signedAt.toISOString(),
        signedPdfBase64: Buffer.from(signedBytes).toString("base64"),
      },
    };
  } catch (err) {
    // Compensating rollback: release the claim so the signer can retry.
    await db
      .update(documentosComerciaisTable)
      .set({ status: "enviado", updatedAt: new Date() })
      .where(
        and(
          eq(documentosComerciaisTable.id, doc.id),
          eq(documentosComerciaisTable.status, "assinando"),
        ),
      )
      .catch(() => {});
    const msg = err instanceof Error ? err.message : "Erro ao processar assinatura";
    req.log.error({ err, docId: doc.id }, "comercial proposta signature failed");
    return { status: 500, body: { error: msg } };
  }
}

interface ContratoEmailPayload {
  doc: DocRow;
  termoNome: string;
  clinicId: string;
  signerName: string;
  signerEmail: string;
  signerCpf: string;
  signedAt: Date;
  ip: string;
  verificationCode: string;
  signedBytes: Uint8Array;
  fullySigned: boolean;
  signedCount: number;
  requiredCount: number;
}

async function submitContrato(
  docId: string,
  token: string,
  input: { signerName: string; cleanCpf: string },
  req: Request,
): Promise<PublicResult> {
  const ip = clientIp(req);
  const ua = (req.headers["user-agent"] as string | undefined) ?? "";

  let outcome: { result: PublicResult; emails?: ContratoEmailPayload };
  try {
    outcome = await db.transaction(async (tx) => {
      // Serialize concurrent signers of the SAME contract so cumulative
      // stamping (read base → stamp → write) never races. The lock auto-releases
      // at transaction end. Different documents use distinct lock keys.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`sign-doc-comercial:${docId}`}))`,
      );

      const [fresh] = await tx
        .select()
        .from(documentosComerciaisTable)
        .where(eq(documentosComerciaisTable.id, docId))
        .limit(1);
      if (!fresh)
        return { result: { status: 404, body: { error: "Link inválido" } } };

      const sigs = (fresh.signatarios ?? []).slice();
      const idx = sigs.findIndex((s) => s.signingToken === token);
      if (idx < 0)
        return { result: { status: 404, body: { error: "Link inválido" } } };
      const sig = sigs[idx];
      if (sig.status === "assinado")
        return {
          result: {
            status: 409,
            body: { error: "Você já assinou este documento" },
          },
        };
      if (sig.status !== "enviado")
        return {
          result: {
            status: 409,
            body: { error: "Link não disponível para assinatura" },
          },
        };
      if (isExpired(sig.signingTokenExpiresAt))
        return {
          result: {
            status: 410,
            body: { error: "Link expirado — solicite um novo à clínica" },
          },
        };
      if (!fresh.pdfPath || !fresh.docHash)
        return {
          result: {
            status: 500,
            body: { error: "Documento original ausente — solicite reenvio" },
          },
        };

      // Integrity check on the ORIGINAL contract terms (immutable across
      // signers — the Comprovantes are appended pages only).
      const originalBytes = await downloadPdfBytes(fresh.pdfPath);
      if (sha256Hex(originalBytes) !== fresh.docHash)
        return {
          result: {
            status: 409,
            body: {
              error:
                "Falha de integridade do documento. Solicite reenvio à clínica.",
            },
          },
        };

      // Progressive cumulative stamping onto the latest signed copy.
      const baseBytes = fresh.signedStoragePath
        ? await downloadPdfBytes(fresh.signedStoragePath)
        : originalBytes;
      const verificationCode = generateVerificationCode();
      const signedAt = new Date();
      const signedBytes = await stampSignedPdf(baseBytes, {
        signerName: input.signerName,
        signerEmail: sig.email ?? "",
        signerCpf: formatCpf(input.cleanCpf),
        signerCargo: sig.cargo,
        signedAt,
        signerIp: ip,
        signerUserAgent: ua,
        docHash: fresh.docHash,
        verificationCode,
      });
      const signedPath = await uploadPdfToPath(
        signedBytes,
        buildSignedPath(fresh.clinicId, fresh.id, `c${idx}`),
      );

      sigs[idx] = {
        ...sig,
        status: "assinado",
        signerCpf: formatCpf(input.cleanCpf),
        signerIp: ip,
        signerUserAgent: ua,
        verificationCode,
        signedStoragePath: signedPath,
        signedAt: signedAt.toISOString(),
      };
      const requiredCount = sigs.length;
      const signedCount = sigs.filter((s) => s.status === "assinado").length;
      const fullySigned = signedCount >= requiredCount;

      await tx
        .update(documentosComerciaisTable)
        .set({
          signatarios: sigs,
          signedStoragePath: signedPath,
          updatedAt: new Date(),
          ...(fullySigned ? { status: "assinado", aceitoEm: signedAt } : {}),
        })
        .where(eq(documentosComerciaisTable.id, fresh.id));

      if (fullySigned) {
        // Formalize on the clinic so the Trilha "contrato" marco reflects the
        // SIGNED copy + advance the commercial status.
        await tx
          .update(clinicsTable)
          .set({
            contratoUrl: objectPathToServingUrl(signedPath),
            status: "contrato",
            updatedAt: new Date(),
          })
          .where(eq(clinicsTable.id, fresh.clinicId));
        await tx.insert(clinicActivityTable).values({
          clinicId: fresh.clinicId,
          tipo: "comercial",
          titulo: "Contrato assinado",
          descricao: `Contrato v${fresh.versao} assinado por todos os ${requiredCount} signatários.`,
          autorNome: "Sistema (assinatura eletrônica)",
        });
      } else {
        await tx.insert(clinicActivityTable).values({
          clinicId: fresh.clinicId,
          tipo: "comercial",
          titulo: "Contrato — assinatura registrada",
          descricao: `${input.signerName} assinou o contrato v${fresh.versao} (${signedCount} de ${requiredCount}).`,
          autorNome: "Sistema (assinatura eletrônica)",
        });
      }

      return {
        result: {
          status: 200,
          body: {
            success: true,
            verificationCode,
            signedAt: signedAt.toISOString(),
            signedPdfBase64: Buffer.from(signedBytes).toString("base64"),
          },
        },
        emails: {
          doc: fresh,
          termoNome: fresh.titulo ?? tipoLabel(fresh.tipo),
          clinicId: fresh.clinicId,
          signerName: input.signerName,
          signerEmail: sig.email ?? "",
          signerCpf: formatCpf(input.cleanCpf),
          signedAt,
          ip,
          verificationCode,
          signedBytes,
          fullySigned,
          signedCount,
          requiredCount,
        },
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao processar assinatura";
    req.log.error({ err, docId }, "comercial contrato signature failed");
    return { status: 500, body: { error: msg } };
  }

  // Side effects after the transaction commits (best-effort).
  if (outcome.emails) {
    const e = outcome.emails;
    await sendSignatureEmails({
      req,
      doc: e.doc,
      documentoTipo: "contrato",
      termoNome: e.termoNome,
      clinicId: e.clinicId,
      signerName: e.signerName,
      signerEmail: e.signerEmail,
      signerCpf: e.signerCpf,
      signedAt: e.signedAt,
      ip: e.ip,
      verificationCode: e.verificationCode,
      signedBytes: e.signedBytes,
      fullySigned: e.fullySigned,
      signedCount: e.signedCount,
      requiredCount: e.requiredCount,
    });
    if (e.fullySigned) await reconcileTrilha(e.clinicId).catch(() => {});
  }
  return outcome.result;
}

// ─── Notification emails (signer + operator) ───────────────────────────────

async function sendSignatureEmails(opts: {
  req: Request;
  doc: DocRow;
  documentoTipo: "proposta" | "contrato";
  termoNome: string;
  clinicId: string;
  signerName: string;
  signerEmail: string;
  signerCpf: string;
  signedAt: Date;
  ip: string;
  verificationCode: string;
  signedBytes: Uint8Array;
  fullySigned: boolean;
  signedCount: number;
  requiredCount: number;
}): Promise<void> {
  const [clinic] = await db
    .select()
    .from(clinicsTable)
    .where(eq(clinicsTable.id, opts.clinicId));
  const clinicName = clinic?.fantasia ?? clinic?.nome ?? "—";
  const formattedSignedAt = formatBRT(opts.signedAt);
  const pdfBase64 = Buffer.from(opts.signedBytes).toString("base64");

  // (1) Signer confirmation with the signed PDF attached.
  if (opts.signerEmail) {
    const html = buildSigningConfirmationEmail({
      signatarioNome: opts.signerName,
      termoNome: opts.termoNome,
      clinicName,
      signedAt: formattedSignedAt,
      verificationCode: opts.verificationCode,
    });
    sendEmail({
      to: opts.signerEmail,
      subject: `[CLINIONEX360] Documento assinado — ${opts.termoNome}`,
      html,
      attachments: [
        {
          filename: `${opts.documentoTipo}-assinado.pdf`,
          content: pdfBase64,
          contentType: "application/pdf",
        },
      ],
    }).catch(() => {});
  }

  // (2) Operator notification — fall back through configured addresses, and if
  // none is set log a SUPER_ADMIN warning so the event is never silently lost.
  const operatorEmail =
    (await getConfig("contratada_email_notificacao")) ??
    (await getConfig("reply_to_address")) ??
    null;
  if (operatorEmail) {
    const appUrl = await resolveAppUrl(opts.req);
    const html = buildComercialSignatureNotificationEmail({
      documentoTipo: opts.documentoTipo,
      termoNome: opts.termoNome,
      clinicName,
      signatarioNome: opts.signerName,
      signatarioEmail: opts.signerEmail,
      signatarioCpf: opts.signerCpf,
      signedAt: formattedSignedAt,
      signerIp: opts.ip,
      verificationCode: opts.verificationCode,
      documentLink: `${appUrl}/admin/clinicas/${opts.clinicId}`,
      fullySigned: opts.fullySigned,
      signedCount: opts.signedCount,
      requiredCount: opts.requiredCount,
    });
    const statusLabel = opts.fullySigned
      ? `${tipoLabel(opts.documentoTipo)} assinado`
      : `${tipoLabel(opts.documentoTipo)} — assinatura registrada`;
    sendEmail({
      to: operatorEmail,
      subject: `[CLINIONEX360] ${statusLabel} — ${clinicName}`,
      html,
    }).catch((err: unknown) => {
      opts.req.log.error(
        {
          err,
          docId: opts.doc.id,
          clinicId: opts.clinicId,
          verificationCode: opts.verificationCode,
        },
        "comercial operator notification failed",
      );
    });
  } else {
    opts.req.log.warn(
      {
        docId: opts.doc.id,
        clinicId: opts.clinicId,
        verificationCode: opts.verificationCode,
      },
      "comercial operator notification skipped — no contratada_email_notificacao or reply_to_address configured",
    );
  }
}
