import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Preserves the HTTP status and parsed response body so callers (e.g. the
// upload modal) can react to specific cases like a 409 duplicate conflict.
export class ApiError<TBody = unknown> extends Error {
  status: number;
  body: TBody;
  constructor(message: string, status: number, body: TBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body?.error ?? res.statusText, res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    body: formData,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body?.error ?? res.statusText, res.status, body);
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

export type SummaryAnalysisMode = "text" | "vision";

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
  contentHash: string | null;
  uploadedBy: string | null;
  summary: string | null;
  summarizedAt: string | null;
  summaryAnalysisMode: SummaryAnalysisMode | null;
  summaryPagesAnalyzed: number | null;
  summaryTotalPages: number | null;
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
  /** When true, bypasses server-side duplicate (content-hash) detection. */
  allowDuplicate?: boolean;
}

/** Shape of the 409 body returned when an identical document already exists. */
export interface DuplicateConflictBody {
  error: string;
  duplicateOf: {
    id: string;
    title: string;
    sequenceNumber: number;
    createdAt: string;
  };
}

export function useUploadClinicDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      title,
      file,
      allowDuplicate,
    }: UploadDocumentInput) => {
      const fd = new FormData();
      fd.append("categoryId", categoryId);
      if (title) fd.append("title", title);
      if (allowDuplicate) fd.append("allowDuplicate", "true");
      fd.append("file", file, file.name);
      return apiUpload<ClinicDocument>(
        `/api/clinics/${clinicId}/documents`,
        fd,
      );
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

export interface SummarizeResponse {
  summary: string;
  summarizedAt: string;
}

export function useSummarizeClinicDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SummarizeResponse>(
        `/api/clinics/${clinicId}/documents/${id}/summarize`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
    },
  });
}

export interface SuggestTitleResponse {
  title: string;
  source: "ai" | "filename";
  document: ClinicDocument;
}

export function useSuggestClinicDocumentTitle(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SuggestTitleResponse>(
        `/api/clinics/${clinicId}/documents/${id}/suggest-title`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
    },
  });
}

export function useRenameClinicDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<ClinicDocument>(`/api/clinics/${clinicId}/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
    },
  });
}

export function isSummarizableMime(mime: string | null): boolean {
  if (!mime) return false;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

export async function fixClinicDocumentEncoding(clinicId: string): Promise<number> {
  const r = await apiFetch<{ fixed: number }>(
    `/api/clinics/${clinicId}/documents/fix-encoding`,
    { method: "POST" },
  );
  return r.fixed;
}
