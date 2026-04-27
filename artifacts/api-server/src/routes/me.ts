import { Router, type IRouter } from "express";
import { inArray } from "drizzle-orm";
import { db, clinicsTable } from "@workspace/db";
import { listAccessibleClinicIds, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

/**
 * Lightweight clinic card used by `/me/clinicas` (frontend) so the user
 * can choose which clinic to enter when they have multi-clinic access.
 */
function mapClinicCard(c: typeof clinicsTable.$inferSelect) {
  return {
    id: c.id,
    nome: c.nome,
    fantasia: c.fantasia,
    status: c.status,
    plano: c.plano,
    etapa: c.etapa,
    progresso: c.progresso ?? 0,
    cidade: c.cidade,
    uf: c.uf,
  };
}

/**
 * GET /api/me/clinics
 * Returns the clinics the authenticated session can access.
 *  - super_admin → ALL clinics
 *  - team_member → clinics whose `equipe_interna` row matches the JWT email
 *    and has `tem_acesso_plataforma = true`.
 *
 * The shape is intentionally narrow (id, name, status, etapa, progresso)
 * so the cards page renders quickly even for super admins with many
 * clinics. Detail pages should still go through `/api/clinics/:id`.
 */
router.get("/me/clinics", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const access = await listAccessibleClinicIds(req);

  if (access.isSuperAdmin) {
    const all = await db
      .select()
      .from(clinicsTable)
      .orderBy(clinicsTable.nome);
    res.json({ role: "super_admin", clinics: all.map(mapClinicCard) });
    return;
  }

  const ids = access.clinicIds ?? [];
  if (ids.length === 0) {
    res.json({ role: "team_member", clinics: [] });
    return;
  }
  const rows = await db
    .select()
    .from(clinicsTable)
    .where(inArray(clinicsTable.id, ids))
    .orderBy(clinicsTable.nome);
  res.json({ role: "team_member", clinics: rows.map(mapClinicCard) });
});

export default router;
