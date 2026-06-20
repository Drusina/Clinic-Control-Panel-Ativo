import { useListDiagnostics, getListDiagnosticsQueryKey, useCreateDiagnostic, useCompleteDiagnostic, useReopenDiagnostic } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, PlayCircle, CheckCircle, ListChecks, Unlock, AlertTriangle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentRole } from "@/hooks/use-auth";
import { GenerateRisksButton } from "@/components/riscos/generate-risks-button";

const PILAR_LABELS: Record<string, string> = {
  estrategia: "Estratégia e Governança",
  financeiro: "Financeiro e Fluxo de Caixa",
  contabil: "Contabilidade e Fiscal",
  marketing: "Vendas, Marketing e Captação",
  operacoes: "Processos Operacionais",
  pessoas: "Gestão de Pessoas e Cultura",
  tecnologia: "Tecnologia e Sistemas",
  compliance: "Compliance e Regulamentação",
};

function pilarLabel(slug: string): string {
  return PILAR_LABELS[slug] ?? slug.replace(/_/g, " ");
}

function progressPct(p?: { totalQuestions: number; totalAnswered: number } | null): number {
  if (!p || p.totalQuestions <= 0) return 0;
  return Math.round((p.totalAnswered / p.totalQuestions) * 100);
}

export default function DiagnosticsTab({
  clinicId,
  buildDelegacaoHref,
}: {
  clinicId: string;
  buildDelegacaoHref?: (diagnosticoId: string) => string;
}) {
  const delegacaoHref =
    buildDelegacaoHref ??
    ((id: string) => `/delegacao/${clinicId}?diagnostico=${id}`);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { data: currentUser } = useCurrentRole();
  const isSuperAdmin = currentUser?.role === "super_admin";
  const { data: diagnostics, isLoading } = useListDiagnostics(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListDiagnosticsQueryKey(clinicId) },
  });

  const createDiagnostic = useCreateDiagnostic();
  const completeDiagnostic = useCompleteDiagnostic();
  const reopenDiagnostic = useReopenDiagnostic();

  const handleCreate = () => {
    createDiagnostic.mutate(
      { clinicId },
      {
        onSuccess: () => {
          toast({ title: "Diagnóstico iniciado", description: "Um novo diagnóstico foi criado para a clínica." });
          queryClient.invalidateQueries({ queryKey: getListDiagnosticsQueryKey(clinicId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Erro", description: "Falha ao iniciar diagnóstico." });
        },
      }
    );
  };

  const handleComplete = (id: string) => {
    completeDiagnostic.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Diagnóstico concluído", description: "O diagnóstico foi marcado como concluído." });
          queryClient.invalidateQueries({ queryKey: getListDiagnosticsQueryKey(clinicId) });
        },
        onError: (err: unknown) => {
          const data = (err as { data?: { error?: string } } | null)?.data;
          toast({
            variant: "destructive",
            title: "Erro",
            description: data?.error ?? "Falha ao concluir diagnóstico.",
          });
        },
      }
    );
  };

  const handleReopen = (id: string) => {
    reopenDiagnostic.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Diagnóstico reaberto", description: "Agora as respostas podem ser editadas novamente." });
          queryClient.invalidateQueries({ queryKey: getListDiagnosticsQueryKey(clinicId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Erro", description: "Falha ao reabrir diagnóstico." });
        },
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  const inProgress = diagnostics?.find(d => d.status === "em_andamento");
  const history = diagnostics?.filter(d => d.status !== "em_andamento") || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Diagnósticos de Maturidade</h3>
          <p className="text-sm text-muted-foreground">Avalie os pilares de gestão da clínica.</p>
        </div>
        {!inProgress && (
          <Button onClick={handleCreate} disabled={createDiagnostic.isPending}>
            {createDiagnostic.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Novo Diagnóstico
          </Button>
        )}
      </div>

      {inProgress && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-primary flex flex-wrap items-center gap-2">
                  <PlayCircle className="h-5 w-5" />
                  Diagnóstico em Andamento (v{inProgress.versao})
                  {inProgress.progresso &&
                    (inProgress.progresso.completo ? (
                      <Badge className="bg-green-600 text-white hover:bg-green-600">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Pronto para concluir
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {progressPct(inProgress.progresso)}% respondido
                      </Badge>
                    ))}
                </CardTitle>
                <CardDescription>
                  Iniciado em {format(new Date(inProgress.iniciadoEm), "dd/MM/yyyy", { locale: ptBR })}
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => handleComplete(inProgress.id)}
                disabled={completeDiagnostic.isPending || !inProgress.progresso?.completo}
                title={
                  inProgress.progresso?.completo
                    ? undefined
                    : "Conclua todas as perguntas dos 8 pilares para liberar a conclusão."
                }
              >
                {completeDiagnostic.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Concluir Diagnóstico
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {inProgress.progresso && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {inProgress.progresso.totalAnswered} de {inProgress.progresso.totalQuestions} perguntas respondidas
                  </span>
                  <span className="text-muted-foreground">
                    {inProgress.progresso.totalQuestions > 0
                      ? Math.round(
                          (inProgress.progresso.totalAnswered / inProgress.progresso.totalQuestions) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    inProgress.progresso.totalQuestions > 0
                      ? (inProgress.progresso.totalAnswered / inProgress.progresso.totalQuestions) * 100
                      : 0
                  }
                  className="h-2"
                />
                {!inProgress.progresso.completo ? (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        Faltam {inProgress.progresso.totalQuestions - inProgress.progresso.totalAnswered} de{" "}
                        {inProgress.progresso.totalQuestions} perguntas para concluir.
                      </p>
                      {(() => {
                        const incompletos = inProgress.progresso.pilares.filter((p) => !p.completo);
                        if (incompletos.length === 0) return null;
                        return (
                          <p className="mt-1 text-amber-700">
                            Pilares pendentes:{" "}
                            {incompletos
                              .map((p) => `${pilarLabel(p.slug)} (${p.answeredCount}/${p.questionCount})`)
                              .join(", ")}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                    <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">
                        Todas as {inProgress.progresso.totalQuestions} perguntas dos 8 pilares foram respondidas.
                      </p>
                      <p className="mt-1 text-green-700">
                        O diagnóstico está pronto para concluir.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="bg-muted/50 p-4 rounded-md text-sm text-muted-foreground text-center space-y-3">
              <p>Responda às perguntas e delegue pilares, módulos ou perguntas individuais na tela de Delegação.</p>
              <Link href={delegacaoHref(inProgress.id)}>
                <Button size="sm" variant="default">
                  <ListChecks className="h-4 w-4 mr-2" />
                  Abrir delegação e responder
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Histórico</h4>
          {history.map((diag) => (
            <Card key={diag.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <h5 className="font-semibold">Versão {diag.versao}</h5>
                    <Badge variant={diag.status === "concluido" ? "default" : "secondary"}>
                      {diag.status === "concluido" ? "Concluído" : "Arquivado"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-primary">{diag.scoreGlobal?.toFixed(1) || "-"}</span>
                    <span className="text-sm text-muted-foreground">/5.0 Geral</span>
                  </div>
                </div>
                
                {diag.scoresPilares && Object.keys(diag.scoresPilares).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                    {Object.entries(diag.scoresPilares as Record<string, number>).map(([pilar, score]) => (
                      <div key={pilar} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium capitalize">{pilar.replace(/_/g, " ")}</span>
                          <span>{score.toFixed(1)}/5.0</span>
                        </div>
                        <Progress value={(score / 5) * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground italic">Nenhum score registrado para este diagnóstico.</p>
                    {diag.progresso && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {diag.progresso.totalAnswered} de {diag.progresso.totalQuestions} perguntas respondidas
                          </span>
                          <span>{progressPct(diag.progresso)}%</span>
                        </div>
                        <Progress value={progressPct(diag.progresso)} className="h-2" />
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between mt-4">
                  <div className="text-xs text-muted-foreground">
                    Concluído em: {diag.concluidoEm ? format(new Date(diag.concluidoEm), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                  </div>
                  <div className="flex items-center gap-1">
                    {diag.status === "concluido" && isSuperAdmin && (
                      <GenerateRisksButton
                        clinicId={clinicId}
                        diagnosticId={diag.id}
                        label="Gerar mapa de riscos"
                        size="sm"
                        className="text-xs"
                        onCommitted={() => navigate(`/riscos/${clinicId}`)}
                      />
                    )}
                    {diag.status === "concluido" && !inProgress && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-xs" disabled={reopenDiagnostic.isPending}>
                            {reopenDiagnostic.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Unlock className="h-3 w-3 mr-1" />
                            )}
                            Reabrir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reabrir diagnóstico?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O diagnóstico (v{diag.versao}) voltará para "Em andamento" e as respostas
                              poderão ser editadas novamente. Conclua-o de novo após as alterações para
                              atualizar os scores.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleReopen(diag.id)}>Reabrir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Link href={delegacaoHref(diag.id)}>
                      <Button size="sm" variant="ghost" className="text-xs">
                        <ListChecks className="h-3 w-3 mr-1" /> Ver respostas
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!inProgress && history.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-primary/10 p-3 mb-4">
              <PlayCircle className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-1">Nenhum diagnóstico</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              A clínica ainda não possui diagnósticos de maturidade registrados. Inicie um para avaliar as áreas de gestão.
            </p>
            <Button onClick={handleCreate} disabled={createDiagnostic.isPending}>
              <Plus className="mr-2 h-4 w-4" /> Novo Diagnóstico
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
