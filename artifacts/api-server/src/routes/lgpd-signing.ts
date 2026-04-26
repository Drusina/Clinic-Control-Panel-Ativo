import { Router, type IRouter, type Request } from "express";
import { eq, and, gt, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { randomBytes, createHash } from "crypto";
import {
  db,
  lgpdTermosTable,
  lgpdTermoTemplatesTable,
  clinicsTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { getConfig } from "../lib/config.js";
import {
  renderTermoPdf,
  stampSignedPdf,
  formatBRT,
  type ContratadaInfo,
  type ContratanteInfo,
} from "../lib/lgpd-pdf.js";
import { DEFAULT_TEMPLATES } from "../lib/lgpd-templates.js";
import {
  sendEmail,
  sendEmailDetailed,
  buildSigningRequestEmail,
  buildSigningConfirmationEmail,
  buildOperatorSignatureNotificationEmail,
  resolveAppUrl,
} from "../lib/email.js";

const protectedRouter: IRouter = Router();
const publicRouter: IRouter = Router();
const objectStorage = new ObjectStorageService();

// ─── Helpers ──────────────────────────────────────────────────────────────

function generateToken(): string {
  // 32 URL-safe characters → ~190 bits of entropy
  return randomBytes(24).toString("base64url");
}

function generateVerificationCode(): string {
  // Short human-readable code: 8 chars uppercase alphanumeric
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[buf[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) sum += parseInt(cpf[i], 10) * (factor - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(10) === parseInt(cpf[9], 10) && calc(11) === parseInt(cpf[10], 10);
}

function formatCpf(raw: string): string {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return raw;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

async function loadContratada(): Promise<ContratadaInfo> {
  return {
    razao_social: (await getConfig("contratada_razao_social")) ?? "",
    cnpj: (await getConfig("contratada_cnpj")) ?? "",
    endereco: (await getConfig("contratada_endereco")) ?? "",
    cidade_uf: (await getConfig("contratada_cidade_uf")) ?? "",
    cep: (await getConfig("contratada_cep")) ?? "",
    representante_nome: (await getConfig("contratada_representante_nome")) ?? "",
    representante_cpf: (await getConfig("contratada_representante_cpf")) ?? "",
    representante_cargo: (await getConfig("contratada_representante_cargo")) ?? "",
  };
}

async function loadContratante(clinicId: string): Promise<{ info: ContratanteInfo; nome: string } | null> {
  const [row] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, clinicId));
  if (!row) return null;
  return {
    nome: row.fantasia ?? row.nome,
    info: {
      razao_social: row.razaoSocial ?? row.nome,
      nome_fantasia: row.fantasia ?? row.nome,
      cnpj: row.cnpj,
      endereco: row.endereco ?? "",
      cidade_uf: [row.cidade, row.uf].filter(Boolean).join("/"),
      cep: row.cep ?? "",
      responsavel: row.responsavel ?? "",
    },
  };
}

async function getOrSeedTemplate(slug: string) {
  let [tpl] = await db.select().from(lgpdTermoTemplatesTable).where(eq(lgpdTermoTemplatesTable.slug, slug));
  if (!tpl) {
    const def = DEFAULT_TEMPLATES.find((t) => t.slug === slug);
    if (!def) return null;
    [tpl] = await db
      .insert(lgpdTermoTemplatesTable)
      .values({ slug: def.slug, titulo: def.titulo, descricao: def.descricao, corpo: def.corpo, versao: 1 })
      .returning();
  }
  return tpl;
}

async function uploadPdfBytes(bytes: Uint8Array): Promise<string> {
  const uploadUrl = await objectStorage.getObjectEntityUploadURL();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from(bytes),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload PDF failed: ${res.status} ${txt}`);
  }
  return objectStorage.normalizeObjectEntityPath(uploadUrl);
}

async function downloadPdfBytes(objectPath: string): Promise<Buffer> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [buf] = await file.download();
  return buf;
}

function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0].split(",")[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "";
}

// ─── PROTECTED: send / re-send signing request ────────────────────────────

const SendBody = z.object({
  signerName: z.string().min(2),
  signerEmail: z.email(),
  signerCargo: z.string().optional().nullable(),
});

protectedRouter.post(
  "/clinics/:clinicId/lgpd-termos/:termoId/send-for-signing",
  async (req, res): Promise<void> => {
    const clinicId = req.params.clinicId as string;
    const termoId = req.params.termoId as string;

    const parsed = SendBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      const [termo] = await db
        .select()
        .from(lgpdTermosTable)
        .where(and(eq(lgpdTermosTable.id, termoId), eq(lgpdTermosTable.clinicId, clinicId)));
      if (!termo) {
        res.status(404).json({ error: "Termo não encontrado" });
        return;
      }

      const tpl = await getOrSeedTemplate(termo.slug);
      if (!tpl) {
        res.status(400).json({ error: `Modelo "${termo.slug}" não encontrado` });
        return;
      }

      const contratada = await loadContratada();
      const clinic = await loadContratante(clinicId);
      if (!clinic) {
        res.status(404).json({ error: "Clínica não encontrada" });
        return;
      }

      // Render PDF + compute hash
      const { bytes, hash } = await renderTermoPdf({
        titulo: tpl.titulo,
        corpo: tpl.corpo,
        versao: tpl.versao,
        contratada,
        contratante: clinic.info,
      });

      // Upload original PDF to GCS
      const originalPath = await uploadPdfBytes(bytes);

      // Token + 30-day expiry (matches the validity window communicated to the
      // signer in the request e-mail; renew via "Reemitir" if it expires).
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(lgpdTermosTable)
        .set({
          status: "enviado",
          metodo: "assinatura_eletronica_simples",
          signatarioNome: parsed.data.signerName,
          signatarioEmail: parsed.data.signerEmail,
          signatarioCargo: parsed.data.signerCargo ?? null,
          storagePath: originalPath,
          docHash: hash,
          templateVersion: tpl.versao,
          signingToken: token,
          signingTokenExpiresAt: expiresAt,
          signedStoragePath: null,
          signerCpf: null,
          signerIp: null,
          signerUserAgent: null,
          assinadoEm: null,
          enviadoEm: new Date(),
          autentiqueDocId: null,
          acaoUrl: null,
        })
        .where(eq(lgpdTermosTable.id, termoId));

      // Build signing link (uses CCP base URL — same origin as the API)
      const appUrl = await resolveAppUrl(req);
      const signatureLink = `${appUrl}/assinar/${token}`;

      const html = buildSigningRequestEmail({
        signatarioNome: parsed.data.signerName,
        termoNome: tpl.titulo,
        signatureLink,
        clinicName: clinic.nome,
        expiresAt: expiresAt.toLocaleDateString("pt-BR"),
      });

      const emailResult = await sendEmailDetailed({
        to: parsed.data.signerEmail,
        subject: `[IONEX360] Assine: ${tpl.titulo}`,
        html,
      });

      res.json({
        success: true,
        token,
        signatureLink,
        expiresAt: expiresAt.toISOString(),
        emailSent: emailResult.ok,
        emailError: emailResult.ok ? null : emailResult.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      res.status(500).json({ error: message });
    }
  },
);

protectedRouter.post(
  "/clinics/:clinicId/lgpd-termos/:termoId/resend-signing-email",
  async (req, res): Promise<void> => {
    const clinicId = req.params.clinicId as string;
    const termoId = req.params.termoId as string;

    const [termo] = await db
      .select()
      .from(lgpdTermosTable)
      .where(and(eq(lgpdTermosTable.id, termoId), eq(lgpdTermosTable.clinicId, clinicId)));
    if (!termo || !termo.signingToken || !termo.signatarioEmail || !termo.signatarioNome) {
      res.status(404).json({ error: "Solicitação de assinatura não encontrada" });
      return;
    }
    if (termo.signingTokenExpiresAt && termo.signingTokenExpiresAt.getTime() < Date.now()) {
      res.status(400).json({ error: "Token expirado — gere uma nova solicitação" });
      return;
    }

    const clinic = await loadContratante(clinicId);
    const appUrl = await resolveAppUrl(req);
    const signatureLink = `${appUrl}/assinar/${termo.signingToken}`;

    const html = buildSigningRequestEmail({
      signatarioNome: termo.signatarioNome,
      termoNome: termo.nome,
      signatureLink,
      clinicName: clinic?.nome,
      expiresAt: termo.signingTokenExpiresAt?.toLocaleDateString("pt-BR"),
    });

    const result = await sendEmailDetailed({
      to: termo.signatarioEmail,
      subject: `[IONEX360] Assine: ${termo.nome} (reenvio)`,
      html,
    });

    res.json({ success: result.ok, emailError: result.ok ? null : result.error });
  },
);

// ─── PROTECTED: download signed PDF ───────────────────────────────────────

protectedRouter.get(
  "/clinics/:clinicId/lgpd-termos/:termoId/signed-pdf",
  async (req, res): Promise<void> => {
    const clinicId = req.params.clinicId as string;
    const termoId = req.params.termoId as string;

    const [termo] = await db
      .select()
      .from(lgpdTermosTable)
      .where(and(eq(lgpdTermosTable.id, termoId), eq(lgpdTermosTable.clinicId, clinicId)));
    if (!termo) {
      res.status(404).json({ error: "Termo não encontrado" });
      return;
    }

    const path = termo.signedStoragePath ?? termo.storagePath;
    if (!path) {
      res.status(404).json({ error: "PDF não disponível" });
      return;
    }

    try {
      const buf = await downloadPdfBytes(path);
      const filename = `${termo.slug}-${termo.id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "private, max-age=0, no-store");
      res.send(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao buscar PDF";
      res.status(500).json({ error: msg });
    }
  },
);

// ─── PUBLIC: signing flow (no auth) ───────────────────────────────────────

publicRouter.get("/assinar/info/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;
  const [termo] = await db.select().from(lgpdTermosTable).where(eq(lgpdTermosTable.signingToken, token));
  if (!termo) {
    res.status(404).json({ error: "invalid_token", message: "Link inválido ou expirado." });
    return;
  }
  const expired = termo.signingTokenExpiresAt && termo.signingTokenExpiresAt.getTime() < Date.now();
  if (expired) {
    res.status(410).json({ error: "expired", message: "Este link expirou. Solicite um novo à clínica." });
    return;
  }

  const alreadySigned = termo.status === "assinado";
  const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, termo.clinicId));

  res.json({
    token,
    termoNome: termo.nome,
    termoDescricao: termo.descricao ?? null,
    clinicNome: clinic?.fantasia ?? clinic?.nome ?? "—",
    signatarioNome: termo.signatarioNome ?? "",
    signatarioEmail: termo.signatarioEmail ?? "",
    signatarioCargo: termo.signatarioCargo ?? null,
    status: termo.status,
    alreadySigned,
    expiresAt: termo.signingTokenExpiresAt?.toISOString() ?? null,
  });
});

publicRouter.get("/assinar/pdf/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;
  const [termo] = await db.select().from(lgpdTermosTable).where(eq(lgpdTermosTable.signingToken, token));
  if (!termo) {
    res.status(404).json({ error: "Token inválido" });
    return;
  }
  const expired = termo.signingTokenExpiresAt && termo.signingTokenExpiresAt.getTime() < Date.now();
  if (expired) {
    res.status(410).json({ error: "Link expirado" });
    return;
  }

  // If already signed, prefer the signed copy
  const path = termo.signedStoragePath ?? termo.storagePath;
  if (!path) {
    res.status(404).json({ error: "PDF não disponível" });
    return;
  }

  try {
    const buf = await downloadPdfBytes(path);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${termo.slug}.pdf"`);
    res.setHeader("Cache-Control", "private, max-age=0, no-store");
    res.send(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao buscar PDF";
    res.status(500).json({ error: msg });
  }
});

const SubmitBody = z.object({
  signerName: z.string().min(2),
  signerCpf: z.string().min(11),
  acceptTerms: z.literal(true),
});

publicRouter.post("/assinar/submit/:token", async (req, res): Promise<void> => {
  const token = req.params.token as string;
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos: " + parsed.error.message });
    return;
  }

  const cleanCpf = parsed.data.signerCpf.replace(/\D/g, "");
  if (!isValidCpf(cleanCpf)) {
    res.status(400).json({ error: "CPF inválido" });
    return;
  }

  // ─── Atomic single-use claim ──────────────────────────────────────────
  // Prevent replay/race: only one concurrent request can transition the row
  // from "enviado" to a "claimed" state. We use a conditional UPDATE…RETURNING
  // gated on (token, status='enviado', expiry > now) so a second concurrent
  // submit gets zero rows back and is rejected.
  const claimedAt = new Date();
  const claimed = await db
    .update(lgpdTermosTable)
    .set({ status: "assinando", assinadoEm: claimedAt })
    .where(
      and(
        eq(lgpdTermosTable.signingToken, token),
        eq(lgpdTermosTable.status, "enviado"),
        gt(lgpdTermosTable.signingTokenExpiresAt, new Date()),
      ),
    )
    .returning();

  if (claimed.length === 0) {
    // Disambiguate the failure for a clearer error to the signer.
    const [existing] = await db
      .select()
      .from(lgpdTermosTable)
      .where(eq(lgpdTermosTable.signingToken, token));
    if (!existing) {
      res.status(404).json({ error: "Link inválido" });
      return;
    }
    if (existing.status === "assinado" || existing.status === "assinando") {
      res.status(409).json({ error: "Documento já foi assinado" });
      return;
    }
    if (existing.signingTokenExpiresAt && existing.signingTokenExpiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "Link expirado — solicite um novo à clínica" });
      return;
    }
    res.status(409).json({ error: "Link não disponível para assinatura" });
    return;
  }

  const termo = claimed[0];
  if (!termo.storagePath || !termo.docHash) {
    // Roll back the claim so the admin can re-emit
    await db
      .update(lgpdTermosTable)
      .set({ status: "enviado", assinadoEm: null })
      .where(eq(lgpdTermosTable.id, termo.id));
    res.status(500).json({ error: "Documento original ausente — solicite reenvio" });
    return;
  }

  try {
    // Download the original PDF
    const originalBytes = await downloadPdfBytes(termo.storagePath);

    // ─── Integrity check ────────────────────────────────────────────────
    // Recompute SHA-256 of the bytes we are about to stamp and compare to
    // the hash captured at draft time. If they differ, the storage object
    // was tampered with after the draft was emitted — abort and roll back.
    const actualHash = createHash("sha256").update(originalBytes).digest("hex");
    if (actualHash !== termo.docHash) {
      await db
        .update(lgpdTermosTable)
        .set({ status: "enviado", assinadoEm: null })
        .where(eq(lgpdTermosTable.id, termo.id));
      res.status(409).json({
        error: "Falha de integridade do documento. Solicite reenvio à clínica.",
      });
      return;
    }

    const verificationCode = generateVerificationCode();
    const signedAt = new Date();
    const ip = clientIp(req);
    const ua = (req.headers["user-agent"] as string | undefined) ?? "";

    // Stamp signature page
    const signedBytes = await stampSignedPdf(originalBytes, {
      signerName: parsed.data.signerName,
      signerEmail: termo.signatarioEmail ?? "",
      signerCpf: formatCpf(cleanCpf),
      signerCargo: termo.signatarioCargo,
      signedAt,
      signerIp: ip,
      signerUserAgent: ua,
      docHash: termo.docHash,
      verificationCode,
    });

    // Upload signed PDF
    const signedPath = await uploadPdfBytes(signedBytes);

    // Finalize: transition to "assinado" and persist all signature evidence.
    await db
      .update(lgpdTermosTable)
      .set({
        status: "assinado",
        signatarioNome: parsed.data.signerName,
        signerCpf: formatCpf(cleanCpf),
        signerIp: ip,
        signerUserAgent: ua,
        signedStoragePath: signedPath,
        assinadoEm: signedAt,
        // We deliberately keep signingToken non-NULL so /assinar/info still
        // renders the success state when the signer revisits the link.
      })
      .where(eq(lgpdTermosTable.id, termo.id));

    // Send confirmation emails (non-blocking but await for visibility)
    const [clinic] = await db.select().from(clinicsTable).where(eq(clinicsTable.id, termo.clinicId));
    const clinicName = clinic?.fantasia ?? clinic?.nome ?? "—";
    const formattedSignedAt = formatBRT(signedAt);
    const pdfBase64 = Buffer.from(signedBytes).toString("base64");

    // (1) signer
    if (termo.signatarioEmail) {
      const html = buildSigningConfirmationEmail({
        signatarioNome: parsed.data.signerName,
        termoNome: termo.nome,
        clinicName,
        signedAt: formattedSignedAt,
        verificationCode,
      });
      sendEmail({
        to: termo.signatarioEmail,
        subject: `[IONEX360] Documento assinado — ${termo.nome}`,
        html,
        attachments: [
          { filename: `${termo.slug}-assinado.pdf`, content: pdfBase64, contentType: "application/pdf" },
        ],
      }).catch(() => {});
    }

    // (2) operator
    const operatorEmail =
      (await getConfig("contratada_email_notificacao")) ??
      (await getConfig("reply_to_address")) ??
      null;
    if (operatorEmail) {
      const appUrl = await resolveAppUrl(req);
      const html = buildOperatorSignatureNotificationEmail({
        termoNome: termo.nome,
        clinicName,
        signatarioNome: parsed.data.signerName,
        signatarioEmail: termo.signatarioEmail ?? "",
        signatarioCpf: formatCpf(cleanCpf),
        signedAt: formattedSignedAt,
        signerIp: ip,
        verificationCode,
        documentLink: `${appUrl}/kickoff/${termo.clinicId}`,
      });
      sendEmail({
        to: operatorEmail,
        subject: `[IONEX360] Termo assinado por ${clinicName} — ${termo.nome}`,
        html,
      }).catch(() => {});
    }

    res.json({
      success: true,
      verificationCode,
      signedAt: signedAt.toISOString(),
      downloadToken: token, // The same token can fetch the signed PDF via /assinar/pdf/:token
    });
  } catch (err) {
    // Compensating rollback: any failure after the atomic claim must release the
    // row back to "enviado" so the admin can re-emit and the signer can retry.
    // Without this the termo would be deadlocked in "assinando".
    try {
      await db
        .update(lgpdTermosTable)
        .set({ status: "enviado", assinadoEm: null })
        .where(
          and(
            eq(lgpdTermosTable.signingToken, token),
            eq(lgpdTermosTable.status, "assinando"),
          ),
        );
    } catch {
      /* swallow — best-effort rollback */
    }
    const msg = err instanceof Error ? err.message : "Erro ao processar assinatura";
    res.status(500).json({ error: msg });
  }
});

export { protectedRouter as lgpdSigningProtectedRouter, publicRouter as lgpdSigningPublicRouter };
