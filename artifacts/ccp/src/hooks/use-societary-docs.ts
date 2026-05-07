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
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export interface ExtractedSocio {
  nome: string;
  cpf: string | null;
  percentual: number | null;
  valor_quotas: number | null;
  qualificacao: string | null;
}

export interface SocietaryExtractionData {
  tipo_detectado?: string;
  razao_social?: string | null;
  data_referencia?: string | null;
  resumo?: string;
  capital_social?: number | null;
  socios?: ExtractedSocio[];
}

export type AnalysisMode = "text" | "vision";

export interface SocietaryDoc {
  id: string;
  clinicId: string;
  documentId: string;
  tipo: string;
  status: "ready" | "error";
  errorMessage: string | null;
  extraction: SocietaryExtractionData | null;
  analysisMode: AnalysisMode | null;
  truncated: boolean;
  pagesAnalyzed: number | null;
  totalPages: number | null;
  appliedAt: string | null;
  createdAt: string;
  document: {
    id: string;
    title: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
    storagePath: string;
    createdAt: string;
  };
}

const TIPO_LABEL: Record<string, string> = {
  contrato_social: "Contrato Social",
  alteracao: "Alteração Contratual",
  acordo_socios: "Acordo de Sócios",
  outro: "Outro",
};

export function societaryTipoLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo;
}

export const SOCIETARY_TIPOS = [
  { value: "contrato_social", label: "Contrato Social" },
  { value: "alteracao", label: "Alteração Contratual" },
  { value: "acordo_socios", label: "Acordo de Sócios" },
  { value: "outro", label: "Outro" },
];

export function useSocietaryDocs(clinicId: string) {
  return useQuery<SocietaryDoc[]>({
    queryKey: ["societary-docs", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/societary-docs`),
    enabled: !!clinicId,
  });
}

export interface UploadSocietaryInput {
  tipo: string;
  title?: string;
  file: File;
}

export function useUploadSocietaryDoc(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, title, file }: UploadSocietaryInput) => {
      const fd = new FormData();
      fd.append("tipo", tipo);
      if (title) fd.append("title", title);
      fd.append("file", file, file.name);
      return apiUpload<SocietaryDoc>(
        `/api/clinics/${clinicId}/societary-docs`,
        fd,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["societary-docs", clinicId] });
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
      qc.invalidateQueries({ queryKey: ["document-categories", clinicId] });
    },
  });
}

export interface ApplySocietaryInput {
  id: string;
  applyCapitalSocial: boolean;
  socioIndices: number[];
  markOmittedAsExited?: boolean;
}

export interface ApplySocietaryResult {
  capitalUpdated: boolean;
  sociosCreated: number;
  sociosUpdated: number;
  sociosExited: number;
}

export function useApplySocietaryExtraction(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      applyCapitalSocial,
      socioIndices,
      markOmittedAsExited,
    }: ApplySocietaryInput) =>
      apiFetch<ApplySocietaryResult>(
        `/api/clinics/${clinicId}/societary-docs/${id}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            applyCapitalSocial,
            socioIndices,
            markOmittedAsExited: markOmittedAsExited === true,
          }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["societary-docs", clinicId] });
    },
  });
}

export function useReanalyzeSocietaryDoc(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<SocietaryDoc>(
        `/api/clinics/${clinicId}/societary-docs/${id}/reanalyze`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["societary-docs", clinicId] });
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
    },
  });
}

export function useRenameSocietaryDoc(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch<SocietaryDoc>(
        `/api/clinics/${clinicId}/societary-docs/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["societary-docs", clinicId] });
      qc.invalidateQueries({ queryKey: ["clinic-documents", clinicId] });
    },
  });
}

export function useDeleteSocietaryDoc(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(
        `/api/clinics/${clinicId}/societary-docs/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["societary-docs", clinicId] });
    },
  });
}

export async function getSocietarySignedUrl(
  clinicId: string,
  id: string,
): Promise<string> {
  const r = await apiFetch<{ url: string }>(
    `/api/clinics/${clinicId}/societary-docs/${id}/signed-url`,
  );
  return r.url;
}
