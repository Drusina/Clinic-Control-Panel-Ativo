import { useListNotifications, getListNotificationsQueryKey, useMarkNotificationRead } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle, Info, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Notifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: notifications, isLoading } = useListNotifications({
    query: { queryKey: getListNotificationsQueryKey() },
  });

  const markRead = useMarkNotificationRead();

  const handleMarkRead = (id: string) => {
    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Erro", description: "Não foi possível marcar a notificação como lida." });
        }
      }
    );
  };

  const handleMarkAllRead = () => {
    const unread = notifications?.filter(n => !n.lida) || [];
    unread.forEach(n => {
      markRead.mutate({ id: n.id });
    });
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      toast({ title: "Notificações atualizadas" });
    }, 500);
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'alerta': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'info': return <Info className="h-5 w-5 text-primary" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const unreadCount = notifications?.filter(n => !n.lida).length || 0;

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="notifications-title">
            Notificações
          </h1>
          <p className="text-muted-foreground">
            Avisos, alertas e atualizações importantes do sistema.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={handleMarkAllRead}>
            <CheckCircle className="mr-2 h-4 w-4" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {notifications && notifications.length > 0 ? (
          notifications.map((notif) => (
            <Card key={notif.id} className={notif.lida ? "opacity-70 bg-muted/30" : "border-primary/20 shadow-sm"}>
              <CardContent className="p-4 flex gap-4">
                <div className="mt-1 shrink-0">
                  {getIcon(notif.tipo)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start gap-4">
                    <h4 className={`font-medium ${!notif.lida ? "text-foreground" : "text-muted-foreground"}`}>
                      {notif.titulo}
                    </h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(notif.createdAt), "dd MMM, HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {notif.mensagem && (
                    <p className="text-sm text-muted-foreground">
                      {notif.mensagem}
                    </p>
                  )}
                </div>
                {!notif.lida && (
                  <div className="shrink-0 flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(notif.id)}>
                      Marcar lida
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p>Você não tem nenhuma notificação no momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}
