import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, WifiOff } from "lucide-react";
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

const PILAR_COLORS: Record<string, string> = {
  estrategia: "bg-indigo-500",
  financeiro: "bg-emerald-500",
  contabil: "bg-amber-500",
  marketing: "bg-rose-500",
  operacoes: "bg-cyan-500",
  pessoas: "bg-violet-500",
  tecnologia: "bg-sky-500",
  compliance: "bg-slate-500",
};

export default function DiagnosticoWizard() {
  const params = useParams<{ id: string }>();
  const diagnosticoId = params.id;
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const pilarDeepLink = new URLSearchParams(window.location.search).get("pilar");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState(false);
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { toast } = useToast();

  const { data: perguntas, isLoading: loadingPerguntas } = useQuery<Pergunta[]>({
    queryKey: ["perguntas"],
    queryFn: () => apiFetch("/perguntas"),
    staleTime: Infinity,
  });

  const { data: respostasData, isLoading: loadingRespostas } = useQuery<Resposta[]>({
    queryKey: ["respostas", diagnosticoId],
    queryFn: () => apiFetch(`/diagnostics/${diagnosticoId}/respostas`),
    enabled: !!diagnosticoId,
  });

  useEffect(() => {
    if (!respostasData || !perguntas) return;
    const map: Record<string, string> = {};
    for (const r of respostasData) {
      map[r.perguntaId] = r.valor;
    }
    setLocalAnswers(map);

    if (pilarDeepLink) {
      const pilarIdx = perguntas.findIndex((p) => p.pilarSlug === pilarDeepLink);
      if (pilarIdx !== -1) {
        setCurrentIndex(pilarIdx);
        return;
      }
    }

    const firstUnanswered = perguntas.findIndex((p) => !map[p.id]);
    if (firstUnanswered !== -1) setCurrentIndex(firstUnanswered);
    else if (perguntas.length > 0) setCurrentIndex(perguntas.length - 1);
  }, [respostasData, perguntas, pilarDeepLink]);

  const saveAnswer = useCallback(
    async (perguntaId: string, valor: string) => {
      setSavingMap((m) => ({ ...m, [perguntaId]: true }));
      try {
        await apiFetch(`/diagnostics/${diagnosticoId}/respostas/${perguntaId}`, {
          method: "PUT",
          body: JSON.stringify({ valor }),
        });
        setSavedMap((m) => ({ ...m, [perguntaId]: true }));
        setSaveError(false);
        qc.invalidateQueries({ queryKey: ["respostas", diagnosticoId] });
      } catch {
        setSaveError(true);
        toast({
          variant: "destructive",
          title: "Falha ao salvar resposta",
          description: "Verifique sua conexão e tente novamente.",
        });
      } finally {
        setSavingMap((m) => ({ ...m, [perguntaId]: false }));
      }
    },
    [diagnosticoId, qc, toast]
  );

  const handleAnswer = useCallback(
    (perguntaId: string, valor: string, immediate = false) => {
      setLocalAnswers((prev) => ({ ...prev, [perguntaId]: valor }));
      setSavedMap((m) => ({ ...m, [perguntaId]: false }));

      if (autoSaveTimers.current[perguntaId]) {
        clearTimeout(autoSaveTimers.current[perguntaId]);
      }

      if (immediate) {
        saveAnswer(perguntaId, valor);
      } else {
        autoSaveTimers.current[perguntaId] = setTimeout(() => {
          saveAnswer(perguntaId, valor);
        }, 800);
      }
    },
    [saveAnswer]
  );

  const calculateScoresMut = useMutation({
    mutationFn: () =>
      apiFetch(`/diagnostics/${diagnosticoId}/calculate-scores`, { method: "POST" }),
    onSuccess: () => {
      navigate(`/diagnostico/${diagnosticoId}/resultado`);
    },
  });

  if (loadingPerguntas || loadingRespostas) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!perguntas?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <div className="text-center">
          <p className="font-semibold text-lg">Nenhuma questão encontrada</p>
          <p className="text-muted-foreground text-sm">As questões do diagnóstico não foram carregadas.</p>
        </div>
      </div>
    );
  }

  const answered = perguntas.filter((p) => localAnswers[p.id] !== undefined).length;
  const total = perguntas.length;
  const progress = Math.round((answered / total) * 100);
  const allAnswered = answered === total;

  const pilares = Array.from(new Set(perguntas.map((p) => p.pilarSlug))).sort(
    (a, b) =>
      (perguntas.find((p) => p.pilarSlug === a)?.pilarOrdem ?? 0) -
      (perguntas.find((p) => p.pilarSlug === b)?.pilarOrdem ?? 0)
  );

  const currentPergunta = perguntas[currentIndex];
  const currentValue = localAnswers[currentPergunta?.id ?? ""];
  const isSaving = savingMap[currentPergunta?.id ?? ""];
  const isSaved = savedMap[currentPergunta?.id ?? ""];

  const goTo = (idx: number) => {
    if (idx >= 0 && idx < perguntas.length) setCurrentIndex(idx);
  };

  const pilarQuestions = perguntas.filter((p) => p.pilarSlug === currentPergunta?.pilarSlug);
  const pilarAnswered = pilarQuestions.filter((p) => localAnswers[p.id] !== undefined).length;

  const EXPECTED_QUESTIONS = 150;
  const isPartialSeed = total > 0 && total < EXPECTED_QUESTIONS;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {isPartialSeed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Modo de banco de questões reduzido</strong> — Apenas {total} de {EXPECTED_QUESTIONS} questões foram carregadas.
            As pontuações podem não refletir a avaliação completa. Verifique o banco de questões.
          </div>
        </div>
      )}
      {saveError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Falha ao salvar resposta</strong> — Algumas respostas podem não ter sido registradas.
            Verifique sua conexão e continue respondendo; o sistema tentará salvar novamente.
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Diagnóstico 360°</h1>
          <p className="text-sm text-muted-foreground">
            {answered} de {total} questões respondidas
          </p>
        </div>
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
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            {allAnswered ? "Ver Resultado" : "Resultado Parcial"}
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Progress value={progress} className="h-2" />
        <div className="flex gap-1 flex-wrap">
          {pilares.map((slug) => {
            const pqs = perguntas.filter((p) => p.pilarSlug === slug);
            const pAns = pqs.filter((p) => localAnswers[p.id] !== undefined).length;
            const isActive = currentPergunta?.pilarSlug === slug;
            const isDone = pAns === pqs.length;
            return (
              <button
                key={slug}
                onClick={() => {
                  const idx = perguntas.findIndex((p) => p.pilarSlug === slug);
                  goTo(idx);
                }}
                className={`h-2 flex-1 rounded-full transition-all ${
                  isActive
                    ? (PILAR_COLORS[slug] ?? "bg-primary")
                    : isDone
                    ? "bg-green-400"
                    : "bg-muted"
                }`}
                title={perguntas.find((p) => p.pilarSlug === slug)?.pilarNome}
              />
            );
          })}
        </div>
      </div>

      {currentPergunta && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Badge
              className={`text-white text-xs ${PILAR_COLORS[currentPergunta.pilarSlug] ?? "bg-primary"}`}
            >
              {currentPergunta.pilarNome}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {pilarAnswered}/{pilarQuestions.length} neste pilar
            </span>
          </div>

          <div className="rounded-xl border bg-card shadow-sm p-6 flex flex-col gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Questão {currentIndex + 1} de {total}
              </p>
              <h2 className="text-lg font-semibold leading-snug">{currentPergunta.texto}</h2>
              {currentPergunta.dica && (
                <p className="text-xs text-muted-foreground mt-2 italic">{currentPergunta.dica}</p>
              )}
            </div>

            {currentPergunta.tipo === "sim_nao" && (
              <div className="grid grid-cols-2 gap-3">
                {(["sim", "nao"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => handleAnswer(currentPergunta.id, opt, true)}
                    className={`py-6 rounded-xl border-2 text-lg font-bold transition-all ${
                      currentValue === opt
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
            )}

            {currentPergunta.tipo === "escala_1_5" && (
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((val) => {
                  const info = ESCALA_LABELS[val];
                  const isSelected = currentValue === String(val);
                  return (
                    <button
                      key={val}
                      onClick={() => handleAnswer(currentPergunta.id, String(val), true)}
                      className={`flex flex-col items-center gap-1 py-4 px-2 rounded-xl border-2 transition-all ${
                        isSelected ? ESCALA_SELECTED[val] : `${info.color} border-transparent`
                      }`}
                    >
                      <span className="text-2xl font-bold">{val}</span>
                      <span className="text-xs font-medium">{info.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentPergunta.tipo === "texto_livre" && (
              <Textarea
                value={currentValue ?? ""}
                onChange={(e) => handleAnswer(currentPergunta.id, e.target.value)}
                placeholder="Digite sua resposta..."
                rows={4}
                className="resize-none"
              />
            )}

            {currentPergunta.tipo === "numerico" && (
              <div className="flex flex-col gap-1">
                <Input
                  type="number"
                  value={currentValue ?? ""}
                  onChange={(e) => handleAnswer(currentPergunta.id, e.target.value)}
                  placeholder={
                    currentPergunta.valorMin != null && currentPergunta.valorMax != null
                      ? `${currentPergunta.valorMin} – ${currentPergunta.valorMax}`
                      : "Digite um número..."
                  }
                  min={currentPergunta.valorMin ?? undefined}
                  max={currentPergunta.valorMax ?? undefined}
                  className="text-lg h-12 text-center"
                />
                {currentPergunta.valorMin != null && currentPergunta.valorMax != null && (
                  <p className="text-xs text-muted-foreground text-center">
                    Intervalo: {currentPergunta.valorMin} a {currentPergunta.valorMax}
                    {currentPergunta.inverso && " (menor é melhor)"}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground min-w-20">
                {isSaving && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</span>}
                {!isSaving && isSaved && <span className="text-green-600">✓ Salvo</span>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goTo(currentIndex - 1)}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goTo(currentIndex + 1)}
                  disabled={currentIndex === perguntas.length - 1}
                >
                  Próxima
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex gap-1 flex-wrap">
            {pilarQuestions.map((p) => {
              const isAnswered = localAnswers[p.id] !== undefined;
              const isCurrent = p.id === currentPergunta.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    const idx = perguntas.findIndex((x) => x.id === p.id);
                    goTo(idx);
                  }}
                  className={`w-7 h-7 rounded text-xs font-medium transition-all ${
                    isCurrent
                      ? `${PILAR_COLORS[p.pilarSlug] ?? "bg-primary"} text-white`
                      : isAnswered
                      ? "bg-green-100 text-green-800 border border-green-300"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {p.ordem}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
