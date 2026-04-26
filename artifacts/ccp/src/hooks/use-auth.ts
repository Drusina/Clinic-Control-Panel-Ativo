import { useQuery, useQueryClient } from "@tanstack/react-query";

const AUTH_TOKEN_KEY = "ccp_admin_token";
const AUTH_QUERY_KEY = ["auth", "me"] as const;

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
}

async function fetchCurrentRole(): Promise<CurrentUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/auth/me", { headers });
  if (!res.ok) return { role: null, clinicId: null, nome: null, email: null, teamMemberId: null };
  return res.json() as Promise<CurrentUser>;
}

export function useCurrentRole() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentRole,
    retry: false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
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
    const previousToken = getStoredToken();
    await revokePushEndpoint(previousToken);
    storeToken(token);
    clearAllCaches(queryClient);
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    const previousToken = getStoredToken();
    await revokePushEndpoint(previousToken);
    clearToken();
    clearAllCaches(queryClient);
  };
}
