import { useState } from "react";
import { Link } from "wouter";
import {
  useListClinics,
  getListClinicsQueryKey,
  useGetDashboardSummary,
} from "@workspace/api-client-react";
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
import { Plus, Search, MoreHorizontal, Activity, Building2, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStatusBadgeVariant, getPlanBadgeVariant } from "./clinic-utils";
export { getStatusBadgeVariant, getPlanBadgeVariant } from "./clinic-utils";

export default function Clinics() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [plano, setPlano] = useState<string>("");

  const { data: summary } = useGetDashboardSummary();

  const { data, isLoading } = useListClinics(
    { search: search || undefined, status: status || undefined, plano: plano || undefined },
    { query: { queryKey: getListClinicsQueryKey({ search: search || undefined, status: status || undefined, plano: plano || undefined }) } }
  );

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

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
              data.data.map((clinic) => (
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
                        <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`btn-actions-${clinic.id}`}>
                          <span className="sr-only">Abrir menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/clinicas/${clinic.id}`} className="cursor-pointer w-full" data-testid={`link-view-${clinic.id}`}>
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Copiar Email</DropdownMenuItem>
                        <DropdownMenuItem>Copiar WhatsApp</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
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
    </div>
  );
}
