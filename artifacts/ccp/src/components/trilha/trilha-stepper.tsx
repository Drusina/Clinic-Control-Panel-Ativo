import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  useGetTrilha,
  useUpdateTrilhaEtapa,
  getGetTrilhaQueryKey,
  getGetClinicQueryKey,
  type TrilhaEtapa,
  type TrilhaEtapaStatus,
  type TrilhaEtapaUpdate,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight,
  Ban,
  Check,
  CheckCircle2,
  CircleSlash,
  Loader2,
  MoreVertical,
  Pencil,
  PlayCircle,
  RotateCcw,
  Map as MapIcon,
} from "lucide-react";

export type TrilhaModuleTarget =
  | { kind: "link"; href: string; label: string }
  | { kind: "action"; onClick: () => void; label: string };

interface TrilhaStepperProps {
  clinicId: string;
  /**
   * Map a stage's `modulo` (or null for manual marcos) to a navigation target
   * for the current context. Return null to hide the "open module" affordance.
   */
  moduleNav: (modulo: string | null, etapa: TrilhaEtapa) => TrilhaModuleTarget | null;
  /** Extra query keys to invalidate after a successful mutation (e.g. portal myClinics). */
  invalidateKeys?: QueryKey[];
  className?: string;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_META: Record<
  TrilhaEtapaStatus,
  { label: string; badge: BadgeVariant; dot: string; ring: string }
> = {
  pendente: {
    label: "Pendente",
    badge: "outline",
    dot: "bg-muted-foreground/40",
    ring: "border-border bg-card text-muted-foreground",
  },
  em_andamento: {
    label: "Em andamento",
    badge: "secondary",
    dot: "bg-blue-500",
    ring: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  concluido: {
    label: "Concluída",
    badge: "default",
    dot: "bg-emerald-500",
    ring: "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  bloqueado: {
    label: "Bloqueada",
    badge: "destructive",
    dot: "bg-red-500",
    ring: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  nao_aplicavel: {
    label: "Não se aplica",
    badge: "outline",
    dot: "bg-muted-foreground/30",
    ring: "border-border bg-muted/40 text-muted-foreground",
  },
};

function isResolved(status: TrilhaEtapaStatus): boolean {
  return status === "concluido" || status === "nao_aplicavel";
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

interface EditState {
  etapa: TrilhaEtapa;
  responsavel: string;
  dataPrevista: string;
  observacao: string;
}

export function TrilhaStepper({
  clinicId,
  moduleNav,
  invalidateKeys,
  className,
}: TrilhaStepperProps) {
  const queryClient = useQueryClient();
  const { data: trilha, isLoading } = useGetTrilha(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetTrilhaQueryKey(clinicId) },
  });
  const update = useUpdateTrilhaEtapa();
  const [edit, setEdit] = useState<EditState | null>(null);

  const pendingKey = update.isPending ? update.variables?.etapaKey : undefined;

  function applyUpdate(
    etapaKey: string,
    data: TrilhaEtapaUpdate,
    onDone?: () => void,
  ) {
    update.mutate(
      { clinicId, etapaKey, data },
      {
        onSuccess: (fresh) => {
          queryClient.setQueryData(getGetTrilhaQueryKey(clinicId), fresh);
          queryClient.invalidateQueries({
            queryKey: getGetTrilhaQueryKey(clinicId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetClinicQueryKey(clinicId),
          });
          invalidateKeys?.forEach((key) =>
            queryClient.invalidateQueries({ queryKey: key }),
          );
          onDone?.();
        },
      },
    );
  }

  function setStatus(etapaKey: string, status: TrilhaEtapaStatus) {
    applyUpdate(etapaKey, { status });
  }

  function saveEdit() {
    if (!edit) return;
    applyUpdate(
      edit.etapa.key,
      {
        responsavel: edit.responsavel.trim() || null,
        dataPrevista: edit.dataPrevista || null,
        observacao: edit.observacao.trim() || null,
      },
      () => setEdit(null),
    );
  }

  return (
    <Card className={className} data-testid="trilha-stepper">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapIcon className="h-4 w-4 text-primary" />
            Trilha de Implementação
          </CardTitle>
          {trilha && (
            <span className="text-sm text-muted-foreground" data-testid="trilha-resumo">
              Etapa{" "}
              <span className="font-semibold text-foreground">
                {Math.min(trilha.resumo.etapa, trilha.resumo.total)}
              </span>{" "}
              de {trilha.resumo.total} ·{" "}
              <span className="font-semibold text-primary">
                {trilha.resumo.progresso}%
              </span>
            </span>
          )}
        </div>
        {trilha && (
          <Progress value={trilha.resumo.progresso} className="mt-2 h-2" />
        )}
      </CardHeader>
      <CardContent>
        {isLoading || !trilha ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <ol className="relative flex flex-col">
            {trilha.etapas.map((etapa, idx) => {
              const meta = STATUS_META[etapa.status];
              const resolved = isResolved(etapa.status);
              const target = moduleNav(etapa.modulo ?? null, etapa);
              const isPending = pendingKey === etapa.key;
              const last = idx === trilha.etapas.length - 1;
              const responsavel = etapa.responsavel?.trim();
              const dataPrevista = formatDate(etapa.dataPrevista);
              const dataConcluida = formatDate(etapa.dataConcluida);

              return (
                <li
                  key={etapa.key}
                  className="relative flex gap-4 pb-6 last:pb-0"
                  data-testid={`trilha-etapa-${etapa.key}`}
                >
                  {!last && (
                    <span
                      aria-hidden
                      className="absolute left-4 top-9 h-[calc(100%-1.5rem)] w-px -translate-x-1/2 bg-border"
                    />
                  )}
                  <div
                    className={cn(
                      "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                      meta.ring,
                    )}
                  >
                    {etapa.status === "concluido" ? (
                      <Check className="h-4 w-4" />
                    ) : etapa.status === "nao_aplicavel" ? (
                      <CircleSlash className="h-4 w-4" />
                    ) : etapa.status === "bloqueado" ? (
                      <Ban className="h-4 w-4" />
                    ) : (
                      etapa.ordem
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "font-medium",
                          resolved ? "text-muted-foreground" : "text-foreground",
                        )}
                      >
                        {etapa.titulo}
                      </span>
                      <Badge variant={meta.badge} className="text-[11px]">
                        {meta.label}
                      </Badge>
                      {etapa.manual && etapa.status === "pendente" && (
                        <Badge variant="outline" className="text-[11px] text-muted-foreground">
                          Marco manual
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{etapa.descricao}</p>

                    {(responsavel || dataPrevista || dataConcluida) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {responsavel && (
                          <span>
                            Responsável:{" "}
                            <span className="text-foreground">{responsavel}</span>
                          </span>
                        )}
                        {dataPrevista && !resolved && (
                          <span>
                            Prevista:{" "}
                            <span className="text-foreground">{dataPrevista}</span>
                          </span>
                        )}
                        {dataConcluida && etapa.status === "concluido" && (
                          <span>
                            Concluída em{" "}
                            <span className="text-foreground">{dataConcluida}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {etapa.observacao && (
                      <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                        {etapa.observacao}
                      </p>
                    )}

                    {!resolved &&
                      !etapa.manual &&
                      etapa.status !== "bloqueado" &&
                      etapa.sugestao.motivo && (
                        <p
                          className="text-xs text-muted-foreground/80"
                          data-testid={`trilha-aguardando-${etapa.key}`}
                        >
                          Aguardando: {etapa.sugestao.motivo}
                        </p>
                      )}

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {target &&
                        (target.kind === "link" ? (
                          <Link
                            href={target.href}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-7 gap-1.5 text-xs",
                            )}
                            data-testid={`trilha-modulo-${etapa.key}`}
                          >
                            {target.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={target.onClick}
                            data-testid={`trilha-modulo-${etapa.key}`}
                          >
                            {target.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ))}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            disabled={isPending}
                            data-testid={`trilha-acoes-${etapa.key}`}
                          >
                            {isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <MoreVertical className="h-3.5 w-3.5" />
                            )}
                            Ações
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          {etapa.manual && etapa.status !== "concluido" && (
                            <DropdownMenuItem
                              onClick={() => setStatus(etapa.key, "concluido")}
                              data-testid={`trilha-acao-concluir-${etapa.key}`}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              Concluir etapa
                            </DropdownMenuItem>
                          )}
                          {etapa.manual && etapa.status === "pendente" && (
                            <DropdownMenuItem
                              onClick={() => setStatus(etapa.key, "em_andamento")}
                            >
                              <PlayCircle className="h-4 w-4 text-blue-600" />
                              Marcar em andamento
                            </DropdownMenuItem>
                          )}
                          {(etapa.status === "bloqueado" ||
                            etapa.status === "nao_aplicavel" ||
                            (etapa.manual && etapa.status === "concluido")) && (
                            <DropdownMenuItem
                              onClick={() => setStatus(etapa.key, "pendente")}
                              data-testid={`trilha-acao-reabrir-${etapa.key}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                              {etapa.manual ? "Reabrir etapa" : "Remover marcação"}
                            </DropdownMenuItem>
                          )}
                          {etapa.status !== "bloqueado" &&
                            etapa.status !== "concluido" && (
                              <DropdownMenuItem
                                onClick={() => setStatus(etapa.key, "bloqueado")}
                              >
                                <Ban className="h-4 w-4 text-red-600" />
                                Bloquear
                              </DropdownMenuItem>
                            )}
                          {etapa.status !== "nao_aplicavel" && (
                            <DropdownMenuItem
                              onClick={() => setStatus(etapa.key, "nao_aplicavel")}
                            >
                              <CircleSlash className="h-4 w-4" />
                              Não se aplica
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              setEdit({
                                etapa,
                                responsavel: etapa.responsavel ?? "",
                                dataPrevista: etapa.dataPrevista ?? "",
                                observacao: etapa.observacao ?? "",
                              })
                            }
                            data-testid={`trilha-acao-editar-${etapa.key}`}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar detalhes
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {edit ? `Editar — ${edit.etapa.titulo}` : "Editar etapa"}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="flex flex-col gap-4 py-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trilha-responsavel">Responsável</Label>
                <Input
                  id="trilha-responsavel"
                  value={edit.responsavel}
                  placeholder="Nome do responsável"
                  onChange={(e) =>
                    setEdit({ ...edit, responsavel: e.target.value })
                  }
                  data-testid="trilha-input-responsavel"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trilha-data-prevista">Data prevista</Label>
                <Input
                  id="trilha-data-prevista"
                  type="date"
                  value={edit.dataPrevista}
                  onChange={(e) =>
                    setEdit({ ...edit, dataPrevista: e.target.value })
                  }
                  data-testid="trilha-input-data-prevista"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trilha-observacao">Observação</Label>
                <Textarea
                  id="trilha-observacao"
                  value={edit.observacao}
                  placeholder="Anotações sobre esta etapa"
                  rows={3}
                  onChange={(e) =>
                    setEdit({ ...edit, observacao: e.target.value })
                  }
                  data-testid="trilha-input-observacao"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEdit(null)}
              disabled={update.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveEdit}
              disabled={update.isPending}
              data-testid="trilha-salvar-edicao"
            >
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
