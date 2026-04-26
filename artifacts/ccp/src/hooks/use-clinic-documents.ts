import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ClinicDocumentCategory {
  id: string;
  clinicId: string;
  name: string;
  ordem: number;
  createdAt: string;
  documentCount: number;
}

export interface ClinicDocument {
  id: string;
  clinicId: string;
  categoryId: string;
  sequenceNumber: number;
  title: string;
  fileName: string;
  storagePath: string;
  fileSize: number | null;
  fileType: string | null;
  uploadedBy: string | null;
  summary: string | null;
  summarizedAt: string | null;
  createdAt: string;
}

// ─── Categories ────────────────────────────────────────────────────────────

export function useClinicDocumentCategories(clinicId: string) {
  return useQuery<ClinicDocumentCategory[]>({
    queryKey: ["document-categories", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/document-categories`),
    enabled: !!clinicId,
  });
}

export function useCreateDocumentCategory(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<ClinicDocumentCategory>(`/api/clinics/${clinicId}/document-categories`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] }),
  });
}

export function useRenameDocumentCategory(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiFetch<ClinicDocumentCategory>(
        `/api/clinics/${clinicId}/document-categories/${id}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] }),
  });
}

export function useDeleteDocumentCategory(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(
        `/api/clinics/${clinicId}/document-categories/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] }),
  });
}

// ─── Documents ─────────────────────────────────────────────────────────────

export function useClinicDocuments(clinicId: string) {
  return useQuery<ClinicDocument[]>({
    queryKey: ["clinic-documents", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/documents`),
    enabled: !!clinicId,
  });
}

export interface UploadDocumentInput {
  categoryId: string;
  title?: string;
  file: File;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

export function useUploadClinicDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, title, file }: UploadDocumentInput) => {
      const fileBase64 = await fileToBase64(file);
      return apiFetch<ClinicDocument>(`/api/clinics/${clinicId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          categoryId,
          title: title ?? file.name,
          fileName: file.name,
          fileBase64,
          mimeType: file.type || "application/octet-stream",
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] });
    },
  });
}

export function useDeleteClinicDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/clinics/${clinicId}/documents/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] });
    },
  });
}

export async function getClinicDocumentSignedUrl(
  clinicId: string,
  id: string,
): Promise<string> {
  const r = await apiFetch<{ url: string }>(
    `/api/clinics/${clinicId}/documents/${id}/signed-url`,
  );
  return r.url;
}

export async function fixClinicDocumentEncoding(clinicId: string): Promise<number> {
  const r = await apiFetch<{ fixed: number }>(
    `/api/clinics/${clinicId}/documents/fix-encoding`,
    { method: "POST" },
  );
  return r.fixed;
}
