# Backend authorization audit — Task #194

**Scope of this document.** Task #194's primary deliverable was a
frontend fix (clinic-selector screens were calling the super-admin
`/api/clinics` endpoint from team_member sessions). Steps 3 and 4 of
the task also asked for a written audit confirming the backend is not
vulnerable to the same class of bug. This file is that audit.

**No backend code was changed by Task #194.** Auth middlewares
(`requireSuperAdmin`, `requireClinicAccess`, `assertClinicAccess`,
`listAccessibleClinicIds`) were explicitly listed as out-of-scope.
The audit below confirms that every clinic-bearing handler currently
in production already enforces clinic ownership.

## Mount layers — `artifacts/api-server/src/routes/index.ts`

The router is structured in three explicit groups (in mount order):

### Group 1 — `requireClinicAccess` (auto-protected by URL)

The middleware extracts the `:clinicId` (or `:id` on `clinicsRouter`)
from the URL and refuses the request unless the session is
super_admin OR the team_member's email is in `equipe_interna` for
that clinic with `tem_acesso_plataforma = true`. Routers mounted
here:

```
documentCategoriesRouter, clinicDocumentsRouter, societaryDocsRouter,
clinicsRouter, statusHistoryRouter, sociosRouter, activityRouter,
kickoffsRouter, actionsRouter, risksRouter, faturasRouter,
perfilOperacionalRouter, parceirosExternosRouter, sistemasUsoRouter,
docsConstitutivoRouter, lgpdTermosRouter, lgpdSigningProtectedRouter,
delegacoesRouter, processosRouter, evidenciasRouter, documentosRouter
```

**Coverage: enforced by middleware. No per-handler check needed for
URL-scoped paths.** `clinicsRouter` itself only exposes
`/clinics/:id` (lines 195, 207) and the legacy
`/clinics/:id/documents` (318, 396) — all URL-scoped, all covered.

### Group 2 — `requireAuth` mixed (must call `assertClinicAccess` inline)

Routers in this group share two kinds of paths:
- URL-scoped (`/clinics/:clinicId/...`) where we still call
  `assertClinicAccess` defensively (middleware doesn't auto-check
  here because the mount is `requireAuth`, not `requireClinicAccess`).
- ID-scoped (`/team/:id`, `/diagnostics/:id`,
  `/diagnostics/:diagnosticoId/...`) where the handler must first
  load the record, derive the clinic id, then call
  `assertClinicAccess`.

**`routes/team.ts`** — every `clinicId`-bearing handler audited:

| Handler | Line | Guard |
| --- | --- | --- |
| `GET    /clinics/:clinicId/team`              | 144 | `assertClinicAccess(clinicId)` |
| `POST   /clinics/:clinicId/team`              | 151 | `assertClinicAccess(clinicId)` |
| `PATCH  /team/:id`                            | 201 | `assertClinicAccess(existing.clinicId)` (217) |
| `DELETE /team/:id`                            | 276 | `assertClinicAccess(existing.clinicId)` (284) |
| `POST   /clinics/:clinicId/team/bulk-invite`  | 297 | `assertClinicAccess(clinicId)` |
| `POST   /clinics/:clinicId/team/import`       | 545 | `assertClinicAccess(clinicId)` (line 540) |
| `GET    /clinics/:clinicId/team/export`       | 765 | `assertClinicAccess(clinicId)` |
| `GET    /clinics/:clinicId/team/template`     | 859 | `assertClinicAccess(clinicId)` |
| `GET    /team/all`                            | 126 | super-admin only (explicit role check) |

**`routes/diagnostics.ts`**:

| Handler | Line | Guard |
| --- | --- | --- |
| `GET  /diagnostics/latest-active`             | 29  | explicit `user.role !== "super_admin"` 403 |
| `GET  /clinics/:clinicId/diagnostics`         | 53  | `assertClinicAccess(clinicId)` |
| `POST /clinics/:clinicId/diagnostics`         | 66  | `assertClinicAccess(clinicId)` |
| `GET  /diagnostics/:id`                       | 85  | `assertClinicAccess(diagnostic.clinicId)` |
| `POST /diagnostics/:id/calculate-scores`      | 102 | `assertClinicAccess(existing.clinicId)` |
| `POST /diagnostics/:id/complete`              | 118 | `assertClinicAccess(existing.clinicId)` |

**`routes/perguntas.ts`**:

| Handler | Line | Guard |
| --- | --- | --- |
| `GET  /diagnostic/pillars`                    | 91  | n/a — global pillar catalog (no clinic data) |
| `GET  /diagnostic/pillars/:pillarSlug/questions` | 118 | n/a — global question catalog |
| `GET  /perguntas`                             | 132 | n/a — global question bank |
| `POST /perguntas`                             | 143 | `ensureSuperAdmin` |
| `PATCH /perguntas/:id`                        | 173 | `ensureSuperAdmin` |
| `DELETE /perguntas/:id`                       | 216 | `ensureSuperAdmin` |
| `POST /perguntas/import`                      | 240 | `ensureSuperAdmin` |
| `POST /perguntas/reset-to-seed`               | 299 | `ensureSuperAdmin` |
| `GET  /diagnostics/:diagnosticoId/respostas`  | 340 | `assertAccessByDiagnostic` (loads diag → clinic) |
| `PUT  /diagnostics/:diagnosticoId/respostas/:perguntaId` | 362 | `assertAccessByDiagnostic` |
| `POST /diagnostics/:diagnosticoId/respostas/batch` | 398 | `assertAccessByDiagnostic` |
| `GET  /clinics/:clinicId/diagnostics/:diagnosticoId/hydrated` | 439 | `assertClinicAccess(clinicId)` |

**`routes/ai.ts`**:

| Handler | Line | Guard |
| --- | --- | --- |
| `POST /ai/analyze-diagnostico`                | 21  | `assertClinicAccess(diagnostic.clinicId)` (50) |
| `POST /diagnostics/:id/calculate-scores`      | 200 | `assertClinicAccess(diagnostic.clinicId)` (212) |

### Group 3 — `requireSuperAdmin` (super-admin–only globals)

These routers are mounted under `requireSuperAdmin`, which 403s any
`team_member` token outright:

| Router | Routes | Notes |
| --- | --- | --- |
| `dashboardRouter`           | `/dashboard/{summary,pipeline,recent-activity,diagnostics}` | global KPIs |
| `clinicsAdminRouter`        | `POST /clinics`, `DELETE /clinics/:id`, `PATCH /clinics/:id/status`, `POST /clinics/:id/invite-user`, `GET /clinics` | CRUD on the clinics table |
| `lgpdTemplatesAdminRouter`  | `/admin/lgpd-templates*` | template editor |
| `notificationsRouter`       | `GET /notifications`, `POST /notifications/:id/read` | super-admin notifications inbox |
| `jobsRouter`                | `POST /jobs/expiry-check` | cron-style trigger |
| `icsTemplatesRouter`        | `/admin/ics-templates*` | calendar templates |
| `serverConfigRouter`        | `/admin/config/integrations*`, `/admin/test-email`, `/admin/token-signing-secret/*`, `/admin/rotate-token-signing-secret` | server config + rotations |
| `documentAccessLogRouter`   | `GET /admin/document-access-log` | audit log read |
| `cnpjRouter`                | `GET /cnpj/:cnpj` | BrasilAPI proxy |

**Coverage: enforced by middleware mount. No per-handler check
needed.**

### User-scoped routers (no clinic in URL, mounted as plain auth)

| Router | Per-route guard |
| --- | --- |
| `notification-preferences` | `requireSuperAdmin` on every route |
| `push`                     | `requireAuth + requireActiveTeamMember` on every route; subscriber identity derived from JWT `sub` |

## Conclusion

No missing `assertClinicAccess` was found in handlers reachable by a
`team_member` token. All clinic-scoped surfaces are protected either
by the `requireClinicAccess` middleware mount (Group 1) or by an
explicit inline `assertClinicAccess` call (Group 2 audit table
above). Global-only surfaces are covered by `requireSuperAdmin`
(Group 3).

The remaining surface area for the original bug ("gestor enxerga 5
clínicas") was therefore confirmed to be entirely on the **frontend**
data-source layer — fixed by Task #194's switch from `useListClinics`
to `useClinicsForCurrentUser` across the affected portal screens
(see `artifacts/ccp/src/hooks/use-clinics-for-current-user.ts` and
the 9 migrated `pages/*/index.tsx` and `pages/*/select.tsx` files).

## Manual verification checklist

The following matrix should be re-run by anyone reviewing this PR
against a deployed environment:

1. Generate a fresh test invite for the team_member user via
   `node artifacts/api-server/src/scripts/create-test-invite.mjs`
   (creates / refreshes `claudio_milenio@hotmail.com` in
   `equipe_interna` for clinic `f86fed98-a0a5-4200-941f-4971b0fdbe3a`
   — INSTITUTO DE CARDIOLOGIA DE SORRISO).
2. Open the invite link in a private window, redeem, then visit each
   portal selector and confirm only **INSTITUTO DE CARDIOLOGIA DE
   SORRISO** is listed:
   - `/portal/diagnostico/select`
   - `/portal/delegacao`
   - `/portal/riscos`
   - `/portal/acao`
   - `/portal/processos`
   - `/portal/evidencias`
   - `/portal/documentos`
   - `/portal/kickoff`
   - `/portal/relatorios`
3. Try a deep-link to a clinic outside the user's scope (e.g.
   `/portal/riscos/<other-clinic-uuid>`) and confirm
   `ClinicAccessGuard` redirects to `/me/clinicas`.
4. Log out, log back in as super_admin, and confirm every selector
   above still lists the full clinic catalog (regression).

The pattern used by `useClinicsForCurrentUser` is identical to the
one already shipped in production for `/portal/diagnostico/select`
(Task #136), where the same role-switch guarantee has been validated
end-to-end.
