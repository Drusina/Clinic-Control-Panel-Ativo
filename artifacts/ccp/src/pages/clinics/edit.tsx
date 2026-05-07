import { useLocation, useParams, Link } from "wouter";
import {
  useGetClinic,
  useUpdateClinic,
  getGetClinicQueryKey,
  getListClinicsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Activity } from "lucide-react";
import {
  ClinicForm,
  type ClinicFormValues,
  clinicFormDefaults,
} from "./clinic-form";

export default function EditClinic() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateClinic = useUpdateClinic();

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

  const initialValues: ClinicFormValues = {
    ...clinicFormDefaults,
    nome: clinic.nome ?? "",
    fantasia: clinic.fantasia ?? "",
    cnpj: clinic.cnpj ?? "",
    razaoSocial: clinic.razaoSocial ?? "",
    cnae: clinic.cnae ?? "",
    situacaoCadastral: clinic.situacaoCadastral ?? "",
    capitalSocial: clinic.capitalSocial ?? 0,
    dataAbertura: clinic.dataAbertura ?? "",
    cidade: clinic.cidade ?? "",
    uf: clinic.uf ?? "",
    cep: clinic.cep ?? "",
    endereco: clinic.endereco ?? "",
    responsavel: clinic.responsavel ?? "",
    email: clinic.email ?? "",
    whatsapp: clinic.whatsapp ?? "",
    plano: clinic.plano,
    valorImplantacao: clinic.valorImplantacao ?? 0,
    valorRecorrente: clinic.valorRecorrente ?? 0,
    diaVencimento: clinic.diaVencimento ?? 10,
  };

  function onSubmit(values: ClinicFormValues) {
    updateClinic.mutate(
      { id, data: values },
      {
        onSuccess: () => {
          toast({
            title: "Clínica atualizada",
            description: "Os dados da clínica foram salvos com sucesso.",
          });
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListClinicsQueryKey() });
          setLocation("/admin/clinicas");
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Não foi possível salvar as alterações.";
          toast({
            variant: "destructive",
            title: "Erro ao atualizar",
            description: message,
          });
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/clinicas">
          <Button variant="outline" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="edit-clinic-title">
            Editar Clínica
          </h1>
          <p className="text-muted-foreground">
            Atualize os dados cadastrais de <strong>{clinic.nome}</strong>.
          </p>
        </div>
      </div>

      <ClinicForm
        defaultValues={initialValues}
        onSubmit={onSubmit}
        isSubmitting={updateClinic.isPending}
        submitLabel="Salvar Alterações"
        cancelHref="/admin/clinicas"
      />
    </div>
  );
}
