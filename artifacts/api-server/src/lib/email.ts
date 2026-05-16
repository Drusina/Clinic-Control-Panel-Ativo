import { getConfig } from "./config.js";
import type { Request } from "express";

const DEFAULT_FROM = "IONEX360 <onboarding@resend.dev>";
const DEFAULT_APP_URL = "https://app.clinionex.com.br";
const BRAND_SITE_URL = "https://clinionex.com.br";
const BRAND_SITE_LABEL = "clinionex.com.br";

/**
 * Resolves the public app URL for use in email links.
 * Priority order:
 *   1. `app_url` from server_config (DB) — set by admin in /admin/configuracoes
 *   2. `APP_URL` env var (via config registry fallback)
 *   3. Request context (`req.protocol://req.get('host')`) when `req` is provided,
 *      with strict host sanitization to defend against Host-header poisoning.
 *   4. DEFAULT_APP_URL (https://app.clinionex.com.br) as last-resort hardcoded fallback
 */
export async function resolveAppUrl(req?: Request): Promise<string> {
  const configured = await getConfig("app_url");
  if (configured) {
    warnIfAppUrlLooksLikeMarketingSite(configured);
    return configured;
  }
  if (req) {
    const host = req.get("host");
    // Defensive: only accept hosts that look like a normal hostname[:port].
    // Rejects newlines, spaces, commas (multi-host injection) and other injection vectors.
    if (host && /^[a-zA-Z0-9.\-]+(:\d{1,5})?$/.test(host)) {
      const fromReq = `${req.protocol}://${host}`;
      warnIfAppUrlLooksLikeMarketingSite(fromReq);
      return fromReq;
    }
  }
  return DEFAULT_APP_URL;
}

/**
 * Heuristic: if the resolved app URL points at the marketing site
 * (`clinionex.com.br` without the `app.` subdomain) the email links will
 * 404 because the marketing site does not host the SPA routes
 * (`/assinar/<token>`, `/convite/<token>`, etc.). This already happened
 * once in production (Apr 2026 — the operator pasted the marketing URL in
 * /admin/configuracoes), so we now log a SUPER_ADMIN-level warning every
 * time we resolve such a value to make recurrences obvious in the logs.
 * We only log; we do not rewrite the URL, in case some operator legitimately
 * wants a non-app subdomain in the future.
 */
// Bounded dedupe set so a sustained stream of distinct bad request hosts
// (worst-case: req-derived URLs from a misbehaving proxy) cannot grow this
// without limit. We keep the most recent N entries; once the cap is hit we
// drop everything (simpler than LRU, and the warning is intentionally
// repeatable — losing the dedupe just means it logs again).
const WARNED_APP_URLS_MAX = 100;
let warnedAppUrls = new Set<string>();
function warnIfAppUrlLooksLikeMarketingSite(url: string): void {
  // Parse the URL so we match on the host exactly, not on a substring of the
  // full URL. Otherwise a path like `https://example.com/clinionex.com.br/x`
  // would falsely trip the warning.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  // Use hostname (no port) for the equality check so explicit-port variants
  // like `https://app.clinionex.com.br:443` aren't falsely flagged.
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "clinionex.com.br" && !hostname.endsWith(".clinionex.com.br")) return;
  if (hostname === "app.clinionex.com.br") return;
  // Dedupe by canonical origin (protocol + host with port if any) so query
  // strings or path variants don't blow up the cache.
  const key = `${parsed.protocol}//${parsed.host.toLowerCase()}`;
  if (warnedAppUrls.has(key)) return;
  if (warnedAppUrls.size >= WARNED_APP_URLS_MAX) warnedAppUrls.clear();
  warnedAppUrls.add(key);
  console.error(
    `[SUPER_ADMIN] app_url está configurado como "${key}", que aponta para o site institucional (sem subdomínio "app."). ` +
      `Os links nos e-mails vão levar a 404. Corrija em /admin/configuracoes para "https://app.clinionex.com.br".`,
  );
}

// Test/utility hook — clear the dedupe cache. Not exported in the public
// surface; only used by unit tests to reset between cases.
export function __resetAppUrlWarningCacheForTests(): void {
  warnedAppUrls = new Set<string>();
}

function baseTemplate(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0b0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0b0f;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background-color:#111218;border-radius:12px 12px 0 0;padding:28px 40px;border-bottom:2px solid #1e2333;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;">
                      <span style="color:#3b82f6;">IONEX</span><span style="color:#e2e8f0;">360</span>
                    </span>
                    <span style="display:block;font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:1px;">Clinic Control Platform</span>
                  </td>
                  <td align="right">
                    <span style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-size:10px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">ICS</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color:#111218;padding:40px;border-radius:0 0 12px 12px;">
              ${bodyHtml}
              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:40px;padding-top:24px;border-top:1px solid #1e2333;">
                <tr>
                  <td style="color:#475569;font-size:12px;text-align:center;line-height:1.6;">
                    Este é um email automático do sistema IONEX360.<br/>
                    Para suporte ou dúvidas, responda a este email.<br/>
                    <a href="${BRAND_SITE_URL}" style="color:#3b82f6;text-decoration:none;">${BRAND_SITE_LABEL}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:8px;margin:24px 0;">${label}</a>`;
}

export function buildInviteEmail(params: { email: string; role: string; magicLink: string; clinicName?: string }): string {
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Bem-vindo(a) à plataforma IONEX360</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Você foi convidado(a) a acessar o painel clínico${params.clinicName ? ` da <strong style="color:#e2e8f0;">${params.clinicName}</strong>` : ""}.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      ${params.clinicName ? `<tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
          <p style="margin:0;color:#3b82f6;font-weight:600;">${params.clinicName}</p>
        </td>
      </tr>` : ""}
      <tr><td style="${params.clinicName ? "padding-top:16px;" : ""}">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Email</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.email}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Perfil de acesso</p>
        <p style="margin:0;color:#f59e0b;font-weight:600;">${params.role}</p>
      </td></tr>
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Clique no botão abaixo para definir sua senha e acessar a plataforma. Este link é válido por <strong style="color:#e2e8f0;">7 dias</strong>.
    </p>

    ${primaryButton(params.magicLink, "Acessar a plataforma →")}

    <p style="color:#475569;font-size:12px;margin-top:8px;">
      Ou copie e cole este link no navegador:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${params.magicLink}</span>
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não esperava este convite, pode ignorar este email com segurança.
    </p>
  `;
  return baseTemplate("Convite IONEX360", body);
}

export function describeDelegationScope(params: {
  nivel?: number | null;
  questaoInicio?: number | null;
  questaoFim?: number | null;
}): string {
  const inicio = params.questaoInicio ?? null;
  const fim = params.questaoFim ?? null;
  if (inicio != null && fim != null && inicio === fim) {
    return `Pergunta única Q${inicio}`;
  }
  if (inicio != null && fim != null) {
    return `Perguntas Q${inicio}–Q${fim}`;
  }
  if (params.nivel === 2) {
    return "Módulo de perguntas";
  }
  return "Pilar inteiro";
}

export function buildDelegationEmail(params: {
  responsavelNome: string;
  responsavelEmail: string;
  pilarNome: string;
  pilarSlug: string;
  clinicId?: string;
  clinicName?: string;
  diagnosticoId?: string;
  nivel?: number;
  questaoInicio?: number | null;
  questaoFim?: number | null;
  prazo?: string;
  observacoes?: string;
  appUrl: string;
}): string {
  const link = params.clinicId
    ? `${params.appUrl}/delegacao/${params.clinicId}${
        params.diagnosticoId ? `?diagnostico=${encodeURIComponent(params.diagnosticoId)}` : ""
      }`
    : `${params.appUrl}/diagnostico/select?pilar=${encodeURIComponent(params.pilarSlug)}`;
  const escopoLabel = describeDelegationScope({
    nivel: params.nivel,
    questaoInicio: params.questaoInicio ?? null,
    questaoFim: params.questaoFim ?? null,
  });
  const escopoLine = `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Escopo</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${escopoLabel}</p>
      </td></tr>`;
  const prazoLine = params.prazo
    ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Prazo</p>
        <p style="margin:0;color:#f59e0b;font-weight:600;">${params.prazo}</p>
      </td></tr>`
    : "";
  const obsLine = params.observacoes
    ? `<p style="color:#94a3b8;font-size:14px;line-height:1.7;margin-top:16px;"><strong style="color:#e2e8f0;">Observações:</strong> ${params.observacoes}</p>`
    : "";

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Delegação de Pilar Diagnóstico</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">Olá, <strong style="color:#e2e8f0;">${params.responsavelNome}</strong>. Você foi designado(a) responsável por um pilar do diagnóstico ICS.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Pilar</p>
          <p style="margin:0;color:#3b82f6;font-weight:700;font-size:18px;">${params.pilarNome}</p>
        </td>
      </tr>
      ${params.clinicName ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.clinicName}</p>
      </td></tr>` : ""}
      ${escopoLine}
      ${prazoLine}
    </table>

    ${obsLine}

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Acesse a plataforma para visualizar as perguntas do diagnóstico, registrar evidências e acompanhar o progresso do seu pilar.
    </p>

    ${primaryButton(link, "Acessar diagnóstico →")}

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Em caso de dúvidas, entre em contato com o administrador do sistema.
    </p>
  `;
  return baseTemplate(`Delegação — ${params.pilarNome}`, body);
}

export function buildRespondentInviteEmail(params: {
  responsavelNome: string;
  pilarNome: string;
  clinicName?: string;
  prazo?: string | null;
  link: string;
}): string {
  const clinicLine = params.clinicName
    ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.clinicName}</p>
      </td></tr>`
    : "";
  const prazoLine = params.prazo
    ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Prazo sugerido</p>
        <p style="margin:0;color:#f59e0b;font-weight:600;">${params.prazo}</p>
      </td></tr>`
    : "";

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Convite para responder o Diagnóstico 360°</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.responsavelNome}</strong>. Você foi indicado(a) para responder
      as perguntas do pilar <strong style="color:#3b82f6;">${params.pilarNome}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr><td>
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Pilar</p>
        <p style="margin:0;color:#3b82f6;font-weight:700;font-size:18px;">${params.pilarNome}</p>
      </td></tr>
      ${clinicLine}
      ${prazoLine}
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Ao clicar no botão abaixo você abrirá <strong style="color:#e2e8f0;">apenas as perguntas do seu pilar</strong>.
      Suas respostas são salvas automaticamente — pode pausar e voltar pelo mesmo link quando quiser.
    </p>

    ${primaryButton(params.link, "Responder agora →")}

    <p style="color:#475569;font-size:12px;margin-top:8px;">
      Ou copie e cole este link no navegador:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${params.link}</span>
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Este link é pessoal e válido por <strong style="color:#94a3b8;">30 dias</strong>. Não compartilhe com terceiros.
    </p>
  `;
  return baseTemplate(`Convite — ${params.pilarNome}`, body);
}

export function buildExpiryDigestEmail(params: {
  clinicName: string;
  adminEmail: string;
  documents: Array<{ nome: string; categoria: string; validade: string; diasRestantes: number }>;
  appUrl: string;
}): string {
  const rows = params.documents
    .map(
      (doc) => `
      <tr style="border-bottom:1px solid #1e2333;">
        <td style="padding:12px 8px;color:#e2e8f0;font-size:14px;">${doc.nome}</td>
        <td style="padding:12px 8px;color:#94a3b8;font-size:13px;">${doc.categoria}</td>
        <td style="padding:12px 8px;color:#94a3b8;font-size:13px;">${doc.validade}</td>
        <td style="padding:12px 8px;text-align:center;">
          <span style="background:${doc.diasRestantes <= 7 ? "#7f1d1d" : "#78350f"};color:${doc.diasRestantes <= 7 ? "#fca5a5" : "#fcd34d"};font-size:12px;font-weight:600;padding:3px 10px;border-radius:12px;">
            ${doc.diasRestantes}d
          </span>
        </td>
      </tr>`
    )
    .join("");

  const docsLink = `${params.appUrl}/documentos`;

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Documentos próximos ao vencimento</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      A clínica <strong style="color:#e2e8f0;">${params.clinicName}</strong> possui ${params.documents.length} documento(s) com vencimento nos próximos 30 dias.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#1e2333;">
          <th style="padding:12px 8px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Documento</th>
          <th style="padding:12px 8px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Categoria</th>
          <th style="padding:12px 8px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Vencimento</th>
          <th style="padding:12px 8px;text-align:center;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Resta</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    ${primaryButton(docsLink, "Gerenciar documentos →")}
  `;
  return baseTemplate("Documentos próximos ao vencimento — IONEX360", body);
}

export function buildSigningConfirmationEmail(params: {
  signatarioNome: string;
  termoNome: string;
  clinicName?: string;
  signedAt: string;
  verificationCode: string;
}): string {
  const clinicLine = params.clinicName ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.clinicName}</p>
      </td></tr>` : "";

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Documento assinado com sucesso</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.signatarioNome}</strong>. Sua assinatura eletrônica foi registrada e
      uma cópia em PDF do documento assinado está anexa a este e-mail.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Documento assinado</p>
          <p style="margin:0;color:#e2e8f0;font-weight:600;font-size:16px;">${params.termoNome}</p>
        </td>
      </tr>
      ${clinicLine}
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Data e hora</p>
        <p style="margin:0;color:#e2e8f0;">${params.signedAt}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Código de verificação</p>
        <p style="margin:0;"><code style="background:#1e2333;color:#fbbf24;font-size:13px;font-weight:600;padding:4px 10px;border-radius:4px;letter-spacing:1px;">${params.verificationCode}</code></p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0;"><span style="background:#14532d;color:#4ade80;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">✓ Assinado</span></p>
      </td></tr>
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Esta assinatura tem validade jurídica como assinatura eletrônica simples,
      conforme a <strong style="color:#e2e8f0;">Lei nº 14.063/2020</strong>.
      Guarde o PDF anexo como comprovante.
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não realizou esta assinatura, entre em contato imediatamente com a administração da plataforma.
    </p>
  `;
  return baseTemplate(`Documento assinado — ${params.termoNome}`, body);
}

export function buildSigningRequestEmail(params: {
  signatarioNome: string;
  termoNome: string;
  signatureLink: string;
  clinicName?: string;
  expiresAt?: string;
}): string {
  const clinicLine = params.clinicName ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.clinicName}</p>
      </td></tr>` : "";
  const expiryLine = params.expiresAt ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Válido até</p>
        <p style="margin:0;color:#f59e0b;font-weight:600;">${params.expiresAt}</p>
      </td></tr>` : "";

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Assinatura eletrônica solicitada</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.signatarioNome}</strong>. Você foi solicitado(a) a assinar o seguinte documento.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Documento</p>
          <p style="margin:0;color:#e2e8f0;font-weight:600;font-size:16px;">${params.termoNome}</p>
        </td>
      </tr>
      ${clinicLine}
      ${expiryLine}
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Clique no botão abaixo para revisar o documento e registrar sua assinatura eletrônica.
      Sua assinatura terá validade jurídica como assinatura eletrônica simples
      (<strong style="color:#e2e8f0;">Lei nº 14.063/2020</strong>) e será registrada com data, hora e endereço IP.
    </p>

    ${primaryButton(params.signatureLink, "Revisar e assinar →")}

    <p style="color:#475569;font-size:12px;margin-top:8px;">
      Ou copie e cole este link no navegador:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${params.signatureLink}</span>
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não esperava esta solicitação, entre em contato com a administração da plataforma.
    </p>
  `;
  return baseTemplate(`Assine: ${params.termoNome}`, body);
}

export function buildOperatorSignatureNotificationEmail(params: {
  termoNome: string;
  clinicName: string;
  signatarioNome: string;
  signatarioEmail: string;
  signatarioCpf: string;
  signedAt: string;
  signerIp: string;
  verificationCode: string;
  documentLink: string;
}): string {
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Termo assinado por cliente</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Um documento LGPD foi assinado eletronicamente por um signatário da clínica
      <strong style="color:#e2e8f0;">${params.clinicName}</strong>. Detalhes abaixo.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Documento</p>
          <p style="margin:0;color:#3b82f6;font-weight:600;font-size:16px;">${params.termoNome}</p>
        </td>
      </tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Signatário</p>
        <p style="margin:0;color:#e2e8f0;">${params.signatarioNome} — CPF ${params.signatarioCpf}</p>
        <p style="margin:0;color:#94a3b8;font-size:13px;">${params.signatarioEmail}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Data e hora</p>
        <p style="margin:0;color:#e2e8f0;">${params.signedAt}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Endereço IP</p>
        <p style="margin:0;color:#94a3b8;font-family:monospace;">${params.signerIp || "—"}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Código de verificação</p>
        <p style="margin:0;"><code style="background:#1e2333;color:#fbbf24;font-size:13px;font-weight:600;padding:4px 10px;border-radius:4px;letter-spacing:1px;">${params.verificationCode}</code></p>
      </td></tr>
    </table>

    ${primaryButton(params.documentLink, "Abrir painel da clínica →")}

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      O PDF assinado está disponível para download na aba <strong style="color:#94a3b8;">LGPD &amp; Autorizações</strong>
      do kickoff da clínica.
    </p>
  `;
  return baseTemplate(`[IONEX360] Termo assinado — ${params.clinicName}`, body);
}

export function buildAcessoCriadoEmail(params: {
  nome: string;
  email: string;
  senhaProvisoria: string;
  loginLink: string;
  clinicName?: string;
}): string {
  const clinicLine = params.clinicName
    ? `<tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Clínica</p>
        <p style="margin:0;color:#3b82f6;font-weight:600;">${params.clinicName}</p>
      </td></tr>`
    : "";

  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Seu acesso à plataforma IONEX360</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.nome}</strong>. Seu acesso à plataforma foi habilitado.
      Use as credenciais abaixo para entrar e, no primeiro login, será solicitado que você crie uma senha definitiva.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      ${clinicLine}
      <tr><td style="${params.clinicName ? "padding-top:16px;" : ""}">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">E-mail</p>
        <p style="margin:0;color:#e2e8f0;font-weight:600;">${params.email}</p>
      </td></tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Senha provisória</p>
        <p style="margin:0;"><code style="background:#1e2333;color:#fbbf24;font-size:16px;font-weight:700;padding:8px 14px;border-radius:6px;letter-spacing:2px;">${params.senhaProvisoria}</code></p>
      </td></tr>
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Acesse a plataforma e troque sua senha:
    </p>

    ${primaryButton(params.loginLink, "Acessar a plataforma →")}

    <p style="color:#475569;font-size:12px;margin-top:8px;">
      Ou copie e cole este link no navegador:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${params.loginLink}</span>
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Por segurança, esta senha é provisória e deve ser alterada no primeiro acesso.
      Nunca compartilhe sua senha com terceiros.
    </p>
  `;
  return baseTemplate("Seu acesso — IONEX360", body);
}

/**
 * Task #216 — quando um e-mail já tem credencial e ganha acesso a uma nova
 * clínica, NÃO rotacionamos a senha. Avisamos que a clínica está disponível
 * no seletor com a senha que já existe.
 */
export function buildAcessoHabilitadoEmail(params: {
  nome: string;
  email: string;
  loginLink: string;
  clinicName?: string;
}): string {
  const clinicLine = params.clinicName
    ? `<p style="margin:0 0 16px 0;color:#94a3b8;font-size:14px;">Nova clínica disponível: <strong style="color:#3b82f6;">${params.clinicName}</strong></p>`
    : "";
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Acesso habilitado</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 16px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.nome}</strong>. Seu acesso à plataforma IONEX360 foi habilitado para uma nova clínica.
    </p>
    ${clinicLine}
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Use seu e-mail (<strong style="color:#e2e8f0;">${params.email}</strong>) e a <strong style="color:#e2e8f0;">senha que você já usa</strong>
      na plataforma. A nova clínica aparecerá no seletor após o login.
    </p>
    ${primaryButton(params.loginLink, "Acessar a plataforma →")}
    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Esqueceu a senha? Use a opção "Esqueci minha senha" na tela de login.
    </p>
  `;
  return baseTemplate("Acesso habilitado — IONEX360", body);
}

export function buildResetSenhaEmail(params: {
  nome: string;
  resetLink: string;
}): string {
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Redefinir sua senha</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá${params.nome ? `, <strong style="color:#e2e8f0;">${params.nome}</strong>` : ""}.
      Recebemos um pedido para redefinir sua senha de acesso à plataforma IONEX360.
    </p>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Clique no botão abaixo para escolher uma nova senha. Este link é válido por
      <strong style="color:#e2e8f0;">1 hora</strong> e pode ser usado apenas uma vez.
    </p>

    ${primaryButton(params.resetLink, "Criar nova senha →")}

    <p style="color:#475569;font-size:12px;margin-top:8px;">
      Ou copie e cole este link no navegador:<br/>
      <span style="color:#3b82f6;word-break:break-all;">${params.resetLink}</span>
    </p>

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não solicitou esta redefinição, pode ignorar este e-mail com segurança —
      sua senha atual continuará valendo.
    </p>
  `;
  return baseTemplate("Redefinir senha — IONEX360", body);
}

export function buildPushSetupEmail(params: { nome: string; activationLink: string }): string {
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Ative suas notificações push</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.nome}</strong>. Você pode receber alertas em tempo real sobre delegações e atualizações da plataforma.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Benefício</p>
          <p style="margin:0;color:#e2e8f0;">Receba alertas mesmo com o navegador fechado, sem precisar entrar na plataforma.</p>
        </td>
      </tr>
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Clique no botão abaixo para ativar as notificações no seu dispositivo.
    </p>

    ${primaryButton(params.activationLink, "Ativar notificações →")}

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não esperava este e-mail, pode ignorá-lo com segurança.
    </p>
  `;
  return baseTemplate("Ativar notificações push — IONEX360", body);
}

export interface SendEmailResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64-encoded
  contentType?: string;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const result = await sendEmailDetailed(params);
  return result.ok;
}

export async function sendEmailDetailed(params: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const apiKey = await getConfig("resend_api_key");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY não configurado" };
  }

  const fromAddress = (await getConfig("resend_from_address")) ?? DEFAULT_FROM;
  const replyTo = params.replyTo ?? (await getConfig("reply_to_address"));

  try {
    const body: Record<string, unknown> = {
      from: fromAddress,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
    };
    if (replyTo) {
      body.reply_to = replyTo;
    }
    if (params.attachments && params.attachments.length > 0) {
      body.attachments = params.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { content_type: a.contentType } : {}),
      }));
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errBody = await res.json() as { message?: string; error?: string; name?: string };
        errMsg = errBody.message ?? errBody.error ?? errBody.name ?? errMsg;
      } catch {
        // ignore parse error
      }
      return { ok: false, status: res.status, error: errMsg };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de conexão com Resend" };
  }
}
