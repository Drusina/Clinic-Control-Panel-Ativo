const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "IONEX360 <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL ?? "https://ionex360.com.br";

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
                    Por favor, não responda a este email.<br/>
                    <a href="${APP_URL}" style="color:#3b82f6;text-decoration:none;">ionex360.com.br</a>
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

export function buildDelegationEmail(params: {
  responsavelNome: string;
  responsavelEmail: string;
  pilarNome: string;
  pilarSlug: string;
  clinicName?: string;
  prazo?: string;
  observacoes?: string;
}): string {
  const link = `${APP_URL}/diagnostico/select?pilar=${encodeURIComponent(params.pilarSlug)}`;
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

export function buildExpiryDigestEmail(params: {
  clinicName: string;
  adminEmail: string;
  documents: Array<{ nome: string; categoria: string; validade: string; diasRestantes: number }>;
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

  const docsLink = `${APP_URL}/documentos`;

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
  docsLink: string;
}): string {
  const body = `
    <h1 style="color:#f8fafc;font-size:26px;font-weight:700;margin:0 0 8px 0;">Documento assinado com sucesso</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px 0;">
      Olá, <strong style="color:#e2e8f0;">${params.signatarioNome}</strong>. Confirmamos o recebimento da sua assinatura eletrônica.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border:1px solid #1e2333;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Documento assinado</p>
          <p style="margin:0;color:#e2e8f0;font-weight:600;font-size:16px;">${params.termoNome}</p>
        </td>
      </tr>
      <tr><td style="padding-top:16px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Status</p>
        <p style="margin:0;"><span style="background:#14532d;color:#4ade80;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">✓ Assinado</span></p>
      </td></tr>
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Sua assinatura foi registrada com segurança via Autentique. O documento pode ser acessado na plataforma IONEX360.
    </p>

    ${primaryButton(params.docsLink, "Ver documentos →")}
  `;
  return baseTemplate(`Documento assinado — ${params.termoNome}`, body);
}

export function buildSigningRequestEmail(params: {
  signatarioNome: string;
  termoNome: string;
  signatureLink: string;
}): string {
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
    </table>

    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">
      Clique no botão abaixo para revisar e assinar o documento eletronicamente via Autentique. O link é seguro e único para você.
    </p>

    ${primaryButton(params.signatureLink, "Revisar e assinar →")}

    <p style="color:#475569;font-size:12px;margin-top:16px;">
      Se você não esperava esta solicitação, entre em contato com a administração da plataforma.
    </p>
  `;
  return baseTemplate(`Assine: ${params.termoNome}`, body);
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: Array.isArray(params.to) ? params.to : [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
