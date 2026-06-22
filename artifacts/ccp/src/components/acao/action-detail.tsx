import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetActionDetail,
  getGetActionDetailQueryKey,
  getListActionsQueryKey,
  useUpdateAction,
  useLinkActionEvidencia,
  useUnlinkActionEvidencia,
  useAddActionNota,
  useDeleteActionNota,
  useListTeam,
  getListTeamQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Activity,
  Loader2,
  Send,
  Trash2,
  X,
  Paperclip,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";
import TarefaList, { type TeamOption } from "./tarefa-list";
import { formatScore } from "./origem-diagnostico-badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES: Record<string, string> = {
  estrategia: "Estratégia e Governança",
  financeiro: "Financeiro e Fluxo de Caixa",
  contabil: "Contabilidade e Fiscal",
  marketing: "Vendas, Marketing e Captação",
  operacoes: "Processos Operacionais",
  pessoas: "Gestão de Pessoas e Cultura",
  tecnologia: "Tecnologia e Sistemas",
  compliance: "Compliance e Regulamentação",
};

type ClinicEvidencia = {
  id: string;
  nome: string;
  pilarSlug: string | null;
  tipo: string | null;
};

async function fetchClinicEvidencias(clinicId: string): Promise<ClinicEvidencia[]> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api/clinics/${clinicId}/evidencias`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch evidencias");
  return res.json();
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ActionDetail({
  actionId,
  clinicId,
  onEdit,
}: {
  actionId: string;
  clinicId: string;
  onEdit?: () => void;
}) {
  const queryClient = useQueryClient();
  const [novaNota, setNovaNota] = useState("");
  const [notificarResponsavel, setNotificarResponsavel] = useState(false);
  const [evidenciaToLink, setEvidenciaToLink] = useState("");

  const { data, isLoading } = useGetActionDetail(actionId, {
    query: { queryKey: getGetActionDetailQueryKey(actionId), enabled: !!actionId },
  });

  const { data: clinicEvidencias = [] } = useQuery({
    queryKey: ["clinic-evidencias", clinicId],
    queryFn: () => fetchClinicEvidencias(clinicId),
    enabled: !!clinicId,
  });

  const { data: teamRaw = [] } = useListTeam(clinicId, {
    query: { queryKey: getListTeamQueryKey(clinicId), enabled: !!clinicId },
  });

  const updateAction = useUpdateAction();
  const linkEvidencia = useLinkActionEvidencia();
  const unlinkEvidencia = useUnlinkActionEvidencia();
  const addNota = useAddActionNota();
  const deleteNota = useDeleteActionNota();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetActionDetailQueryKey(actionId) });
  };
  const invalidateAll = () => {
    invalidate();
    queryClient.invalidateQueries({ queryKey: getListActionsQueryKey(clinicId) });
  };

  const action = data?.action;
  const tarefas = data?.tarefas ?? [];
  const evidencias = data?.evidencias ?? [];
  const notas = data?.notas ?? [];
  const risco = data?.riscoVinculado;

  const teamMembers = useMemo<TeamOption[]>(
    () =>
      teamRaw
        .filter((m): m is typeof m & { email: string } => !!m.email)
        .map((m) => ({ nome: m.nome, email: m.email })),
    [teamRaw],
  );

  const linkedIds = useMemo(
    () => new Set(evidencias.map((e) => e.evidenciaId)),
    [evidencias],
  );
  const availableEvidencias = clinicEvidencias.filter((e) => !linkedIds.has(e.id));

  const patchDate = (field: "dataInicio" | "prazo", value: string) => {
    updateAction.mutate(
      { id: actionId, data: { [field]: value || null } },
      { onSuccess: invalidateAll },
    );
  };

  const handleLinkEvidencia = (evidenciaId: string) => {
    if (!evidenciaId) return;
    linkEvidencia.mutate(
      { id: actionId, data: { evidenciaId } },
      {
        onSuccess: () => {
          setEvidenciaToLink("");
          invalidate();
        },
      },
    );
  };

  const handleUnlink = (linkId: string) => {
    unlinkEvidencia.mutate({ id: actionId, linkId }, { onSuccess: invalidate });
  };

  const handleAddNota = () => {
    const texto = novaNota.trim();
    if (!texto) return;
    addNota.mutate(
      { id: actionId, data: { texto, notificar: notificarResponsavel } },
      {
        onSuccess: () => {
          setNovaNota("");
          invalidate();
        },
      },
    );
  };

  const handleDeleteNota = (notaId: string) => {
    deleteNota.mutate({ id: actionId, notaId }, { onSuccess: invalidate });
  };

  if (isLoading || !action) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const pilarNome = action.pilarSlug ? PILARES[action.pilarSlug] ?? action.pilarSlug : "—";

  return (
    <div className="space-y-4">
      {/* Detalhes card */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Detalhes</h3>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar Ação
            </Button>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Descrição</label>
          <p className="mt-1 text-sm whitespace-pre-wrap text-foreground/90">
            {action.descricao || "Sem descrição."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Responsável</label>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                {initials(action.responsavelNome)}
              </div>
              <span className="text-sm">{action.responsavelNome || "Não atribuído"}</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pilar</label>
            <p className="mt-1 text-sm py-1.5 px-2.5 rounded-md bg-muted/50">{pilarNome}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Data de Início</label>
            <Input
              type="date"
              className="mt-1"
              value={action.dataInicio ?? ""}
              onChange={(e) => patchDate("dataInicio", e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Prazo</label>
            <Input
              type="date"
              className="mt-1"
              value={action.prazo ?? ""}
              onChange={(e) => patchDate("prazo", e.target.value)}
            />
          </div>
        </div>

        {action.origemDiagnostico ? (
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Activity className="h-4 w-4 text-muted-foreground" /> Origem no diagnóstico
            </div>
            <p className="mt-1 text-sm">{action.origemDiagnostico.pilarNome}</p>
            <p className="text-xs text-muted-foreground">
              Score do pilar:{" "}
              <span
                className={
                  action.origemDiagnostico.abaixoDaMeta
                    ? "text-amber-600 font-medium"
                    : "text-foreground font-medium"
                }
              >
                {formatScore(action.origemDiagnostico.score)}/5
              </span>{" "}
              · meta {formatScore(action.origemDiagnostico.meta)}/5
              {action.origemDiagnostico.abaixoDaMeta ? " — abaixo da meta" : ""}
            </p>
          </div>
        ) : action.pilarSlug ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4" /> Origem no diagnóstico
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem diagnóstico concluído para exibir a pontuação deste pilar.
            </p>
          </div>
        ) : null}

        {risco && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-1.5 text-red-700 font-medium text-sm">
              <AlertTriangle className="h-4 w-4" /> Risco Vinculado
            </div>
            <p className="mt-1 text-sm text-red-700">{risco.nome}</p>
            <p className="text-xs text-red-600">
              Score: {risco.severidade} (P{risco.probabilidade} × I{risco.impacto})
            </p>
          </div>
        )}
      </div>

      {/* Tarefas card */}
      <TarefaList
        actionId={actionId}
        tarefas={tarefas}
        teamMembers={teamMembers}
        onChanged={invalidateAll}
      />

      {/* Evidências Vinculadas card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Evidências Vinculadas</h3>
        </div>
        {evidencias.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-1">
            Nenhuma evidência vinculada.
          </p>
        ) : (
          <div className="space-y-1.5">
            {evidencias.map((ev) => (
              <div
                key={ev.id}
                className="group flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm truncate">{ev.nome}</span>
                {ev.pilarSlug && (
                  <span className="text-[10px] text-muted-foreground">
                    {PILARES[ev.pilarSlug]?.split(" ")[0] ?? ev.pilarSlug}
                  </span>
                )}
                <button
                  onClick={() => handleUnlink(ev.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label="Desvincular evidência"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Select
          value={evidenciaToLink}
          onValueChange={(v) => handleLinkEvidencia(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Vincular evidência…" />
          </SelectTrigger>
          <SelectContent>
            {availableEvidencias.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                Nenhuma evidência disponível.
              </div>
            ) : (
              availableEvidencias.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.nome}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Notas do Coordenador card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Notas do Coordenador</h3>
        </div>
        {notas.length === 0 ? (
          <p className="text-sm text-center text-muted-foreground py-1">
            Nenhuma nota registrada.
          </p>
        ) : (
          <div className="space-y-2">
            {notas.map((nota) => (
              <div key={nota.id} className="group rounded-md bg-muted/40 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap flex-1">{nota.texto}</p>
                  <button
                    onClick={() => handleDeleteNota(nota.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity flex-shrink-0"
                    aria-label="Remover nota"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(nota.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {nota.autor ? ` · ${nota.autor}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Adicionar observação…"
              value={novaNota}
              onChange={(e) => setNovaNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddNota();
                }
              }}
            />
            <Button
              size="icon"
              onClick={handleAddNota}
              disabled={!novaNota.trim() || addNota.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={notificarResponsavel}
              onCheckedChange={(v) => setNotificarResponsavel(v === true)}
            />
            Notificar responsável{action.responsavelNome ? ` (${action.responsavelNome})` : ""} por e-mail e push
          </label>
        </div>
      </div>
    </div>
  );
}
