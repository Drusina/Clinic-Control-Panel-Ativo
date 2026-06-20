import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, Trash2, ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PILARES = [
  { slug: "estrategia", nome: "Estratégia e Governança" },
  { slug: "financeiro", nome: "Financeiro e Fluxo de Caixa" },
  { slug: "contabil", nome: "Contabilidade e Fiscal" },
  { slug: "marketing", nome: "Vendas, Marketing e Captação" },
  { slug: "operacoes", nome: "Processos Operacionais" },
  { slug: "pessoas", nome: "Gestão de Pessoas e Cultura" },
  { slug: "tecnologia", nome: "Tecnologia e Sistemas" },
  { slug: "compliance", nome: "Compliance e Regulamentação" },
];

const PILAR_COLORS: Record<string, string> = {
  estrategia: "bg-blue-100 text-blue-700",
  financeiro: "bg-green-100 text-green-700",
  contabil: "bg-teal-100 text-teal-700",
  marketing: "bg-purple-100 text-purple-700",
  operacoes: "bg-orange-100 text-orange-700",
  pessoas: "bg-pink-100 text-pink-700",
  tecnologia: "bg-cyan-100 text-cyan-700",
  compliance: "bg-red-100 text-red-700",
};

function getSeverityLabel(
  sev: number,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (sev <= 6) return { label: "Baixo", variant: "outline" };
  if (sev <= 14) return { label: "Médio", variant: "secondary" };
  return { label: "Alto", variant: "destructive" };
}

function nivelFromSeveridade(sev: number): "baixo" | "medio" | "alto" {
  if (sev <= 6) return "baixo";
  if (sev <= 14) return "medio";
  return "alto";
}

export type PerguntaFonte = {
  pergunta: string;
  resposta: string;
  pilarSlug?: string | null;
};

type GeneratedRiskPreview = {
  pilarSlug: string;
  nome: string;
  descricao: string;
  probabilidade: number;
  impacto: number;
  severidade: number;
  nivel: "baixo" | "medio" | "alto";
  acoesMitigadoras: string;
  perguntasFonte: PerguntaFonte[];
};

type PreviewRisksResult = {
  message: string;
  risks: GeneratedRiskPreview[];
};

type CommitRiskItem = {
  pilarSlug: string | null;
  nome: string;
  descricao: string | null;
  probabilidade: number;
  impacto: number;
  acoesMitigadoras: string | null;
  perguntasFonte: PerguntaFonte[];
  criarCard: boolean;
};

export type CommitRisksResult = {
  created: number;
  cardsCreated: number;
  message: string;
};

type ReviewRisk = GeneratedRiskPreview & { criarCard: boolean };

async function previewRisksForDiagnostic(
  clinicId: string,
  diagnosticId: string,
): Promise<PreviewRisksResult> {
  const token = getStoredToken();
  const res = await fetch(
    `${BASE}/api/clinics/${clinicId}/diagnostics/${diagnosticId}/generate-risks/preview`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    let msg = "Falha ao gerar os riscos.";
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const body = await res.json();
  return { message: body.message, risks: body.risks ?? [] };
}

async function commitRisksForDiagnostic(
  clinicId: string,
  diagnosticId: string,
  risks: CommitRiskItem[],
): Promise<CommitRisksResult> {
  const token = getStoredToken();
  const res = await fetch(
    `${BASE}/api/clinics/${clinicId}/diagnostics/${diagnosticId}/generate-risks/commit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ risks }),
    },
  );
  if (!res.ok) {
    let msg = "Falha ao salvar os riscos.";
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export interface GenerateRisksButtonProps {
  clinicId: string;
  /** Explicit diagnostic to generate risks from. Takes precedence over the resolver. */
  diagnosticId?: string;
  /** Lazily resolves the diagnostic id on click (e.g. "latest concluded"). */
  resolveDiagnosticId?: () => Promise<string>;
  /** Called after a successful commit so the caller can invalidate / navigate. */
  onCommitted?: (result: CommitRisksResult) => void;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** When true, shows an explanatory confirmation dialog before previewing. */
  confirm?: boolean;
}

/**
 * Self-contained super-admin flow that turns a concluded diagnostic into a
 * reviewed set of risks: preview (AI) → review/edit dialog → commit. It owns
 * all of its dialog state so it can be dropped onto any surface (the standalone
 * risk map and the diagnostics tab) without duplicating the review UI.
 */
export function GenerateRisksButton({
  clinicId,
  diagnosticId,
  resolveDiagnosticId,
  onCommitted,
  label = "Gerar do diagnóstico",
  variant = "outline",
  size,
  className,
  confirm = true,
}: GenerateRisksButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDiagnosticId, setReviewDiagnosticId] = useState<string | null>(null);
  const [reviewRisks, setReviewRisks] = useState<ReviewRisk[]>([]);

  const previewMut = useMutation({
    mutationFn: async () => {
      const id = diagnosticId ?? (resolveDiagnosticId ? await resolveDiagnosticId() : null);
      if (!id) throw new Error("NO_DIAGNOSTIC");
      const result = await previewRisksForDiagnostic(clinicId, id);
      return { diagnosticId: id, ...result };
    },
    onSuccess: (result) => {
      setConfirmOpen(false);
      if (result.risks.length === 0) {
        toast({
          title: "Nenhum risco gerado",
          description:
            result.message ||
            "O diagnóstico não apontou respostas frágeis o suficiente para gerar riscos.",
        });
        return;
      }
      setReviewDiagnosticId(result.diagnosticId);
      setReviewRisks(result.risks.map((r) => ({ ...r, criarCard: r.nivel === "alto" })));
      setReviewOpen(true);
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      if (err.message === "NO_DIAGNOSTIC") {
        toast({
          variant: "destructive",
          title: "Sem diagnóstico disponível",
          description:
            "Conclua um diagnóstico desta clínica antes de gerar riscos automaticamente.",
        });
      } else if (err.message === "NEEDS_CONCLUSION") {
        toast({
          variant: "destructive",
          title: "Diagnóstico ainda não concluído",
          description:
            "Há um diagnóstico 100% respondido, mas ele ainda não foi concluído. Conclua-o na aba Diagnósticos para gerar riscos.",
        });
      } else {
        toast({ variant: "destructive", title: "Erro ao gerar riscos", description: err.message });
      }
    },
  });

  const commitMut = useMutation({
    mutationFn: (items: CommitRiskItem[]) =>
      commitRisksForDiagnostic(clinicId, reviewDiagnosticId!, items),
    onSuccess: (result) => {
      setReviewOpen(false);
      setReviewRisks([]);
      setReviewDiagnosticId(null);
      queryClient.invalidateQueries({ queryKey: ["riscos", clinicId] });
      toast({
        title: `${result.created} risco(s) salvo(s) a partir do diagnóstico`,
        description:
          result.cardsCreated > 0
            ? `${result.cardsCreated} risco(s) viraram cards no Plano de Ação.`
            : "Nenhum card foi criado no Plano de Ação.",
      });
      onCommitted?.(result);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Erro ao salvar riscos", description: err.message });
    },
  });

  const updateReviewRisk = (index: number, patch: Partial<ReviewRisk>) => {
    setReviewRisks((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        next.severidade = next.probabilidade * next.impacto;
        next.nivel = nivelFromSeveridade(next.severidade);
        return next;
      }),
    );
  };

  const removeReviewRisk = (index: number) => {
    setReviewRisks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCommitReview = () => {
    if (reviewRisks.length === 0) return;
    const items: CommitRiskItem[] = reviewRisks.map((r) => ({
      pilarSlug: r.pilarSlug || null,
      nome: r.nome.trim(),
      descricao: r.descricao?.trim() || null,
      probabilidade: r.probabilidade,
      impacto: r.impacto,
      acoesMitigadoras: r.acoesMitigadoras?.trim() || null,
      perguntasFonte: r.perguntasFonte,
      criarCard: r.criarCard,
    }));
    commitMut.mutate(items);
  };

  const handleTrigger = () => {
    if (confirm) {
      setConfirmOpen(true);
    } else {
      previewMut.mutate();
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleTrigger}
        disabled={previewMut.isPending}
      >
        {previewMut.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        {label}
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!previewMut.isPending) setConfirmOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" /> Gerar mapeamento de riscos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              A IA analisa as respostas mais frágeis do diagnóstico e propõe riscos temáticos com
              descrição, probabilidade, impacto e ações sugeridas.
            </p>
            <p>
              Você poderá <span className="font-medium text-foreground">revisar e editar</span> cada
              risco e escolher quais viram cards no{" "}
              <span className="font-medium text-foreground">Plano de Ação</span> antes de salvar.
            </p>
            <p className="text-amber-600">
              Ao salvar, os riscos gerados anteriormente a partir deste diagnóstico serão
              substituídos. Riscos cadastrados manualmente não são afetados.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={previewMut.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
              {previewMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Gerar para revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reviewOpen}
        onOpenChange={(o) => {
          if (!commitMut.isPending) {
            setReviewOpen(o);
            if (!o) {
              setReviewRisks([]);
              setReviewDiagnosticId(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" /> Revisar riscos antes de salvar
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Edite a redação, ajuste probabilidade e impacto, e marque quais riscos devem virar cards
            no Plano de Ação. Nada é salvo até você confirmar.
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 py-2 space-y-4">
            {reviewRisks.map((r, i) => {
              const sev = getSeverityLabel(r.severidade);
              return (
                <div key={i} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Nome do risco
                      </label>
                      <Input
                        value={r.nome}
                        onChange={(e) => updateReviewRisk(i, { nome: e.target.value })}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive mt-5"
                      onClick={() => removeReviewRisk(i)}
                      title="Descartar este risco"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sev.variant} className="text-[10px]">
                      {sev.label} (Sev: {r.severidade})
                    </Badge>
                    {r.pilarSlug && (
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-medium",
                          PILAR_COLORS[r.pilarSlug] ?? "bg-gray-100 text-gray-700",
                        )}
                      >
                        {PILARES.find((p) => p.slug === r.pilarSlug)?.nome.split(" ")[0] ??
                          r.pilarSlug}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Descrição
                    </label>
                    <Textarea
                      rows={2}
                      value={r.descricao}
                      onChange={(e) => updateReviewRisk(i, { descricao: e.target.value })}
                      className="resize-none text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Probabilidade: {r.probabilidade}/5
                      </label>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[r.probabilidade]}
                        onValueChange={([v]) => updateReviewRisk(i, { probabilidade: v })}
                        className="py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Impacto: {r.impacto}/5
                      </label>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[r.impacto]}
                        onValueChange={([v]) => updateReviewRisk(i, { impacto: v })}
                        className="py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Ações mitigadoras
                    </label>
                    <Textarea
                      rows={2}
                      value={r.acoesMitigadoras}
                      onChange={(e) => updateReviewRisk(i, { acoesMitigadoras: e.target.value })}
                      className="resize-none text-sm"
                    />
                  </div>

                  {r.perguntasFonte.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Respostas do diagnóstico que originaram este risco (
                        {r.perguntasFonte.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {r.perguntasFonte.map((pf, idx) => (
                          <li key={idx} className="border-l-2 border-indigo-300 pl-3 py-0.5">
                            <div className="text-foreground font-medium leading-snug">
                              {pf.pergunta}
                            </div>
                            <div className="mt-0.5">
                              <span className="font-semibold text-foreground/70">Resposta: </span>
                              <span className="text-muted-foreground">{pf.resposta}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <Checkbox
                      checked={r.criarCard}
                      onCheckedChange={(c) => updateReviewRisk(i, { criarCard: c === true })}
                    />
                    <span className="text-sm flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-indigo-600" />
                      Criar card no Plano de Ação
                    </span>
                  </label>
                </div>
              );
            })}
            {reviewRisks.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">
                Todos os riscos foram descartados. Feche e gere novamente se necessário.
              </div>
            )}
          </div>
          <DialogFooter className="border-t pt-3">
            <div className="mr-auto text-xs text-muted-foreground self-center">
              {reviewRisks.length} risco(s) · {reviewRisks.filter((r) => r.criarCard).length} viram
              card(s)
            </div>
            <Button
              variant="outline"
              onClick={() => setReviewOpen(false)}
              disabled={commitMut.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleCommitReview} disabled={commitMut.isPending || reviewRisks.length === 0}>
              {commitMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar riscos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
