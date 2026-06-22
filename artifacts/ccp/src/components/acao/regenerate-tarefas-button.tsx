import { useRegenerateActionTarefas } from "@workspace/api-client-react";
import { useCurrentRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Loader2, Wrench } from "lucide-react";

/**
 * Botão super-admin para (re)gerar as tarefas sugeridas de TODAS as ações da
 * clínica atual, com confirmação destrutiva. O backend
 * (`POST /clinics/:clinicId/actions/regenerate-tarefas`) já exige super_admin e
 * SUBSTITUI as tarefas existentes; o gating aqui é apenas para esconder o botão
 * de quem não é super-admin. `onSuccess` deve invalidar a query da lista de
 * ações da superfície que monta este botão (as chaves diferem entre o Kanban e
 * a aba embutida).
 */
export function RegenerateTarefasButton({
  clinicId,
  clinicName,
  onSuccess,
}: {
  clinicId: string;
  clinicName?: string | null;
  onSuccess?: () => void;
}) {
  const { data: auth } = useCurrentRole();
  const { toast } = useToast();
  const regen = useRegenerateActionTarefas();

  if (auth?.role !== "super_admin") return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={regen.isPending}
          data-testid="button-regen-tarefas"
        >
          {regen.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wrench className="h-4 w-4" />
          )}
          Regenerar tarefas
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Substituir tarefas desta clínica?
          </AlertDialogTitle>
          <AlertDialogDescription>
            As tarefas atuais de <strong>todas as ações</strong>
            {clinicName ? (
              <>
                {" "}
                de <strong>{clinicName}</strong>
              </>
            ) : (
              " desta clínica"
            )}{" "}
            serão apagadas e recriadas. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="confirm-regen-tarefas"
            onClick={() =>
              regen.mutate(
                { clinicId },
                {
                  onSuccess: (summary) => {
                    onSuccess?.();
                    toast({
                      title: "Tarefas regeneradas",
                      description: `${summary.actionsProcessed} ações · ${summary.tarefasCreated} tarefas (modelo ${summary.bySource.modelo} · IA ${summary.bySource.ia} · fallback ${summary.bySource.fallback})`,
                    });
                  },
                  onError: () =>
                    toast({
                      variant: "destructive",
                      title: "Falha ao regenerar tarefas",
                      description: "Tente novamente em instantes.",
                    }),
                },
              )
            }
          >
            Substituir tarefas
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default RegenerateTarefasButton;
