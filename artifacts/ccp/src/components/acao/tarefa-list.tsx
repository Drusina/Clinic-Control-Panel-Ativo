import { useState } from "react";
import {
  useCreateTarefa,
  useUpdateTarefa,
  useDeleteTarefa,
} from "@workspace/api-client-react";
import type { AcaoTarefa, AcaoTarefaStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListChecks,
  Plus,
  Trash2,
  CornerDownRight,
  ChevronRight,
  ChevronDown,
  Lock,
  Activity,
} from "lucide-react";

export type TeamOption = { nome: string; email: string };

const NONE = "__none__";

const STATUS_LABELS: Record<AcaoTarefaStatus, string> = {
  a_fazer: "A fazer",
  fazendo: "Fazendo",
  concluida: "Concluída",
};

const STATUS_STYLES: Record<AcaoTarefaStatus, string> = {
  a_fazer: "text-muted-foreground",
  fazendo: "text-amber-600",
  concluida: "text-emerald-600",
};

function TarefaRow({
  actionId,
  tarefa,
  teamMembers,
  onChanged,
  isSub = false,
}: {
  actionId: string;
  tarefa: AcaoTarefa;
  teamMembers: TeamOption[];
  onChanged: () => void;
  isSub?: boolean;
}) {
  const updateTarefa = useUpdateTarefa();
  const deleteTarefa = useDeleteTarefa();
  const createTarefa = useCreateTarefa();

  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [showSubInput, setShowSubInput] = useState(false);
  const [novaSub, setNovaSub] = useState("");
  const [expanded, setExpanded] = useState(true);

  const subtarefas = tarefa.subtarefas ?? [];
  const concluida = tarefa.status === "concluida";

  const patch = (
    data: Parameters<typeof updateTarefa.mutate>[0]["data"],
  ) => {
    updateTarefa.mutate(
      { id: actionId, tarefaId: tarefa.id, data },
      { onSuccess: onChanged },
    );
  };

  const commitTitle = () => {
    const t = titulo.trim();
    if (!t || t === tarefa.titulo) {
      setTitulo(tarefa.titulo);
      return;
    }
    patch({ titulo: t });
  };

  const handleResponsavel = (value: string) => {
    if (value === NONE) {
      patch({ responsavelEmail: null, responsavelNome: null });
    } else {
      const m = teamMembers.find((x) => x.email === value);
      patch({ responsavelEmail: value, responsavelNome: m?.nome ?? null });
    }
  };

  const handleAddSub = () => {
    const t = novaSub.trim();
    if (!t) return;
    createTarefa.mutate(
      { id: actionId, data: { titulo: t, parentTarefaId: tarefa.id } },
      {
        onSuccess: () => {
          setNovaSub("");
          setShowSubInput(false);
          onChanged();
        },
      },
    );
  };

  const respValue = tarefa.responsavelEmail ?? NONE;
  const bloqueada = tarefa.bloqueada;
  const temOrigem = !!(tarefa.origemPergunta || tarefa.origemResposta);

  return (
    <div
      className={
        isSub
          ? ""
          : `rounded-lg border bg-background/40 p-2.5 ${bloqueada ? "border-amber-300 bg-amber-50/40" : ""}`
      }
      data-testid={`tarefa-row-${tarefa.id}`}
    >
      <div className="flex items-start gap-2">
        {!isSub &&
          (subtarefas.length > 0 ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-muted-foreground hover:text-foreground flex-shrink-0"
              aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-3.5 flex-shrink-0" />
          ))}
        {isSub && (
          <CornerDownRight className="mt-2 h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={`h-8 flex-1 ${concluida ? "line-through text-muted-foreground" : ""}`}
            />
            <button
              onClick={() =>
                deleteTarefa.mutate(
                  { id: actionId, tarefaId: tarefa.id },
                  { onSuccess: onChanged },
                )
              }
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              aria-label="Remover tarefa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={tarefa.status}
              onValueChange={(v) => patch({ status: v as AcaoTarefaStatus })}
            >
              <SelectTrigger
                className={`h-7 w-[120px] text-xs ${STATUS_STYLES[tarefa.status]}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as AcaoTarefaStatus[]).map((s) => (
                  <SelectItem
                    key={s}
                    value={s}
                    disabled={bloqueada && s !== "a_fazer"}
                  >
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={respValue} onValueChange={handleResponsavel}>
              <SelectTrigger className="h-7 w-[170px] text-xs">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não atribuído</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.email} value={m.email}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={tarefa.dataInicio ?? ""}
              onChange={(e) => patch({ dataInicio: e.target.value || null })}
              className="h-7 w-[150px] text-xs"
              title="Data de início"
            />

            <Input
              type="date"
              value={tarefa.prazo ?? ""}
              onChange={(e) => patch({ prazo: e.target.value || null })}
              className="h-7 w-[150px] text-xs"
              title="Prazo"
            />
          </div>

          {bloqueada && (
            <div
              className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-100/60 rounded-md px-2 py-1"
              data-testid={`tarefa-bloqueada-${tarefa.id}`}
            >
              <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Bloqueada até concluir
                {tarefa.dependeDeTitulo ? (
                  <>
                    : <span className="font-medium">{tarefa.dependeDeTitulo}</span>
                  </>
                ) : (
                  " a fase anterior"
                )}
                .
              </span>
            </div>
          )}

          {temOrigem && (
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground border-l-2 border-muted pl-2">
              <Activity className="h-3 w-3 mt-0.5 flex-shrink-0 text-muted-foreground/70" />
              <div className="min-w-0">
                <span className="font-medium text-foreground/70">↳ origem: </span>
                {tarefa.origemPergunta && (
                  <span className="text-foreground/80">{tarefa.origemPergunta}</span>
                )}
                {tarefa.origemResposta && (
                  <span> — “{tarefa.origemResposta}”</span>
                )}
              </div>
            </div>
          )}

          {!isSub && expanded && subtarefas.length > 0 && (
            <div className="space-y-1.5 border-l pl-2 ml-0.5">
              {subtarefas.map((st) => (
                <TarefaRow
                  key={st.id}
                  actionId={actionId}
                  tarefa={st}
                  teamMembers={teamMembers}
                  onChanged={onChanged}
                  isSub
                />
              ))}
            </div>
          )}

          {!isSub &&
            (showSubInput ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  placeholder="Nova subtarefa…"
                  value={novaSub}
                  onChange={(e) => setNovaSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSub();
                    }
                  }}
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={handleAddSub}
                  disabled={!novaSub.trim() || createTarefa.isPending}
                >
                  Adicionar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => {
                    setShowSubInput(false);
                    setNovaSub("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowSubInput(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Subtarefa
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function TarefaList({
  actionId,
  tarefas,
  teamMembers,
  onChanged,
}: {
  actionId: string;
  tarefas: AcaoTarefa[];
  teamMembers: TeamOption[];
  onChanged: () => void;
}) {
  const createTarefa = useCreateTarefa();
  const [novaTarefa, setNovaTarefa] = useState("");

  const total = tarefas.length;
  const done = tarefas.filter((t) => t.status === "concluida").length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  const handleAdd = () => {
    const t = novaTarefa.trim();
    if (!t) return;
    createTarefa.mutate(
      { id: actionId, data: { titulo: t } },
      {
        onSuccess: () => {
          setNovaTarefa("");
          onChanged();
        },
      },
    );
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">Tarefas</h3>
        </div>
        <span className="text-xs font-medium border rounded-full px-2 py-0.5 text-muted-foreground">
          {done}/{total}
        </span>
      </div>
      <Progress value={pct} className="h-2" />

      {total === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-2">
          Nenhuma tarefa ainda. Detalhe esta ação em tarefas com responsáveis e
          prazos.
        </p>
      ) : (
        <div className="space-y-2">
          {tarefas.map((t) => (
            <TarefaRow
              key={t.id}
              actionId={actionId}
              tarefa={t}
              teamMembers={teamMembers}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Input
          placeholder={total === 0 ? "Detalhar em tarefas…" : "Adicionar tarefa…"}
          value={novaTarefa}
          onChange={(e) => setNovaTarefa(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={handleAdd}
          disabled={!novaTarefa.trim() || createTarefa.isPending}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
