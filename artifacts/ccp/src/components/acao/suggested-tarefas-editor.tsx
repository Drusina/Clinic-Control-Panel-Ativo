import { useSuggestActionTarefas } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Plus, X, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_TAREFAS = 12;

/** Merge two title lists: trims, drops empties, dedups case-insensitively, caps. */
function mergeTitles(current: string[], incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...current, ...incoming]) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAREFAS) break;
  }
  return out;
}

export interface SuggestedTarefasEditorProps {
  clinicId: string;
  /** Context for the AI suggestion. */
  titulo: string;
  descricao?: string;
  pilarSlug?: string;
  /** Controlled list of task titles (may include in-progress empty strings). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Reusable editor for an action's suggested tarefas (titles only). Renders an
 * "Sugerir tarefas com IA" button (calls the suggest endpoint, which always
 * returns titles via AI or a curated fallback) plus a manually editable list.
 * The parent owns the list and threads it into the create payload — nothing is
 * persisted here.
 */
export function SuggestedTarefasEditor({
  clinicId,
  titulo,
  descricao,
  pilarSlug,
  value,
  onChange,
  disabled,
}: SuggestedTarefasEditorProps) {
  const { toast } = useToast();
  const suggest = useSuggestActionTarefas();

  const handleSuggest = () => {
    if (!titulo.trim()) {
      toast({
        variant: "destructive",
        title: "Informe o título da ação",
        description: "A IA usa o título (e a descrição) para sugerir as tarefas.",
      });
      return;
    }
    suggest.mutate(
      {
        clinicId,
        data: {
          titulo: titulo.trim(),
          descricao: descricao?.trim() || undefined,
          pilarSlug: pilarSlug || undefined,
        },
      },
      {
        onSuccess: (result) => {
          onChange(mergeTitles(value, result.tarefas));
          toast({
            title:
              result.source === "ai"
                ? "Tarefas sugeridas pela IA"
                : "Tarefas sugeridas (modelos padrão)",
            description:
              result.source === "ai"
                ? "Revise e edite antes de criar a ação."
                : "A IA não respondeu a tempo; usamos modelos padrão. Revise antes de criar.",
          });
        },
        onError: () =>
          toast({
            variant: "destructive",
            title: "Erro ao sugerir tarefas",
            description: "Tente novamente ou adicione as tarefas manualmente.",
          }),
      },
    );
  };

  const updateAt = (index: number, v: string) =>
    onChange(value.map((t, i) => (i === index ? v : t)));
  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, ""]);

  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <ListChecks className="h-3.5 w-3.5 text-indigo-600" />
          Tarefas sugeridas ({value.length})
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleSuggest}
            disabled={disabled || suggest.isPending}
          >
            {suggest.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1 text-indigo-600" />
            )}
            Sugerir com IA
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={add}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          A ação nascerá com estas tarefas (somente títulos; sem responsável/datas). Use a IA ou
          adicione manualmente.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {value.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                value={t}
                placeholder="Título da tarefa"
                onChange={(e) => updateAt(i, e.target.value)}
                disabled={disabled}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeAt(i)}
                disabled={disabled}
                title="Remover tarefa"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SuggestedTarefasEditor;
