import { useState } from "react";
import { 
  useListFaturas, 
  getListFaturasQueryKey, 
  useCreateFatura, 
  useUpdateFatura 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MoreHorizontal, FileText } from "lucide-react";
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
import { Fatura } from "@workspace/api-client-react/src/generated/api.schemas";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const formSchema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  vencimento: z.string().min(1, "Vencimento obrigatório"),
  valor: z.coerce.number().min(0.01, "Valor deve ser maior que 0"),
  status: z.enum(["pendente", "pago", "atrasado", "cancelado"]).default("pendente"),
  formaPagamento: z.string().optional(),
  observacao: z.string().optional(),
});

export default function FinancialTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null);

  const { data: faturas, isLoading } = useListFaturas(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListFaturasQueryKey(clinicId) },
  });

  const createFatura = useCreateFatura();
  const updateFatura = useUpdateFatura();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      numero: "",
      vencimento: "",
      valor: 0,
      status: "pendente",
      formaPagamento: "",
      observacao: "",
    },
  });

  const openDialog = (fatura?: Fatura) => {
    if (fatura) {
      setEditingFatura(fatura);
      form.reset({
        numero: fatura.numero,
        vencimento: fatura.vencimento.split("T")[0],
        valor: fatura.valor,
        status: (fatura.status as any) || "pendente",
        formaPagamento: fatura.formaPagamento || "",
        observacao: fatura.observacao || "",
      });
    } else {
      setEditingFatura(null);
      form.reset({
        numero: "",
        vencimento: "",
        valor: 0,
        status: "pendente",
        formaPagamento: "",
        observacao: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (editingFatura) {
      const isPaid = values.status === "pago" && editingFatura.status !== "pago";
      updateFatura.mutate(
        { 
          clinicId, 
          id: editingFatura.id, 
          data: { 
            ...values,
            pagoEm: isPaid ? new Date().toISOString() : editingFatura.pagoEm
          } as any 
        },
        {
          onSuccess: () => {
            toast({ title: "Fatura atualizada" });
            queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        }
      );
    } else {
      createFatura.mutate(
        { clinicId, data: values as any },
        {
          onSuccess: () => {
            toast({ title: "Fatura registrada" });
            queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao registrar" }),
        }
      );
    }
  };

  const markAsPaid = (id: string) => {
    updateFatura.mutate(
      { 
        clinicId, 
        id, 
        data: { 
          status: "pago",
          pagoEm: new Date().toISOString()
        }
      },
      {
        onSuccess: () => {
          toast({ title: "Fatura marcada como paga" });
          queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const getStatusVariant = (status: string) => {
    switch(status) {
      case "pago": return "default";
      case "atrasado": return "destructive";
      case "pendente": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Financeiro</h3>
          <p className="text-sm text-muted-foreground">Acompanhe as faturas e mensalidades da clínica.</p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="mr-2 h-4 w-4" /> Nova Fatura
        </Button>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faturas && faturas.length > 0 ? (
              faturas.map((fatura) => (
                <TableRow key={fatura.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {fatura.numero}
                  </TableCell>
                  <TableCell>{format(new Date(fatura.vencimento), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>{formatCurrency(fatura.valor)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(fatura.status)} className="capitalize">
                      {fatura.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {fatura.pagoEm ? format(new Date(fatura.pagoEm), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {fatura.status !== "pago" && (
                          <DropdownMenuItem onClick={() => markAsPaid(fatura.id)}>
                            Marcar como Pago
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openDialog(fatura)}>Editar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Nenhuma fatura registrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingFatura ? "Editar Fatura" : "Nova Fatura"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número / Identificador</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="valor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="vencimento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vencimento</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                          <SelectItem value="atrasado">Atrasado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="formaPagamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forma de Pagamento</FormLabel>
                    <FormControl><Input placeholder="Ex: Boleto, Cartão, PIX" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button type="submit" disabled={createFatura.isPending || updateFatura.isPending}>
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
