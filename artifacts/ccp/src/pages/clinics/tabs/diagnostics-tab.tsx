import { useListDiagnostics, getListDiagnosticsQueryKey, useCreateDiagnostic, useCompleteDiagnostic } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, PlayCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function DiagnosticsTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: diagnostics, isLoading } = useListDiagnostics(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListDiagnosticsQueryKey(clinicId) },
  });

  const createDiagnostic = useCreateDiagnostic();
  const completeDiagnostic = useCompleteDiagnostic();

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
        onError: () => {
          toast({ variant: "destructive", title: "Erro", description: "Falha ao concluir diagnóstico." });
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
                <CardTitle className="text-primary flex items-center gap-2">
                  <PlayCircle className="h-5 w-5" />
                  Diagnóstico em Andamento (v{inProgress.versao})
                </CardTitle>
                <CardDescription>
                  Iniciado em {format(new Date(inProgress.iniciadoEm), "dd/MM/yyyy", { locale: ptBR })}
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => handleComplete(inProgress.id)} disabled={completeDiagnostic.isPending}>
                {completeDiagnostic.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                Concluir Diagnóstico
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-md text-sm text-muted-foreground text-center">
              Preenchimento do diagnóstico ocorre via formulário externo (integração Typeform/Jotform).
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
                  <p className="text-sm text-muted-foreground italic">Nenhum score registrado para este diagnóstico.</p>
                )}
                <div className="text-xs text-muted-foreground mt-4">
                  Concluído em: {diag.concluidoEm ? format(new Date(diag.concluidoEm), "dd/MM/yyyy", { locale: ptBR }) : "-"}
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
