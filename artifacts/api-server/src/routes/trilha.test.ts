import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { randomUUID } from "crypto";

// Fixed signing secret so we mint real session tokens through the production
// signing/verifying code path instead of bypassing auth.
const TEST_SIGNING_SECRET = "trilha-test-signing-secret-0001";
vi.mock("../lib/token-secret.js", () => ({
  getTokenSigningSecret: () => TEST_SIGNING_SECRET,
}));

import {
  db,
  clinicsTable,
  trilhaEtapasTable,
  lgpdTermosTable,
  risksTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireClinicAccess } from "../middleware/auth";
import trilhaRouter from "./trilha";
import { backfillTrilha } from "../lib/trilha";
import { TEMPLATE_SLUGS } from "../lib/lgpd-templates";

// Mirror the production mount: `router.use(requireClinicAccess, trilhaRouter)`.
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", requireClinicAccess, trilhaRouter);
  return app;
}

const app = buildApp();
const suffix = randomUUID().slice(0, 8);
const clinicIds: string[] = [];

let clinicId: string;
let backfillClinicId: string;
let lgpdClinicId: string;
let revertClinicId: string;
let overrideClinicId: string;

const SYSTEM_ACTOR = "Sistema (automático)";

function superAdminToken(): string {
  return signToken({ role: "super_admin", sub: "tester" });
}

async function makeClinic(label: string): Promise<string> {
  const [c] = await db
    .insert(clinicsTable)
    .values({
      nome: `Trilha ${label} ${suffix}`,
      cnpj: `trilha-${label}-${suffix}`,
    })
    .returning();
  clinicIds.push(c.id);
  return c.id;
}

function getTrilha(id: string) {
  return request(app)
    .get(`/api/clinics/${id}/trilha`)
    .set("Authorization", `Bearer ${superAdminToken()}`);
}

function findEtapa(etapas: { key: string }[], key: string) {
  return etapas.find((e) => e.key === key) as
    | {
        key: string;
        status: string;
        confirmadoPor: string | null;
        dataConcluida: string | null;
        manual: boolean;
        sugestao: { pronto: boolean; motivo: string };
      }
    | undefined;
}

beforeAll(async () => {
  clinicId = await makeClinic("bare");
  backfillClinicId = await makeClinic("backfill");
  lgpdClinicId = await makeClinic("lgpd");
  revertClinicId = await makeClinic("revert");
  overrideClinicId = await makeClinic("override");
});

afterAll(async () => {
  for (const id of clinicIds) {
    await db
      .delete(trilhaEtapasTable)
      .where(eq(trilhaEtapasTable.clinicId, id));
    await db.delete(clinicsTable).where(eq(clinicsTable.id, id));
  }
});

describe("Trilha de Implementação — automatic completion", () => {
  it("GET auto-concludes data-detectable stages with no human click (pre_cadastro)", async () => {
    const res = await getTrilha(clinicId);
    expect(res.status).toBe(200);
    const { etapas, resumo } = res.body;

    expect(etapas).toHaveLength(15);

    // A bare clinic already satisfies `pre_cadastro` (always pronto), so the
    // system concludes it on read — no confirmation click required.
    const pre = findEtapa(etapas, "pre_cadastro")!;
    expect(pre.status).toBe("concluido");
    expect(pre.confirmadoPor).toBe(SYSTEM_ACTOR);
    expect(pre.dataConcluida).toBeTruthy();

    // Stages whose signal is not yet satisfied stay pendente.
    const proposta = findEtapa(etapas, "proposta")!;
    expect(proposta.status).toBe("pendente");

    // Manual marcos are never auto-derived.
    const avaliacao = findEtapa(etapas, "avaliacao")!;
    expect(avaliacao.manual).toBe(true);
    expect(avaliacao.status).toBe("pendente");

    // One resolved stage → etapa 2 (first unresolved), progresso round(1/15).
    expect(resumo).toMatchObject({ etapa: 2, progresso: 7, resolvidas: 1, total: 15 });
  });

  it("backfillTrilha auto-concludes detectable stages and recomputes clinics.etapa/progresso at boot", async () => {
    await backfillTrilha();

    const rows = await db
      .select()
      .from(trilhaEtapasTable)
      .where(eq(trilhaEtapasTable.clinicId, backfillClinicId));

    expect(rows).toHaveLength(15);
    const pre = rows.find((r) => r.etapaKey === "pre_cadastro")!;
    expect(pre.status).toBe("concluido");
    expect(pre.confirmadoPor).toBe(SYSTEM_ACTOR);

    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, backfillClinicId));
    expect(clinic.etapa).toBe(2);
    expect(clinic.progresso).toBe(7);
  });

  it("LGPD completes only when all 6 termos are formalized; shows 'X de 6' until then", async () => {
    // Three of six formalized → still pendente, with a "3 de 6" hint.
    await db.insert(lgpdTermosTable).values(
      TEMPLATE_SLUGS.slice(0, 3).map((slug, i) => ({
        clinicId: lgpdClinicId,
        slug,
        nome: `Termo ${slug}`,
        status: i === 0 ? "anexado" : "assinado",
      })),
    );

    let res = await getTrilha(lgpdClinicId);
    let lgpd = findEtapa(res.body.etapas, "lgpd")!;
    expect(lgpd.status).toBe("pendente");
    expect(lgpd.sugestao.pronto).toBe(false);
    expect(lgpd.sugestao.motivo).toContain("3 de 6");

    // A DUPLICATE formalized row for an already-counted slug must NOT inflate
    // the total — the gate counts distinct required slugs, not raw rows.
    await db.insert(lgpdTermosTable).values({
      clinicId: lgpdClinicId,
      slug: TEMPLATE_SLUGS[0],
      nome: `Termo ${TEMPLATE_SLUGS[0]} (duplicado)`,
      status: "assinado",
    });
    res = await getTrilha(lgpdClinicId);
    lgpd = findEtapa(res.body.etapas, "lgpd")!;
    expect(lgpd.status).toBe("pendente");
    expect(lgpd.sugestao.motivo).toContain("3 de 6");

    // Formalize the remaining three → 6/6 → auto-concluded.
    await db.insert(lgpdTermosTable).values(
      TEMPLATE_SLUGS.slice(3).map((slug) => ({
        clinicId: lgpdClinicId,
        slug,
        nome: `Termo ${slug}`,
        status: "assinado",
      })),
    );

    res = await getTrilha(lgpdClinicId);
    lgpd = findEtapa(res.body.etapas, "lgpd")!;
    expect(lgpd.status).toBe("concluido");
    expect(lgpd.confirmadoPor).toBe(SYSTEM_ACTOR);
  });

  it("auto-concluded stage reverts to pendente when its signal disappears", async () => {
    const [risk] = await db
      .insert(risksTable)
      .values({
        clinicId: revertClinicId,
        nome: "Risco de teste",
        probabilidade: 3,
        impacto: 3,
        severidade: 9,
      })
      .returning();

    let res = await getTrilha(revertClinicId);
    let mapa = findEtapa(res.body.etapas, "mapa_riscos")!;
    expect(mapa.status).toBe("concluido");
    expect(mapa.confirmadoPor).toBe(SYSTEM_ACTOR);

    // Remove the only risk → the signal lapses → the stage reopens.
    await db.delete(risksTable).where(eq(risksTable.id, risk.id));

    res = await getTrilha(revertClinicId);
    mapa = findEtapa(res.body.etapas, "mapa_riscos")!;
    expect(mapa.status).toBe("pendente");
    expect(mapa.confirmadoPor).toBeNull();
    expect(mapa.dataConcluida).toBeNull();
  });

  it("human override (não se aplica) is preserved even when the signal says pronto", async () => {
    // pre_cadastro is always pronto, but a human override must win.
    await getTrilha(overrideClinicId); // materialize + auto-conclude pre_cadastro
    const patch = await request(app)
      .patch(`/api/clinics/${overrideClinicId}/trilha/pre_cadastro`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aplicavel" });
    expect(patch.status).toBe(200);

    const res = await getTrilha(overrideClinicId);
    const pre = findEtapa(res.body.etapas, "pre_cadastro")!;
    expect(pre.status).toBe("nao_aplicavel");
    expect(pre.sugestao.pronto).toBe(true);
  });

  it("manual marcos still require an explicit PATCH and record the human actor", async () => {
    const patch = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/avaliacao`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "concluido" });
    expect(patch.status).toBe(200);

    const res = await getTrilha(clinicId);
    const avaliacao = findEtapa(res.body.etapas, "avaliacao")!;
    expect(avaliacao.status).toBe("concluido");
    expect(avaliacao.confirmadoPor).toBe("Super Admin");
    expect(avaliacao.confirmadoPor).not.toBe(SYSTEM_ACTOR);
  });

  it("rejects a manual conclude/em_andamento PATCH on an automatic stage, but allows overrides and metadata edits", async () => {
    // A non-manual stage cannot be hand-set to concluido...
    const concluir = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/contrato`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "concluido" });
    expect(concluir.status).toBe(400);

    // ...nor to em_andamento.
    const andamento = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/contrato`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "em_andamento" });
    expect(andamento.status).toBe(400);

    // Metadata-only edits are still allowed.
    const meta = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/contrato`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ observacao: "nota interna" });
    expect(meta.status).toBe(200);

    // Human overrides are still allowed and must win over the auto signal.
    const override = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/contrato`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "nao_aplicavel" });
    expect(override.status).toBe(200);
    const after = findEtapa((await getTrilha(clinicId)).body.etapas, "contrato")!;
    expect(after.status).toBe("nao_aplicavel");
  });

  it("rejects an unknown etapaKey with 400", async () => {
    const res = await request(app)
      .patch(`/api/clinics/${clinicId}/trilha/bogus`)
      .set("Authorization", `Bearer ${superAdminToken()}`)
      .send({ status: "concluido" });
    expect(res.status).toBe(400);
  });
});
