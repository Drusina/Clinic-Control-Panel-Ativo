import { lazy, Suspense } from "react";
import { useParams } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useGetClinic, getGetClinicQueryKey } from "@workspace/api-client-react";

const AtaTab = lazy(() => import("./tabs/ata-tab"));
const PerfilOperacionalTab = lazy(() => import("./tabs/perfil-operacional-tab"));
const QuadroSocietarioTab = lazy(() => import("./tabs/quadro-societario-tab"));
const EquipeInternaTab = lazy(() => import("./tabs/equipe-interna-tab"));
const RedeExternaTab = lazy(() => import("./tabs/rede-externa-tab"));
const SistemasUsoTab = lazy(() => import("./tabs/sistemas-uso-tab"));
const DocumentosConstitutivoTab = lazy(() => import("./tabs/documentos-constitutivos-tab"));
const LgpdTab = lazy(() => import("./tabs/lgpd-tab"));

function TabFallback() {
  return (
    <div className="p-8 flex justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export default function KickoffPage() {
  const params = useParams<{ clinicId: string }>();
  const clinicId = params.clinicId;

  const { data: clinic, isLoading } = useGetClinic(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicQueryKey(clinicId) },
  });

  if (!clinicId) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <p className="text-xl font-semibold text-muted-foreground">Clínica não especificada</p>
        <Link href="/admin/clinicas">
          <Button variant="outline">Ver clínicas</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/clinicas/${clinicId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">Kick-off</h1>
            {clinic && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-xl font-medium text-muted-foreground">{clinic.nome}</span>
                <Badge variant="secondary" className="capitalize">{clinic.status}</Badge>
              </>
            )}
          </div>
          <p className="text-muted-foreground mt-1">Módulo completo de onboarding e levantamento inicial</p>
        </div>
      </div>

      <Tabs defaultValue="ata" className="w-full space-y-6">
        <TabsList className="bg-card border w-full flex overflow-x-auto justify-start rounded-md h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="ata" className="min-w-fit" data-testid="tab-ata">Ata</TabsTrigger>
          <TabsTrigger value="perfil" className="min-w-fit" data-testid="tab-perfil">Perfil Operacional</TabsTrigger>
          <TabsTrigger value="qsa" className="min-w-fit" data-testid="tab-qsa">Quadro Societário</TabsTrigger>
          <TabsTrigger value="equipe" className="min-w-fit" data-testid="tab-equipe">Equipe Interna</TabsTrigger>
          <TabsTrigger value="rede" className="min-w-fit" data-testid="tab-rede">Rede Externa</TabsTrigger>
          <TabsTrigger value="sistemas" className="min-w-fit" data-testid="tab-sistemas">Sistemas em Uso</TabsTrigger>
          <TabsTrigger value="docs" className="min-w-fit" data-testid="tab-docs">Documentos Constitutivos</TabsTrigger>
          <TabsTrigger value="lgpd" className="min-w-fit" data-testid="tab-lgpd">LGPD & Autorizações</TabsTrigger>
        </TabsList>

        <TabsContent value="ata">
          <Suspense fallback={<TabFallback />}>
            <AtaTab clinicId={clinicId} clinicName={clinic?.nome ?? undefined} />
          </Suspense>
        </TabsContent>
        <TabsContent value="perfil">
          <Suspense fallback={<TabFallback />}>
            <PerfilOperacionalTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="qsa">
          <Suspense fallback={<TabFallback />}>
            <QuadroSocietarioTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="equipe">
          <Suspense fallback={<TabFallback />}>
            <EquipeInternaTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="rede">
          <Suspense fallback={<TabFallback />}>
            <RedeExternaTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="sistemas">
          <Suspense fallback={<TabFallback />}>
            <SistemasUsoTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="docs">
          <Suspense fallback={<TabFallback />}>
            <DocumentosConstitutivoTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="lgpd">
          <Suspense fallback={<TabFallback />}>
            <LgpdTab clinicId={clinicId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
