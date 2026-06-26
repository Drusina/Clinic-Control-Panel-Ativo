import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Stethoscope, Share2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DiagnosticsTab from "./diagnostics-tab";
import DelegacaoPage from "@/pages/delegacao/index";

const TAB_DIAGNOSTICOS = "diagnosticos";
const TAB_DELEGACAO = "delegacao";

export default function DiagnosticoSection({
  clinicId,
  basePath,
  buildDelegacaoHref,
}: {
  clinicId: string;
  /**
   * Path the inner tab switcher navigates to (query string is appended). Defaults
   * to the portal diagnóstico section; the super-admin clinic detail passes its
   * own `/admin/clinicas/:id` base so the `?tab=diagnostics&aba=…` URL is kept.
   */
  basePath?: string;
  /** Overrides the per-diagnostic delegação deep link rendered inside DiagnosticsTab. */
  buildDelegacaoHref?: (diagnosticoId: string) => string;
}) {
  const search = useSearch();
  const [, navigate] = useLocation();

  const sectionPath = basePath ?? `/portal/clinica/${clinicId}/diagnostico`;
  const delegacaoHref =
    buildDelegacaoHref ??
    ((id: string) => `${sectionPath}?aba=delegacao&diagnostico=${id}`);

  const abaFromUrl = useMemo(() => {
    const sp = new URLSearchParams(search);
    return sp.get("aba") === TAB_DELEGACAO ? TAB_DELEGACAO : TAB_DIAGNOSTICOS;
  }, [search]);

  const [activeTab, setActiveTab] = useState<string>(abaFromUrl);

  useEffect(() => {
    setActiveTab(abaFromUrl);
  }, [abaFromUrl]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const sp = new URLSearchParams(search);
    if (value === TAB_DELEGACAO) sp.set("aba", TAB_DELEGACAO);
    else sp.delete("aba");
    const qs = sp.toString();
    navigate(`${sectionPath}${qs ? `?${qs}` : ""}`, { replace: true });
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      className="w-full space-y-6"
    >
      <TabsList className="bg-card border w-full flex overflow-x-auto justify-start rounded-md h-auto flex-wrap gap-1 p-1">
        <TabsTrigger
          value={TAB_DIAGNOSTICOS}
          className="min-w-fit gap-2"
          data-testid="tab-diagnosticos"
        >
          <Stethoscope className="h-4 w-4" /> Diagnósticos
        </TabsTrigger>
        <TabsTrigger
          value={TAB_DELEGACAO}
          className="min-w-fit gap-2"
          data-testid="tab-delegacao"
        >
          <Share2 className="h-4 w-4" /> Delegação &amp; Respostas
        </TabsTrigger>
      </TabsList>

      <TabsContent value={TAB_DIAGNOSTICOS}>
        <DiagnosticsTab clinicId={clinicId} buildDelegacaoHref={delegacaoHref} />
      </TabsContent>
      <TabsContent value={TAB_DELEGACAO}>
        <DelegacaoPage embedded clinicId={clinicId} />
      </TabsContent>
    </Tabs>
  );
}
