import { useState, useEffect, useMemo, useRef } from "react";
import { BancoPerguntasDialog } from "@/components/banco-perguntas-dialog";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken, useCurrentRole } from "@/hooks/use-auth";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserX,
  UserCheck,
  ArrowLeft,
  Search,
  Pencil,
  Trash2,
  FilePlus,
  BookOpen,
  Mail,
  Send,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(`${BASE}${path}`, { ...init, headers });
}

// ─── Types ──────────────────────────────────────────────────────────────────

type DiagnosticoStatus = "em_andamento" | "concluido" | "arquivado";

interface DiagnosticoSummary {
  id: string;
  versao: number;
  status: DiagnosticoStatus;
  iniciadoEm: string;
  concluidoEm: string | null;
  scoreGlobal: number | null;
}

interface PerguntaTipo {
  id: string;
  pilarSlug: string;
  pilarNome: string;
  pilarOrdem: number;
  texto: string;
  tipo: "sim_nao" | "escala_1_5" | "numerico" | "texto_livre";
  peso: number;
  ordem: number;
  dica: string | null;
  valorMin: number | null;
  valorMax: number | null;
  inverso: boolean;
}

interface RespostaTipo {
  id: string;
  perguntaId: string;
  valor: string;
  respondidoEm: string;
}

interface PilarSummary {
  slug: string;
  nome: string;
  ordem: number;
  questionCount: number;
  answeredCount: number;
}

interface TeamMember {
  id: string;
  nome: string;
  email: string | null;
  funcao: string | null;
  whatsapp?: string | null;
}

interface HydratedDiagnostic {
  diagnostic: {
    id: string;
    clinicId: string;
    versao: number;
    status: DiagnosticoStatus;
    iniciadoEm: string;
    concluidoEm: string | null;
    scoreGlobal: number | null;
    scoresPilares: Record<string, number> | null;
  };
  pillars: PilarSummary[];
  questions: PerguntaTipo[];
  respostas: RespostaTipo[];
  delegacoes: Delegacao[];
  team: TeamMember[];
}

interface Delegacao {
  id: string;
  clinicId: string;
  pilarSlug: string;
  pilarNome: string;
  nivel: number;
  responsavelNome: string | null;
  responsavelEmail: string | null;
  prazo: string | null;
  status: string;
  questaoInicio: number | null;
  questaoFim: number | null;
  parentId: string | null;
  observacoes: string | null;
  inviteSentAt?: string | null;
  inviteRedeemedAt?: string | null;
  inviteCodeExpiresAt?: string | null;
  inviteDiagnosticoId?: string | null;
  inviteStatus?: "nao_enviado" | "enviado" | "aceito" | "expirado";
}

const INVITE_BADGE: Record<string, { className: string }> = {
  nao_enviado: { className: "bg-muted text-muted-foreground" },
  enviado: { className: "bg-blue-100 text-blue-800 border-blue-300" },
  aceito: { className: "bg-green-100 text-green-800 border-green-300" },
  expirado: { className: "bg-amber-100 text-amber-900 border-amber-300" },
};

function formatDateBR(value: string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pt-BR");
}

function inviteBadgeLabel(
  delegacao: Delegacao,
  answered: number,
  total: number,
): string {
  const status = delegacao.inviteStatus ?? "nao_enviado";
  if (status === "nao_enviado") return "Não enviado";
  if (status === "enviado")
    return `Enviado em ${formatDateBR(delegacao.inviteSentAt) ?? "—"}`;
  if (status === "expirado")
    return `Expirado em ${formatDateBR(delegacao.inviteCodeExpiresAt) ?? "—"}`;
  // aceito
  return total > 0
    ? `Aberto · ${answered} de ${total} respondidas`
    : "Aberto";
}

function InviteStatusBadge({
  clinicId,
  diagnosticoId,
  delegacao,
  answered,
  total,
}: {
  clinicId: string;
  diagnosticoId: string;
  delegacao: Delegacao;
  answered: number;
  total: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const status = delegacao.inviteStatus ?? "nao_enviado";
  const cfg = INVITE_BADGE[status];
  const label = inviteBadgeLabel(delegacao, answered, total);
  const pct = total === 0 ? 0 : Math.round((answered / total) * 100);

  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(
        `/api/clinics/${clinicId}/diagnostics/${diagnosticoId}/delegacoes/${delegacao.id}/send-invite`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Erro ao gerar link");
      }
      return res.json() as Promise<{ ok: boolean; sent: boolean; to: string; link: string }>;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      try {
        await navigator.clipboard.writeText(data.link);
        toast({
          title: "Link copiado",
          description: `Novo link gerado e copiado. E-mail ${data.sent ? "também enviado" : "não pôde ser enviado"} para ${data.to}.`,
        });
      } catch {
        toast({ title: "Link gerado", description: data.link });
      }
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Não foi possível gerar o link", description: err.message }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center"
          aria-label="Ver detalhes do convite"
        >
          <Badge
            variant="outline"
            className={`text-[10px] gap-1 cursor-pointer ${cfg.className}`}
          >
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Convite individual
          </div>
          <div className="font-semibold">{delegacao.pilarNome}</div>
          {delegacao.responsavelEmail && (
            <div className="text-xs text-muted-foreground">{delegacao.responsavelEmail}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Enviado em</div>
            <div className="font-medium">{formatDateBR(delegacao.inviteSentAt) ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Aberto em</div>
            <div className="font-medium">
              {formatDateBR(delegacao.inviteRedeemedAt) ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Expira em</div>
            <div className="font-medium">
              {formatDateBR(delegacao.inviteCodeExpiresAt) ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-medium capitalize">{status.replace("_", " ")}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Respostas do pilar</span>
            <span>
              {answered}/{total} ({pct}%)
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="pt-1 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            disabled={!delegacao.responsavelEmail || sendMut.isPending}
            onClick={() => sendMut.mutate()}
            title={
              !delegacao.responsavelEmail
                ? "Adicione um e-mail antes de gerar o link"
                : "Gera um novo link, envia por e-mail e copia para a área de transferência"
            }
          >
            {sendMut.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Mail className="h-3 w-3 mr-1" />
            )}
            {status === "nao_enviado" ? "Enviar e copiar link" : "Reenviar e copiar link"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Status visuals ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  nao_delegado: { label: "Não delegado", variant: "outline", icon: <UserX className="h-3 w-3" /> },
  pendente: { label: "Pendente", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  andamento: { label: "Em andamento", variant: "default", icon: <RefreshCw className="h-3 w-3" /> },
  concluido: { label: "Concluído", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
  atrasado: { label: "Atrasado", variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
};

// ─── Data hooks ─────────────────────────────────────────────────────────────

async function fetchDiagnosticsList(clinicId: string): Promise<DiagnosticoSummary[]> {
  const res = await authFetch(`/api/clinics/${clinicId}/diagnostics`);
  if (!res.ok) throw new Error("Failed to fetch diagnostics");
  const data = await res.json();
  return data.map(
    (d: {
      id: string;
      versao: number;
      status: DiagnosticoStatus;
      iniciadoEm: string;
      concluidoEm: string | null;
      scoreGlobal: number | null;
    }) => ({
      id: d.id,
      versao: d.versao,
      status: d.status,
      iniciadoEm: d.iniciadoEm,
      concluidoEm: d.concluidoEm,
      scoreGlobal: d.scoreGlobal,
    })
  );
}

async function fetchHydrated(clinicId: string, diagnosticoId: string): Promise<HydratedDiagnostic> {
  const res = await authFetch(`/api/clinics/${clinicId}/diagnostics/${diagnosticoId}/hydrated`);
  if (!res.ok) throw new Error("Failed to fetch hydrated diagnostic");
  return res.json();
}

// ─── Page entry ─────────────────────────────────────────────────────────────

export default function DelegacaoPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;

  if (!clinicId) {
    return <ClinicSelector />;
  }
  return <DelegacaoBoard clinicId={clinicId} />;
}

// ─── Main board ─────────────────────────────────────────────────────────────

function DelegacaoBoard({ clinicId }: { clinicId: string }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentRole();
  const isSuperAdmin = currentUser?.role === "super_admin";

  // ─ Diagnostic selector ──
  const { data: diagnostics = [], isLoading: isLoadingDiags } = useQuery({
    queryKey: ["diagnostics", clinicId],
    queryFn: () => fetchDiagnosticsList(clinicId),
    enabled: !!clinicId,
  });

  const queryDiagnosticoId = useMemo(() => {
    const sp = new URLSearchParams(search);
    return sp.get("diagnostico");
  }, [search]);

  const localStorageKey = `ccp_delegacao_diag_${clinicId}`;

  const defaultDiagnosticoId = useMemo(() => {
    if (queryDiagnosticoId) return queryDiagnosticoId;
    const stored = typeof window !== "undefined" ? localStorage.getItem(localStorageKey) : null;
    if (stored && diagnostics.some((d) => d.id === stored)) return stored;
    // Prefer the LATEST em_andamento (sort iniciadoEm desc), then latest concluido.
    const inProgress = [...diagnostics]
      .filter((d) => d.status === "em_andamento")
      .sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm));
    if (inProgress.length > 0) return inProgress[0].id;
    const concluded = [...diagnostics]
      .filter((d) => d.status === "concluido")
      .sort((a, b) => b.iniciadoEm.localeCompare(a.iniciadoEm));
    if (concluded.length > 0) return concluded[0].id;
    return diagnostics[0]?.id ?? null;
  }, [queryDiagnosticoId, diagnostics, localStorageKey]);

  const [selectedDiagId, setSelectedDiagId] = useState<string | null>(null);
  useEffect(() => {
    if (defaultDiagnosticoId && selectedDiagId !== defaultDiagnosticoId) {
      setSelectedDiagId(defaultDiagnosticoId);
    }
  }, [defaultDiagnosticoId]);

  useEffect(() => {
    if (selectedDiagId) localStorage.setItem(localStorageKey, selectedDiagId);
  }, [selectedDiagId, localStorageKey]);

  const createDiagMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/api/clinics/${clinicId}/diagnostics`, { method: "POST" });
      if (!res.ok) throw new Error("Falha ao criar diagnóstico");
      return res.json() as Promise<DiagnosticoSummary>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["diagnostics", clinicId] });
      setSelectedDiagId(created.id);
      toast({ title: "Diagnóstico criado", description: `Versão ${created.versao} iniciada.` });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao criar diagnóstico" }),
  });

  // ─ Hydrated load ──
  const {
    data: hydrated,
    isLoading: isLoadingHydrated,
    isFetching: isFetchingHydrated,
  } = useQuery({
    queryKey: ["delegacao-hydrated", clinicId, selectedDiagId],
    queryFn: () => fetchHydrated(clinicId, selectedDiagId!),
    enabled: !!clinicId && !!selectedDiagId,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const data = query.state.data as HydratedDiagnostic | undefined;
      if (data && data.diagnostic.status !== "em_andamento") return false;
      return 7000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Delegacoes & team now come from the hydrated payload — no extra round-trip.
  const delegacoes = hydrated?.delegacoes ?? [];
  const team = hydrated?.team ?? [];

  const isLoading = isLoadingDiags || (!!selectedDiagId && isLoadingHydrated);

  const [showBancoDialog, setShowBancoDialog] = useState(false);

  // Auto-create a first diagnostic if none exists
  const autoCreated = useRef(false);
  useEffect(() => {
    if (
      !autoCreated.current &&
      !isLoadingDiags &&
      diagnostics.length === 0 &&
      isSuperAdmin &&
      !createDiagMut.isPending
    ) {
      autoCreated.current = true;
      createDiagMut.mutate();
    }
  }, [isLoadingDiags, diagnostics.length, isSuperAdmin]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/me/clinicas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Delegação do Diagnóstico</h1>
          <p className="text-sm text-muted-foreground">
            Responda às perguntas, delegue por pilar, módulo ou pergunta individual.
          </p>
        </div>
        <DiagnosticPicker
          diagnostics={diagnostics}
          value={selectedDiagId}
          onChange={(id) => setSelectedDiagId(id)}
          onCreate={() => createDiagMut.mutate()}
          creating={createDiagMut.isPending}
          canCreate={true}
        />
        {isSuperAdmin && (
          <Button variant="outline" size="sm" onClick={() => setShowBancoDialog(true)}>
            <BookOpen className="h-4 w-4 mr-1" /> Banco de perguntas
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !selectedDiagId ? (
        <EmptyDiagnosticState
          canCreate={isSuperAdmin}
          onCreate={() => createDiagMut.mutate()}
          creating={createDiagMut.isPending}
        />
      ) : hydrated ? (
        <>
          {isFetchingHydrated && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Atualizando…
            </div>
          )}
          <DiagnosticHeader hydrated={hydrated} />
          <PilaresTable
            clinicId={clinicId}
            hydrated={hydrated}
            delegacoes={delegacoes}
            team={team}
            isSuperAdmin={isSuperAdmin}
            diagnosticoId={selectedDiagId}
          />
        </>
      ) : null}

      {showBancoDialog && (
        <BancoPerguntasDialog onClose={() => setShowBancoDialog(false)} />
      )}
    </div>
  );
}

// ─── Diagnostic picker ──────────────────────────────────────────────────────

function DiagnosticPicker({
  diagnostics,
  value,
  onChange,
  onCreate,
  creating,
  canCreate,
}: {
  diagnostics: DiagnosticoSummary[];
  value: string | null;
  onChange: (id: string) => void;
  onCreate: () => void;
  creating: boolean;
  canCreate: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {diagnostics.length > 0 && (
        <Select value={value ?? undefined} onValueChange={onChange}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Selecionar diagnóstico" />
          </SelectTrigger>
          <SelectContent>
            {diagnostics.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                v{d.versao} — {d.status === "em_andamento" ? "Em andamento" : d.status === "concluido" ? "Concluído" : "Arquivado"}
                {d.iniciadoEm && (
                  <span className="text-muted-foreground ml-1">
                    ({new Date(d.iniciadoEm).toLocaleDateString("pt-BR")})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {canCreate && (
        <Button size="sm" variant="outline" onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          Novo
        </Button>
      )}
    </div>
  );
}

function EmptyDiagnosticState({
  canCreate,
  onCreate,
  creating,
}: {
  canCreate: boolean;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="border rounded-lg p-8 bg-muted/30 flex flex-col items-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <div>
        <p className="font-semibold">Nenhum diagnóstico ativo</p>
        <p className="text-sm text-muted-foreground mt-1">
          {canCreate
            ? "Inicie um diagnóstico para começar a responder e delegar pilares."
            : "Solicite ao super admin que inicie um diagnóstico para esta clínica."}
        </p>
      </div>
      {canCreate && (
        <Button onClick={onCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Iniciar diagnóstico
        </Button>
      )}
    </div>
  );
}

function DiagnosticHeader({ hydrated }: { hydrated: HydratedDiagnostic }) {
  const totalQuestions = hydrated.pillars.reduce((s, p) => s + p.questionCount, 0);
  const totalAnswered = hydrated.pillars.reduce((s, p) => s + p.answeredCount, 0);
  const pct = totalQuestions === 0 ? 0 : Math.round((totalAnswered / totalQuestions) * 100);

  return (
    <div className="border rounded-lg p-4 bg-card flex flex-wrap items-center gap-6">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Diagnóstico</div>
        <div className="font-semibold">v{hydrated.diagnostic.versao}</div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Status</div>
        <Badge variant={hydrated.diagnostic.status === "em_andamento" ? "secondary" : "default"}>
          {hydrated.diagnostic.status === "em_andamento"
            ? "Em andamento"
            : hydrated.diagnostic.status === "concluido"
            ? "Concluído"
            : "Arquivado"}
        </Badge>
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progresso global</span>
          <span>
            {totalAnswered}/{totalQuestions} ({pct}%)
          </span>
        </div>
        <Progress value={pct} className="h-2" />
      </div>
      {hydrated.diagnostic.scoreGlobal != null && (
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Score global</div>
          <div className="text-xl font-bold text-primary">
            {hydrated.diagnostic.scoreGlobal.toFixed(1)}
            <span className="text-sm text-muted-foreground">/5.0</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pilares table ──────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  nome: string;
  email: string | null;
  funcao: string | null;
  whatsapp?: string | null;
}

function PilaresTable({
  clinicId,
  hydrated,
  delegacoes,
  team,
  isSuperAdmin,
  diagnosticoId,
}: {
  clinicId: string;
  hydrated: HydratedDiagnostic;
  delegacoes: Delegacao[];
  team: TeamMember[];
  isSuperAdmin: boolean;
  diagnosticoId: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingPergunta, setEditingPergunta] = useState<PerguntaTipo | null>(null);
  const [creatingPerguntaForPilar, setCreatingPerguntaForPilar] = useState<PilarSummary | null>(null);
  const [delegateContext, setDelegateContext] = useState<{
    pilar: PilarSummary;
    nivel: 1 | 2;
    questaoInicio?: number;
    questaoFim?: number;
    existing?: Delegacao;
  } | null>(null);

  const respByPergunta = useMemo(() => {
    const m = new Map<string, RespostaTipo>();
    for (const r of hydrated.respostas) m.set(r.perguntaId, r);
    return m;
  }, [hydrated.respostas]);

  const questionsByPilar = useMemo(() => {
    const m = new Map<string, PerguntaTipo[]>();
    for (const q of hydrated.questions) {
      if (!m.has(q.pilarSlug)) m.set(q.pilarSlug, []);
      m.get(q.pilarSlug)!.push(q);
    }
    return m;
  }, [hydrated.questions]);

  const delegacoesByPilar = useMemo(() => {
    const m = new Map<string, { n1?: Delegacao; n2s: Delegacao[] }>();
    for (const d of delegacoes) {
      let bucket = m.get(d.pilarSlug);
      if (!bucket) {
        bucket = { n2s: [] };
        m.set(d.pilarSlug, bucket);
      }
      if (d.nivel === 1) bucket.n1 = d;
      else bucket.n2s.push(d);
    }
    return m;
  }, [delegacoes]);

  const toggleRow = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-8"></th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pilar</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                Responsável
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                Progresso
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Score</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {hydrated.pillars.map((pilar) => {
              const isExpanded = expanded.has(pilar.slug);
              const bucket = delegacoesByPilar.get(pilar.slug);
              const n1 = bucket?.n1;
              const n2s = bucket?.n2s ?? [];
              const status = n1?.status ?? "nao_delegado";
              const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.nao_delegado;
              const pct =
                pilar.questionCount === 0 ? 0 : Math.round((pilar.answeredCount / pilar.questionCount) * 100);
              const score = hydrated.diagnostic.scoresPilares?.[pilar.slug];
              const questions = questionsByPilar.get(pilar.slug) ?? [];

              return (
                <PilarRow
                  key={pilar.slug}
                  pilar={pilar}
                  questions={questions}
                  respByPergunta={respByPergunta}
                  n1={n1}
                  n2s={n2s}
                  statusCfg={statusCfg}
                  pct={pct}
                  score={score}
                  isExpanded={isExpanded}
                  toggleRow={toggleRow}
                  isSuperAdmin={isSuperAdmin}
                  clinicId={clinicId}
                  diagnosticoId={diagnosticoId}
                  onDelegatePilar={() => setDelegateContext({ pilar, nivel: 1 })}
                  onReatribuirPilar={() => setDelegateContext({ pilar, nivel: 1, existing: n1 })}
                  onSubdelegate={() => setDelegateContext({ pilar, nivel: 2 })}
                  onDelegateQuestion={(ordem) =>
                    setDelegateContext({ pilar, nivel: 2, questaoInicio: ordem, questaoFim: ordem })
                  }
                  onEditPergunta={(p) => setEditingPergunta(p)}
                  onCreatePergunta={() => setCreatingPerguntaForPilar(pilar)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {delegateContext && (
        <DelegacaoDialog
          clinicId={clinicId}
          diagnosticoId={diagnosticoId}
          context={delegateContext}
          team={team}
          parentDelegacao={
            delegateContext.nivel === 2
              ? delegacoesByPilar.get(delegateContext.pilar.slug)?.n1 ?? null
              : null
          }
          pilarQuestions={questionsByPilar.get(delegateContext.pilar.slug) ?? []}
          onClose={() => setDelegateContext(null)}
        />
      )}

      {(editingPergunta || creatingPerguntaForPilar) && (
        <PerguntaDialog
          pergunta={editingPergunta ?? null}
          pilar={creatingPerguntaForPilar ?? null}
          existingPilarOrdens={
            creatingPerguntaForPilar
              ? (questionsByPilar.get(creatingPerguntaForPilar.slug) ?? []).map((p) => p.ordem)
              : []
          }
          onClose={() => {
            setEditingPergunta(null);
            setCreatingPerguntaForPilar(null);
          }}
        />
      )}
    </>
  );
}

// ─── Pilar row + expanded details ───────────────────────────────────────────

interface PilarRowProps {
  pilar: PilarSummary;
  questions: PerguntaTipo[];
  respByPergunta: Map<string, RespostaTipo>;
  n1: Delegacao | undefined;
  n2s: Delegacao[];
  statusCfg: typeof STATUS_CONFIG[string];
  pct: number;
  score: number | undefined;
  isExpanded: boolean;
  toggleRow: (slug: string) => void;
  isSuperAdmin: boolean;
  clinicId: string;
  diagnosticoId: string;
  onDelegatePilar: () => void;
  onReatribuirPilar: () => void;
  onSubdelegate: () => void;
  onDelegateQuestion: (ordem: number) => void;
  onEditPergunta: (p: PerguntaTipo) => void;
  onCreatePergunta: () => void;
}

function PilarRow(props: PilarRowProps) {
  const {
    pilar,
    questions,
    respByPergunta,
    n1,
    n2s,
    statusCfg,
    pct,
    score,
    isExpanded,
    toggleRow,
    isSuperAdmin,
    clinicId,
    diagnosticoId,
    onDelegatePilar,
    onReatribuirPilar,
    onSubdelegate,
    onDelegateQuestion,
    onEditPergunta,
    onCreatePergunta,
  } = props;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateDelegMut = useMutation({
    mutationFn: async (vars: { id: string; data: Partial<Delegacao> }) => {
      const res = await authFetch(`/api/delegacoes/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify(vars.data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] }),
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar delegação" }),
  });

  const deleteDelegMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/delegacoes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] }),
  });

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          <button
            onClick={() => toggleRow(pilar.slug)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={isExpanded ? "Recolher" : "Expandir"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium">{pilar.nome}</div>
          <div className="text-xs text-muted-foreground">
            {pilar.answeredCount}/{pilar.questionCount} respondidas
            {n2s.length > 0 ? ` · ${n2s.length} sub-delegações` : ""}
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          {n1?.responsavelNome ? (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                {n1.responsavelNome.charAt(0).toUpperCase()}
              </div>
              <div className="text-xs">
                <div>{n1.responsavelNome}</div>
                {n1.responsavelEmail && (
                  <div className="text-muted-foreground">{n1.responsavelEmail}</div>
                )}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground italic text-xs">Não delegado</span>
          )}
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <div className="flex items-center gap-2">
            <Progress value={pct} className="h-2 w-24" />
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">
          <div className="flex flex-col gap-1 items-start">
            <Badge variant={statusCfg.variant} className="gap-1 text-xs">
              {statusCfg.icon}
              {statusCfg.label}
            </Badge>
            {n1 && (
              <InviteStatusBadge
                clinicId={clinicId}
                diagnosticoId={diagnosticoId}
                delegacao={n1}
                answered={pilar.answeredCount}
                total={pilar.questionCount}
              />
            )}
          </div>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          {score != null ? (
            <span className="text-sm font-semibold">{score.toFixed(1)}/5.0</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1 flex-wrap">
            {!n1 ? (
              <Button size="sm" variant="outline" onClick={onDelegatePilar}>
                <UserCheck className="h-3 w-3 mr-1" /> Delegar pilar
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={onReatribuirPilar}>
                  <UserCheck className="h-3 w-3 mr-1" /> Reatribuir
                </Button>
                <Button size="sm" variant="ghost" onClick={onSubdelegate}>
                  <Plus className="h-3 w-3 mr-1" /> Sub-delegar
                </Button>
                <SendInviteButton clinicId={clinicId} diagnosticoId={diagnosticoId} delegacao={n1} />
                <Select
                  value={n1.status}
                  onValueChange={(val) => updateDelegMut.mutate({ id: n1.id, data: { status: val } })}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="andamento">Em andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("Remover delegação deste pilar?")) deleteDelegMut.mutate(n1.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-muted/10">
          <td></td>
          <td colSpan={6} className="px-4 py-3">
            <ExpandedPilar
              pilar={pilar}
              questions={questions}
              respByPergunta={respByPergunta}
              n2s={n2s}
              isSuperAdmin={isSuperAdmin}
              clinicId={clinicId}
              diagnosticoId={diagnosticoId}
              onDelegateQuestion={onDelegateQuestion}
              onEditPergunta={onEditPergunta}
              onCreatePergunta={onCreatePergunta}
              onDeleteDelegacao={(id) => deleteDelegMut.mutate(id)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Expanded pilar (questions + answers + per-question delegate) ───────────

function ExpandedPilar({
  pilar,
  questions,
  respByPergunta,
  n2s,
  isSuperAdmin,
  clinicId,
  diagnosticoId,
  onDelegateQuestion,
  onEditPergunta,
  onCreatePergunta,
  onDeleteDelegacao,
}: {
  pilar: PilarSummary;
  questions: PerguntaTipo[];
  respByPergunta: Map<string, RespostaTipo>;
  n2s: Delegacao[];
  isSuperAdmin: boolean;
  clinicId: string;
  diagnosticoId: string;
  onDelegateQuestion: (ordem: number) => void;
  onEditPergunta: (p: PerguntaTipo) => void;
  onCreatePergunta: () => void;
  onDeleteDelegacao: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Local pending state per question for snappy input + debounced save
  const [pending, setPending] = useState<Record<string, string>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const saveAnswerMut = useMutation({
    mutationFn: async (vars: { perguntaId: string; valor: string }) => {
      const res = await authFetch(
        `/api/diagnostics/${diagnosticoId}/respostas/${vars.perguntaId}`,
        { method: "PUT", body: JSON.stringify({ valor: vars.valor }) }
      );
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId, diagnosticoId] });
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar resposta" }),
  });

  const handleAnswerChange = (perguntaId: string, valor: string) => {
    setPending((prev) => ({ ...prev, [perguntaId]: valor }));
    const existing = saveTimers.current[perguntaId];
    if (existing) clearTimeout(existing);
    saveTimers.current[perguntaId] = setTimeout(() => {
      if (valor === "" || valor == null) return;
      saveAnswerMut.mutate({ perguntaId, valor });
    }, 600);
  };

  // ranges of n2 sub-delegations (questaoInicio..questaoFim)
  const findN2ForOrdem = (ordem: number): Delegacao | undefined =>
    n2s.find(
      (d) =>
        d.questaoInicio != null &&
        d.questaoFim != null &&
        ordem >= d.questaoInicio &&
        ordem <= d.questaoFim
    );

  return (
    <div className="space-y-3">
      {n2s.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground self-center">Sub-delegações:</span>
          {n2s.map((d) => (
            <div
              key={d.id}
              className="inline-flex items-center gap-1.5 border border-border rounded px-2 py-1 bg-card"
            >
              <span className="font-medium">{d.responsavelNome ?? "—"}</span>
              {d.questaoInicio != null && d.questaoFim != null && (
                <span className="text-muted-foreground">
                  {d.questaoInicio === d.questaoFim
                    ? `Q${d.questaoInicio}`
                    : `Q${d.questaoInicio}–Q${d.questaoFim}`}
                </span>
              )}
              <Badge variant={STATUS_CONFIG[d.status]?.variant ?? "outline"} className="text-[10px]">
                {STATUS_CONFIG[d.status]?.label ?? d.status}
              </Badge>
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm("Remover esta sub-delegação?")) onDeleteDelegacao(d.id);
                }}
                aria-label="Remover sub-delegação"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {questions.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            Nenhuma pergunta cadastrada para este pilar.
          </div>
        )}
        {questions.map((q) => {
          const resp = respByPergunta.get(q.id);
          const value = pending[q.id] ?? resp?.valor ?? "";
          const ownerN2 = findN2ForOrdem(q.ordem);
          return (
            <div key={q.id} className="border rounded-lg p-3 bg-card">
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground font-mono mt-0.5 w-8">Q{q.ordem}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{q.texto}</div>
                  {q.dica && (
                    <div className="text-xs text-muted-foreground italic mt-0.5">{q.dica}</div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AnswerInput
                      pergunta={q}
                      value={value}
                      onChange={(v) => handleAnswerChange(q.id, v)}
                    />
                    {resp && (
                      <span className="text-[10px] text-muted-foreground">
                        ✓ {new Date(resp.respondidoEm).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {ownerN2 ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {ownerN2.responsavelNome ?? "—"}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onDelegateQuestion(q.ordem)}
                    >
                      <UserCheck className="h-3 w-3 mr-1" /> Delegar
                    </Button>
                  )}
                  {isSuperAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => onEditPergunta(q)}
                      title="Editar pergunta"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isSuperAdmin && (
          <Button size="sm" variant="outline" className="text-xs" onClick={onCreatePergunta}>
            <FilePlus className="h-3 w-3 mr-1" /> Adicionar pergunta a {pilar.nome}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Answer input by tipo ───────────────────────────────────────────────────

function AnswerInput({
  pergunta,
  value,
  onChange,
}: {
  pergunta: PerguntaTipo;
  value: string;
  onChange: (v: string) => void;
}) {
  if (pergunta.tipo === "sim_nao") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Selecionar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="sim">Sim</SelectItem>
          <SelectItem value="nao">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (pergunta.tipo === "escala_1_5") {
    return (
      <div className="inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={`h-8 w-8 rounded text-xs font-medium border transition-colors ${
              value === String(n)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card hover:bg-muted"
            }`}
            aria-label={`Nota ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  if (pergunta.tipo === "numerico") {
    return (
      <Input
        type="number"
        min={pergunta.valorMin ?? undefined}
        max={pergunta.valorMax ?? undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-[120px] text-xs"
        placeholder={
          pergunta.valorMin != null && pergunta.valorMax != null
            ? `${pergunta.valorMin}–${pergunta.valorMax}`
            : "Valor"
        }
      />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs flex-1 min-w-[200px]"
      placeholder="Resposta"
    />
  );
}

// ─── Send invite (link individual por pilar) — task #205 ───────────────────

function SendInviteButton({
  clinicId,
  diagnosticoId,
  delegacao,
}: {
  clinicId: string;
  diagnosticoId: string;
  delegacao: Delegacao;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sendMut = useMutation({
    mutationFn: async () => {
      const res = await authFetch(
        `/api/clinics/${clinicId}/diagnostics/${diagnosticoId}/delegacoes/${delegacao.id}/send-invite`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Erro ao enviar convite");
      }
      return res.json() as Promise<{ ok: boolean; sent: boolean; to: string; link: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      toast({
        title: data.sent ? "Convite enviado" : "Link gerado (e-mail falhou)",
        description: data.sent
          ? `E-mail enviado para ${data.to}. O link é válido por 30 dias.`
          : `Compartilhe manualmente: ${data.link}`,
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Não foi possível enviar", description: err.message });
    },
  });

  const alreadySent = !!delegacao.inviteSentAt;
  const disabled = !delegacao.responsavelEmail || sendMut.isPending;

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={() => sendMut.mutate()}
      title={
        !delegacao.responsavelEmail
          ? "Adicione um e-mail de responsável antes de enviar"
          : alreadySent
          ? "Reenviar link de resposta"
          : "Enviar link de resposta por e-mail"
      }
    >
      {sendMut.isPending ? (
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
      ) : alreadySent ? (
        <Send className="h-3 w-3 mr-1" />
      ) : (
        <Mail className="h-3 w-3 mr-1" />
      )}
      {alreadySent ? "Reenviar" : "Enviar convite"}
    </Button>
  );
}

// ─── Delegação dialog ───────────────────────────────────────────────────────

function DelegacaoDialog({
  clinicId,
  diagnosticoId,
  context,
  team,
  parentDelegacao,
  pilarQuestions,
  onClose,
}: {
  clinicId: string;
  diagnosticoId: string;
  context: {
    pilar: PilarSummary;
    nivel: 1 | 2;
    questaoInicio?: number;
    questaoFim?: number;
    existing?: Delegacao;
  };
  team: TeamMember[];
  parentDelegacao: Delegacao | null;
  pilarQuestions: PerguntaTipo[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isReatribuir = !!context.existing;

  const [form, setForm] = useState({
    responsavelNome: context.existing?.responsavelNome ?? "",
    responsavelEmail: context.existing?.responsavelEmail ?? "",
    prazo: context.existing?.prazo ?? "",
    questaoInicio:
      context.existing?.questaoInicio != null
        ? String(context.existing.questaoInicio)
        : context.questaoInicio != null
        ? String(context.questaoInicio)
        : "",
    questaoFim:
      context.existing?.questaoFim != null
        ? String(context.existing.questaoFim)
        : context.questaoFim != null
        ? String(context.questaoFim)
        : "",
    observacoes: context.existing?.observacoes ?? "",
  });

  const createMut = useMutation({
    mutationFn: async (data: object) => {
      const res = await authFetch(`/api/clinics/${clinicId}/delegacoes`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      toast({
        title:
          context.nivel === 1
            ? "Pilar delegado"
            : context.questaoInicio === context.questaoFim
            ? "Pergunta delegada"
            : "Sub-delegação criada",
      });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao salvar" }),
  });

  const updateMut = useMutation({
    mutationFn: async (data: object) => {
      const res = await authFetch(`/api/delegacoes/${context.existing!.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated", clinicId] });
      toast({ title: "Responsável reatribuído" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
  });

  const handleSubmit = () => {
    if (isReatribuir) {
      updateMut.mutate({
        responsavelNome: form.responsavelNome || undefined,
        responsavelEmail: form.responsavelEmail || undefined,
        prazo: form.prazo || undefined,
        observacoes: form.observacoes || undefined,
      });
      return;
    }
    const member = team.find((m) => m.email === form.responsavelEmail);
    createMut.mutate({
      pilarSlug: context.pilar.slug,
      pilarNome: context.pilar.nome,
      nivel: context.nivel,
      responsavelNome: form.responsavelNome || undefined,
      responsavelEmail: form.responsavelEmail || undefined,
      responsavelWhatsapp: member?.whatsapp ?? undefined,
      prazo: form.prazo || undefined,
      status: "pendente",
      questaoInicio: form.questaoInicio ? parseInt(form.questaoInicio) : undefined,
      questaoFim: form.questaoFim ? parseInt(form.questaoFim) : undefined,
      observacoes: form.observacoes || undefined,
      diagnosticoId,
      // Link sub-delegations to their parent N1 when one exists.
      parentId: context.nivel === 2 ? parentDelegacao?.id ?? undefined : undefined,
    });
  };

  const title =
    isReatribuir
      ? `Reatribuir — ${context.pilar.nome}`
      : context.nivel === 1
      ? `Delegar pilar — ${context.pilar.nome}`
      : context.questaoInicio === context.questaoFim
      ? `Delegar pergunta Q${context.questaoInicio} — ${context.pilar.nome}`
      : `Sub-delegar módulo — ${context.pilar.nome}`;

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Responsável</label>
            {team.length > 0 ? (
              <Select
                value={form.responsavelNome}
                onValueChange={(v) => {
                  const member = team.find((m) => m.nome === v);
                  setForm((f) => ({
                    ...f,
                    responsavelNome: v,
                    responsavelEmail: member?.email ?? f.responsavelEmail,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um membro da equipe" />
                </SelectTrigger>
                <SelectContent>
                  {team.map((m) => (
                    <SelectItem key={m.id} value={m.nome}>
                      {m.nome} {m.funcao ? `— ${m.funcao}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Nome do responsável"
                value={form.responsavelNome}
                onChange={(e) => setForm((f) => ({ ...f, responsavelNome: e.target.value }))}
              />
            )}
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">E-mail</label>
            <Input
              type="email"
              placeholder="email@clinica.com.br"
              value={form.responsavelEmail}
              onChange={(e) => setForm((f) => ({ ...f, responsavelEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Prazo</label>
            <Input
              type="date"
              value={form.prazo}
              onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
            />
          </div>
          {context.nivel === 2 && (
            <div>
              <label className="text-sm font-medium mb-1 block">
                Faixa de perguntas
                {form.questaoInicio && form.questaoFim && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    Q{form.questaoInicio}–Q{form.questaoFim} (
                    {parseInt(form.questaoFim) - parseInt(form.questaoInicio) + 1} perguntas)
                  </span>
                )}
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Clique em uma pergunta para definir o início, depois em outra para o fim.
                Clique novamente para reiniciar a seleção.
              </p>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 border rounded-md">
                {(pilarQuestions.length > 0
                  ? pilarQuestions.map((q) => q.ordem)
                  : Array.from({ length: context.pilar.questionCount }, (_, i) => i + 1)
                ).map((n) => {
                  const ini = form.questaoInicio ? parseInt(form.questaoInicio) : null;
                  const fim = form.questaoFim ? parseInt(form.questaoFim) : null;
                  const inRange = ini != null && fim != null && n >= ini && n <= fim;
                  const isEdge = n === ini || n === fim;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setForm((f) => {
                          const a = f.questaoInicio ? parseInt(f.questaoInicio) : null;
                          const b = f.questaoFim ? parseInt(f.questaoFim) : null;
                          if (a == null) return { ...f, questaoInicio: String(n), questaoFim: String(n) };
                          if (b == null || a === b) {
                            const lo = Math.min(a, n);
                            const hi = Math.max(a, n);
                            return { ...f, questaoInicio: String(lo), questaoFim: String(hi) };
                          }
                          return { ...f, questaoInicio: String(n), questaoFim: String(n) };
                        });
                      }}
                      className={
                        "px-2 py-1 text-xs rounded border transition-colors " +
                        (isEdge
                          ? "bg-primary text-primary-foreground border-primary"
                          : inRange
                          ? "bg-primary/20 border-primary/40"
                          : "bg-background hover:bg-muted")
                      }
                    >
                      Q{n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">Observações</label>
            <Textarea
              rows={2}
              placeholder="Instruções adicionais…"
              value={form.observacoes}
              onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !form.responsavelNome}>
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isReatribuir ? "Reatribuir" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pergunta CRUD dialog (super_admin) ─────────────────────────────────────

function PerguntaDialog({
  pergunta,
  pilar,
  existingPilarOrdens,
  onClose,
}: {
  pergunta: PerguntaTipo | null;
  pilar: PilarSummary | null;
  existingPilarOrdens: number[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!pergunta;
  const targetPilarSlug = pergunta?.pilarSlug ?? pilar?.slug ?? "";
  const targetPilarNome = pergunta?.pilarNome ?? pilar?.nome ?? "";
  const targetPilarOrdem = pergunta?.pilarOrdem ?? pilar?.ordem ?? 1;

  const nextOrdem = useMemo(() => {
    if (existingPilarOrdens.length === 0) return 1;
    return Math.max(...existingPilarOrdens) + 1;
  }, [existingPilarOrdens]);

  const [form, setForm] = useState({
    texto: pergunta?.texto ?? "",
    tipo: pergunta?.tipo ?? "escala_1_5",
    peso: pergunta?.peso ?? 1,
    ordem: pergunta?.ordem ?? nextOrdem,
    dica: pergunta?.dica ?? "",
    valorMin: pergunta?.valorMin ?? 0,
    valorMax: pergunta?.valorMax ?? 100,
    inverso: pergunta?.inverso ?? false,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        pilarSlug: targetPilarSlug,
        pilarNome: targetPilarNome,
        pilarOrdem: targetPilarOrdem,
        texto: form.texto,
        tipo: form.tipo,
        peso: Number(form.peso),
        ordem: Number(form.ordem),
        dica: form.dica || null,
        valorMin: form.tipo === "numerico" ? Number(form.valorMin) : null,
        valorMax: form.tipo === "numerico" ? Number(form.valorMax) : null,
        inverso: form.inverso,
      };
      const res = await authFetch(
        isEdit ? `/api/perguntas/${pergunta!.id}` : `/api/perguntas`,
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Falha ao salvar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated"] });
      queryClient.invalidateQueries({ queryKey: ["perguntas"] });
      toast({ title: isEdit ? "Pergunta atualizada" : "Pergunta criada" });
      onClose();
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "Erro", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: async (force: boolean): Promise<void> => {
      const res = await authFetch(
        `/api/perguntas/${pergunta!.id}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      );
      if (res.status === 409) {
        const data = await res.json();
        if (
          confirm(
            `${data.respostasCount} resposta(s) já foram registradas para esta pergunta. Apagar mesmo assim?`
          )
        ) {
          await deleteMut.mutateAsync(true);
          return;
        }
        throw new Error("cancelled");
      }
      if (!res.ok) throw new Error("Falha ao apagar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delegacao-hydrated"] });
      queryClient.invalidateQueries({ queryKey: ["perguntas"] });
      toast({ title: "Pergunta apagada" });
      onClose();
    },
    onError: (e: Error) => {
      if (e.message !== "cancelled") {
        toast({ variant: "destructive", title: "Erro", description: e.message });
      }
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
          <DialogDescription>
            {targetPilarNome} (ordem do pilar: {targetPilarOrdem})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Texto</label>
            <Textarea
              rows={3}
              value={form.texto}
              onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Dica (opcional)</label>
            <Input
              value={form.dica}
              onChange={(e) => setForm((f) => ({ ...f, dica: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <Select
                value={form.tipo}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, tipo: v as PerguntaTipo["tipo"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim_nao">Sim/Não</SelectItem>
                  <SelectItem value="escala_1_5">Escala 1–5</SelectItem>
                  <SelectItem value="numerico">Numérico</SelectItem>
                  <SelectItem value="texto_livre">Texto livre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Peso</label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={form.peso}
                onChange={(e) => setForm((f) => ({ ...f, peso: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Ordem</label>
              <Input
                type="number"
                min="1"
                value={form.ordem}
                onChange={(e) => setForm((f) => ({ ...f, ordem: Number(e.target.value) }))}
              />
            </div>
          </div>
          {form.tipo === "numerico" && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Valor mín.</label>
                <Input
                  type="number"
                  value={form.valorMin}
                  onChange={(e) => setForm((f) => ({ ...f, valorMin: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valor máx.</label>
                <Input
                  type="number"
                  value={form.valorMax}
                  onChange={(e) => setForm((f) => ({ ...f, valorMax: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end gap-2">
                <input
                  type="checkbox"
                  id="inverso"
                  checked={form.inverso}
                  onChange={(e) => setForm((f) => ({ ...f, inverso: e.target.checked }))}
                />
                <label htmlFor="inverso" className="text-sm">
                  Inverso (menor é melhor)
                </label>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          <div>
            {isEdit && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteMut.mutate(false)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Apagar
              </Button>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !form.texto.trim()}
            >
              {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clinic selector (no clinicId in URL) ───────────────────────────────────

function ClinicSelector() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const { clinics, isLoading } = useClinicsForCurrentUser({ pageSize: 100 });
  const filtered = clinics.filter(
    (c) =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      (c.cidade ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Delegação do Diagnóstico</h1>
        <p className="text-sm text-muted-foreground">Selecione uma clínica para começar.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar clínica..."
          className="pl-9"
        />
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/delegacao/${c.id}`)}
              className="w-full text-left p-4 border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{c.nome}</div>
                <div className="text-sm text-muted-foreground">
                  {c.cidade}
                  {c.uf ? `, ${c.uf}` : ""}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma clínica encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
}

