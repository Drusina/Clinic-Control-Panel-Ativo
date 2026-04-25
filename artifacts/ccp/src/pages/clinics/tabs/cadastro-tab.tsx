import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useUpdateClinic,
  useListSocios,
  getListSociosQueryKey,
  useCreateSocio,
  useUpdateSocio,
  useDeleteSocio,
} from "@workspace/api-client-react";
import type { Clinic, Socio, UpdateClinicBody, UpdateSocioBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetClinicQueryKey } from "@workspace/api-client-react";
import { Loader2, Plus, Trash2, UserCircle, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const clinicFormSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  fantasia: z.string().optional(),
  razaoSocial: z.string().optional(),
  cnpj: z.string().min(1, "CNPJ obrigatório"),
  cnae: z.string().optional(),
  situacaoCadastral: z.string().optional(),
  capitalSocial: z.coerce.number().optional(),
  dataAbertura: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
  endereco: z.string().optional(),
  responsavel: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  whatsapp: z.string().optional(),
  cargo: z.string().optional(),
  plano: z.enum(["starter", "pro", "enterprise"]),
  etapa: z.coerce.number().min(1).max(10).optional(),
});

const socioFormSchema = z.object({
  nome: z.string().min(1, "Nome do sócio obrigatório"),
  qualificacao: z.string().optional(),
  dataEntrada: z.string().optional(),
});

export default function CadastroTab({ clinic }: { clinic: Clinic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSocioDialogOpen, setIsSocioDialogOpen] = useState(false);
  const [editingSocio, setEditingSocio] = useState<Socio | null>(null);

  const updateClinic = useUpdateClinic();

  const { data: socios, isLoading: loadingSocios } = useListSocios(clinic.id, {
    query: { enabled: !!clinic.id, queryKey: getListSociosQueryKey(clinic.id) },
  });

  const createSocio = useCreateSocio();
  const updateSocio = useUpdateSocio();
  const deleteSocio = useDeleteSocio();

  const form = useForm<z.infer<typeof clinicFormSchema>>({
    resolver: zodResolver(clinicFormSchema),
    defaultValues: {
      nome: clinic.nome,
      fantasia: clinic.fantasia ?? "",
      razaoSocial: clinic.razaoSocial ?? "",
      cnpj: clinic.cnpj,
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
      cargo: clinic.cargo ?? "",
      plano: clinic.plano as "starter" | "pro" | "enterprise",
      etapa: clinic.etapa,
    },
  });

  const socioForm = useForm<z.infer<typeof socioFormSchema>>({
    resolver: zodResolver(socioFormSchema),
    defaultValues: { nome: "", qualificacao: "", dataEntrada: "" },
  });

  const onSaveClinic = (values: z.infer<typeof clinicFormSchema>) => {
    updateClinic.mutate(
      { id: clinic.id, data: values as UpdateClinicBody },
      {
        onSuccess: () => {
          toast({ title: "Dados atualizados com sucesso" });
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinic.id) });
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao salvar dados" }),
      }
    );
  };

  const openSocioDialog = (socio?: Socio) => {
    if (socio) {
      setEditingSocio(socio);
      socioForm.reset({
        nome: socio.nome,
        qualificacao: socio.qualificacao ?? "",
        dataEntrada: socio.dataEntrada?.split("T")[0] ?? "",
      });
    } else {
      setEditingSocio(null);
      socioForm.reset({ nome: "", qualificacao: "", dataEntrada: "" });
    }
    setIsSocioDialogOpen(true);
  };

  const onSocioSubmit = (values: z.infer<typeof socioFormSchema>) => {
    if (editingSocio) {
      updateSocio.mutate(
        { clinicId: clinic.id, socioId: editingSocio.id, data: values as UpdateSocioBody },
        {
          onSuccess: () => {
            toast({ title: "Sócio atualizado" });
            queryClient.invalidateQueries({ queryKey: getListSociosQueryKey(clinic.id) });
            setIsSocioDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar sócio" }),
        }
      );
    } else {
      createSocio.mutate(
        { clinicId: clinic.id, data: { nome: values.nome, qualificacao: values.qualificacao ?? null, dataEntrada: values.dataEntrada || null } },
        {
          onSuccess: () => {
            toast({ title: "Sócio adicionado" });
            queryClient.invalidateQueries({ queryKey: getListSociosQueryKey(clinic.id) });
            setIsSocioDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao adicionar sócio" }),
        }
      );
    }
  };

  const handleDeleteSocio = (socioId: string) => {
    if (!confirm("Deseja remover este sócio?")) return;
    deleteSocio.mutate(
      { clinicId: clinic.id, socioId },
      {
        onSuccess: () => {
          toast({ title: "Sócio removido" });
          queryClient.invalidateQueries({ queryKey: getListSociosQueryKey(clinic.id) });
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao remover sócio" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSaveClinic)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>Informações cadastrais e de identificação.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Clínica</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fantasia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="razaoSocial"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Razão Social</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="situacaoCadastral"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Situação Cadastral</FormLabel>
                    <FormControl><Input placeholder="ATIVA" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cnae"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>CNAE Principal</FormLabel>
                    <FormControl><Input placeholder="86.30-5-04 – Atividades de fisioterapia" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dataAbertura"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Abertura</FormLabel>
                    <FormControl><Input placeholder="AAAA-MM-DD" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="capitalSocial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capital Social (R$)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="plano"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plano</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endereço</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl><Input placeholder="00000-000" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="uf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <FormControl><Input maxLength={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contato Principal</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cargo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateClinic.isPending} data-testid="btn-save-cadastro">
              {updateClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>QSA — Quadro de Sócios e Administradores</CardTitle>
            <CardDescription>Sócios e administradores conforme Receita Federal.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => openSocioDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSocios ? (
            <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
          ) : socios && socios.length > 0 ? (
            <div className="space-y-2">
              {socios.map((socio: Socio) => (
                <div key={socio.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <UserCircle className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{socio.nome}</p>
                      {socio.qualificacao && (
                        <p className="text-xs text-muted-foreground">{socio.qualificacao}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {socio.dataEntrada && (
                      <Badge variant="outline" className="text-xs">
                        Desde {socio.dataEntrada}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openSocioDialog(socio)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSocio(socio.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
              Nenhum sócio cadastrado.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSocioDialogOpen} onOpenChange={setIsSocioDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSocio ? "Editar Sócio" : "Adicionar Sócio"}</DialogTitle>
          </DialogHeader>
          <Form {...socioForm}>
            <form onSubmit={socioForm.handleSubmit(onSocioSubmit)} className="space-y-4">
              <FormField
                control={socioForm.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Sócio</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={socioForm.control}
                name="qualificacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualificação</FormLabel>
                    <FormControl><Input placeholder="Ex: Sócio Administrador" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={socioForm.control}
                name="dataEntrada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Entrada</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createSocio.isPending || updateSocio.isPending}>
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
