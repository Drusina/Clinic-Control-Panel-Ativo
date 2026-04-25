import { useState, useRef } from "react";
import {
  useListFaturas,
  getListFaturasQueryKey,
  useCreateFatura,
  useUpdateFatura,
  useUpdateClinic,
} from "@workspace/api-client-react";
import type { Clinic, Fatura, UpdateClinicBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, MoreHorizontal, FileText, Send, Upload, ExternalLink, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { getStoredToken } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getGetClinicQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

const faturaSchema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  vencimento: z.string().min(1, "Vencimento obrigatório"),
  valor: z.coerce.number().min(0.01, "Valor deve ser maior que 0"),
  status: z.enum(["pendente", "pago", "atrasado", "cancelado"]).default("pendente"),
  formaPagamento: z.string().optional(),
  observacao: z.string().optional(),
});

const contratoSchema = z.object({
  valorImplantacao: z.coerce.number().optional(),
  valorRecorrente: z.coerce.number().optional(),
  formaPagamento: z.string().optional(),
  diaVencimento: z.coerce.number().min(1).max(31).optional(),
  reajusteIndice: z.string().optional(),
  inicioRecorrencia: z.string().optional(),
});

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "boleto", label: "Boleto Bancário" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão de Crédito" },
  { value: "transferencia", label: "Transferência Bancária" },
];

const REAJUSTE_OPTIONS = [
  { value: "IGPM/FGV", label: "IGPM/FGV" },
  { value: "IPCA/IBGE", label: "IPCA/IBGE" },
  { value: "INPC/IBGE", label: "INPC/IBGE" },
  { value: "fixo", label: "Fixo (sem reajuste)" },
];

export default function FinancialTab({ clinicId, clinic }: { clinicId: string; clinic?: Clinic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFatura, setEditingFatura] = useState<Fatura | null>(null);
  const [uploadingProposta, setUploadingProposta] = useState(false);
  const [uploadingContrato, setUploadingContrato] = useState(false);
  const [deletingProposta, setDeletingProposta] = useState(false);
  const [deletingContrato, setDeletingContrato] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"proposta" | "contrato" | null>(null);
  const propostaInputRef = useRef<HTMLInputElement>(null);
  const contratoInputRef = useRef<HTMLInputElement>(null);

  const openDocument = async (url: string) => {
    if (!url.startsWith("/api/storage/objects/")) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const token = getStoredToken();
    try {
      const signedReqUrl = new URL(url, window.location.origin);
      signedReqUrl.searchParams.set("signed", "true");
      const signedRes = await fetch(signedReqUrl.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!signedRes.ok) {
        toast({ variant: "destructive", title: "Não foi possível abrir o documento" });
        return;
      }
      const { url: signedUrl } = await signedRes.json() as { url: string };
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast({ variant: "destructive", title: "Erro ao abrir o documento" });
    }
  };

  const handleDocumentUpload = async (file: File, type: "proposta" | "contrato") => {
    if (!clinic) return;
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Apenas arquivos PDF são aceitos" });
      return;
    }
    if (type === "proposta") setUploadingProposta(true);
    else setUploadingContrato(true);

    try {
      const token = getStoredToken();
      const res = await fetch(`/api/clinics/${clinic.id}/documents?type=${type}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({
          variant: "destructive",
          title: "Erro no upload",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }

      toast({
        title: type === "proposta" ? "Proposta enviada" : "Contrato enviado",
        description: `Arquivo ${file.name} enviado com sucesso.`,
      });
      queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinic.id) });
    } catch {
      toast({ variant: "destructive", title: "Erro de conexão ao fazer upload" });
    } finally {
      if (type === "proposta") setUploadingProposta(false);
      else setUploadingContrato(false);
    }
  };

  const handleDocumentDelete = async (type: "proposta" | "contrato") => {
    if (!clinic) return;
    const label = type === "proposta" ? "Proposta" : "Contrato";

    if (type === "proposta") setDeletingProposta(true);
    else setDeletingContrato(true);

    try {
      const token = getStoredToken();
      const res = await fetch(`/api/clinics/${clinic.id}/documents?type=${type}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast({
          variant: "destructive",
          title: "Erro ao remover documento",
          description: err.error ?? "Erro desconhecido",
        });
        return;
      }

      toast({ title: `${label} removida com sucesso` });
      queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinic.id) });
    } catch {
      toast({ variant: "destructive", title: "Erro de conexão ao remover documento" });
    } finally {
      if (type === "proposta") setDeletingProposta(false);
      else setDeletingContrato(false);
    }
  };

  const { data: faturas, isLoading } = useListFaturas(clinicId, {
    query: { enabled: !!clinicId, queryKey: getListFaturasQueryKey(clinicId) },
  });

  const createFatura = useCreateFatura();
  const updateFatura = useUpdateFatura();
  const updateClinic = useUpdateClinic();

  const faturaForm = useForm<z.infer<typeof faturaSchema>>({
    resolver: zodResolver(faturaSchema),
    defaultValues: {
      numero: "",
      vencimento: "",
      valor: 0,
      status: "pendente",
      formaPagamento: "",
      observacao: "",
    },
  });

  const contratoForm = useForm<z.infer<typeof contratoSchema>>({
    resolver: zodResolver(contratoSchema),
    defaultValues: {
      valorImplantacao: clinic?.valorImplantacao ?? 0,
      valorRecorrente: clinic?.valorRecorrente ?? 0,
      formaPagamento: clinic?.formaPagamento ?? "boleto",
      diaVencimento: clinic?.diaVencimento ?? 10,
      reajusteIndice: "IGPM/FGV",
      inicioRecorrencia: clinic?.inicioRecorrencia ?? "",
    },
  });

  const openDialog = (fatura?: Fatura) => {
    if (fatura) {
      setEditingFatura(fatura);
      faturaForm.reset({
        numero: fatura.numero,
        vencimento: fatura.vencimento.split("T")[0],
        valor: fatura.valor,
        status: (fatura.status as "pendente" | "pago" | "atrasado" | "cancelado") || "pendente",
        formaPagamento: fatura.formaPagamento || "",
        observacao: fatura.observacao || "",
      });
    } else {
      setEditingFatura(null);
      faturaForm.reset({
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

  const onFaturaSubmit = (values: z.infer<typeof faturaSchema>) => {
    if (editingFatura) {
      const isPaid = values.status === "pago" && editingFatura.status !== "pago";
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
            queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });
            setIsDialogOpen(false);
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao atualizar" }),
        }
      );
    } else {
      createFatura.mutate(
        { clinicId, data: values },
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

  const onContratoSubmit = (values: z.infer<typeof contratoSchema>) => {
    if (!clinic) return;
    updateClinic.mutate(
      { id: clinic.id, data: values as UpdateClinicBody },
      {
        onSuccess: () => {
          toast({ title: "Contrato atualizado" });
          queryClient.invalidateQueries({ queryKey: getGetClinicQueryKey(clinic.id) });
        },
        onError: () => toast({ variant: "destructive", title: "Erro ao salvar" }),
      }
    );
  };

  const markAsPaid = (id: string) => {
    updateFatura.mutate(
      {
        id,
        data: {
          status: "pago",
          pagoEm: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Fatura marcada como paga" });
          queryClient.invalidateQueries({ queryKey: getListFaturasQueryKey(clinicId) });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "pago":
        return "default";
      case "atrasado":
        return "destructive";
      case "pendente":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {clinic && (
        <Card>
          <CardHeader>
            <CardTitle>Contrato & Valores</CardTitle>
            <CardDescription>Configurações financeiras do contrato com esta clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...contratoForm}>
              <form onSubmit={contratoForm.handleSubmit(onContratoSubmit)} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <FormField
                    control={contratoForm.control}
                    name="valorImplantacao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Implantação (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={contratoForm.control}
                    name="valorRecorrente"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Recorrência / MRR (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={contratoForm.control}
                    name="diaVencimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dia de Vencimento</FormLabel>
                        <FormControl>
                          <Input type="number" min="1" max="31" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={contratoForm.control}
                    name="inicioRecorrencia"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Início Recorrência</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={contratoForm.control}
                    name="formaPagamento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forma de Pagamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FORMA_PAGAMENTO_OPTIONS.map((opt) => (
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
                  <FormField
                    control={contratoForm.control}
                    name="reajusteIndice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Índice de Reajuste</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {REAJUSTE_OPTIONS.map((opt) => (
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Proposta (PDF)</Label>
                    <input
                      ref={propostaInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocumentUpload(file, "proposta");
                        e.target.value = "";
                      }}
                    />
                    {clinic?.propostaUrl ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 text-green-600 border-green-300">
                          <CheckCircle2 className="h-3 w-3" /> Proposta enviada
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs"
                          onClick={() => openDocument(clinic.propostaUrl!)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Ver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs"
                          disabled={uploadingProposta}
                          onClick={() => propostaInputRef.current?.click()}
                        >
                          {uploadingProposta ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={deletingProposta}
                          onClick={() => setDeleteTarget("proposta")}
                          data-testid="btn-delete-proposta"
                        >
                          {deletingProposta ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={uploadingProposta}
                        onClick={() => propostaInputRef.current?.click()}
                        data-testid="btn-upload-proposta"
                      >
                        {uploadingProposta ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Enviar Proposta
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Contrato Assinado (PDF)</Label>
                    <input
                      ref={contratoInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocumentUpload(file, "contrato");
                        e.target.value = "";
                      }}
                    />
                    {clinic?.contratoUrl ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 text-green-600 border-green-300">
                          <CheckCircle2 className="h-3 w-3" /> Contrato enviado
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs"
                          onClick={() => openDocument(clinic.contratoUrl!)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" /> Ver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs"
                          disabled={uploadingContrato}
                          onClick={() => contratoInputRef.current?.click()}
                        >
                          {uploadingContrato ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={deletingContrato}
                          onClick={() => setDeleteTarget("contrato")}
                          data-testid="btn-delete-contrato"
                        >
                          {deletingContrato ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={uploadingContrato}
                        onClick={() => contratoInputRef.current?.click()}
                        data-testid="btn-upload-contrato"
                      >
                        {uploadingContrato ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Enviar Contrato
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      toast({
                        title: "Disponível em breve",
                        description: "Integração com Autentique será ativada na próxima versão.",
                      })
                    }
                  >
                    <Send className="mr-2 h-4 w-4" /> Enviar via Autentique
                  </Button>
                  <Button type="submit" disabled={updateClinic.isPending}>
                    {updateClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar Contrato
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Faturas</CardTitle>
            <CardDescription>Acompanhe as cobranças e mensalidades.</CardDescription>
          </div>
          <Button size="sm" onClick={() => openDialog()}>
            <Plus className="mr-2 h-4 w-4" /> Nova Fatura
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
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
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {fatura.numero}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(fatura.vencimento), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{formatCurrency(fatura.valor)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(fatura.status)} className="capitalize">
                          {fatura.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {fatura.pagoEm
                          ? format(new Date(fatura.pagoEm), "dd/MM/yyyy", { locale: ptBR })
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
                            {fatura.status !== "pago" && (
                              <DropdownMenuItem onClick={() => markAsPaid(fatura.id)}>
                                Marcar como Pago
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
                      Nenhuma fatura registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingFatura ? "Editar Fatura" : "Nova Fatura"}</DialogTitle>
          </DialogHeader>
          <Form {...faturaForm}>
            <form onSubmit={faturaForm.handleSubmit(onFaturaSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={faturaForm.control}
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
                  control={faturaForm.control}
                  name="valor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={faturaForm.control}
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
                  control={faturaForm.control}
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
                control={faturaForm.control}
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
                control={faturaForm.control}
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

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleteTarget === "proposta" ? "Proposta" : "Contrato"}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o arquivo de {deleteTarget === "proposta" ? "Proposta" : "Contrato"}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  handleDocumentDelete(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
