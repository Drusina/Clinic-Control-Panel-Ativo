import { useState } from "react";
import { Link } from "wouter";
import {
  useListClinics,
  getListClinicsQueryKey,
  useGetDashboardSummary,
  useUpdateClinicStatus,
  type Clinic,
  type ClinicStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Search,
  MoreHorizontal,
  Activity,
  Building2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Pencil,
  XCircle,
  PlayCircle,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getStatusBadgeVariant, getPlanBadgeVariant } from "./clinic-utils";
export { getStatusBadgeVariant, getPlanBadgeVariant } from "./clinic-utils";

const ALLOWED_TRANSITIONS: Record<ClinicStatus, ClinicStatus[]> = {
  prospect: ["proposta", "desativada"],
  proposta: ["contrato", "prospect", "desativada"],
  contrato: ["trial", "proposta", "desativada"],
  trial: ["ativa", "contrato", "suspensa", "desativada"],
  ativa: ["suspensa", "desativada"],
  suspensa: ["ativa", "desativada"],
  desativada: [],
};

export default function Clinics() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [plano, setPlano] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateClinicStatus();

  const [deactivateTarget, setDeactivateTarget] = useState<Clinic | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<Clinic | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deactivateReason, setDeactivateReason] = useState("");

  const { data: summary } = useGetDashboardSummary();

  const listFilters = {
    search: search || undefined,
    status: status || undefined,
    plano: plano || undefined,
  };

  const { data, isLoading } = useListClinics(listFilters, {
    query: { queryKey: getListClinicsQueryKey(listFilters) },
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const closeDeactivate = () => {
    setDeactivateTarget(null);
    setConfirmName("");
    setDeactivateReason("");
  };

  const closeReactivate = () => {
    setReactivateTarget(null);
  };

  const runStatusUpdate = (
    clinic: Clinic,
    next: ClinicStatus,
    motivo: string | null,
    onDone: () => void,
  ) => {
    updateStatus.mutate(
      { id: clinic.id, data: { status: next, motivo } },
      {
        onSuccess: () => {
          toast({
            title:
              next === "desativada"
                ? `${clinic.nome} foi desativada.`
                : `${clinic.nome} foi reativada.`,
          });
          queryClient.invalidateQueries({ queryKey: getListClinicsQueryKey() });
          onDone();
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Não foi possível atualizar o status.";
          toast({
            variant: "destructive",
            title: "Erro ao alterar status",
            description: message,
          });
        },
      },
    );
  };

  const handleConfirmDeactivate = () => {
    if (!deactivateTarget) return;
    if (confirmName.trim() !== deactivateTarget.nome) {
      toast({ variant: "destructive", title: "Nome da clínica não confere" });
      return;
    }
    const reason = deactivateReason.trim()
      ? deactivateReason.trim()
      : "Clínica desativada pelo super admin.";
    runStatusUpdate(deactivateTarget, "desativada", reason, closeDeactivate);
  };

  const handleConfirmReactivate = () => {
    if (!reactivateTarget) return;
    runStatusUpdate(reactivateTarget, "ativa", null, closeReactivate);
  };

  const kpis = [
    {
      label: "Total de Clínicas",
      value: summary?.totalClinics ?? 0,
      icon: Building2,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950",
    },
    {
      label: "Ativas",
      value: summary?.clinicasAtivas ?? 0,
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950",
    },
    {
      label: "Em Trial",
      value: summary?.clinicasTrial ?? 0,
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-950",
    },
    {
      label: "Suspensas",
      value: summary?.clinicasSuspensas ?? 0,
      icon: AlertTriangle,
      color: "text-orange-500",
      bg: "bg-orange-50 dark:bg-orange-950",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="clinics-title">
            Clínicas
          </h1>
          <p className="text-muted-foreground">
            Gerencie todas as clínicas cadastradas na plataforma.
          </p>
        </div>
        <Link href="/admin/clinicas/new">
          <Button data-testid="btn-new-clinic">
            <Plus className="mr-2 h-4 w-4" /> Nova Clínica
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <div className={`rounded-full p-2 ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {kpi.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CNPJ..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-clinics"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="proposta">Proposta</SelectItem>
              <SelectItem value="contrato">Contrato</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="ativa">Ativa</SelectItem>
              <SelectItem value="suspensa">Suspensa</SelectItem>
              <SelectItem value="desativada">Desativada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={plano} onValueChange={setPlano}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos os Planos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Planos</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead className="text-right">MRR</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Activity className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : data?.data && data.data.length > 0 ? (
              data.data.map((clinic) => {
                const transitions = ALLOWED_TRANSITIONS[clinic.status as ClinicStatus] ?? [];
                const canDeactivate = transitions.includes("desativada");
                const canReactivate =
                  clinic.status === "suspensa" && transitions.includes("ativa");
                const isUpdatingThis =
                  updateStatus.isPending &&
                  (deactivateTarget?.id === clinic.id || reactivateTarget?.id === clinic.id);

                return (
                  <TableRow key={clinic.id} data-testid={`row-clinic-${clinic.id}`}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{clinic.nome}</span>
                        <span className="text-xs text-muted-foreground">{clinic.cidade}/{clinic.uf}</span>
                      </div>
                    </TableCell>
                    <TableCell>{clinic.cnpj}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{clinic.responsavel || "-"}</span>
                        <span className="text-xs text-muted-foreground">{clinic.email || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPlanBadgeVariant(clinic.plano)} className="capitalize">
                        {clinic.plano}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(clinic.status)} className="capitalize">
                        {clinic.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{clinic.etapa}/10</span>
                        <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${clinic.progresso}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {clinic.valorRecorrente
                        ? formatCurrency(clinic.valorRecorrente)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`btn-actions-${clinic.id}`} disabled={isUpdatingThis}>
                            <span className="sr-only">Abrir menu</span>
                            {isUpdatingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/clinicas/${clinic.id}`} className="cursor-pointer w-full" data-testid={`link-view-${clinic.id}`}>
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/admin/clinicas/${clinic.id}/editar`}
                              className="cursor-pointer w-full"
                              data-testid={`link-edit-${clinic.id}`}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Editar clínica
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>Copiar Email</DropdownMenuItem>
                          <DropdownMenuItem>Copiar WhatsApp</DropdownMenuItem>
                          {(canDeactivate || canReactivate) && <DropdownMenuSeparator />}
                          {canReactivate && (
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setReactivateTarget(clinic);
                              }}
                              data-testid={`btn-reactivate-${clinic.id}`}
                            >
                              <PlayCircle className="mr-2 h-4 w-4 text-green-600" />
                              Reativar clínica
                            </DropdownMenuItem>
                          )}
                          {canDeactivate && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setDeactivateTarget(clinic);
                              }}
                              data-testid={`btn-deactivate-${clinic.id}`}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Inativar clínica
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Nenhuma clínica encontrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => {
          if (!open) closeDeactivate();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Inativar clínica</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Conforme a <strong>Cláusula 14</strong> do contrato, os dados
              da clínica serão retidos por 90 dias e então permanentemente removidos.
            </DialogDescription>
          </DialogHeader>
          {deactivateTarget && (
            <div className="space-y-3">
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive inline mr-2" />
                Para confirmar, digite o nome da clínica:{" "}
                <strong>{deactivateTarget.nome}</strong>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deactivate-confirm">Nome da clínica</Label>
                <Input
                  id="deactivate-confirm"
                  placeholder={deactivateTarget.nome}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  data-testid="input-deactivate-confirm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deactivate-reason">Motivo (opcional)</Label>
                <Textarea
                  id="deactivate-reason"
                  placeholder="Ex.: Encerramento contratual solicitado pelo cliente."
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDeactivate} disabled={updateStatus.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={
                !deactivateTarget ||
                confirmName.trim() !== deactivateTarget.nome ||
                updateStatus.isPending
              }
              data-testid="btn-confirm-deactivate"
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Inativar clínica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!reactivateTarget}
        onOpenChange={(open) => {
          if (!open) closeReactivate();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reativar clínica</DialogTitle>
            <DialogDescription>
              {reactivateTarget ? (
                <>
                  A clínica <strong>{reactivateTarget.nome}</strong> voltará ao status{" "}
                  <strong>Ativa</strong> e os usuários terão acesso liberado novamente.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeReactivate} disabled={updateStatus.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReactivate}
              disabled={updateStatus.isPending}
              data-testid="btn-confirm-reactivate"
            >
              {updateStatus.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reativar clínica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
