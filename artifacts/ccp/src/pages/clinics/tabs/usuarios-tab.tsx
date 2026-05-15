import { useState } from "react";
import {
  useListTeam,
  getListTeamQueryKey,
  useCreateTeamMember,
  useUpdateTeamMember,
  useDeleteTeamMember,
  useInviteClinicUser,
  useResendClinicTeamInvite,
} from "@workspace/api-client-react";
import type { TeamMember, UpdateTeamMemberBody, InviteUserResponse } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus, MoreHorizontal, Mail, UserPlus, ShieldCheck, Clock, Copy, CheckCheck, Link2 } from "lucide-react";

const inviteSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(["admin", "gestor", "colaborador"]),
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  colaborador: "Colaborador",
};

const ROLE_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "default",
  gestor: "secondary",
  colaborador: "outline",
};

export default function UsuariosTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const { data: members, isLoading } = useListTeam(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListTeamQueryKey(clinicId) },
  });

  const inviteUser = useInviteClinicUser();
  const resendInvite = useResendClinicTeamInvite();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "colaborador" },
  });

  const platformUsers = members?.filter((m) => m.temAcessoPlataforma) ?? [];

  const onInvite = (values: z.infer<typeof inviteSchema>) => {
    inviteUser.mutate(
      { id: clinicId, data: { email: values.email, role: values.role } },
      {
        onSuccess: (resp: InviteUserResponse) => {
          queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
          setIsInviteOpen(false);
          form.reset();
          if (resp.inviteLink) {
            setInviteLink(resp.inviteLink);
          } else {
            toast({ title: "Convite enviado", description: resp.message });
          }
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao enviar convite" }),
      }
    );
  };

  const handleRevoke = (member: TeamMember) => {
    if (!confirm(`Revogar acesso de ${member.nome}?`)) return;
    updateMember.mutate(
      { id: member.id, data: { temAcessoPlataforma: false } as UpdateTeamMemberBody },
      {
        onSuccess: () => {
          toast({ title: "Acesso revogado" });
          queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao revogar acesso" }),
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Usuários da Plataforma</CardTitle>
            <CardDescription>
              Gerencie quem tem acesso ao painel desta clínica.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIsInviteOpen(true)} data-testid="btn-invite-user">
            <UserPlus className="mr-2 h-4 w-4" /> Convidar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Convite</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {platformUsers.length > 0 ? (
                  platformUsers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                            {member.nome.charAt(0).toUpperCase()}
                          </div>
                          <span>{member.nome}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ROLE_COLORS[member.funcao ?? "colaborador"] ?? "outline"}
                        >
                          {ROLE_LABELS[member.funcao ?? "colaborador"] ?? member.funcao ?? "Colaborador"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {member.email ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {member.inviteStatus === "pending" && (
                          <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-400">
                            Pendente
                          </Badge>
                        )}
                        {member.inviteStatus === "accepted" && (
                          <Badge variant="secondary" className="gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Aceito
                          </Badge>
                        )}
                        {member.inviteStatus === "revoked" && (
                          <Badge variant="destructive" className="gap-1">
                            Revogado
                          </Badge>
                        )}
                        {!member.inviteStatus && (
                          <Badge variant="secondary" className="gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.lastAccessAt ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDistanceToNow(new Date(member.lastAccessAt), { addSuffix: true, locale: ptBR })}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nunca acessou</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={resendInvite.isPending}
                              onClick={() => {
                                resendInvite.mutate(
                                  { id: clinicId, teamMemberId: member.id },
                                  {
                                    onSuccess: (resp: InviteUserResponse) => {
                                      toast({
                                        title: "Convite reenviado",
                                        description: `Enviado para ${member.email ?? member.nome}.`,
                                      });
                                      if (resp.inviteLink) {
                                        setInviteLink(resp.inviteLink);
                                      }
                                    },
                                    onError: async (err: unknown) => {
                                      let description: string | undefined;
                                      const maybeRes = (err as { response?: Response })?.response;
                                      if (maybeRes && typeof maybeRes.json === "function") {
                                        try {
                                          const body = await maybeRes.json();
                                          if (body?.error) description = body.error;
                                        } catch {}
                                      }
                                      toast({
                                        variant: "destructive",
                                        title: "Erro ao reenviar convite",
                                        description,
                                      });
                                    },
                                  }
                                );
                              }}
                              data-testid={`btn-resend-invite-${member.id}`}
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Reenviar Convite
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleRevoke(member)}
                            >
                              Revogar Acesso
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nenhum usuário com acesso à plataforma.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {members && members.filter(m => !m.temAcessoPlataforma).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Membros sem acesso à plataforma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {members
                .filter((m) => !m.temAcessoPlataforma)
                .map((member) => (
                  <Badge key={member.id} variant="outline" className="gap-1">
                    {member.nome}
                    {member.email && (
                      <span className="text-muted-foreground">· {member.email}</span>
                    )}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!inviteLink} onOpenChange={(open) => { if (!open) setInviteLink(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Link de Convite Gerado
            </DialogTitle>
            <DialogDescription>
              Copie e envie este link para o usuário acessar a plataforma. O link expira em 7 dias.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <Input
                readOnly
                value={inviteLink ?? ""}
                className="font-mono text-xs"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (inviteLink) {
                    navigator.clipboard.writeText(inviteLink).then(() => {
                      toast({ title: "Link copiado!", description: "Cole no WhatsApp ou email do usuário." });
                    }).catch(() => {
                      toast({ title: "Copie manualmente", description: "Selecione o link acima e pressione Ctrl+C." });
                    });
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
              Usuário adicionado na aba Usuários com status "Pendente".
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteLink(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
            <DialogDescription>
              O usuário receberá um convite por email para acessar o painel desta clínica.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onInvite)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="usuario@clinica.com.br" {...field} data-testid="input-invite-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil de Acesso</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="colaborador">Colaborador</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setIsInviteOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={inviteUser.isPending} data-testid="btn-confirm-invite">
                  {inviteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Convite
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
