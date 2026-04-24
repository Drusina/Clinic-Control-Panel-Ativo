import {
  useGetClinicActivity,
  getGetClinicActivityQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Activity, FileText, UserPlus, Settings, CheckCircle, AlertCircle, Building2, Star } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPO_ICONS: Record<string, React.ReactNode> = {
  cadastro: <Building2 className="h-4 w-4 text-blue-500" />,
  proposta_enviada: <FileText className="h-4 w-4 text-blue-400" />,
  contrato_assinado: <CheckCircle className="h-4 w-4 text-green-500" />,
  kickoff_realizado: <Star className="h-4 w-4 text-amber-500" />,
  status_change: <Settings className="h-4 w-4 text-purple-500" />,
  usuario_convidado: <UserPlus className="h-4 w-4 text-teal-500" />,
  default: <Activity className="h-4 w-4 text-muted-foreground" />,
};

const TIPO_COLORS: Record<string, string> = {
  cadastro: "bg-blue-50 border-blue-200 dark:bg-blue-950",
  proposta_enviada: "bg-blue-50 border-blue-200 dark:bg-blue-950",
  contrato_assinado: "bg-green-50 border-green-200 dark:bg-green-950",
  kickoff_realizado: "bg-amber-50 border-amber-200 dark:bg-amber-950",
  status_change: "bg-purple-50 border-purple-200 dark:bg-purple-950",
  usuario_convidado: "bg-teal-50 border-teal-200 dark:bg-teal-950",
  default: "bg-card border-border",
};

export default function AtividadeTab({ clinicId }: { clinicId: string }) {
  const { data: activities, isLoading } = useGetClinicActivity(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicActivityQueryKey(clinicId) },
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linha do Tempo de Atividades</CardTitle>
        <CardDescription>
          Histórico completo de eventos e interações com esta clínica.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities && activities.length > 0 ? (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {activities.map((activity, i) => {
                const icon = TIPO_ICONS[activity.tipo] ?? TIPO_ICONS.default;
                const colorClass = TIPO_COLORS[activity.tipo] ?? TIPO_COLORS.default;

                return (
                  <div key={activity.id} className="relative pl-12">
                    <div
                      className={`absolute left-3 top-2 h-5 w-5 rounded-full border flex items-center justify-center ${colorClass}`}
                    >
                      {icon}
                    </div>
                    <div className={`rounded-lg border p-3 ${colorClass}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.titulo}</p>
                          {activity.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {activity.descricao}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.createdAt), "HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      {activity.autorNome && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span>por {activity.autorNome}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhuma atividade registrada ainda.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
