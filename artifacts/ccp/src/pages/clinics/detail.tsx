import { useParams } from "wouter";
import {
  useGetClinic,
  getGetClinicQueryKey,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { getStatusBadgeVariant, getPlanBadgeVariant } from "./index";

import OverviewTab from "./tabs/overview-tab";
import KickoffTab from "./tabs/kickoff-tab";
import DiagnosticsTab from "./tabs/diagnostics-tab";
import ActionPlanTab from "./tabs/action-plan-tab";
import RisksTab from "./tabs/risks-tab";
import TeamTab from "./tabs/team-tab";
import RedeExternaTab from "./tabs/rede-externa-tab";
import FinancialTab from "./tabs/financial-tab";
import CadastroTab from "./tabs/cadastro-tab";
import StatusTab from "./tabs/status-tab";
import UsuariosTab from "./tabs/usuarios-tab";
import AtividadeTab from "./tabs/atividade-tab";
import DocumentosTab from "./tabs/documentos-tab";

export default function ClinicDetail() {
  const params = useParams();
  const id = params.id as string;

  const { data: clinic, isLoading } = useGetClinic(id, {
    query: { enabled: !!id, queryKey: getGetClinicQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-xl font-semibold">Clínica não encontrada.</p>
        <Link href="/admin/clinicas">
          <Button variant="outline">Voltar para clínicas</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/clinicas">
          <Button variant="outline" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="clinic-name">
              {clinic.nome}
            </h1>
            <Badge variant={getStatusBadgeVariant(clinic.status)} className="capitalize">
              {clinic.status}
            </Badge>
            <Badge variant={getPlanBadgeVariant(clinic.plano)} className="capitalize">
              {clinic.plano}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {clinic.cnpj} • {clinic.cidade}/{clinic.uf}
          </p>
        </div>
      </div>

      <Tabs defaultValue="cadastro" className="w-full space-y-6">
        <TabsList className="bg-card border w-full flex overflow-x-auto justify-start rounded-md h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="cadastro" className="min-w-fit" data-testid="tab-cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="financial" className="min-w-fit" data-testid="tab-financial">Financeiro & Contrato</TabsTrigger>
          <TabsTrigger value="status" className="min-w-fit" data-testid="tab-status">Status</TabsTrigger>
          <TabsTrigger value="usuarios" className="min-w-fit" data-testid="tab-usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="atividade" className="min-w-fit" data-testid="tab-atividade">Atividade</TabsTrigger>
          <TabsTrigger value="overview" className="min-w-fit">Visão Geral</TabsTrigger>
          <TabsTrigger value="kickoff" className="min-w-fit">Kickoff</TabsTrigger>
          <TabsTrigger value="documentos" className="min-w-fit" data-testid="tab-documentos">Documentos</TabsTrigger>
          <TabsTrigger value="diagnostics" className="min-w-fit">Diagnóstico</TabsTrigger>
          <TabsTrigger value="risks" className="min-w-fit">Riscos</TabsTrigger>
          <TabsTrigger value="actions" className="min-w-fit">Plano de Ação</TabsTrigger>
          <TabsTrigger value="team" className="min-w-fit">Equipe</TabsTrigger>
          <TabsTrigger value="rede-externa" className="min-w-fit" data-testid="tab-rede-externa">Rede Externa</TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro">
          <CadastroTab clinic={clinic} />
        </TabsContent>
        <TabsContent value="financial">
          <FinancialTab clinicId={id} clinic={clinic} />
        </TabsContent>
        <TabsContent value="status">
          <StatusTab clinic={clinic} />
        </TabsContent>
        <TabsContent value="usuarios">
          <UsuariosTab clinicId={id} />
        </TabsContent>
        <TabsContent value="atividade">
          <AtividadeTab clinicId={id} />
        </TabsContent>
        <TabsContent value="documentos">
          <DocumentosTab clinicId={id} />
        </TabsContent>
        <TabsContent value="overview">
          <OverviewTab clinic={clinic} />
        </TabsContent>
        <TabsContent value="kickoff">
          <KickoffTab clinicId={id} />
        </TabsContent>
        <TabsContent value="diagnostics">
          <DiagnosticsTab clinicId={id} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionPlanTab clinicId={id} />
        </TabsContent>
        <TabsContent value="risks">
          <RisksTab clinicId={id} />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab clinicId={id} />
        </TabsContent>
        <TabsContent value="rede-externa">
          <RedeExternaTab clinicId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
