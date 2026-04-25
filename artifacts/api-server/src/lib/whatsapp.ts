const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const BASE_URL = "https://graph.facebook.com/v18.0";

export function isWhatsAppConfigured(): boolean {
  return Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID);
}

export async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: "delegacao_pilar" | "aprovacao_termo";
  components?: Array<{
    type: "body";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
}): Promise<boolean> {
  if (!isWhatsAppConfigured()) {
    return false;
  }

  const phoneId = WHATSAPP_PHONE_ID!;
  const cleanPhone = params.to.replace(/\D/g, "");

  try {
    const res = await fetch(`${BASE_URL}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: "pt_BR" },
          components: params.components ?? [],
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendDelegationWhatsApp(params: {
  phone: string;
  responsavelNome: string;
  pilarNome: string;
  prazo?: string;
}): Promise<boolean> {
  return sendWhatsAppTemplate({
    to: params.phone,
    templateName: "delegacao_pilar",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.responsavelNome },
          { type: "text", text: params.pilarNome },
          { type: "text", text: params.prazo ?? "sem prazo definido" },
        ],
      },
    ],
  });
}

export async function sendApprovalWhatsApp(params: {
  phone: string;
  responsavelNome: string;
  termoNome: string;
}): Promise<boolean> {
  return sendWhatsAppTemplate({
    to: params.phone,
    templateName: "aprovacao_termo",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.responsavelNome },
          { type: "text", text: params.termoNome },
        ],
      },
    ],
  });
}
