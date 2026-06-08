---
name: Delegation email routing (respondent vs gestor)
description: Which delegation email a recipient gets depends on platform access, not delegation nível.
---

# Delegation email routing

When a delegação is created/resent, the recipient gets ONE of two emails based on
whether `hasPlatformAccess(email)` is true — NOT based on the delegação nível:

- **No platform access (Respondente de Diagnóstico)** → scoped respondent invite only
  (`buildRespondentInviteEmail`, link `/responder?code=...`). The generic
  `buildDelegationEmail` (button "Acessar diagnóstico →" → `/delegacao/:clinicId`,
  a login-walled full-access portal) must be SUPPRESSED for these users.
- **Has platform access (gestor)** → keeps the generic portal delegation email.

**Why:** the portal link requires login + grants full clinic access, so sending it to
a respondent is both useless (they can't log in) and a privilege-exposure smell. The
respondent flow is the scoped token (`invite_code_hash` on the delegação row), which the
`/respondent/hub` surfaces regardless of nível.

**How to apply:** the scoped-invite mint block in the create flow has no nível guard —
it fires for any `enviarConvite && responsavelEmail && diagnosticoId`. Gate the generic
`buildDelegationEmail` send on `hasPlatformAccess`. `send-invite` mints/sends the scoped
respondent link and must accept nível 1, 2, and 3 (subdelegação = N2). The WhatsApp
template `delegacao_pilar` carries no portal link, so it's safe for either recipient.
