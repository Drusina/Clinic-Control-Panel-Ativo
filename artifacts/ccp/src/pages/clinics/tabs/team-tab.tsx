import { useState } from "react";
import { 
  useListTeam, 
  getListTeamQueryKey, 
  useCreateTeamMember, 
  useUpdateTeamMember, 
  useDeleteTeamMember 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MoreHorizontal, User, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import type { TeamMember } from "@workspace/api-client-react";

const formSchema = z.object({
  nome: z.string().min(2, "Nome obrigatório"),
  funcao: z.string().optional(),
  area: z.enum(["Administrativo", "Clínico", "Atendimento", "Marketing", "TI", "Outro"]).optional(),
  vinculo: z.enum(["CLT", "PJ", "Socio", "Terceirizado"]).optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  whatsapp: z.string().optional(),
  temAcessoPlataforma: z.boolean().default(false),
});

export default function TeamTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const { data: team, isLoading } = useListTeam(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListTeamQueryKey(clinicId) },
  });

  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMember = useDeleteTeamMember();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      funcao: "",
      area: "Administrativo",
      vinculo: "CLT",
      email: "",
      whatsapp: "",
      temAcessoPlataforma: false,
    },
  });

  const openDialog = (member?: TeamMember) => {
    if (member) {
      setEditingMember(member);
      form.reset({
        nome: member.nome,
        funcao: member.funcao || "",
        area: (member.area as any) || "Administrativo",
        vinculo: (member.vinculo as any) || "CLT",
        email: member.email || "",
        whatsapp: member.whatsapp || "",
        temAcessoPlataforma: member.temAcessoPlataforma,
      });
    } else {
      setEditingMember(null);
      form.reset({
        nome: "",
        funcao: "",
        area: "Administrativo",
        vinculo: "CLT",
        email: "",
        whatsapp: "",
        temAcessoPlataforma: false,
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (editingMember) {
      updateMember.mutate(
        { id: editingMember.id, data: values },
        {
          onSuccess: () => {
            toast({ title: "Membro atualizado" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        }
      );
    } else {
      createMember.mutate(
        { clinicId, data: values as any },
        {
          onSuccess: () => {
            toast({ title: "Membro adicionado" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao adicionar" }),
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Deseja realmente excluir este membro da equipe?")) {
      deleteMember.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Membro excluído" });
            queryClient.invalidateQueries({ queryKey: getListTeamQueryKey(clinicId) });
          },
        }
      );
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Equipe da Clínica</h3>
          <p className="text-sm text-muted-foreground">Gerencie os colaboradores e seus acessos.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar Membro
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {team && team.length > 0 ? (
          team.map((member) => (
            <div key={member.id} className="flex flex-col bg-card border rounded-lg p-5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">{member.nome}</h4>
                    <p className="text-xs text-muted-foreground">{member.funcao || "Sem função"}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openDialog(member)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDelete(member.id)} className="text-destructive">
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm flex-1">
                {member.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{member.email}</span>
                  </div>
                )}
                {member.whatsapp && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> <span>{member.whatsapp}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <Badge variant="outline">{member.area || "Outro"}</Badge>
                <Badge variant="outline">{member.vinculo || "CLT"}</Badge>
                {member.temAcessoPlataforma && (
                  <Badge variant="secondary" className="ml-auto">Com Acesso</Badge>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center border rounded-lg border-dashed text-muted-foreground">
            Nenhum membro cadastrado.
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingMember ? "Editar Membro" : "Adicionar Membro"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="funcao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Função</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Área</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Administrativo">Administrativo</SelectItem>
                          <SelectItem value="Clínico">Clínico</SelectItem>
                          <SelectItem value="Atendimento">Atendimento</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="TI">TI</SelectItem>
                          <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vinculo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vínculo</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="CLT">CLT</SelectItem>
                          <SelectItem value="PJ">PJ</SelectItem>
                          <SelectItem value="Socio">Sócio</SelectItem>
                          <SelectItem value="Terceirizado">Terceirizado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="temAcessoPlataforma"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Acesso à Plataforma</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Concede acesso para o membro visualizar e interagir no painel da clínica.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createMember.isPending || updateMember.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
