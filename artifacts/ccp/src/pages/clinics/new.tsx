import { useLocation, Link } from "wouter";
import { useCreateClinic } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { ClinicForm, type ClinicFormValues } from "./clinic-form";

export default function NewClinic() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createClinic = useCreateClinic();

  function onSubmit(values: ClinicFormValues) {
    createClinic.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          toast({
            title: "Clínica cadastrada",
            description: "A clínica foi cadastrada com sucesso.",
          });
          setLocation(`/admin/clinicas/${data.id}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Erro ao cadastrar",
            description: "Ocorreu um erro ao tentar cadastrar a clínica.",
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
          <h1 className="text-3xl font-bold tracking-tight" data-testid="new-clinic-title">
            Nova Clínica
          </h1>
          <p className="text-muted-foreground">
            Cadastre uma nova clínica na plataforma.
          </p>
        </div>
      </div>

      <ClinicForm
        onSubmit={onSubmit}
        isSubmitting={createClinic.isPending}
        submitLabel="Salvar Clínica"
      />
    </div>
  );
}
