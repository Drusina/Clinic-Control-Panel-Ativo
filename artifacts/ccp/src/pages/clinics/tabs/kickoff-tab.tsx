import { useState, useEffect } from "react";
import { useGetKickoff, getGetKickoffQueryKey, useUpsertKickoff } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

const formSchema = z.object({
  dataRealizacao: z.string().optional().or(z.literal("")),
  modalidade: z.enum(["presencial", "remoto", "hibrido"]).optional().or(z.literal("")),
  duracaoMinutos: z.coerce.number().optional(),
  facilitador: z.string().optional().or(z.literal("")),
  status: z.enum(["rascunho", "realizado", "validado"]).optional().or(z.literal("")),
});

export default function KickoffTab({ clinicId }: { clinicId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: kickoff, isLoading } = useGetKickoff(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetKickoffQueryKey(clinicId) },
  });

  const upsertKickoff = useUpsertKickoff();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      dataRealizacao: "",
      modalidade: "remoto",
      duracaoMinutos: 60,
      facilitador: "",
      status: "rascunho",
    },
  });

  useEffect(() => {
    if (kickoff) {
      form.reset({
        dataRealizacao: kickoff.dataRealizacao ? kickoff.dataRealizacao.split("T")[0] : "",
        modalidade: (kickoff.modalidade as any) || "remoto",
        duracaoMinutos: kickoff.duracaoMinutos || 60,
        facilitador: kickoff.facilitador || "",
        status: (kickoff.status as any) || "rascunho",
      });
    }
  }, [kickoff, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    upsertKickoff.mutate(
      { clinicId, data: values as any },
      {
        onSuccess: () => {
          toast({ title: "Kickoff atualizado", description: "Os detalhes do kickoff foram salvos." });
          queryClient.invalidateQueries({ queryKey: getGetKickoffQueryKey(clinicId) });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Erro", description: "Não foi possível salvar o kickoff." });
        },
      }
    );
  }

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/kickoff/${clinicId}`}>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir módulo completo de Kick-off
          </Button>
        </Link>
      </div>
    <Card>
      <CardHeader>
        <CardTitle>Resumo do Kickoff</CardTitle>
        <CardDescription>Detalhes básicos da reunião. Acesse o módulo completo para editar ata, equipe, documentos e LGPD.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="dataRealizacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data da Reunião</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duracaoMinutos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (minutos)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="modalidade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalidade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="remoto">Remoto</SelectItem>
                        <SelectItem value="presencial">Presencial</SelectItem>
                        <SelectItem value="hibrido">Híbrido</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="facilitador"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facilitador (Consultor)</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do consultor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="rascunho">Rascunho (Agendando)</SelectItem>
                        <SelectItem value="realizado">Realizado (Aguardando Validação)</SelectItem>
                        <SelectItem value="validado">Validado (Concluído)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={upsertKickoff.isPending}>
                {upsertKickoff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Kickoff
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
    </div>
  );
}
