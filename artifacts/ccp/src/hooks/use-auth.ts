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
  /** true quando o team_member ainda está com senha provisória (precisa trocar antes de usar o app). */
  senhaProvisoria?: boolean | null;
}

async function fetchCurrentRole(): Promise<CurrentUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/auth/me`, { headers });
  if (!res.ok) return { role: null, clinicId: null, nome: null, email: null, teamMemberId: null, senhaProvisoria: null };
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

/**
 * Session-scoped "currently selected clinic".
 *
 * Stored in sessionStorage (NOT localStorage) on purpose: the active clinic
 * must be chosen explicitly each new browser session. A manager with 2+
 * clinics who reopens the app in a new session is sent back to the chooser
 * instead of silently reopening the last clinic — that stale default could
 * surface the wrong clinic during a client-facing session. The value still
 * survives reloads and in-session navigation, and single-clinic managers
 * keep auto-resolving to their only clinic in every resolver, so they never
 * see the chooser. Login/logout clear it via setActiveClinicId(null).
 */
export function getActiveClinicId(): string | null {
  return sessionStorage.getItem(ACTIVE_CLINIC_KEY);
}

export function setActiveClinicId(id: string | null): void {
  if (id) sessionStorage.setItem(ACTIVE_CLINIC_KEY, id);
  else sessionStorage.removeItem(ACTIVE_CLINIC_KEY);
  // Defensive cleanup: older builds persisted this in localStorage, which
  // auto-unlocked modules across sessions. Drop any lingering value so it can
  // never be read by a stale code path.
  localStorage.removeItem(ACTIVE_CLINIC_KEY);
}

function clearAllCaches(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.clear();
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_API_CACHE" });
  }
}

async function revokePushEndpoint(token: string | null): Promise<void> {
  // Nothing to revoke when there is no previous session — fast path for fresh
  // sessions (e.g. a user landing on /convite in a brand-new tab).
  if (!token) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  // Bound the entire cleanup to 1.5s so a misbehaving service worker / push
  // manager can never block the auth flow that awaits us.
  const TIMEOUT_MS = 1500;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS));

  const work = (async () => {
    try {
      // `getRegistration()` resolves to `undefined` immediately when there is
      // no SW registered for this scope. `ready` would hang forever in that
      // case, blocking every caller that awaits switchSession().
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers["Authorization"] = `Bearer ${token}`;
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    } catch {
      // best-effort cleanup
    }
  })();

  await Promise.race([work, timeout]);
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
