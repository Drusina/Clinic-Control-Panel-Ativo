import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db, lgpdTermosTable, teamTable } from "@workspace/db";
import { sendEmail, buildSigningRequestEmail, buildSigningConfirmationEmail, resolveAppUrl } from "../lib/email.js";
import { sendApprovalWhatsApp, isWhatsAppConfigured } from "../lib/whatsapp.js";
import { getRecipientPrefs } from "../lib/preferences.js";
import { getConfig } from "../lib/config.js";

const publicRouter: IRouter = Router();
const protectedRouter: IRouter = Router();

const AUTENTIQUE_API_URL = "https://api.autentique.com.br/v2/graphql";

async function generateTermoPdf(termoNome: string, termoDescricao: string | null, clinicId: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  const margin = 60;
  let y = height - 70;
  const primary = rgb(0.1, 0.33, 0.86);
  const dark = rgb(0.07, 0.09, 0.15);
  const gray = rgb(0.42, 0.45, 0.5);

  // Header brand
  page.drawText("IONEX360", { x: margin, y, font: bold, size: 22, color: primary });
  page.drawText("Gestão de Clínicas Estéticas", { x: margin, y: y - 16, font: regular, size: 9, color: gray });

  y -= 40;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: primary });
  y -= 24;

  // Document title
  page.drawText("Termo de Aceite LGPD", { x: margin, y, font: bold, size: 16, color: dark });
  y -= 28;

  // Term name
  const titleLines = wrapTextSimple(termoNome, 14, width - margin * 2, 5.5);
  for (const line of titleLines) {
    page.drawText(line, { x: margin, y, font: bold, size: 14, color: primary });
    y -= 20;
  }
  y -= 8;

  // Description
  if (termoDescricao) {
    const descLines = wrapTextSimple(termoDescricao, 11, width - margin * 2, 5.5);
    for (const line of descLines) {
      page.drawText(line, { x: margin, y, font: regular, size: 11, color: dark });
      y -= 16;
    }
    y -= 12;
  }

  // Date / clinic info
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  page.drawText(`Data de emissão: ${today}`, { x: margin, y, font: regular, size: 10, color: gray });
  y -= 16;
  page.drawText(`Referência de clínica: ${clinicId}`, { x: margin, y, font: regular, size: 10, color: gray });
  y -= 40;

  // Signature area placeholder
  y = 200;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 240, y }, thickness: 0.5, color: gray });
  page.drawText("Assinatura do Responsável", { x: margin, y: y - 14, font: regular, size: 10, color: gray });

  page.drawLine({ start: { x: margin + 280, y }, end: { x: margin + 520, y }, thickness: 0.5, color: gray });
  page.drawText("Representante IONEX360", { x: margin + 280, y: y - 14, font: regular, size: 10, color: gray });

  // Footer
  page.drawText("IONEX360 — Plataforma de Gestão de Clínicas Estéticas", {
    x: margin, y: 40, font: regular, size: 8, color: gray,
  });

  return doc.save();
}

function wrapTextSimple(text: string, size: number, maxWidth: number, charWidth: number): string[] {
  const charsPerLine = Math.floor(maxWidth / (size * charWidth / 10));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > charsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

protectedRouter.post("/autentique/create-document", async (req, res): Promise<void> => {
  const { termSlug, clinicId, signerEmail, signerName } = req.body;

  if (!termSlug || !clinicId || !signerEmail || !signerName) {
    res.status(400).json({ error: "termSlug, clinicId, signerEmail, and signerName are required" });
    return;
  }

  const autentiqueToken = await getConfig("autentique_token");
  if (!autentiqueToken) {
    res.status(503).json({
      error: "Autentique não está configurado. Acesse Configurações → Integrações para adicionar o token.",
    });
    return;
  }

  const [termo] = await db
    .select()
    .from(lgpdTermosTable)
    .where(and(eq(lgpdTermosTable.slug, termSlug), eq(lgpdTermosTable.clinicId, clinicId)));

  if (!termo) {
    res.status(404).json({ error: "Termo não encontrado para esta clínica" });
    return;
  }

  try {
    const pdfBytes = await generateTermoPdf(termo.nome, termo.descricao ?? null, clinicId);
    const pdfBuffer = Buffer.from(pdfBytes);

    let storagePath: string | null = null;
    const supabaseUrl = await getConfig("supabase_url");
    const serviceRoleKey = await getConfig("supabase_service_role_key");
    if (supabaseUrl && serviceRoleKey) {
      const objectPath = `clinics/${clinicId}/lgpd/${termo.slug}.pdf`;
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/signed-docs/${objectPath}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/pdf",
            "x-upsert": "true",
          },
          body: pdfBuffer,
        }
      );
      if (uploadRes.ok) {
        storagePath = objectPath;
      }
    }

    const mutation = `
      mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
        createDocument(document: $document, signers: $signers, file: $file) {
          id
          name
          signers {
            public_id
            email
            action { name }
            link { short_link }
          }
        }
      }
    `;

    const variables = {
      document: {
        name: termo.nome,
        message: `Por favor, assine o documento: ${termo.nome}`,
        reminder: true,
        sortable: false,
        cc: [],
        refusable: false,
      },
      signers: [
        { email: signerEmail, action: "SIGN", positions: [] },
      ],
      file: null,
    };

    const formData = new FormData();
    formData.append("operations", JSON.stringify({ query: mutation, variables }));
    formData.append("map", JSON.stringify({ "0": ["variables.file"] }));
    formData.append(
      "0",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      `${termo.slug}.pdf`
    );

    const autentiqueRes = await fetch(AUTENTIQUE_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${autentiqueToken}` },
      body: formData,
    });

    const result = await autentiqueRes.json() as {
      data?: {
        createDocument?: {
          id: string;
          signers?: Array<{ link?: { short_link: string } }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors || !result.data?.createDocument) {
      const errMsg = result.errors?.[0]?.message ?? "Autentique error";
      res.status(502).json({ error: `Autentique: ${errMsg}` });
      return;
    }

    const doc = result.data.createDocument;
    const signatureLink = doc.signers?.[0]?.link?.short_link ?? null;

    await db
      .update(lgpdTermosTable)
      .set({
        status: "enviado",
        metodo: "aceite_digital",
        autentiqueDocId: doc.id,
        acaoUrl: signatureLink,
        signatarioNome: signerName,
        signatarioEmail: signerEmail,
        ...(storagePath ? { storagePath } : {}),
        enviadoEm: new Date(),
      })
      .where(and(eq(lgpdTermosTable.slug, termSlug), eq(lgpdTermosTable.clinicId, clinicId)));

    if (signatureLink) {
      const signingHtml = buildSigningRequestEmail({
        signatarioNome: signerName,
        termoNome: termo.nome,
        signatureLink,
      });
      sendEmail({
        to: signerEmail,
        subject: `[IONEX360] Assinatura necessária: ${termo.nome}`,
        html: signingHtml,
      }).catch(() => {});
    }

    res.json({ success: true, documentId: doc.id, signatureLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    res.status(500).json({ error: message });
  }
});

publicRouter.post("/autentique/webhook", async (req, res): Promise<void> => {
  try {
    const webhookSecret = await getConfig("autentique_webhook_secret");
    const incomingSecret = req.headers["x-autentique-secret"] as string | undefined;

    if (webhookSecret) {
      if (!incomingSecret || incomingSecret !== webhookSecret) {
        res.sendStatus(401);
        return;
      }
    } else if (process.env.NODE_ENV === "production") {
      res.status(503).json({ error: "AUTENTIQUE_WEBHOOK_SECRET não configurado. Acesse Configurações → Integrações." });
      return;
    }

    const payload = req.body;
    const docId = payload?.document?.id as string | undefined;
    const event = payload?.event as string | undefined;

    if (!docId) {
      res.sendStatus(200);
      return;
    }

    let newStatus = "enviado";
    if (event === "DOCUMENT_SIGNED") newStatus = "assinado";
    else if (event === "DOCUMENT_REFUSED") newStatus = "recusado";

    const [termo] = await db
      .select()
      .from(lgpdTermosTable)
      .where(eq(lgpdTermosTable.autentiqueDocId, docId));

    if (termo) {
      await db
        .update(lgpdTermosTable)
        .set({
          status: newStatus,
          assinadoEm: newStatus === "assinado" ? new Date() : undefined,
        })
        .where(eq(lgpdTermosTable.autentiqueDocId, docId));

      if (newStatus === "assinado" && termo.signatarioEmail && termo.signatarioNome) {
        const recipientPrefs = await getRecipientPrefs(termo.signatarioEmail);

        const [teamMember] = await db
          .select({ whatsapp: teamTable.whatsapp })
          .from(teamTable)
          .where(eq(teamTable.email, termo.signatarioEmail))
          .limit(1);

        let notifiedViaWhatsApp = false;
        if (recipientPrefs.whatsappEnabled && teamMember?.whatsapp && isWhatsAppConfigured()) {
          notifiedViaWhatsApp = await sendApprovalWhatsApp({
            phone: teamMember.whatsapp,
            responsavelNome: termo.signatarioNome,
            termoNome: termo.nome ?? "Termo LGPD",
          });
        }

        if (!notifiedViaWhatsApp && recipientPrefs.emailEnabled) {
          const appUrl = await resolveAppUrl(req);
          const docsLink = `${appUrl}/documentos`;
          const html = buildSigningConfirmationEmail({
            signatarioNome: termo.signatarioNome,
            termoNome: termo.nome ?? "Termo LGPD",
            docsLink,
          });
          sendEmail({
            to: termo.signatarioEmail,
            subject: `[IONEX360] Documento assinado com sucesso — ${termo.nome ?? "Termo LGPD"}`,
            html,
          }).catch(() => {});
        }
      }
    }

    res.sendStatus(200);
  } catch {
    res.sendStatus(200);
  }
});

export { publicRouter as autentiquePublicRouter, protectedRouter as autentiqueProtectedRouter };
export default publicRouter;
