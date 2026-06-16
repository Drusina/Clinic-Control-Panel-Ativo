import { useEffect } from "react";
import { useParams, Link, Redirect } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setActiveClinicId } from "@/hooks/use-auth";
import PortalDashboard from "./portal-dashboard";
import KickoffTab from "@/pages/clinics/tabs/kickoff-tab";
import DiagnosticoSection from "@/pages/clinics/tabs/diagnostico-section";
import TeamTab from "@/pages/clinics/tabs/team-tab";
import RedeExternaTab from "@/pages/clinics/tabs/rede-externa-tab";
import SistemasAcessosTab from "@/pages/clinics/tabs/sistemas-acessos-tab";
import RiscosPage from "@/pages/riscos/index";
import AcaoPage from "@/pages/acao/index";
import ProcessosPage from "@/pages/processos/index";
import EvidenciasPage from "@/pages/evidencias/index";
import DocumentosPage from "@/pages/documentos/index";

const SECTION_LABELS: Record<string, string> = {
  kickoff: "Kickoff",
  diagnostico: "Diagnóstico 360°",
  riscos: "Mapa de Riscos",
  acao: "Plano de Ação",
  processos: "Processos",
  evidencias: "Evidências",
  documentos: "Documentos",
  equipe: "Equipe Interna",
  "rede-externa": "Rede Externa",
  "sistemas-acessos": "Sistemas e Acessos",
};

function renderSection(secao: string, clinicId: string) {
  switch (secao) {
    case "kickoff":
      return <KickoffTab clinicId={clinicId} />;
    case "diagnostico":
      return <DiagnosticoSection clinicId={clinicId} />;
    case "riscos":
      return <RiscosPage embedded />;
    case "acao":
      return <AcaoPage embedded />;
    case "processos":
      return <ProcessosPage embedded />;
    case "evidencias":
      return <EvidenciasPage embedded />;
    case "documentos":
      return <DocumentosPage embedded />;
    case "equipe":
      return <TeamTab clinicId={clinicId} />;
    case "rede-externa":
      return <RedeExternaTab clinicId={clinicId} />;
    case "sistemas-acessos":
      return <SistemasAcessosTab clinicId={clinicId} />;
    default:
      return null;
  }
}

/**
 * PainelClinica — unified workspace for a single clinic. The overview
 * (`visao-geral`) renders the module hub; every other section renders the
 * corresponding module INSIDE the panel with a consistent back-to-hub header.
 * Modules no longer live in the global chrome — navigation happens here.
 */
export default function PainelClinica() {
  const params = useParams<{ clinicId: string; secao?: string }>();
  const clinicId = params.clinicId;
  const secao = params.secao ?? "visao-geral";

  useEffect(() => {
    if (clinicId) setActiveClinicId(clinicId);
  }, [clinicId]);

  if (secao === "visao-geral") {
    return <PortalDashboard clinicId={clinicId} />;
  }

  if (secao === "delegacao") {
    return (
      <Redirect to={`/portal/clinica/${clinicId}/diagnostico?aba=delegacao`} />
    );
  }

  const label = SECTION_LABELS[secao];
  if (!label) {
    return <Redirect to={`/portal/clinica/${clinicId}`} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link href={`/portal/clinica/${clinicId}`}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            data-testid="btn-back-to-hub"
          >
            <ArrowLeft className="h-4 w-4" /> Painel
          </Button>
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <h1 className="text-xl font-semibold tracking-tight">{label}</h1>
      </div>
      {renderSection(secao, clinicId)}
    </div>
  );
}
