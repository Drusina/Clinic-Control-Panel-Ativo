import { useQuery, useQueryClient } from "@tanstack/react-query";

const AUTH_TOKEN_KEY = "ccp_admin_token";
const AUTH_QUERY_KEY = ["auth", "me"] as const;
const MY_CLINICS_QUERY_KEY = ["me", "clinics"] as const;
const ACTIVE_CLINIC_KEY = "ccp_active_clinic_id";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export interface CurrentUser {
  role: string | null;
  clinicId: string | null;
  nome: string | null;
  email: string | null;
  teamMemberId: string | null;
  /** Token version. v=1 (legacy) tokens carry clinicId/teamMemberId; v=2 are email-only. */
  v?: number;
}

async function fetchCurrentRole(): Promise<CurrentUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/auth/me`, { headers });
  if (!res.ok) return { role: null, clinicId: null, nome: null, email: null, teamMemberId: null };
  return res.json() as Promise<CurrentUser>;
}

export function useCurrentRole() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentRole,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Compact clinic card returned by `GET /api/me/clinics`. Used by the
 * `/me/clinicas` chooser, the clinic switcher in the header, and the
 * `ClinicAccessGuard` to verify whether a `:clinicId` URL param is
 * accessible to the current session.
 */
export interface MyClinicCard {
  id: string;
  nome: string;
  fantasia: string | null;
  status: string | null;
  plano: string | null;
  etapa: string | null;
  progresso: number;
  cidade: string | null;
  uf: string | null;
}

export interface MyClinicsResponse {
  role: "super_admin" | "team_member";
  clinics: MyClinicCard[];
}

async function fetchMyClinics(): Promise<MyClinicsResponse | null> {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/api/me/clinics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<MyClinicsResponse>;
}

/**
 * Lists every clinic the current session can reach. Returns `null` when the
 * user is not authenticated. For super admins this is the full clinics
 * table (mapped to a narrow card shape); for team members it is the subset
 * resolved from `equipe_interna` by email.
 */
export function useMyClinics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: MY_CLINICS_QUERY_KEY,
    queryFn: fetchMyClinics,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

/** Persisted "currently selected clinic" used by the header switcher. */
export function getActiveClinicId(): string | null {
  return localStorage.getItem(ACTIVE_CLINIC_KEY);
}

export function setActiveClinicId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_CLINIC_KEY, id);
  else localStorage.removeItem(ACTIVE_CLINIC_KEY);
}

function clearAllCaches(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.clear();
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
  }
}

async function revokePushEndpoint(token: string | null): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
  }
}

export function useSwitchSession() {
  const queryClient = useQueryClient();
  return async (token: string) => {
    // Token / cache must be swapped BEFORE any await so that any caller that
    // does not (or cannot) await this function still sees a consistent
    // session on the very next render. Push cleanup is best-effort and runs
    // afterwards with the previous token.
    const previousToken = getStoredToken();
    storeToken(token);
    setActiveClinicId(null);
    clearAllCaches(queryClient);
    await revokePushEndpoint(previousToken);
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    const previousToken = getStoredToken();
    await revokePushEndpoint(previousToken);
    clearToken();
    setActiveClinicId(null);
    clearAllCaches(queryClient);
  };
}
