import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getStoredToken } from "@/hooks/use-auth";
import {
  Loader2,
  Save,
  RotateCcw,
  ShieldAlert,
  KanbanSquare,
  Users,
  CheckCircle2,
  AlertCircle,
  ListChecks,
  Plus,
  X,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PLANS = [
  { id: "starter", label: "Starter", color: "bg-slate-100 text-slate-800" },
  { id: "pro", label: "Pro", color: "bg-blue-100 text-blue-800" },
  { id: "enterprise", label: "Enterprise", color: "bg-purple-100 text-purple-800" },
] as const;

type Plan = "starter" | "pro" | "enterprise";

interface IcsPilar {
  slug: string;
  nome: string;
  role: string;
}

interface IcsRisk {
  nome: string;
  descricao: string;
  probabilidade: number;
  impacto: number;
  pilarSlug: string;
  acoesMitigadoras: string;
}

interface IcsAction {
  titulo: string;
  descricao: string;
  pilarSlug: string;
  prioridade: string;
  coluna: string;
  ordem: number;
  tarefas?: string[];
}

interface PlanTemplate {
  plan: Plan;
  risks: IcsRisk[];
  actions: IcsAction[];
  pilares: IcsPilar[];
  isCustomized: boolean;
  updatedAt: string | null;
  defaults?: {
    risks: IcsRisk[];
    actions: IcsAction[];
    pilares: IcsPilar[];
  };
}

function severityLabel(p: number, i: number) {
  const s = p * i;
  if (s >= 15) return { label: "Crítico", cls: "bg-red-100 text-red-700" };
  if (s >= 9) return { label: "Alto", cls: "bg-orange-100 text-orange-700" };
  if (s >= 4) return { label: "Médio", cls: "bg-yellow-100 text-yellow-700" };
  return { label: "Baixo", cls: "bg-green-100 text-green-700" };
}

function prioridadeLabel(p: string) {
  if (p === "alta") return { label: "Alta", cls: "bg-red-100 text-red-700" };
  if (p === "media") return { label: "Média", cls: "bg-yellow-100 text-yellow-700" };
  return { label: "Baixa", cls: "bg-green-100 text-green-700" };
}

function colunaLabel(c: string) {
  const map: Record<string, string> = {
    backlog: "Backlog",
    todo: "A fazer",
    doing: "Em andamento",
    review: "Revisão",
    done: "Concluído",
  };
  return map[c] ?? c;
}

interface PlanEditorState {
  risks: Set<string>;
  actions: Set<string>;
  pilares: Set<string>;
  /** Curated tarefa titles per action titulo (editable in the library). */
  actionTarefas: Record<string, string[]>;
}

export default function IcsTemplatesPage() {
  const { toast } = useToast();
  const [activePlan, setActivePlan] = useState<Plan>("starter");
  const [templates, setTemplates] = useState<Record<Plan, PlanTemplate | null>>({
    starter: null,
    pro: null,
    enterprise: null,
  });
  const [defaults, setDefaults] = useState<{
    risks: IcsRisk[];
    actions: IcsAction[];
    pilares: IcsPilar[];
  } | null>(null);
  const [editorState, setEditorState] = useState<Record<Plan, PlanEditorState>>({
    starter: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
    pro: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
    enterprise: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const authHeaders = useCallback((): HeadersInit => {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/ics-templates`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Erro ao carregar templates");
      const data: PlanTemplate[] = await res.json();

      const byPlan: Record<Plan, PlanTemplate | null> = {
        starter: null,
        pro: null,
        enterprise: null,
      };
      let globalDefaults = defaults;

      for (const t of data) {
        byPlan[t.plan as Plan] = t;
        if (t.defaults && !globalDefaults) {
          globalDefaults = t.defaults;
        }
      }

      if (!globalDefaults && data.length > 0) {
        const detailRes = await fetch(`${BASE}/api/admin/ics-templates/starter`, {
          headers: authHeaders(),
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          globalDefaults = detail.defaults;
        }
      }

      setDefaults(globalDefaults);
      setTemplates(byPlan);

      const newEditorState: Record<Plan, PlanEditorState> = {
        starter: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
        pro: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
        enterprise: { risks: new Set(), actions: new Set(), pilares: new Set(), actionTarefas: {} },
      };
      const defaultTarefas: Record<string, string[]> = {};
      for (const a of globalDefaults?.actions ?? []) {
        defaultTarefas[a.titulo] = [...(a.tarefas ?? [])];
      }
      for (const plan of ["starter", "pro", "enterprise"] as Plan[]) {
        const t = byPlan[plan];
        if (t) {
          const actionTarefas: Record<string, string[]> = { ...defaultTarefas };
          for (const a of t.actions) {
            actionTarefas[a.titulo] = [...(a.tarefas ?? [])];
          }
          newEditorState[plan] = {
            risks: new Set(t.risks.map((r) => r.nome)),
            actions: new Set(t.actions.map((a) => a.titulo)),
            pilares: new Set(t.pilares.map((p) => p.slug)),
            actionTarefas,
          };
        }
      }
      setEditorState(newEditorState);
    } catch {
      toast({ title: "Erro ao carregar templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, toast, defaults]);

  useEffect(() => {
    loadTemplates();
  }, []);

  function toggleRisk(plan: Plan, nome: string) {
    setEditorState((prev) => {
      const current = new Set(prev[plan].risks);
      if (current.has(nome)) {
        current.delete(nome);
      } else {
        current.add(nome);
      }
      return { ...prev, [plan]: { ...prev[plan], risks: current } };
    });
  }

  function toggleAction(plan: Plan, titulo: string) {
    setEditorState((prev) => {
      const current = new Set(prev[plan].actions);
      if (current.has(titulo)) {
        current.delete(titulo);
      } else {
        current.add(titulo);
      }
      return { ...prev, [plan]: { ...prev[plan], actions: current } };
    });
  }

  function setActionTarefa(plan: Plan, titulo: string, index: number, value: string) {
    setEditorState((prev) => {
      const current = prev[plan].actionTarefas[titulo] ?? [];
      const next = current.map((t, i) => (i === index ? value : t));
      return {
        ...prev,
        [plan]: {
          ...prev[plan],
          actionTarefas: { ...prev[plan].actionTarefas, [titulo]: next },
        },
      };
    });
  }

  function addActionTarefa(plan: Plan, titulo: string) {
    setEditorState((prev) => {
      const current = prev[plan].actionTarefas[titulo] ?? [];
      return {
        ...prev,
        [plan]: {
          ...prev[plan],
          actionTarefas: { ...prev[plan].actionTarefas, [titulo]: [...current, ""] },
        },
      };
    });
  }

  function removeActionTarefa(plan: Plan, titulo: string, index: number) {
    setEditorState((prev) => {
      const current = prev[plan].actionTarefas[titulo] ?? [];
      return {
        ...prev,
        [plan]: {
          ...prev[plan],
          actionTarefas: {
            ...prev[plan].actionTarefas,
            [titulo]: current.filter((_, i) => i !== index),
          },
        },
      };
    });
  }

  function togglePilar(plan: Plan, slug: string) {
    setEditorState((prev) => {
      const current = new Set(prev[plan].pilares);
      if (current.has(slug)) {
        current.delete(slug);
      } else {
        current.add(slug);
      }
      return { ...prev, [plan]: { ...prev[plan], pilares: current } };
    });
  }

  async function handleSave(plan: Plan) {
    if (!defaults) return;
    setSaving(true);
    try {
      const state = editorState[plan];
      const risks = defaults.risks.filter((r) => state.risks.has(r.nome));
      const actions = defaults.actions
        .filter((a) => state.actions.has(a.titulo))
        .map((a) => {
          const tarefas = (state.actionTarefas[a.titulo] ?? a.tarefas ?? [])
            .map((t) => t.trim())
            .filter(Boolean);
          return { ...a, tarefas };
        });
      const pilares = defaults.pilares.filter((p) => state.pilares.has(p.slug));

      const res = await fetch(`${BASE}/api/admin/ics-templates/${plan}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ risks, actions, pilares }),
      });

      if (!res.ok) throw new Error("Falha ao salvar");

      toast({
        title: "Template salvo",
        description: `Configuração do plano ${plan} atualizada com sucesso.`,
      });
      await loadTemplates();
    } catch {
      toast({ title: "Erro ao salvar template", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(plan: Plan) {
    setResetting(true);
    try {
      const res = await fetch(`${BASE}/api/admin/ics-templates/${plan}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao redefinir");

      toast({
        title: "Template redefinido",
        description: `Plano ${plan} voltou aos padrões ICS.`,
      });
      await loadTemplates();
    } catch {
      toast({ title: "Erro ao redefinir template", variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!defaults) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <p>Não foi possível carregar os dados padrão ICS.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates ICS por Plano</h1>
        <p className="text-muted-foreground mt-1">
          Configure quais riscos, ações e delegações são pré-carregados ao inicializar os dados de uma clínica, de acordo com o plano contratado.
        </p>
      </div>

      <Tabs value={activePlan} onValueChange={(v) => setActivePlan(v as Plan)}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          {PLANS.map((plan) => (
            <TabsTrigger key={plan.id} value={plan.id} className="flex items-center gap-2">
              {plan.label}
              {templates[plan.id]?.isCustomized && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {PLANS.map((plan) => {
          const state = editorState[plan.id];
          const template = templates[plan.id];
          const isCustomized = template?.isCustomized ?? false;

          return (
            <TabsContent key={plan.id} value={plan.id} className="space-y-6 mt-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Badge className={plan.color}>{plan.label}</Badge>
                  {isCustomized ? (
                    <span className="flex items-center gap-1 text-sm text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Template personalizado
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Usando padrões ICS</span>
                  )}
                  {template?.updatedAt && (
                    <span className="text-xs text-muted-foreground">
                      Atualizado em {new Date(template.updatedAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {isCustomized && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReset(plan.id)}
                      disabled={resetting || saving}
                    >
                      {resetting ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                      )}
                      Redefinir padrões
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleSave(plan.id)} disabled={saving || resetting}>
                    {saving ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3.5 w-3.5" />
                    )}
                    Salvar configuração
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldAlert className="h-4 w-4 text-destructive" />
                      Riscos
                      <Badge variant="secondary" className="ml-auto text-xs font-normal">
                        {state.risks.size}/{defaults.risks.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Selecione os riscos que serão pré-carregados para este plano
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {defaults.risks.map((risk, i) => {
                      const { label, cls } = severityLabel(risk.probabilidade, risk.impacto);
                      const checked = state.risks.has(risk.nome);
                      return (
                        <div key={i}>
                          {i > 0 && <Separator className="mb-3" />}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`risk-${plan.id}-${i}`}
                              checked={checked}
                              onCheckedChange={() => toggleRisk(plan.id, risk.nome)}
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor={`risk-${plan.id}-${i}`}
                              className="cursor-pointer space-y-1"
                            >
                              <div className="text-sm font-medium leading-snug">{risk.nome}</div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
                                <span className="text-[10px] text-muted-foreground capitalize">{risk.pilarSlug}</span>
                              </div>
                            </Label>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <KanbanSquare className="h-4 w-4 text-blue-600" />
                      Ações
                      <Badge variant="secondary" className="ml-auto text-xs font-normal">
                        {state.actions.size}/{defaults.actions.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Selecione as ações do Kanban que serão pré-carregadas
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {defaults.actions.map((action, i) => {
                      const { label, cls } = prioridadeLabel(action.prioridade);
                      const checked = state.actions.has(action.titulo);
                      const tarefas = state.actionTarefas[action.titulo] ?? action.tarefas ?? [];
                      return (
                        <div key={i}>
                          {i > 0 && <Separator className="mb-3" />}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`action-${plan.id}-${i}`}
                              checked={checked}
                              onCheckedChange={() => toggleAction(plan.id, action.titulo)}
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor={`action-${plan.id}-${i}`}
                              className="cursor-pointer space-y-1"
                            >
                              <div className="text-sm font-medium leading-snug">{action.titulo}</div>
                              <div className="flex flex-wrap gap-1.5 items-center">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
                                <span className="text-[10px] text-muted-foreground">{colunaLabel(action.coluna)}</span>
                                <span className="text-[10px] text-muted-foreground capitalize">{action.pilarSlug}</span>
                              </div>
                            </Label>
                          </div>
                          {checked && (
                            <div className="ml-7 mt-2 rounded-md border border-dashed bg-muted/30 p-2 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                                  <ListChecks className="h-3 w-3 text-indigo-600" />
                                  Tarefas sugeridas ({tarefas.length})
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[11px] px-1.5"
                                  onClick={() => addActionTarefa(plan.id, action.titulo)}
                                >
                                  <Plus className="h-3 w-3 mr-0.5" /> Adicionar
                                </Button>
                              </div>
                              {tarefas.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">
                                  Sem tarefas. A ação nascerá sem tarefas sugeridas neste plano.
                                </p>
                              ) : (
                                <ul className="space-y-1">
                                  {tarefas.map((t, j) => (
                                    <li key={j} className="flex items-center gap-1.5">
                                      <Input
                                        value={t}
                                        placeholder="Título da tarefa"
                                        onChange={(e) =>
                                          setActionTarefa(plan.id, action.titulo, j, e.target.value)
                                        }
                                        className="h-7 text-xs"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                        onClick={() =>
                                          removeActionTarefa(plan.id, action.titulo, j)
                                        }
                                        title="Remover tarefa"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4 text-green-600" />
                      Delegações
                      <Badge variant="secondary" className="ml-auto text-xs font-normal">
                        {state.pilares.size}/{defaults.pilares.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Selecione os pilares que terão delegação N1 pré-criada
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {defaults.pilares.map((pilar, i) => {
                      const checked = state.pilares.has(pilar.slug);
                      return (
                        <div key={i}>
                          {i > 0 && <Separator className="mb-3" />}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`pilar-${plan.id}-${i}`}
                              checked={checked}
                              onCheckedChange={() => togglePilar(plan.id, pilar.slug)}
                              className="mt-0.5"
                            />
                            <Label
                              htmlFor={`pilar-${plan.id}-${i}`}
                              className="cursor-pointer space-y-1"
                            >
                              <div className="text-sm font-medium leading-snug">{pilar.nome}</div>
                              <div className="text-[10px] text-muted-foreground">{pilar.role}</div>
                            </Label>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              <p className="text-xs text-muted-foreground">
                Itens selecionados serão pré-carregados ao inicializar dados ICS para clínicas com o plano <strong>{plan.label}</strong>. Itens não selecionados não serão criados automaticamente.
              </p>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
