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

async function fetchCurrentRole(): Promise<{ role: string | null }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/auth/me", { headers });
  if (!res.ok) return { role: null };
  return res.json() as Promise<{ role: string | null }>;
}

export function useCurrentRole() {
  return useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: fetchCurrentRole,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return () => {
    clearToken();
    queryClient.setQueryData(AUTH_QUERY_KEY, { role: null });
    queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  };
}
