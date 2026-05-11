import { useQuery } from "@tanstack/react-query";
import { getStoredToken, useCurrentRole, type MyClinicsResponse } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Narrow clinic shape consumed by every "selecionar clínica" screen in the
 * portal. Keeping it small lets us merge data from the super_admin endpoint
 * (`GET /api/clinics`) with the team_member endpoint (`GET /api/me/clinics`)
 * without leaking either contract.
 */
export interface ClinicForSelector {
  id: string;
  nome: string;
  fantasia?: string | null;
  cidade?: string | null;
  uf?: string | null;
  status?: string | null;
}

export interface UseClinicsForCurrentUserOptions {
  /**
   * Optional clinic status filter (e.g. "kickoff" for the Kick-off picker).
   * For super admins this is forwarded to `/api/clinics?status=…`; for
   * team_members we apply it client-side over `/api/me/clinics`.
   */
  status?: string;
  /** Hard cap on rows pulled from the super_admin list. Defaults to 200. */
  pageSize?: number;
}

interface AdminClinicsResponse {
  data: ClinicForSelector[];
}

async function fetchAdminClinics(
  pageSize: number,
  status?: string,
): Promise<AdminClinicsResponse> {
  const token = getStoredToken();
  const params = new URLSearchParams();
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/clinics?${params.toString()}`, { headers });
  if (!res.ok) throw new Error(`Failed to load clinics: ${res.status}`);
  return res.json();
}

/**
 * Resolves the list of clinics the current session is allowed to see in any
 * "selecionar clínica" picker (Delegação, Riscos, Plano de Ação, Processos,
 * Evidências, Documentos, Kickoff, Relatórios, Diagnóstico).
 *
 * - super_admin → full clinics list via `GET /api/clinics`
 * - team_member → only the clinics resolved from `equipe_interna` via
 *   `GET /api/me/clinics`
 *
 * The two endpoints are mutually exclusive at the auth layer (the
 * super-admin endpoint 403s for team_members), so we use `useCurrentRole()`
 * to pick exactly one and never call the other.
 *
 * Use this hook instead of the generated `useListClinics` whenever the
 * screen is reachable by team_member sessions.
 */
export function useClinicsForCurrentUser(
  opts: UseClinicsForCurrentUserOptions = {},
): { clinics: ClinicForSelector[]; isLoading: boolean } {
  const pageSize = opts.pageSize ?? 200;
  const status = opts.status;

  const { data: user, isLoading: roleLoading } = useCurrentRole();
  const isSuperAdmin = user?.role === "super_admin";
  const isTeamMember = user?.role === "team_member";

  // Each branch uses its own enabled query so super_admin sessions never
  // hit `/api/me/clinics` and team_member sessions never hit `/api/clinics`
  // (which would 403 anyway). Avoids a wasted request per render in both
  // directions.
  const adminQuery = useQuery({
    queryKey: ["clinics-for-current-user", "super_admin", pageSize, status ?? null],
    queryFn: () => fetchAdminClinics(pageSize, status),
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

  const teamQuery = useQuery({
    queryKey: ["clinics-for-current-user", "team_member"],
    queryFn: fetchMyClinicsForHook,
    enabled: isTeamMember,
    staleTime: 30_000,
  });

  if (roleLoading) {
    return { clinics: [], isLoading: true };
  }

  if (isSuperAdmin) {
    return {
      clinics: adminQuery.data?.data ?? [],
      isLoading: adminQuery.isLoading,
    };
  }

  if (isTeamMember) {
    const all = teamQuery.data?.clinics ?? [];
    const filtered = status ? all.filter((c) => c.status === status) : all;
    return {
      clinics: filtered.map((c) => ({
        id: c.id,
        nome: c.nome,
        fantasia: c.fantasia,
        cidade: c.cidade,
        uf: c.uf,
        status: c.status,
      })),
      isLoading: teamQuery.isLoading,
    };
  }

  return { clinics: [], isLoading: false };
}

async function fetchMyClinicsForHook(): Promise<MyClinicsResponse | null> {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/api/me/clinics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<MyClinicsResponse>;
}
