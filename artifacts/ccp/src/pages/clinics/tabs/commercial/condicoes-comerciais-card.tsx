import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSaveCondicoesComerciais,
  getGetClinicQueryKey,
} from "@workspace/api-client-react";
import type { Clinic, CondicoesComerciaisInput } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FORMA_PAGAMENTO_OPTIONS, REAJUSTE_OPTIONS, errorMessage } from "./shared";

const condicoesSchema = z.object({
  valorImplantacao: z.coerce.number().min(0).optional(),
  valorRecorrente: z.coerce.number().min(0).optional(),
  formaPagamento: z.string().optional(),
  diaVencimento: z.coerce.number().min(1).max(31).optional(),
  reajusteIndice: z.string().optional(),
  inicioRecorrencia: z.string().optional(),
  prazoContratoMeses: z.coerce.number().min(0).max(120).optional(),
  validadePropostaDias: z.coerce.number().min(0).max(365).optional(),
  dataPrevistaInicio: z.string().optional(),
  responsavelComercial: z.string().optional(),
  observacoesComerciais: z.string().optional(),
  condicoesEspeciais: z.string().optional(),
});

type CondicoesValues = z.infer<typeof condicoesSchema>;

export function CondicoesComerciaisCard({ clinic }: { clinic: Clinic }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const saveCondicoes = useSaveCondicoesComerciais();

  const form = useForm<CondicoesValues>({
    resolver: zodResolver(condicoesSchema),
    defaultValues: {
      valorImplantacao: clinic.valorImplantacao ?? 0,
      valorRecorrente: clinic.valorRecorrente ?? 0,
      formaPagamento: clinic.formaPagamento ?? "boleto",
      diaVencimento: clinic.diaVencimento ?? 10,
      reajusteIndice: clinic.reajusteIndice ?? "IGPM/FGV",
      inicioRecorrencia: clinic.inicioRecorrencia ?? "",
      prazoContratoMeses: clinic.prazoContratoMeses ?? 12,
      validadePropostaDias: clinic.validadePropostaDias ?? 15,
      dataPrevistaInicio: clinic.dataPrevistaInicio ?? "",
      responsavelComercial: clinic.responsavelComercial ?? "",
      observacoesComerciais: clinic.observacoesComerciais ?? "",
      condicoesEspeciais: clinic.condicoesEspeciais ?? "",
    },
  });

  const onSubmit = (values: CondicoesValues) => {
    const data: CondicoesComerciaisInput = {
      valorImplantacao: values.valorImplantacao ?? null,
      valorRecorrente: values.valorRecorrente ?? null,
      formaPagamento: values.formaPagamento || null,
      diaVencimento: values.diaVencimento ?? null,
      reajusteIndice: values.reajusteIndice || null,
      inicioRecorrencia: values.inicioRecorrencia || null,
      prazoContratoMeses: values.prazoContratoMeses ?? null,
      validadePropostaDias: values.validadePropostaDias ?? null,
      dataPrevistaInicio: values.dataPrevistaInicio || null,
      responsavelComercial: values.responsavelComercial || null,
      observacoesComerciais: values.observacoesComerciais || null,
      condicoesEspeciais: values.condicoesEspeciais || null,
    };
    saveCondicoes.mutate(
      { clinicId: clinic.id, data },
      {
        onSuccess: () => {
          toast({ title: "Condições comerciais salvas" });
          queryClient.invalidateQueries({
            queryKey: getGetClinicQueryKey(clinic.id),
          });
        },
        onError: (err) =>
          toast({
            variant: "destructive",
            title: "Erro ao salvar condições",
            description: errorMessage(err, "Tente novamente."),
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#0B1F33]">
          <SlidersHorizontal className="h-5 w-5 text-[#0F5F8F]" />
          Condições Comerciais
        </CardTitle>
        <CardDescription>
          Defina valores, prazos e responsáveis. Estas condições alimentam a
          proposta, o contrato e a geração das faturas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="valorImplantacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Implantação (R$)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={typeof field.value === "number" ? field.value : null}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valorRecorrente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recorrência / MRR (R$)</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={typeof field.value === "number" ? field.value : null}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
                control={form.control}
                name="prazoContratoMeses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prazo do Contrato (meses)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" max="120" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
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
                control={form.control}
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
              <FormField
                control={form.control}
                name="inicioRecorrencia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início da Recorrência</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validadePropostaDias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade da Proposta (dias)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" max="365" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dataPrevistaInicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Prevista de Início</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsavelComercial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável Comercial</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do responsável" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="condicoesEspeciais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condições Especiais</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Descontos, carências, cláusulas específicas..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="observacoesComerciais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações Comerciais</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Anotações internas da negociação..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end border-t pt-4">
              <Button
                type="submit"
                disabled={saveCondicoes.isPending}
                className="bg-[#0F5F8F] text-white hover:bg-[#0B1F33]"
              >
                {saveCondicoes.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar Condições
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
