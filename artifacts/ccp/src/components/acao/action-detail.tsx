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
  useSetActionResponsaveis,
} from "@workspace/api-client-react";
import type { ActionResponsavel } from "@workspace/api-client-react";
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
  Workflow,
  UserPlus,
  ChevronDown,
} from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";
import TarefaList, { type TeamOption } from "./tarefa-list";
import { formatScore } from "./origem-diagnostico-badge";
import { CamadaBadge, CAMADA_CONFIG, SeverityBadge } from "./camada-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const setResponsaveis = useSetActionResponsaveis();

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

  // Equipe atribuível ao responsável: ativos (com acesso à plataforma) podem ser
  // selecionados; inativos aparecem desabilitados com convite à ativação.
  const assignableTeam = useMemo(
    () =>
      teamRaw
        .filter((m): m is typeof m & { email: string } => !!m.email)
        .map((m) => ({
          email: m.email,
          nome: m.nome,
          ativo: m.temAcessoPlataforma,
        })),
    [teamRaw],
  );

  const responsaveis = action?.responsaveis ?? [];
  const assignedEmails = useMemo(
    () => new Set(responsaveis.map((r) => r.email.toLowerCase())),
    [responsaveis],
  );

  const applyResponsaveis = (next: ActionResponsavel[]) => {
    setResponsaveis.mutate(
      { id: actionId, data: { responsaveis: next } },
      { onSuccess: invalidateAll },
    );
  };

  const addResponsavel = (email: string, nome: string | null) => {
    if (assignedEmails.has(email.toLowerCase())) return;
    applyResponsaveis([...responsaveis, { email, nome }]);
  };

  const removeResponsavel = (email: string) => {
    applyResponsaveis(
      responsaveis.filter((r) => r.email.toLowerCase() !== email.toLowerCase()),
    );
  };

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

        <div>
          <label className="text-xs font-medium text-muted-foreground">Responsáveis</label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {responsaveis.length === 0 && action.responsavelNome && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2 py-0.5 text-xs"
                data-testid="responsavel-legacy"
              >
                <span className="h-5 w-5 rounded-full bg-muted-foreground/20 flex items-center justify-center text-[9px] font-semibold text-muted-foreground">
                  {initials(action.responsavelNome)}
                </span>
                <span className="max-w-[140px] truncate">{action.responsavelNome}</span>
              </span>
            )}
            {responsaveis.length === 0 && !action.responsavelNome && (
              <span className="text-sm text-muted-foreground">Não atribuído</span>
            )}
            {responsaveis.map((r) => (
              <span
                key={r.email}
                className="group inline-flex items-center gap-1.5 rounded-full bg-primary/10 pl-1 pr-2 py-0.5 text-xs"
                data-testid={`responsavel-chip-${r.email}`}
              >
                <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-semibold text-primary">
                  {initials(r.nome ?? r.email)}
                </span>
                <span className="max-w-[140px] truncate">{r.nome ?? r.email}</span>
                <button
                  onClick={() => removeResponsavel(r.email)}
                  disabled={setResponsaveis.isPending}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${r.nome ?? r.email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={setResponsaveis.isPending}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Atribuir
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {assignableTeam.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Nenhum membro na equipe.
                  </div>
                )}
                {assignableTeam.map((m) => {
                  const atribuido = assignedEmails.has(m.email.toLowerCase());
                  return (
                    <DropdownMenuItem
                      key={m.email}
                      disabled={!m.ativo || atribuido}
                      onSelect={(e) => {
                        e.preventDefault();
                        if (m.ativo && !atribuido) addResponsavel(m.email, m.nome);
                      }}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary flex-shrink-0">
                          {initials(m.nome ?? m.email)}
                        </span>
                        <span className="truncate">{m.nome ?? m.email}</span>
                      </span>
                      {atribuido ? (
                        <span className="text-[10px] text-muted-foreground">atribuído</span>
                      ) : !m.ativo ? (
                        <span className="text-[10px] text-amber-600">convidar</span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {assignableTeam.some((m) => !m.ativo) && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Membros sem acesso à plataforma aparecem como “convidar” — ative o acesso na aba
              Usuários para poder atribuí-los.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Pilar</label>
          <p className="mt-1 text-sm py-1.5 px-2.5 rounded-md bg-muted/50">{pilarNome}</p>
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

        {(action.origemDiagnostico || action.pilarSlug || risco || action.camada) && (
          <div className="rounded-lg border bg-muted/30 p-3" data-testid="acao-cadeia">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Workflow className="h-4 w-4 text-muted-foreground" /> Por que esta ação existe
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Diagnóstico → Risco → Ação: a rastreabilidade que originou este card.
            </p>

            <div className="mt-3 space-y-0">
              {/* Etapa 1 — Diagnóstico */}
              <div className="relative pl-7 pb-3">
                <span className="absolute left-2 top-6 bottom-0 w-px bg-border" />
                <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                </span>
                <div className="text-xs font-medium">Diagnóstico</div>
                {action.origemDiagnostico ? (
                  <p className="text-xs text-muted-foreground">
                    {action.origemDiagnostico.pilarNome} — pontuação{" "}
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {pilarNome !== "—"
                      ? `Pilar ${pilarNome} — sem diagnóstico concluído para exibir a pontuação.`
                      : "Sem pilar de diagnóstico associado."}
                  </p>
                )}
              </div>

              {/* Etapa 2 — Risco */}
              <div className="relative pl-7 pb-3">
                <span className="absolute left-2 top-6 bottom-0 w-px bg-border" />
                <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-3 w-3 text-red-600" />
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">Risco identificado</span>
                  {risco && (
                    <SeverityBadge
                      severidade={risco.severidade}
                      probabilidade={risco.probabilidade}
                      impacto={risco.impacto}
                    />
                  )}
                </div>
                {risco ? (
                  <>
                    <p className="text-xs text-muted-foreground">{risco.nome}</p>
                    {risco.perguntasFonte && risco.perguntasFonte.length > 0 && (
                      <div className="mt-2 rounded-md border border-red-200/70 bg-red-50/60 p-2.5">
                        <div className="text-[11px] font-semibold text-red-800">
                          Respostas do diagnóstico que originaram este risco
                        </div>
                        <p className="mt-0.5 text-[11px] text-red-700/80">
                          Use-as para discutir com o gestor e a equipe antes de aprovar a ação.
                        </p>
                        <ul className="mt-2 space-y-2">
                          {risco.perguntasFonte.map((pf, idx) => (
                            <li key={idx} className="border-l-2 border-red-300 pl-3 py-0.5">
                              <div className="text-xs font-medium leading-snug text-foreground">
                                {pf.pergunta}
                              </div>
                              <div className="mt-0.5 text-xs">
                                <span className="font-semibold text-foreground/70">
                                  Resposta:{" "}
                                </span>
                                <span className="text-muted-foreground">{pf.resposta}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ação sem risco vinculado (criada manualmente ou diretamente do pilar).
                  </p>
                )}
              </div>

              {/* Etapa 3 — Ação (camada) */}
              <div className="relative pl-7">
                <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Workflow className="h-3 w-3 text-primary" />
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">Ação gerada</span>
                  <CamadaBadge camada={action.camada} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {action.camada && CAMADA_CONFIG[action.camada]
                    ? CAMADA_CONFIG[action.camada].descricao
                    : "Ação criada manualmente, sem camada de geração automática."}
                </p>
              </div>
            </div>
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
