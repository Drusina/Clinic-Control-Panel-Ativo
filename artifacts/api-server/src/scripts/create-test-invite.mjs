import pg from "pg";
import { randomBytes, createHash } from "node:crypto";

const CLINIC_ID = "f86fed98-a0a5-4200-941f-4971b0fdbe3a";
const EMAIL = "claudio_milenio@hotmail.com";
const NOME = "drusina";
const FUNCAO = "Gestor";

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cfg = await client.query(
  "SELECT key, value FROM server_config WHERE key IN ('app_url','resend_api_key','resend_from_address','reply_to_address')"
);
const config = Object.fromEntries(cfg.rows.map((r) => [r.key, r.value]));
const appUrl =
  config.app_url ||
  process.env.APP_URL ||
  `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0] || "app.clinionex.com.br"}`;
const resendKey = config.resend_api_key || process.env.RESEND_API_KEY;
const fromAddress =
  config.resend_from_address ||
  process.env.RESEND_FROM_ADDRESS ||
  "IONEX360 <onboarding@resend.dev>";
const replyTo = config.reply_to_address || process.env.REPLY_TO_ADDRESS || null;

const code = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(code).digest("hex");
const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

const existing = await client.query(
  "SELECT id FROM equipe_interna WHERE clinic_id=$1 AND lower(email)=lower($2) LIMIT 1",
  [CLINIC_ID, EMAIL]
);

let memberId;
if (existing.rows.length) {
  memberId = existing.rows[0].id;
  await client.query(
    `UPDATE equipe_interna SET nome=$1, funcao=$2, tem_acesso_plataforma=true,
       invite_code_hash=$3, invite_code_expires_at=$4, invite_status='pending',
       invite_redeemed_at=NULL
     WHERE id=$5`,
    [NOME, FUNCAO, hash, expiresAt, memberId]
  );
  console.log("Updated existing team member:", memberId);
} else {
  const ins = await client.query(
    `INSERT INTO equipe_interna
       (clinic_id, nome, email, funcao, tem_acesso_plataforma,
        invite_code_hash, invite_code_expires_at, invite_status)
     VALUES ($1,$2,lower($3),$4,true,$5,$6,'pending')
     RETURNING id`,
    [CLINIC_ID, NOME, EMAIL, FUNCAO, hash, expiresAt]
  );
  memberId = ins.rows[0].id;
  console.log("Created team member:", memberId);
}

const inviteLink = `${appUrl}/convite?code=${encodeURIComponent(code)}`;
console.log("Invite link:", inviteLink);
console.log("Expires:", expiresAt.toISOString());

if (!resendKey) {
  console.log("\n[WARN] No RESEND key — email not sent. Use the link above.");
  await client.end();
  process.exit(0);
}

const html = `<div style="font-family:system-ui;background:#0a0a0a;color:#fafafa;padding:32px">
  <h1 style="color:#fff">Bem-vindo(a) à plataforma IONEX360</h1>
  <p>Olá ${NOME},</p>
  <p>Você foi convidado(a) como <b>${FUNCAO}</b> da clínica <b>INSTITUTO DE CARDIOLOGIA DE SORRISO</b>.</p>
  <p><a href="${inviteLink}" style="display:inline-block;background:#22c55e;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Aceitar convite</a></p>
  <p style="color:#888;font-size:13px">Ou copie o link: ${inviteLink}</p>
  <p style="color:#888;font-size:12px">Este link expira em 72h.</p>
</div>`;

const payload = {
  from: fromAddress,
  to: [EMAIL],
  subject: "Você foi convidado para a plataforma IONEX360",
  html,
};
if (replyTo) payload.reply_to = replyTo;

const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${resendKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
const body = await r.text();
console.log("Resend status:", r.status, body);

await client.end();
