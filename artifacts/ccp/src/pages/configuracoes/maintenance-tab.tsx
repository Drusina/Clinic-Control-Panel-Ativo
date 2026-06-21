import { useState } from "react";
import {
  useRegenerateActionTarefas,
  useRegenerateAllTarefas,
} from "@workspace/api-client-react";
import { useClinicsForCurrentUser } from "@/hooks/use-clinics-for-current-user";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AlertTriangle, Building2, Globe, Loader2, Wrench } from "lucide-react";

interface RegenSummary {
  clinicsProcessed?: number;
  actionsProcessed: number;
  tarefasCreated: number;
  bySource: { modelo: number; ia: number; fallback: number };
}

function ResultSummary({ summary, scope }: { summary: RegenSummary; scope: "clinic" | "all" }) {
  return (
    <div
      className="rounded-md border border-border bg-muted/40 p-4 text-sm space-y-1"
      data-testid={`regen-result-${scope}`}
    >
      <p className="font-medium text-foreground">Regeneração concluída</p>
      {summary.clinicsProcessed != null && (
        <p className="text-muted-foreground">
          Clínicas processadas: <strong className="text-foreground">{summary.clinicsProcessed}</strong>
        </p>
      )}
      <p className="text-muted-foreground">
        Ações processadas: <strong className="text-foreground">{summary.actionsProcessed}</strong>
      </p>
      <p className="text-muted-foreground">
        Tarefas criadas: <strong className="text-foreground">{summary.tarefasCreated}</strong>
      </p>
      <p className="text-muted-foreground">
        Origem — modelo: {summary.bySource.modelo} · IA: {summary.bySource.ia} · fallback:{" "}
        {summary.bySource.fallback}
      </p>
    </div>
  );
}

function ErrorBox({ scope }: { scope: "clinic" | "all" }) {
  return (
    <p className="text-sm text-destructive" data-testid={`regen-error-${scope}`}>
      Falha ao regenerar as tarefas. Tente novamente.
    </p>
  );
}

export function MaintenanceTab() {
  const { clinics, isLoading: clinicsLoading } = useClinicsForCurrentUser();
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");

  const perClinic = useRegenerateActionTarefas();
  const all = useRegenerateAllTarefas();

  const selectedClinic = clinics.find((c) => c.id === selectedClinicId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Wrench className="h-5 w-5 text-primary" />
            Regenerar tarefas das ações
          </CardTitle>
          <CardDescription>
            Recria as tarefas sugeridas (somente os títulos) das ações já existentes. Ações do
            plano padrão reaproveitam a biblioteca curada; ações de risco/manuais usam a IA. As
            tarefas atuais são <strong>substituídas</strong> — os demais campos da ação (coluna,
            responsável, prazo, prioridade, pilar, risco) são preservados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Per-clinic */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Uma clínica</h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={selectedClinicId}
                onValueChange={(v) => {
                  setSelectedClinicId(v);
                  perClinic.reset();
                }}
                disabled={clinicsLoading}
              >
                <SelectTrigger className="sm:w-80" data-testid="select-regen-clinic">
                  <SelectValue
                    placeholder={clinicsLoading ? "Carregando clínicas..." : "Selecione uma clínica"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fantasia || c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="default"
                    className="gap-2"
                    disabled={!selectedClinicId || perClinic.isPending}
                    data-testid="button-regen-clinic"
                  >
                    {perClinic.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wrench className="h-4 w-4" />
                    )}
                    Regenerar tarefas desta clínica
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Substituir tarefas desta clínica?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      As tarefas atuais de todas as ações de{" "}
                      <strong>{selectedClinic?.fantasia || selectedClinic?.nome || "—"}</strong>{" "}
                      serão apagadas e recriadas. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => perClinic.mutate({ clinicId: selectedClinicId })}
                      data-testid="confirm-regen-clinic"
                    >
                      Substituir tarefas
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {perClinic.isError && <ErrorBox scope="clinic" />}
            {perClinic.isSuccess && perClinic.data && (
              <ResultSummary summary={perClinic.data} scope="clinic" />
            )}
          </section>

          {/* All clinics */}
          <section className="space-y-3 border-t border-border pt-6">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Todas as clínicas</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Roda a regeneração para todas as clínicas do sistema de uma só vez.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={all.isPending}
                  data-testid="button-regen-all"
                >
                  {all.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  Regenerar tarefas de todas as clínicas
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Substituir tarefas de TODAS as clínicas?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    As tarefas atuais de todas as ações de <strong>todas as clínicas</strong> serão
                    apagadas e recriadas. Dependendo do volume, pode levar alguns minutos. Esta ação
                    não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => all.mutate()}
                    data-testid="confirm-regen-all"
                  >
                    Substituir tarefas
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {all.isError && <ErrorBox scope="all" />}
            {all.isSuccess && all.data && <ResultSummary summary={all.data} scope="all" />}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
