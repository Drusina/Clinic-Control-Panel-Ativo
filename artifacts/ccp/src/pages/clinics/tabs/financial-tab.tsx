import { useQueryClient } from "@tanstack/react-query";
import {
  useListDocumentosComerciais,
  getListDocumentosComerciaisQueryKey,
  getGetClinicQueryKey,
} from "@workspace/api-client-react";
import type { Clinic } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { CondicoesComerciaisCard } from "./commercial/condicoes-comerciais-card";
import { DocumentoComercialCard } from "./commercial/documento-comercial-card";
import { FaturasCard } from "./commercial/faturas-card";

export default function FinancialTab({
  clinicId,
  clinic,
}: {
  clinicId: string;
  clinic?: Clinic;
}) {
  const queryClient = useQueryClient();

  const { data: documentos } = useListDocumentosComerciais(clinicId, undefined, {
    query: {
      enabled: !!clinicId,
      queryKey: getListDocumentosComerciaisQueryKey(clinicId),
    },
  });

  const propostaVersions = (documentos ?? []).filter((d) => d.tipo === "proposta");
  const contratoVersions = (documentos ?? []).filter((d) => d.tipo === "contrato");

  const handleDocChanged = () => {
    queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinicId) });
    queryClient.invalidateQueries({
      queryKey: getListDocumentosComerciaisQueryKey(clinicId),
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#0F5F8F]/20 bg-gradient-to-r from-[#0B1F33] to-[#0F5F8F] px-6 py-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#00A3D9]">
          Central Comercial
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">CLINIONEX360</h2>
        <p className="mt-1 text-sm text-white/75">
          Condições, proposta, contrato e faturas desta clínica — tudo em um só
          lugar.
        </p>
      </div>

      {clinic ? (
        <>
          <CondicoesComerciaisCard clinic={clinic} />
          <div className="grid gap-6 lg:grid-cols-2">
            <DocumentoComercialCard
              clinic={clinic}
              tipo="proposta"
              versions={propostaVersions}
              latestDoc={propostaVersions[0]}
              onChanged={handleDocChanged}
            />
            <DocumentoComercialCard
              clinic={clinic}
              tipo="contrato"
              versions={contratoVersions}
              latestDoc={contratoVersions[0]}
              onChanged={handleDocChanged}
            />
          </div>
        </>
      ) : (
        <div className="p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#0F5F8F]" />
        </div>
      )}

      <FaturasCard clinicId={clinicId} clinic={clinic} />
    </div>
  );
}
