import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Building2,
  LogOut,
  PartyPopper,
  UserCheck,
  X,
  ArrowLeft,
} from "lucide-react";
import { DelegateQuestionsModal } from "@/components/diagnostic/delegate-questions-modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getRespondentToken,
  getRespondentIdentity,
  clearRespondentSession,
} from "./index";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Pergunta {
  id: string;
  pilarSlug: string;
  pilarNome: string;
  pilarOrdem: number;
  texto: string;
  tipo: "sim_nao" | "escala_1_5" | "texto_livre" | "numerico";
  peso: number;
  ordem: number;
  dica?: string | null;
  valorMin?: number | null;
  valorMax?: number | null;
  inverso?: boolean;
}

interface Resposta {
  id: string;
  perguntaId: string;
  valor: string;
  respondidoEm: string;
}

interface Progress {
  totalGlobal: number;
  answeredGlobal: number;
  pilarTotal: number;
  pilarAnswered: number;
  pilarDelegated?: number;
  pilarPending?: number;
}

interface DelegatedOut {
  id: string;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  prazo: string | null;
  status: string;
  perguntaIds: string[];
  inviteSentAt: string | null;
  inviteRedeemedAt: string | null;
}

interface ContextResponse {
  delegacaoId: string;
  clinicId: string;
  clinicNome: string | null;
  diagnosticoId: string;
  diagnosticoStatus: string;
  pilarSlug: string;
  pilarNome: string;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  prazo: string | null;
  nivel: number;
  perguntaIds: string[] | null;
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

/**
 * Lê delegacaoId da query (`?delegacaoId=...`).
 * Compat v:1: se a URL não trouxer, cai pro delegacaoId herdado da
 * identidade (que veio no payload do redeem antigo).
 */
function readDelegacaoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("delegacaoId");
  if (fromUrl) return fromUrl;
  const ident = getRespondentIdentity();
  return ident?.delegacaoId ?? null;
}

function withDelegacao(path: string, delegacaoId: string | null): string {
  if (!delegacaoId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}delegacaoId=${encodeURIComponent(delegacaoId)}`;
}

function respFetch(path: string, init?: RequestInit) {
  const token = getRespondentToken();
  return fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

async function respJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await respFetch(path, init);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

function QuestionControl({
  pergunta,
  value,
  onChange,
  disabled,
}: {
  pergunta: Pergunta;
  value: string | undefined;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  if (pergunta.tipo === "sim_nao") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {(["sim", "nao"] as const).map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`py-4 rounded-xl border-2 text-base font-bold transition-all disabled:opacity-50 ${
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
          const selected = value === String(val);
          return (
            <button
              key={val}
              disabled={disabled}
              onClick={() => onChange(String(val))}
              className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl border-2 transition-all disabled:opacity-50 ${
                selected ? ESCALA_SELECTED[val] : `${info.color} border-transparent`
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
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite sua resposta..."
        rows={3}
        className="resize-none"
      />
    );
  }
  if (pergunta.tipo === "numerico") {
    return (
      <Input
        type="number"
        disabled={disabled}
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
    );
  }
  return null;
}

export default function ResponderWizard() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const token = getRespondentToken();
  const identity = getRespondentIdentity();
  // Lido uma única vez por montagem (URL não muda enquanto este componente
  // está montado — a navegação entre delegações desmonta e remonta).
  const [delegacaoId] = useState<string | null>(() => readDelegacaoId());

  useEffect(() => {
    if (!token || !identity) navigate("/responder", { replace: true });
  }, [token, identity, navigate]);

  // Sem delegacaoId não há o que carregar — volta pro hub.
  useEffect(() => {
    if (token && identity && !delegacaoId) navigate("/responder", { replace: true });
  }, [token, identity, delegacaoId, navigate]);

  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showThanks, setShowThanks] = useState(false);
  const [selectedQs, setSelectedQs] = useState<Set<string>>(new Set());
  const [delegateModal, setDelegateModal] = useState<{ perguntaIds: string[] } | null>(null);
  const pendingAnswers = useRef<Record<string, string>>({});
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toggleSelect = useCallback((id: string) => {
    setSelectedQs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedQs(new Set()), []);

  // task #225: o contexto agora vem do servidor (não da sessionStorage),
  // já que o token v:2 é por identidade e o pilar é determinado pela
  // delegacaoId da URL.
  const contextQuery = useQuery<ContextResponse>({
    queryKey: ["respondent-context", delegacaoId],
    queryFn: () => respJson<ContextResponse>(withDelegacao("/respondent/context", delegacaoId)),
    enabled: !!token && !!delegacaoId,
  });

  const questionsQuery = useQuery<Pergunta[]>({
    queryKey: ["respondent-questions", delegacaoId],
    queryFn: () => respJson<Pergunta[]>(withDelegacao("/respondent/questions", delegacaoId)),
    enabled: !!token && !!delegacaoId,
  });

  const respostasQuery = useQuery<Resposta[]>({
    queryKey: ["respondent-respostas", delegacaoId],
    queryFn: () => respJson<Resposta[]>(withDelegacao("/respondent/respostas", delegacaoId)),
    enabled: !!token && !!delegacaoId,
  });

  const progressQuery = useQuery<Progress>({
    queryKey: ["respondent-progress", delegacaoId],
    queryFn: () => respJson<Progress>(withDelegacao("/respondent/progress", delegacaoId)),
    enabled: !!token && !!delegacaoId,
    refetchInterval: 30000,
  });

  const delegatedOutQuery = useQuery<DelegatedOut[]>({
    queryKey: ["respondent-delegated-out", delegacaoId],
    queryFn: () =>
      respJson<DelegatedOut[]>(withDelegacao("/respondent/delegated-out", delegacaoId)),
    enabled: !!token && !!delegacaoId,
    refetchInterval: 30000,
  });

  const delegByPergunta = useMemo(() => {
    const m = new Map<string, DelegatedOut>();
    for (const d of delegatedOutQuery.data ?? []) {
      for (const pid of d.perguntaIds) m.set(pid, d);
    }
    return m;
  }, [delegatedOutQuery.data]);

  useEffect(() => {
    if (!respostasQuery.data) return;
    const map: Record<string, string> = {};
    for (const r of respostasQuery.data) map[r.perguntaId] = r.valor;
    setLocalAnswers(map);
  }, [respostasQuery.data]);

  const batchSave = useCallback(
    async (answers: Record<string, string>) => {
      const respostas = Object.entries(answers).map(([perguntaId, valor]) => ({ perguntaId, valor }));
      if (respostas.length === 0) return;
      setIsSaving(true);
      try {
        const res = await respFetch(withDelegacao("/respondent/respostas/batch", delegacaoId), {
          method: "POST",
          body: JSON.stringify({ respostas, delegacaoId }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            toast({
              variant: "destructive",
              title: "Diagnóstico encerrado",
              description: "Este diagnóstico já foi concluído pelo gestor.",
            });
          }
          throw new Error("save failed");
        }
        setSaveError(false);
        pendingAnswers.current = {};
        qc.invalidateQueries({ queryKey: ["respondent-progress", delegacaoId] });
      } catch {
        setSaveError(true);
        toast({
          variant: "destructive",
          title: "Falha ao salvar",
          description: "Verifique sua conexão. Suas respostas ficarão salvas localmente.",
        });
      } finally {
        setIsSaving(false);
      }
    },
    [qc, toast, delegacaoId],
  );

  const handleAnswer = useCallback(
    (perguntaId: string, valor: string) => {
      setLocalAnswers((prev) => ({ ...prev, [perguntaId]: valor }));
      pendingAnswers.current[perguntaId] = valor;
      if (autoSaveTimers.current[perguntaId]) clearTimeout(autoSaveTimers.current[perguntaId]);
      autoSaveTimers.current[perguntaId] = setTimeout(() => {
        batchSave({ [perguntaId]: pendingAnswers.current[perguntaId] ?? valor });
      }, 800);
    },
    [batchSave],
  );

  const questions = questionsQuery.data ?? [];
  const ctx = contextQuery.data;
  const progress = progressQuery.data;
  const pilarAnswered = useMemo(
    () => questions.filter((q) => localAnswers[q.id] !== undefined && localAnswers[q.id] !== "").length,
    [questions, localAnswers],
  );
  const pilarTotal = questions.length;
  const pilarPct = pilarTotal > 0 ? Math.round((pilarAnswered / pilarTotal) * 100) : 0;
  const globalPct =
    progress && progress.totalGlobal > 0
      ? Math.round((progress.answeredGlobal / progress.totalGlobal) * 100)
      : 0;

  if (!token || !identity || !delegacaoId) return null;

  if (
    questionsQuery.isLoading ||
    respostasQuery.isLoading ||
    contextQuery.isLoading
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (questionsQuery.isError || contextQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Pilar indisponível</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Este pilar não está mais disponível. Pode ter sido removido ou
              reatribuído pelo gestor.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => navigate("/responder", { replace: true })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar aos meus pilares
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clearRespondentSession();
                  navigate("/responder/saiu", { replace: true });
                }}
              >
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // /respondent/questions já EXCLUI as perguntas que este respondente delegou
  // adiante. Para a UI de progresso/conclusão usamos o /respondent/progress
  // (autoritativo, calcula sobre o escopo total — pilar inteiro em N1 ou
  // perguntaIds em N3 — separando respondidas/delegadas/pendentes).
  const pilarDelegated = progress?.pilarDelegated ?? delegByPergunta.size;
  const totalScope = progress?.pilarTotal ?? (pilarTotal + pilarDelegated);
  const pendingScope =
    progress?.pilarPending ?? Math.max(0, totalScope - pilarAnswered - pilarDelegated);
  const completed = pendingScope === 0 && totalScope > 0;

  if (showThanks) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <PartyPopper className="h-7 w-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Obrigado!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Suas respostas foram enviadas. Você pode voltar para escolher
              outro pilar ou sair com tranquilidade.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => navigate("/responder", { replace: true })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar aos meus pilares
              </Button>
              <Button variant="outline" onClick={() => setShowThanks(false)}>
                Revisar minhas respostas
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const clinic = ctx?.clinicNome ?? identity.clinicNome;
                  clearRespondentSession();
                  navigate(
                    clinic
                      ? `/responder/saiu?clinic=${encodeURIComponent(clinic)}`
                      : "/responder/saiu",
                    { replace: true },
                  );
                }}
              >
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const clinicNome = ctx?.clinicNome ?? identity.clinicNome;
  const pilarNome = ctx?.pilarNome ?? identity.pilarNome ?? "Pilar";
  const responsavelNome = ctx?.responsavelNome ?? identity.responsavelNome;
  const diagnosticoStatus = ctx?.diagnosticoStatus ?? identity.diagnosticoStatus;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none">IONEX360</p>
              <p className="text-sm font-semibold leading-tight truncate">
                {clinicNome ?? "Diagnóstico"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/responder", { replace: false })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Meus pilares
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const clinic = clinicNome;
                clearRespondentSession();
                navigate(
                  clinic
                    ? `/responder/saiu?clinic=${encodeURIComponent(clinic)}`
                    : "/responder/saiu",
                  { replace: true },
                );
              }}
            >
              <LogOut className="h-4 w-4 mr-1" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-6">
        {saveError && (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
            <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Falha ao salvar.</strong> Verifique sua internet — vamos tentar novamente automaticamente.
            </span>
          </div>
        )}

        {/* Pilar header */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <Badge variant="secondary" className="mb-2">Seu pilar</Badge>
                <CardTitle className="text-xl">{pilarNome}</CardTitle>
                {responsavelNome && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Respondendo como <strong>{responsavelNome}</strong>
                  </p>
                )}
              </div>
              {isSaving && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
                </Badge>
              )}
              {!isSaving && completed && (
                <Badge variant="default" className="bg-green-600 hover:bg-green-600 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Pilar concluído
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso do seu pilar</span>
                <span>
                {pilarAnswered} respondidas
                {pilarDelegated > 0 ? ` · ${pilarDelegated} delegadas` : ""}
                {" "}/ {pilarTotal}
              </span>
              </div>
              <Progress value={pilarPct} />
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso geral do diagnóstico</span>
                <span>{progress?.answeredGlobal ?? 0} / {progress?.totalGlobal ?? 0}</span>
              </div>
              <Progress value={globalPct} className="opacity-70" />
            </div>
          </CardContent>
        </Card>

        {diagnosticoStatus === "concluido" && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Este diagnóstico já foi <strong>encerrado pelo gestor</strong>. Você pode revisar suas respostas, mas
              elas não podem mais ser editadas.
            </span>
          </div>
        )}

        {/* Delegadas por mim */}
        {(delegatedOutQuery.data?.length ?? 0) > 0 && (
          <Card className="border-violet-200 bg-violet-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-violet-700" />
                Delegadas por mim ({delegatedOutQuery.data!.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {delegatedOutQuery.data!.map((d) => {
                const status = d.inviteRedeemedAt
                  ? "aceito"
                  : d.inviteSentAt
                    ? "convite enviado"
                    : "rascunho";
                const statusColor = d.inviteRedeemedAt
                  ? "bg-green-100 text-green-800 border-green-300"
                  : d.inviteSentAt
                    ? "bg-blue-100 text-blue-800 border-blue-300"
                    : "bg-gray-100 text-gray-700 border-gray-300";
                return (
                  <div key={d.id} className="rounded-md border bg-background px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {d.responsavelNome ?? d.responsavelEmail ?? "Sem destinatário"}
                      </p>
                      <p className="text-muted-foreground">
                        {d.perguntaIds.length} pergunta{d.perguntaIds.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${statusColor}`}>{status}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Questions */}
        <div className="flex flex-col gap-4">
          {questions.filter((q) => !delegByPergunta.has(q.id)).map((q, idx) => {
            const deleg = delegByPergunta.get(q.id);
            const isSelected = selectedQs.has(q.id);
            const canDelegate = diagnosticoStatus !== "concluido" && !deleg;
            return (
              <Card
                key={q.id}
                className={isSelected ? "ring-2 ring-violet-300 border-violet-300" : ""}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {canDelegate ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-violet-600 cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelect(q.id)}
                        aria-label={`Selecionar pergunta ${idx + 1} para delegar`}
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {idx + 1}
                      </span>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium leading-snug">{q.texto}</p>
                      {q.dica && <p className="text-xs text-muted-foreground mt-1">{q.dica}</p>}
                      {deleg && (
                        <Badge variant="secondary" className="text-[10px] mt-1 gap-1">
                          <UserCheck className="h-3 w-3" />
                          Delegada para {deleg.responsavelNome ?? deleg.responsavelEmail ?? "—"}
                        </Badge>
                      )}
                    </div>
                    {canDelegate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs shrink-0"
                        onClick={() => setDelegateModal({ perguntaIds: [q.id] })}
                      >
                        <UserCheck className="h-3 w-3 mr-1" /> Delegar
                      </Button>
                    )}
                    {localAnswers[q.id] !== undefined && localAnswers[q.id] !== "" && (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-1" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <QuestionControl
                    pergunta={q}
                    value={localAnswers[q.id]}
                    onChange={(val) => handleAnswer(q.id, val)}
                    disabled={diagnosticoStatus === "concluido"}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {selectedQs.size > 0 ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="gap-1">
                {selectedQs.size} selecionada{selectedQs.size === 1 ? "" : "s"}
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
              <Button
                size="sm"
                onClick={() => setDelegateModal({ perguntaIds: Array.from(selectedQs) })}
              >
                <UserCheck className="h-3 w-3 mr-1" /> Delegar selecionadas
              </Button>
            </div>
          ) : (
            <div />
          )}
          {completed && diagnosticoStatus !== "concluido" && (
            <Button onClick={() => setShowThanks(true)}>
              Concluir pilar
              <CheckCircle2 className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </main>

      {delegateModal && ctx && (
        <DelegateQuestionsModal
          mode="respondent"
          open
          onClose={() => setDelegateModal(null)}
          perguntaIds={delegateModal.perguntaIds}
          pilarSlug={ctx.pilarSlug}
          pilarNome={ctx.pilarNome}
          diagnosticoId={ctx.diagnosticoId}
          delegacaoId={delegacaoId}
          onSuccess={() => {
            clearSelection();
            setDelegateModal(null);
          }}
        />
      )}
    </div>
  );
}
