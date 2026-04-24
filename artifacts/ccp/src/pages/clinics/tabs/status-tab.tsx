import { useState } from "react";
import {
  useUpdateClinicStatus,
  useGetClinicStatusHistory,
  getGetClinicStatusHistoryQueryKey,
} from "@workspace/api-client-react";
import type { Clinic } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetClinicQueryKey } from "@workspace/api-client-react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  PauseCircle,
  PlayCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type ClinicStatus = "prospect" | "proposta" | "contrato" | "trial" | "ativa" | "suspensa" | "desativada";

const STATUS_LABELS: Record<ClinicStatus, string> = {
  prospect: "Prospect",
  proposta: "Proposta",
  contrato: "Contrato",
  trial: "Trial",
  ativa: "Ativa",
  suspensa: "Suspensa",
  desativada: "Desativada",
};

const STATUS_COLORS: Record<ClinicStatus, string> = {
  prospect: "text-gray-500 bg-gray-50 border-gray-200 dark:bg-gray-900",
  proposta: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950",
  contrato: "text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950",
  trial: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950",
  ativa: "text-green-600 bg-green-50 border-green-200 dark:bg-green-950",
  suspensa: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950",
  desativada: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950",
};

const LIFECYCLE_STEPS: ClinicStatus[] = [
  "prospect",
  "proposta",
  "contrato",
  "trial",
  "ativa",
  "suspensa",
  "desativada",
];

const STATUS_ICONS: Record<string, React.ReactNode> = {
  prospect: <Clock className="h-4 w-4" />,
  proposta: <Clock className="h-4 w-4" />,
  contrato: <CheckCircle className="h-4 w-4" />,
  trial: <PlayCircle className="h-4 w-4" />,
  ativa: <CheckCircle className="h-4 w-4" />,
  suspensa: <PauseCircle className="h-4 w-4" />,
  desativada: <XCircle className="h-4 w-4" />,
};

const ALLOWED_TRANSITIONS: Record<ClinicStatus, ClinicStatus[]> = {
  prospect: ["proposta", "desativada"],
  proposta: ["contrato", "prospect", "desativada"],
  contrato: ["trial", "proposta", "desativada"],
  trial: ["ativa", "contrato", "suspensa", "desativada"],
  ativa: ["suspensa", "desativada"],
  suspensa: ["ativa", "desativada"],
  desativada: [],
};

export default function StatusTab({ clinic }: { clinic: Clinic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suspenderMotivo, setSuspenderMotivo] = useState("");
  const [isSuspenderOpen, setIsSuspenderOpen] = useState(false);
  const [isDesativarOpen, setIsDesativarOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pendingStatus, setPendingStatus] = useState<ClinicStatus | null>(null);

  const updateStatus = useUpdateClinicStatus();

  const { data: statusHistory, isLoading: loadingHistory } = useGetClinicStatusHistory(clinic.id, {
    query: { enabled: !!clinic.id, queryKey: getGetClinicStatusHistoryQueryKey(clinic.id) },
  });

  const currentStatus = clinic.status as ClinicStatus;
  const allowedTransitions = ALLOWED_TRANSITIONS[currentStatus] ?? [];

  const handleStatusChange = (newStatus: ClinicStatus) => {
    if (newStatus === "suspensa") {
      setPendingStatus(newStatus);
      setIsSuspenderOpen(true);
      return;
    }
    if (newStatus === "desativada") {
      setPendingStatus(newStatus);
      setIsDesativarOpen(true);
      return;
    }
    doStatusChange(newStatus, undefined);
  };

  const doStatusChange = (newStatus: ClinicStatus, motivo?: string) => {
    updateStatus.mutate(
      { id: clinic.id, data: { status: newStatus, motivo: motivo ?? null } },
      {
        onSuccess: () => {
          toast({ title: `Status alterado para ${STATUS_LABELS[newStatus]}` });
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinic.id) });
          queryClient.invalidateQueries({ queryKey: getGetClinicStatusHistoryQueryKey(clinic.id) });
          setIsSuspenderOpen(false);
          setIsDesativarOpen(false);
          setSuspenderMotivo("");
          setConfirmText("");
          setPendingStatus(null);
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao alterar status" }),
      }
    );
  };

  const onConfirmSuspender = () => {
    if (!suspenderMotivo.trim()) {
      toast({ variant: "destructive", title: "Informe o motivo da suspensão" });
      return;
    }
    doStatusChange("suspensa", suspenderMotivo);
  };

  const onConfirmDesativar = () => {
    if (confirmText !== clinic.nome) {
      toast({ variant: "destructive", title: "Nome da clínica não confere" });
      return;
    }
    doStatusChange("desativada", "Clínica desativada pelo super admin.");
  };

  const progressIndex = LIFECYCLE_STEPS.indexOf(currentStatus);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Status Atual</CardTitle>
          <CardDescription>Ciclo de vida da clínica na plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${STATUS_COLORS[currentStatus]}`}>
              {STATUS_ICONS[currentStatus]}
              {STATUS_LABELS[currentStatus]}
            </div>
            {currentStatus === "suspensa" && clinic.suspensoMotivo && (
              <p className="text-sm text-muted-foreground">Motivo: {clinic.suspensoMotivo}</p>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {LIFECYCLE_STEPS.filter(s => s !== "suspensa" && s !== "desativada").map((step, i, arr) => (
              <div key={step} className="flex items-center gap-1 shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    step === currentStatus
                      ? STATUS_COLORS[currentStatus]
                      : LIFECYCLE_STEPS.indexOf(step) < progressIndex
                      ? "text-green-600 bg-green-50 border-green-200 dark:bg-green-950"
                      : "text-muted-foreground bg-muted border-border"
                  }`}
                >
                  {step === currentStatus && STATUS_ICONS[step]}
                  {STATUS_LABELS[step]}
                </div>
                {i < arr.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>

          {allowedTransitions.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Ações disponíveis:</p>
              <div className="flex flex-wrap gap-2">
                {allowedTransitions.map((status) => {
                  const isSuspender = status === "suspensa";
                  const isDesativar = status === "desativada";
                  const isReativar = status === "ativa" && currentStatus === "suspensa";

                  return (
                    <Button
                      key={status}
                      variant={isDesativar ? "destructive" : isSuspender ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleStatusChange(status)}
                      disabled={updateStatus.isPending}
                      data-testid={`btn-status-${status}`}
                    >
                      {updateStatus.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      {isDesativar && <XCircle className="mr-2 h-4 w-4" />}
                      {isSuspender && <PauseCircle className="mr-2 h-4 w-4" />}
                      {isReativar && <PlayCircle className="mr-2 h-4 w-4" />}
                      {STATUS_LABELS[status]}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStatus === "desativada" && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive text-sm">Clínica Desativada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Conforme <strong>Cláusula 14</strong> do contrato, os dados desta clínica serão
                    retidos por 90 dias após a desativação. Após este período, os dados serão
                    permanentemente removidos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Status</CardTitle>
          <CardDescription>Linha do tempo de todas as alterações de status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
          ) : statusHistory && statusHistory.length > 0 ? (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4 pl-10">
                {statusHistory.map((entry, i) => (
                  <div key={entry.id} className="relative">
                    <div className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-background ${
                      i === 0 ? "bg-primary" : "bg-muted-foreground"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${STATUS_COLORS[entry.status as ClinicStatus] ?? ""}`}
                        >
                          {STATUS_LABELS[entry.status as ClinicStatus] ?? entry.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        {entry.autorNome && (
                          <span className="text-xs text-muted-foreground">• {entry.autorNome}</span>
                        )}
                      </div>
                      {entry.motivo && (
                        <p className="text-sm text-muted-foreground mt-1">{entry.motivo}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
              Nenhuma alteração de status registrada.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSuspenderOpen} onOpenChange={setIsSuspenderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suspender Clínica</DialogTitle>
            <DialogDescription>
              Informe o motivo da suspensão. Este campo é obrigatório e ficará registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo da Suspensão</Label>
            <Textarea
              id="motivo"
              placeholder="Descreva o motivo da suspensão..."
              value={suspenderMotivo}
              onChange={(e) => setSuspenderMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSuspenderOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmSuspender}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDesativarOpen} onOpenChange={setIsDesativarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Desativar Clínica</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Conforme a <strong>Cláusula 14</strong> do contrato, os dados
              serão retidos por 90 dias e então permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive inline mr-2" />
              Para confirmar, digite o nome da clínica: <strong>{clinic.nome}</strong>
            </div>
            <Input
              placeholder={clinic.nome}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDesativarOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDesativar}
              disabled={confirmText !== clinic.nome || updateStatus.isPending}
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desativar Clínica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
