import { useState } from "react";
import { 
  useListRisks, 
  getListRisksQueryKey, 
  useCreateRisk, 
  useUpdateRisk, 
  useDeleteRisk 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MoreHorizontal, AlertTriangle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import type { Risk } from "@workspace/api-client-react";

const formSchema = z
  .object({
    nome: z.string().min(2, "Nome obrigatório"),
    descricao: z.string().optional(),
    probabilidade: z.coerce.number().min(1).max(5),
    impacto: z.coerce.number().min(1).max(5),
    responsavel: z.string().optional(),
    acoesMitigadoras: z.string().optional(),
    status: z.enum(["identificado", "em_mitigacao", "mitigado", "aceito", "nao_aceito"]).optional(),
    statusJustificativa: z.string().optional(),
  })
  .refine((d) => d.status !== "nao_aceito" || !!d.statusJustificativa?.trim(), {
    message: "Justificativa obrigatória para 'Não aceito'",
    path: ["statusJustificativa"],
  });

export default function RisksTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);

  const { data: risks, isLoading } = useListRisks(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListRisksQueryKey(clinicId) },
  });

  const createRisk = useCreateRisk();
  const updateRisk = useUpdateRisk();
  const deleteRisk = useDeleteRisk();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      probabilidade: 3,
      impacto: 3,
      responsavel: "",
      acoesMitigadoras: "",
      status: "identificado",
      statusJustificativa: "",
    },
  });

  const statusValue = form.watch("status");

  const openDialog = (risk?: Risk) => {
    if (risk) {
      setEditingRisk(risk);
      form.reset({
        nome: risk.nome,
        descricao: risk.descricao || "",
        probabilidade: risk.probabilidade,
        impacto: risk.impacto,
        responsavel: risk.responsavel || "",
        acoesMitigadoras: risk.acoesMitigadoras || "",
        status: (risk.status as any) || "identificado",
        statusJustificativa: risk.statusJustificativa || "",
      });
    } else {
      setEditingRisk(null);
      form.reset({
        nome: "",
        descricao: "",
        probabilidade: 3,
        impacto: 3,
        responsavel: "",
        acoesMitigadoras: "",
        status: "identificado",
        statusJustificativa: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload = {
      ...values,
      statusJustificativa:
        values.status === "nao_aceito" ? values.statusJustificativa?.trim() || null : null,
    };
    if (editingRisk) {
      updateRisk.mutate(
        { id: editingRisk.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Risco atualizado" });
            queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        }
      );
    } else {
      createRisk.mutate(
        { clinicId, data: payload as any },
        {
          onSuccess: () => {
            toast({ title: "Risco registrado" });
            queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao registrar" }),
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Deseja realmente excluir este risco?")) {
      deleteRisk.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Risco excluído" });
            queryClient.invalidateQueries({ queryKey: getListRisksQueryKey(clinicId) });
          },
        }
      );
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  const getSeverityVariant = (severity: number) => {
    if (severity >= 15) return "destructive";
    if (severity >= 8) return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Matriz de Riscos</h3>
          <p className="text-sm text-muted-foreground">Identifique e mitigue riscos na operação da clínica.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Registrar Risco
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risco</TableHead>
              <TableHead>Severidade</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risks && risks.length > 0 ? (
              risks.map((risk) => (
                <TableRow key={risk.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium flex items-center gap-1.5">
                        {risk.severidade >= 15 && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        {risk.nome}
                      </span>
                      {risk.descricao && <span className="text-xs text-muted-foreground truncate max-w-xs">{risk.descricao}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getSeverityVariant(risk.severidade)}>
                      {risk.severidade} (P{risk.probabilidade} × I{risk.impacto})
                    </Badge>
                  </TableCell>
                  <TableCell>{risk.responsavel || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {risk.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDialog(risk)}>Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(risk.id)} className="text-destructive">
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Nenhum risco registrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingRisk ? "Editar Risco" : "Registrar Risco"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Risco</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" rows={2} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="probabilidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Probabilidade (1-5)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value.toString()}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {[1,2,3,4,5].map(v => <SelectItem key={v} value={v.toString()}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="impacto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Impacto (1-5)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value.toString()}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {[1,2,3,4,5].map(v => <SelectItem key={v} value={v.toString()}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="acoesMitigadoras"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ações Mitigadoras</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" rows={2} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
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
                {editingRisk && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="identificado">Identificado</SelectItem>
                            <SelectItem value="em_mitigacao">Em Mitigação</SelectItem>
                            <SelectItem value="mitigado">Mitigado</SelectItem>
                            <SelectItem value="aceito">Aceito</SelectItem>
                            <SelectItem value="nao_aceito">Não aceito</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              {editingRisk && statusValue === "nao_aceito" && (
                <FormField
                  control={form.control}
                  name="statusJustificativa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Justificativa (Não aceito) *</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          className="resize-none"
                          rows={3}
                          placeholder="Explique por que este risco não foi aceito..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createRisk.isPending || updateRisk.isPending}>
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
