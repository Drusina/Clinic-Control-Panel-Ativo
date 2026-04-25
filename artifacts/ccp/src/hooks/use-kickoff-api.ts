import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> ?? {}),
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

// ─── Kickoff ───────────────────────────────────────────────────────────────

export interface KickoffProximoPasso { acao: string; responsavel: string; prazo: string }
export interface KickoffData {
  id: string; clinicId: string; dataRealizacao?: string | null;
  modalidade?: string | null; duracaoMinutos?: number | null;
  facilitador?: string | null; participantes: string[]; pauta: string[];
  proximosPassos: KickoffProximoPasso[]; status: string;
  createdAt: string; updatedAt: string;
}

export function useKickoff(clinicId: string) {
  return useQuery<KickoffData>({
    queryKey: ["kickoff", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/kickoff`),
    enabled: !!clinicId,
    retry: 1,
  });
}

export function useUpsertKickoffFull(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<KickoffData>) =>
      apiFetch<KickoffData>(`/api/clinics/${clinicId}/kickoff`, {
        method: "PUT", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kickoff", clinicId] }),
  });
}

// ─── Perfil Operacional ────────────────────────────────────────────────────

export interface PerfilOperacionalData {
  clinicId: string; faturamentoMensal?: number | null; ticketMedio?: number | null;
  pacientesAtivos?: number | null; atendimentosMes?: number | null;
  especialidades: string[]; horarioFuncionamento?: string | null;
  modeloParticular: number; modeloConvenio: number; modeloSus: number;
  updatedAt: string;
}

export function usePerfilOperacional(clinicId: string) {
  return useQuery<PerfilOperacionalData>({
    queryKey: ["perfil-operacional", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/perfil-operacional`),
    enabled: !!clinicId,
    retry: 1,
  });
}

export function useUpsertPerfilOperacional(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PerfilOperacionalData>) =>
      apiFetch<PerfilOperacionalData>(`/api/clinics/${clinicId}/perfil-operacional`, {
        method: "PUT", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perfil-operacional", clinicId] }),
  });
}

// ─── Sócios ────────────────────────────────────────────────────────────────

export interface SocioData {
  id: string; clinicId: string; nome: string; cpf?: string | null;
  percentual?: number | null; cargo?: string | null; decisor: boolean;
  email?: string | null; whatsapp?: string | null; origem: string;
  qualificacao?: string | null; qualId?: string | null; dataEntrada?: string | null;
  createdAt: string; updatedAt: string;
}

export function useSocios(clinicId: string) {
  return useQuery<SocioData[]>({
    queryKey: ["socios", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/socios`),
    enabled: !!clinicId,
  });
}

export function useCreateSocio(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SocioData, "id" | "clinicId" | "createdAt" | "updatedAt">) =>
      apiFetch<SocioData>(`/api/clinics/${clinicId}/socios`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["socios", clinicId] }),
  });
}

export function useUpdateSocio(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<SocioData> & { id: string }) =>
      apiFetch<SocioData>(`/api/clinics/${clinicId}/socios/${id}`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["socios", clinicId] }),
  });
}

export function useDeleteSocio(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/clinics/${clinicId}/socios/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["socios", clinicId] }),
  });
}

// ─── Equipe Interna ────────────────────────────────────────────────────────

export interface TeamMemberData {
  id: string; clinicId: string; nome: string; funcao?: string | null;
  area?: string | null; vinculo?: string | null; email?: string | null;
  whatsapp?: string | null; temAcessoPlataforma: boolean;
  inviteStatus?: string | null; lastAccessAt?: string | null; createdAt: string;
}

export function useTeamMembers(clinicId: string) {
  return useQuery<TeamMemberData[]>({
    queryKey: ["team", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/team`),
    enabled: !!clinicId,
  });
}

export function useCreateTeamMember(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TeamMemberData>) =>
      apiFetch<TeamMemberData>(`/api/clinics/${clinicId}/team`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", clinicId] }),
  });
}

export function useUpdateTeamMember(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TeamMemberData> & { id: string }) =>
      apiFetch<TeamMemberData>(`/api/team/${id}`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", clinicId] }),
  });
}

export function useDeleteTeamMember(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/team/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", clinicId] }),
  });
}

// ─── Parceiros Externos ────────────────────────────────────────────────────

export interface ParceirosExternoData {
  id: string; clinicId: string; tipo: string; nomeEmpresa?: string | null;
  responsavel?: string | null; registroProfissional?: string | null;
  telefone?: string | null; email?: string | null; observacoes?: string | null;
  createdAt: string;
}

export function useParceirosExternos(clinicId: string) {
  return useQuery<ParceirosExternoData[]>({
    queryKey: ["parceiros-externos", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/parceiros-externos`),
    enabled: !!clinicId,
  });
}

export function useCreateParceiroExterno(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ParceirosExternoData>) =>
      apiFetch<ParceirosExternoData>(`/api/clinics/${clinicId}/parceiros-externos`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parceiros-externos", clinicId] }),
  });
}

export function useUpdateParceiroExterno(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ParceirosExternoData> & { id: string }) =>
      apiFetch<ParceirosExternoData>(`/api/clinics/${clinicId}/parceiros-externos/${id}`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parceiros-externos", clinicId] }),
  });
}

// ─── Sistemas em Uso ───────────────────────────────────────────────────────

export interface SistemaUsoData {
  id: string; clinicId: string; nome: string; fornecedor?: string | null;
  tipo?: string | null; apiDisponivel?: string | null;
  responsavelInterno?: string | null; criticidade?: string | null;
  integrado: boolean; createdAt: string;
}

export function useSistemasUso(clinicId: string) {
  return useQuery<SistemaUsoData[]>({
    queryKey: ["sistemas-uso", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/sistemas-uso`),
    enabled: !!clinicId,
  });
}

export function useCreateSistemaUso(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SistemaUsoData>) =>
      apiFetch<SistemaUsoData>(`/api/clinics/${clinicId}/sistemas-uso`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sistemas-uso", clinicId] }),
  });
}

export function useUpdateSistemaUso(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<SistemaUsoData> & { id: string }) =>
      apiFetch<SistemaUsoData>(`/api/clinics/${clinicId}/sistemas-uso/${id}`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sistemas-uso", clinicId] }),
  });
}

export function useDeleteSistemaUso(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/clinics/${clinicId}/sistemas-uso/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sistemas-uso", clinicId] }),
  });
}

// ─── Documentos Constitutivos ──────────────────────────────────────────────

export interface DocConstitutivoData {
  id: string; clinicId: string; categoria: string; nome: string;
  obrigatorio: boolean; storagePath?: string | null; tamanho?: number | null;
  enviadoEm?: string | null; createdAt: string;
}

export function useDocsConstitutivos(clinicId: string) {
  return useQuery<DocConstitutivoData[]>({
    queryKey: ["docs-constitutivos", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/docs-constitutivos`),
    enabled: !!clinicId,
  });
}

export function useUploadDocConstitutivo(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, file }: { docId: string; file: File }) => {
      const fileBase64 = await fileToBase64(file);
      return apiFetch<DocConstitutivoData>(
        `/api/clinics/${clinicId}/docs-constitutivos/${docId}/upload`,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            fileBase64,
            mimeType: file.type || "application/pdf",
          }),
        }
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs-constitutivos", clinicId] }),
  });
}

export async function getSignedUrl(clinicId: string, docId: string): Promise<string> {
  const token = getStoredToken();
  const BASE2 = import.meta.env.BASE_URL.replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE2}/api/clinics/${clinicId}/docs-constitutivos/${docId}/signed-url`, { headers });
  const data = await res.json() as { url: string };
  return data.url;
}

// ─── LGPD Termos ───────────────────────────────────────────────────────────

export interface LgpdTermoData {
  id: string; clinicId: string; slug: string; nome: string;
  descricao?: string | null; status: string; metodo?: string | null;
  autentiqueDocId?: string | null; acaoUrl?: string | null;
  signatarioNome?: string | null;
  signatarioEmail?: string | null; assinadoEm?: string | null;
  storagePath?: string | null; enviadoEm?: string | null; createdAt: string;
}

export function useLgpdTermos(clinicId: string) {
  return useQuery<LgpdTermoData[]>({
    queryKey: ["lgpd-termos", clinicId],
    queryFn: () => apiFetch(`/api/clinics/${clinicId}/lgpd-termos`),
    refetchInterval: 30_000,
    enabled: !!clinicId,
  });
}

export function useCreateLgpdTermo(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { nome: string; descricao?: string }) =>
      apiFetch<LgpdTermoData>(`/api/clinics/${clinicId}/lgpd-termos`, {
        method: "POST", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lgpd-termos", clinicId] }),
  });
}

export function useUpdateLgpdTermo(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<LgpdTermoData> & { id: string }) =>
      apiFetch<LgpdTermoData>(`/api/clinics/${clinicId}/lgpd-termos/${id}`, {
        method: "PATCH", body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lgpd-termos", clinicId] }),
  });
}

export function useCreateAutentiqueDocument(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { termSlug: string; signerEmail: string; signerName: string }) =>
      apiFetch(`/api/autentique/create-document`, {
        method: "POST",
        body: JSON.stringify({ ...data, clinicId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lgpd-termos", clinicId] }),
  });
}

export function useUploadLgpdPdf(clinicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ termoId, file }: { termoId: string; file: File }) => {
      const fileBase64 = await fileToBase64(file);
      return apiFetch(`/api/clinics/${clinicId}/lgpd-termos/${termoId}/upload-pdf`, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          fileBase64,
          mimeType: file.type || "application/pdf",
        }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lgpd-termos", clinicId] }),
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });
}
