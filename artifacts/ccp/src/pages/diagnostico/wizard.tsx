import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  WifiOff,
  BarChart3,
} from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getStoredToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface DiagnosticPillar {
  slug: string;
  nome: string;
  ordem: number;
  questionCount: number;
}

interface Pergunta {
  id: string;
  pilarSlug: string;
  pilarNome: string;
  pilarOrdem: number;
  texto: string;
  tipo: "sim_nao" | "escala_1_5" | "texto_livre" | "numerico";
  peso: number;
  ordem: number;
  dica?: string;
  valorMin?: number | null;
  valorMax?: number | null;
  inverso?: boolean;
}

interface Resposta {
  perguntaId: string;
  valor: string;
}

const ESCALA_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Crítico", color: "bg-red-100 border-red-400 text-red-800 hover:bg-red-200" },
  2: { label: "Ruim", color: "bg-orange-100 border-orange-400 text-orange-800 hover:bg-orange-200" },
  3: { label: "Médio", color: "bg-yellow-100 border-yellow-400 text-yellow-800 hover:bg-yellow-200" },
  4: { label: "Bom", color: "bg-blue-100 border-blue-400 text-blue-800 hover:bg-blue-200" },
  5: { label: "Ótimo", color: "bg-green-100 border-green-400 text-green-800 hover:bg-green-200" },
};

const ESCALA_SELECTED: Record<number, string> = {
  1: "bg-red-500 border-red-500 text-white",
  2: "bg-orange-500 border-orange-500 text-white",
  3: "bg-yellow-500 border-yellow-500 text-white",
  4: "bg-blue-500 border-blue-500 text-white",
  5: "bg-green-500 border-green-500 text-white",
};

const PILAR_COLORS: Record<string, { bg: string; ring: string; text: string; light: string }> = {
  estrategia: { bg: "bg-indigo-500", ring: "ring-indigo-500", text: "text-indigo-700", light: "bg-indigo-50" },
  financeiro: { bg: "bg-emerald-500", ring: "ring-emerald-500", text: "text-emerald-700", light: "bg-emerald-50" },
  contabil: { bg: "bg-amber-500", ring: "ring-amber-500", text: "text-amber-700", light: "bg-amber-50" },
  marketing: { bg: "bg-rose-500", ring: "ring-rose-500", text: "text-rose-700", light: "bg-rose-50" },
  operacoes: { bg: "bg-cyan-500", ring: "ring-cyan-500", text: "text-cyan-700", light: "bg-cyan-50" },
  pessoas: { bg: "bg-violet-500", ring: "ring-violet-500", text: "text-violet-700", light: "bg-violet-50" },
  tecnologia: { bg: "bg-sky-500", ring: "ring-sky-500", text: "text-sky-700", light: "bg-sky-50" },
  compliance: { bg: "bg-slate-500", ring: "ring-slate-500", text: "text-slate-700", light: "bg-slate-50" },
};

const PILAR_ICONS: Record<string, string> = {
  estrategia: "🎯",
  financeiro: "💰",
  contabil: "📊",
  marketing: "📣",
  operacoes: "⚙️",
  pessoas: "👥",
  tecnologia: "💻",
  compliance: "🛡️",
};

function QuestionControl({
  pergunta,
  value,
  onChange,
}: {
  pergunta: Pergunta;
  value: string | undefined;
  onChange: (val: string) => void;
}) {
  if (pergunta.tipo === "sim_nao") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {(["sim", "nao"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`py-4 rounded-xl border-2 text-base font-bold transition-all ${
              value === opt
                ? opt === "sim"
                  ? "bg-green-500 border-green-500 text-white shadow-md"
                  : "bg-red-500 border-red-500 text-white shadow-md"
                : "bg-card hover:bg-accent border-border"
            }`}
          >
            {opt === "sim" ? "✅ Sim" : "❌ Não"}
          </button>
        ))}
      </div>
    );
  }

  if (pergunta.tipo === "escala_1_5") {
    return (
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((val) => {
          const info = ESCALA_LABELS[val];
          const isSelected = value === String(val);
          return (
            <button
              key={val}
              onClick={() => onChange(String(val))}
              className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border-2 transition-all ${
                isSelected ? ESCALA_SELECTED[val] : `${info.color} border-transparent`
              }`}
            >
              <span className="text-xl font-bold">{val}</span>
              <span className="text-xs font-medium leading-tight text-center">{info.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (pergunta.tipo === "texto_livre") {
    return (
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite sua resposta..."
        rows={3}
        className="resize-none"
      />
    );
  }

  if (pergunta.tipo === "numerico") {
    return (
      <div className="flex flex-col gap-1">
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            pergunta.valorMin != null && pergunta.valorMax != null
              ? `${pergunta.valorMin} – ${pergunta.valorMax}`
              : "Digite um número..."
          }
          min={pergunta.valorMin ?? undefined}
          max={pergunta.valorMax ?? undefined}
          className="text-lg h-12 text-center"
        />
        {pergunta.valorMin != null && pergunta.valorMax != null && (
          <p className="text-xs text-muted-foreground text-center">
            Intervalo: {pergunta.valorMin} a {pergunta.valorMax}
            {pergunta.inverso && " (menor é melhor)"}
          </p>
        )}
      </div>
    );
  }

  return null;
}

export default function DiagnosticoWizard() {
  const params = useParams<{ id: string }>();
  const diagnosticoId = params.id;
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const pilarDeepLink = new URLSearchParams(window.location.search).get("pilar");

  const [selectedPilar, setSelectedPilar] = useState<string | null>(null);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pendingAnswers = useRef<Record<string, string>>({});
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { toast } = useToast();

  const { data: pillars, isLoading: loadingPillars } = useQuery<DiagnosticPillar[]>({
    queryKey: ["diagnostic-pillars"],
    queryFn: () => apiFetch("/diagnostic/pillars"),
    staleTime: Infinity,
  });

  const pillarQuestionResults = useQueries({
    queries: (pillars ?? []).map((p) => ({
      queryKey: ["pillar-questions", p.slug],
      queryFn: () => apiFetch(`/diagnostic/pillars/${p.slug}/questions`) as Promise<Pergunta[]>,
      staleTime: Infinity,
    })),
  });

  const allQuestions = useMemo((): Pergunta[] => {
    return pillarQuestionResults.flatMap((r) => r.data ?? []);
  }, [pillarQuestionResults]);

  const loadingQuestions = loadingPillars || pillarQuestionResults.some((r) => r.isLoading);

  const { data: respostasData, isLoading: loadingRespostas } = useQuery<Resposta[]>({
    queryKey: ["respostas", diagnosticoId],
    queryFn: () => apiFetch(`/diagnostics/${diagnosticoId}/respostas`),
    enabled: !!diagnosticoId,
  });

  useEffect(() => {
    if (!respostasData) return;
    const map: Record<string, string> = {};
    for (const r of respostasData) {
      map[r.perguntaId] = r.valor;
    }
    setLocalAnswers(map);
  }, [respostasData]);

  useEffect(() => {
    if (pilarDeepLink) {
      setSelectedPilar(pilarDeepLink);
    }
  }, [pilarDeepLink]);

  const batchSave = useCallback(
    async (answers: Record<string, string>) => {
      const respostas = Object.entries(answers).map(([perguntaId, valor]) => ({ perguntaId, valor }));
      if (respostas.length === 0) return;
      setIsBatchSaving(true);
      try {
        await apiFetch(`/diagnostics/${diagnosticoId}/respostas/batch`, {
          method: "POST",
          body: JSON.stringify({ respostas }),
        });
        setSaveError(false);
        pendingAnswers.current = {};
        qc.invalidateQueries({ queryKey: ["respostas", diagnosticoId] });
      } catch {
        setSaveError(true);
        toast({
          variant: "destructive",
          title: "Falha ao salvar respostas",
          description: "Verifique sua conexão e tente novamente.",
        });
      } finally {
        setIsBatchSaving(false);
      }
    },
    [diagnosticoId, qc, toast]
  );

  const handleAnswer = useCallback(
    (perguntaId: string, valor: string) => {
      setLocalAnswers((prev) => ({ ...prev, [perguntaId]: valor }));
      pendingAnswers.current[perguntaId] = valor;

      if (autoSaveTimers.current[perguntaId]) {
        clearTimeout(autoSaveTimers.current[perguntaId]);
      }

      autoSaveTimers.current[perguntaId] = setTimeout(() => {
        const toSave = { [perguntaId]: pendingAnswers.current[perguntaId] ?? valor };
        batchSave(toSave);
      }, 800);
    },
    [batchSave]
  );

  const navigatePilar = useCallback(
    (slug: string | null) => {
      const pending = { ...pendingAnswers.current };
      if (Object.keys(pending).length > 0) {
        Object.keys(autoSaveTimers.current).forEach((id) => clearTimeout(autoSaveTimers.current[id]));
        autoSaveTimers.current = {};
        batchSave(pending);
      }
      setSelectedPilar(slug);
    },
    [batchSave]
  );

  const calculateScoresMut = useMutation({
    mutationFn: () =>
      apiFetch(`/diagnostics/${diagnosticoId}/calculate-scores`, { method: "POST" }),
    onSuccess: () => {
      navigate(`/diagnostico/${diagnosticoId}/resultado`);
    },
    onError: () => {
      toast({ variant: "destructive", title: "Erro ao calcular resultados" });
    },
  });

  if (loadingQuestions || loadingRespostas) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pillars?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <div className="text-center">
          <p className="font-semibold text-lg">Nenhum pilar encontrado</p>
          <p className="text-muted-foreground text-sm">Os pilares do diagnóstico não foram carregados.</p>
        </div>
      </div>
    );
  }

  const pilaresOrdered = [...pillars].sort((a, b) => a.ordem - b.ordem);
  const total = pillars.reduce((sum, p) => sum + p.questionCount, 0);
  const answered = allQuestions.filter((p) => localAnswers[p.id] !== undefined).length;
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;
  const allAnswered = answered === total && total > 0;
  const isSaving = isBatchSaving;

  if (selectedPilar) {
    const pilarQuestions = allQuestions.filter((p) => p.pilarSlug === selectedPilar);
    const pilarMeta = pilaresOrdered.find((p) => p.slug === selectedPilar);
    const pilarIdx = pilaresOrdered.findIndex((p) => p.slug === selectedPilar);
    const prevPilar = pilarIdx > 0 ? pilaresOrdered[pilarIdx - 1] : null;
    const nextPilar = pilarIdx < pilaresOrdered.length - 1 ? pilaresOrdered[pilarIdx + 1] : null;
    const pilarAnswered = pilarQuestions.filter((p) => localAnswers[p.id] !== undefined).length;
    const pilarTotal = pilarMeta?.questionCount ?? pilarQuestions.length;

    return (
      <div className="flex flex-col gap-4 max-w-3xl mx-auto">
        {saveError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
            <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Falha ao salvar</strong> — Verifique sua conexão e continue respondendo.
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigatePilar(null)}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Pilares
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xl">{PILAR_ICONS[selectedPilar] ?? "📋"}</span>
            <div>
              <h1 className="text-lg font-bold leading-tight">{pilarMeta?.nome ?? selectedPilar}</h1>
              <p className="text-xs text-muted-foreground">
                {pilarAnswered} de {pilarTotal} questões respondidas
              </p>
            </div>
          </div>
          {isSaving && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Salvando...
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Progress
            value={pilarTotal > 0 ? Math.round((pilarAnswered / pilarTotal) * 100) : 0}
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{pilarAnswered}/{pilarTotal} respondidas</span>
            {pilarAnswered === pilarTotal && pilarTotal > 0 && (
              <span className="text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Pilar concluído
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {pilarQuestions.map((pergunta) => {
            const isAnswered = localAnswers[pergunta.id] !== undefined;
            return (
              <div
                key={pergunta.id}
                className={`rounded-xl border bg-card shadow-sm p-5 flex flex-col gap-4 transition-all ${
                  isAnswered ? "border-green-200" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        #{pergunta.ordem}
                      </span>
                      {isAnswered && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      )}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">{pergunta.texto}</h3>
                    {pergunta.dica && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{pergunta.dica}</p>
                    )}
                  </div>
                </div>
                <QuestionControl
                  pergunta={pergunta}
                  value={localAnswers[pergunta.id]}
                  onChange={(val) => handleAnswer(pergunta.id, val)}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 pb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigatePilar(prevPilar?.slug ?? null)}
            disabled={!prevPilar}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {prevPilar ? prevPilar.nome.split(" ")[0] : "Anterior"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => navigatePilar(null)}
            className="text-xs"
          >
            Ver todos os pilares
          </Button>

          {nextPilar ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigatePilar(nextPilar.slug)}
            >
              {nextPilar.nome.split(" ")[0]}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => calculateScoresMut.mutate()}
              disabled={calculateScoresMut.isPending || answered === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {calculateScoresMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-1" />
              )}
              Ver Resultado
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {saveError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>Falha ao salvar</strong> — Verifique sua conexão e tente novamente.
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Diagnóstico 360°</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {answered} de {total} questões respondidas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Salvando...
            </span>
          )}
          {answered > 0 && (
            <Button
              onClick={() => calculateScoresMut.mutate()}
              disabled={calculateScoresMut.isPending}
              variant={allAnswered ? "default" : "outline"}
              size="sm"
            >
              {calculateScoresMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {allAnswered ? "Ver Resultado Final" : "Resultado Parcial"}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={progress} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress}% concluído</span>
          <span>{total - answered} restantes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pilaresOrdered.map((pilar) => {
          const pilarQuestions = allQuestions.filter((p) => p.pilarSlug === pilar.slug);
          const pilarAnswered = pilarQuestions.filter((p) => localAnswers[p.id] !== undefined).length;
          const pilarTotal = pilar.questionCount;
          const pilarProgress = pilarTotal > 0 ? Math.round((pilarAnswered / pilarTotal) * 100) : 0;
          const isDone = pilarAnswered === pilarTotal && pilarTotal > 0;
          const pilarColors = PILAR_COLORS[pilar.slug] ?? PILAR_COLORS.compliance;

          return (
            <Card
              key={pilar.slug}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isDone ? "border-green-200 bg-green-50/30" : "hover:border-primary/30"
              }`}
              onClick={() => setSelectedPilar(pilar.slug)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{PILAR_ICONS[pilar.slug] ?? "📋"}</span>
                    <div>
                      <CardTitle className="text-sm font-semibold leading-tight">{pilar.nome}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pilar.questionCount} questões
                      </p>
                    </div>
                  </div>
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Badge variant="outline" className={`text-xs ${pilarColors.text}`}>
                      {pilarAnswered}/{pilarTotal}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isDone ? "bg-green-500" : pilarColors.bg}`}
                      style={{ width: `${pilarProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{pilarProgress}% respondido</span>
                    <span className={`text-xs font-medium ${pilarColors.text}`}>
                      {pilarAnswered === 0 ? "Não iniciado" : isDone ? "Concluído" : "Em andamento"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {answered === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          Clique em um pilar para começar a responder as questões.
        </div>
      )}
    </div>
  );
}
