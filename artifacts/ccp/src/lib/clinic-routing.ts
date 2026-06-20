/**
 * Pure routing helpers for the global clinic switcher (Task #293 T4).
 *
 * `rerouteForClinic` maps the CURRENT location to the equivalent destination
 * for a DIFFERENT clinic, so switching clinics keeps the user in the same
 * module ("per-module bounce"). It returns `null` when the current route is
 * not clinic-scoped — the caller then falls back to a role-appropriate home
 * (`/admin/clinicas/:id` for super_admin, `/portal/clinica/:id` for a gestor).
 *
 * Kept free of React so it can be unit-tested in isolation.
 */

/** Super-admin modules whose URL carries the clinic id directly. */
export const CLINIC_ID_MODULES = [
  "delegacao",
  "riscos",
  "acao",
  "processos",
  "evidencias",
  "documentos",
  "relatorios",
  "kickoff",
] as const;

function splitLocation(location: string): { path: string; suffix: string } {
  const idx = location.search(/[?#]/);
  if (idx === -1) return { path: location, suffix: "" };
  return { path: location.slice(0, idx), suffix: location.slice(idx) };
}

export function rerouteForClinic(
  location: string,
  newClinicId: string,
): string | null {
  const { path, suffix } = splitLocation(location);
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // ---- Portal (gestor) namespace -----------------------------------------
  if (segments[0] === "portal") {
    // Diagnóstico is diagnostic-id scoped; clinic choice happens in-page.
    if (segments[1] === "diagnostico") {
      return "/portal/diagnostico/select";
    }
    // Canonical panel: /portal/clinica/:id[/secao...]
    if (segments[1] === "clinica" && segments[2]) {
      const rest = segments.slice(3);
      const tail = rest.length ? `/${rest.join("/")}` : "";
      return `/portal/clinica/${newClinicId}${tail}${suffix}`;
    }
    // Legacy portal aliases: /portal/<secao>/:id → canonical panel section.
    if (segments[1] && segments[2]) {
      return `/portal/clinica/${newClinicId}/${segments[1]}${suffix}`;
    }
    return null;
  }

  // ---- Super-admin clinic detail: /admin/clinicas/:id[/...] ---------------
  if (segments[0] === "admin" && segments[1] === "clinicas" && segments[2]) {
    if (segments[2] === "new") return null;
    const rest = segments.slice(3);
    const tail = rest.length ? `/${rest.join("/")}` : "";
    return `/admin/clinicas/${newClinicId}${tail}${suffix}`;
  }

  // ---- Diagnóstico (super_admin): always to the in-page selector ----------
  if (segments[0] === "diagnostico") {
    return "/diagnostico/select";
  }

  // ---- Super-admin clinic-id modules: /<module>/:id | /<module>/select ----
  if ((CLINIC_ID_MODULES as readonly string[]).includes(segments[0])) {
    return `/${segments[0]}/${newClinicId}${segments[1] ? suffix : ""}`;
  }

  return null;
}
