---
name: Portal section deep-links
description: How portal modules are reached by URL and what path notification/push/email deep-links must use.
---

Portal modules (delegação, riscos, plano de ação, agenda, etc.) are NOT standalone routes in `App.tsx`. They render as a "section" inside `painel-clinica.tsx` via `renderSection`, reached at `/portal/clinica/:clinicId/:secao` (e.g. `/portal/clinica/<id>/agenda`). Portal-dashboard hub cards and `/portal/<modulo>` shortcut routes redirect into that clinic-scoped URL.

**Rule:** any server-side deep link (in-app notification `acaoUrl`, web push `url`, email CTA href) for a portal module must use the clinic-scoped path `/portal/clinica/<clinicId>/<secao>`. A bare `/<secao>` (e.g. `/agenda`) hits NotFound — there is no such route.

**Why:** Agenda reminder deep links initially pointed at `/agenda`, which does not exist; review flagged it as broken navigation.

**Slug must match `renderSection`'s switch exactly.** `renderSection` (in `painel-clinica.tsx`) `default:` returns `null`, so a wrong/unknown `<secao>` renders a SILENTLY BLANK section (no error, no NotFound). The action-plan section slug is **`acao`** — NOT `plano-de-acao` (which was a long-standing wrong slug in action notifications/email and rendered blank). Tarefa assign + deadline notifications and `notifyResponsavelOfActionUpdate` all use `/portal/clinica/<id>/acao`. Before adding a new deep link, confirm the slug is a real `case` in `renderSection`.

**How to apply:** web push uses root-relative paths — the service worker (`sw.ts`) `notificationclick` prefixes them with the SW registration scope, so pass `/portal/clinica/<id>/<secao>` (no origin, no BASE). The email CTA needs the absolute origin, so build it as `resolveAppUrl() + /portal/clinica/<id>/<secao>`.
