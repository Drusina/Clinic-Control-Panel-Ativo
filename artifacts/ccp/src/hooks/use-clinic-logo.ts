import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getGetClinicQueryKey } from "@workspace/api-client-react";
import { getStoredToken, MY_CLINICS_QUERY_KEY } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function uploadLogo(clinicId: string, file: File): Promise<{ logoUrl: string | null }> {
  const token = getStoredToken();
  const fd = new FormData();
  fd.append("file", file, file.name);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/logo`, {
    method: "POST",
    body: fd,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

async function deleteLogo(clinicId: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/logo`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
}

export function useUploadClinicLogo(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadLogo(clinicId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetClinicQueryKey(clinicId) });
      qc.invalidateQueries({ queryKey: MY_CLINICS_QUERY_KEY });
    },
  });
}

export function useDeleteClinicLogo(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => deleteLogo(clinicId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: getGetClinicQueryKey(clinicId) });
      qc.invalidateQueries({ queryKey: MY_CLINICS_QUERY_KEY });
    },
  });
}
