import { describe, it, expect } from "vitest";
import { rerouteForClinic } from "./clinic-routing";

const NEW = "clinic-new";

describe("rerouteForClinic", () => {
  it("replaces the clinic id in super-admin module routes", () => {
    expect(rerouteForClinic("/delegacao/clinic-1", NEW)).toBe(
      "/delegacao/clinic-new",
    );
    expect(rerouteForClinic("/riscos/clinic-1", NEW)).toBe("/riscos/clinic-new");
    expect(rerouteForClinic("/acao/clinic-1", NEW)).toBe("/acao/clinic-new");
    expect(rerouteForClinic("/processos/clinic-1", NEW)).toBe(
      "/processos/clinic-new",
    );
    expect(rerouteForClinic("/evidencias/clinic-1", NEW)).toBe(
      "/evidencias/clinic-new",
    );
    expect(rerouteForClinic("/documentos/clinic-1", NEW)).toBe(
      "/documentos/clinic-new",
    );
    expect(rerouteForClinic("/relatorios/clinic-1", NEW)).toBe(
      "/relatorios/clinic-new",
    );
    expect(rerouteForClinic("/kickoff/clinic-1", NEW)).toBe(
      "/kickoff/clinic-new",
    );
  });

  it("turns a module /select route into a scoped route for the new clinic", () => {
    expect(rerouteForClinic("/delegacao/select", NEW)).toBe(
      "/delegacao/clinic-new",
    );
    expect(rerouteForClinic("/documentos/select", NEW)).toBe(
      "/documentos/clinic-new",
    );
  });

  it("always routes diagnóstico (super-admin) to the in-page selector", () => {
    expect(rerouteForClinic("/diagnostico/select", NEW)).toBe(
      "/diagnostico/select",
    );
    expect(rerouteForClinic("/diagnostico/diag-1", NEW)).toBe(
      "/diagnostico/select",
    );
    expect(rerouteForClinic("/diagnostico/diag-1/resultado", NEW)).toBe(
      "/diagnostico/select",
    );
    expect(rerouteForClinic("/diagnostico/comparar?a=1&b=2", NEW)).toBe(
      "/diagnostico/select",
    );
  });

  it("replaces the clinic id in the admin clinic detail and keeps the tab suffix", () => {
    expect(rerouteForClinic("/admin/clinicas/clinic-1", NEW)).toBe(
      "/admin/clinicas/clinic-new",
    );
    expect(rerouteForClinic("/admin/clinicas/clinic-1/editar", NEW)).toBe(
      "/admin/clinicas/clinic-new/editar",
    );
    expect(
      rerouteForClinic("/admin/clinicas/clinic-1?aba=financeiro", NEW),
    ).toBe("/admin/clinicas/clinic-new?aba=financeiro");
  });

  it("does not map the admin clinic list or the new-clinic route", () => {
    expect(rerouteForClinic("/admin/clinicas", NEW)).toBeNull();
    expect(rerouteForClinic("/admin/clinicas/new", NEW)).toBeNull();
  });

  it("maps the canonical portal panel and keeps the section", () => {
    expect(rerouteForClinic("/portal/clinica/clinic-1", NEW)).toBe(
      "/portal/clinica/clinic-new",
    );
    expect(rerouteForClinic("/portal/clinica/clinic-1/agenda", NEW)).toBe(
      "/portal/clinica/clinic-new/agenda",
    );
    expect(
      rerouteForClinic("/portal/clinica/clinic-1/rede-externa", NEW),
    ).toBe("/portal/clinica/clinic-new/rede-externa");
  });

  it("maps legacy portal aliases to the canonical panel section", () => {
    expect(rerouteForClinic("/portal/delegacao/clinic-1", NEW)).toBe(
      "/portal/clinica/clinic-new/delegacao",
    );
  });

  it("routes portal diagnóstico to its in-page selector", () => {
    expect(rerouteForClinic("/portal/diagnostico/select", NEW)).toBe(
      "/portal/diagnostico/select",
    );
  });

  it("returns null for non-clinic-scoped routes", () => {
    expect(rerouteForClinic("/", NEW)).toBeNull();
    expect(rerouteForClinic("/notifications", NEW)).toBeNull();
    expect(rerouteForClinic("/me/clinicas", NEW)).toBeNull();
    expect(rerouteForClinic("/admin/configuracoes", NEW)).toBeNull();
    expect(rerouteForClinic("/portal", NEW)).toBeNull();
  });
});
