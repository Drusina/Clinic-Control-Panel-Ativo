import { useState } from "react";
import {
  useListFaturas,
  getListFaturasQueryKey,
  useCreateFatura,
  useUpdateFatura,
  useGerarFaturasDoContrato,
} from "@workspace/api-client-react";
import type { Clinic, Fatura } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Loader2,
  MoreHorizontal,
  FileText,
  Sparkles,
} from "lucide-react";
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
import { CurrencyInput } from "@/components/ui/currency-input";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FATURA_STATUS_OPTIONS,
  formatCurrency,
  getFaturaStatusVariant,
  errorMessage,
} from "./shared";

const faturaSchema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  vencimento: z.string().min(1, "Vencimento obrigatório"),
  valor: z.coerce.number().min(0.01, "Valor deve ser maior que 0"),
  status: z
    .enum(["aberta", "enviada", "paga", "vencida", "cancelada"])
    .default("aberta"),
  formaPagamento: z.string().optional(),
  observacao: z.string().optional(),
});

type FaturaValues = z.infer<typeof faturaSchema>;

export function FaturasCard({
  clinicId,
  clinic,
}: {
  clinicId: string;
  clinic?: Clinic;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null);
  const [confirmGerar, setConfirmGerar] = useState(false);

  const { data: faturas, isLoading } = useListFaturas(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListFaturasQueryKey(clinicId) },
  });

  const createFatura = useCreateFatura();
  const updateFatura = useUpdateFatura();
  const gerarFaturas = useGerarFaturasDoContrato();

  const hasFaturas = !!faturas && faturas.length > 0;

  const form = useForm<FaturaValues>({
    resolver: zodResolver(faturaSchema),
    defaultValues: {
      numero: "",
      vencimento: "",
      valor: 0,
      status: "aberta",
      formaPagamento: "",
      observacao: "",
    },
  });

  const invalidateFaturas = () =>
    queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });

  const openDialog = (fatura?: Fatura) => {
    if (fatura) {
      setEditingFatura(fatura);
      form.reset({
        numero: fatura.numero,
        vencimento: fatura.vencimento.split("T")[0],
        valor: fatura.valor,
        status:
          (fatura.status as FaturaValues["status"]) || "aberta",
        formaPagamento: fatura.formaPagamento || "",
        observacao: fatura.observacao || "",
      });
    } else {
      setEditingFatura(null);
      form.reset({
        numero: "",
        vencimento: "",
        valor: 0,
        status: "aberta",
        formaPagamento: "",
        observacao: "",
      });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = (values: FaturaValues) => {
    if (editingFatura) {
      const isPaid = values.status === "paga" && editingFatura.status !== "paga";
      updateFatura.mutate(
        {
          id: editingFatura.id,
          data: {
            ...values,
            pagoEm: isPaid ? new Date().toISOString() : editingFatura.pagoEm,
          },
        },
        {
          onSuccess: () => {
            toast({ title: "Fatura atualizada" });
            invalidateFaturas();
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        },
      );
    } else {
      createFatura.mutate(
        { clinicId, data: values },
        {
          onSuccess: () => {
            toast({ title: "Fatura registrada" });
            invalidateFaturas();
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao registrar" }),
        },
      );
    }
  };

  const markAsPaid = (id: string) => {
    updateFatura.mutate(
      { id, data: { status: "paga", pagoEm: new Date().toISOString() } },
      {
        onSuccess: () => {
          toast({ title: "Fatura marcada como paga" });
          invalidateFaturas();
        },
      },
    );
  };

  const handleGerar = () => {
    gerarFaturas.mutate(
      { clinicId, data: { confirmar: true } },
      {
        onSuccess: (res) => {
          toast({
            title: "Faturas geradas",
            description: `${res.criadas} fatura(s) criadas a partir das condições comerciais.`,
          });
          invalidateFaturas();
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Não foi possível gerar as faturas",
            description: errorMessage(err, "Verifique as condições comerciais."),
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-[#0B1F33]">
            <FileText className="h-5 w-5 text-[#0F5F8F]" />
            Faturas
          </CardTitle>
          <CardDescription>
            Acompanhe as cobranças e mensalidades desta clínica.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasFaturas && clinic && (
            <Button
              size="sm"
              variant="outline"
              className="border-[#0F5F8F] text-[#0F5F8F] hover:bg-[#F4F7FA]"
              disabled={gerarFaturas.isPending}
              onClick={() => setConfirmGerar(true)}
              data-testid="btn-gerar-faturas"
            >
              {gerarFaturas.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar do Contrato
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#0F5F8F] text-white hover:bg-[#0B1F33]"
            onClick={() => openDialog()}
          >
            <Plus className="mr-2 h-4 w-4" /> Nova Fatura
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#0F5F8F]" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
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
                {hasFaturas ? (
                  faturas.map((fatura) => (
                    <TableRow key={fatura.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {fatura.numero}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(fatura.vencimento), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>{formatCurrency(fatura.valor)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={getFaturaStatusVariant(fatura.status)}
                          className="capitalize"
                        >
                          {fatura.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {fatura.pagoEm
                          ? format(new Date(fatura.pagoEm), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {fatura.status !== "paga" && (
                              <DropdownMenuItem onClick={() => markAsPaid(fatura.id)}>
                                Marcar como Paga
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => openDialog(fatura)}>
                              Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Nenhuma fatura registrada. Use "Gerar do Contrato" para criar
                      a partir das condições comerciais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingFatura ? "Editar Fatura" : "Nova Fatura"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="numero"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
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
                      <FormControl>
                        <CurrencyInput
                          value={typeof field.value === "number" ? field.value : null}
                          onChange={(v) => field.onChange(v ?? 0)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
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
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
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
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FATURA_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
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
                    <FormControl>
                      <Input placeholder="Ex: Boleto, Cartão, PIX" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button
                  type="submit"
                  disabled={createFatura.isPending || updateFatura.isPending}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmGerar} onOpenChange={setConfirmGerar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar faturas do contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Serão criadas uma fatura de implantação (se houver) e uma fatura
              mensal para cada mês do prazo do contrato, a partir das condições
              comerciais salvas. Esta ação só pode ser executada quando ainda não
              há faturas registradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#0F5F8F] text-white hover:bg-[#0B1F33]"
              onClick={() => {
                setConfirmGerar(false);
                handleGerar();
              }}
            >
              Gerar faturas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
