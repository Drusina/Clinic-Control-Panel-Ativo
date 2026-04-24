import { useState } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  useCreateClinic,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Search, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const qsaItemSchema = z.object({
  nome: z.string(),
  qualificacao: z.string().nullable().optional(),
  dataEntrada: z.string().nullable().optional(),
});

const formSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  fantasia: z.string().optional(),
  cnpj: z.string().min(14, "CNPJ inválido"),
  razaoSocial: z.string().optional(),
  cnae: z.string().optional(),
  situacaoCadastral: z.string().optional(),
  capitalSocial: z.coerce.number().optional(),
  dataAbertura: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2, "UF deve ter 2 caracteres").optional(),
  cep: z.string().optional(),
  endereco: z.string().optional(),
  responsavel: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  whatsapp: z.string().optional(),
  plano: z.enum(["starter", "pro", "enterprise"]),
  valorImplantacao: z.coerce.number().optional(),
  valorRecorrente: z.coerce.number().optional(),
  diaVencimento: z.coerce.number().min(1).max(31).optional(),
  qsa: z.array(qsaItemSchema).optional(),
});

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
}

function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcDigit = (digits: string, length: number) => {
    let sum = 0;
    let pos = length - 7;
    for (let i = length; i >= 1; i--) {
      sum += parseInt(digits[length - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return result;
  };

  const d1 = calcDigit(digits, 12);
  const d2 = calcDigit(digits, 13);

  return parseInt(digits[12]) === d1 && parseInt(digits[13]) === d2;
}

interface QSAPartner {
  nome_socio: string;
  qualificacao_socio: string;
  data_entrada_sociedade?: string;
}

interface BrasilAPIResponse {
  razao_social: string;
  nome_fantasia: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  data_inicio_atividade?: string;
  capital_social?: number;
  situacao_cadastral?: string;
  qsa?: QSAPartner[];
}

export default function NewClinic() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createClinic = useCreateClinic();

  const [cnpjRaw, setCnpjRaw] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [qsaPartners, setQsaPartners] = useState<QSAPartner[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      fantasia: "",
      cnpj: "",
      razaoSocial: "",
      cnae: "",
      situacaoCadastral: "",
      capitalSocial: 0,
      dataAbertura: "",
      cidade: "",
      uf: "",
      cep: "",
      endereco: "",
      responsavel: "",
      email: "",
      whatsapp: "",
      plano: "starter",
      valorImplantacao: 0,
      valorRecorrente: 0,
      diaVencimento: 10,
    },
  });

  const handleCnpjChange = (value: string) => {
    const formatted = formatCNPJ(value);
    setCnpjRaw(formatted);
    form.setValue("cnpj", formatted);
    setLookupError(null);
  };

  const handleLookup = async () => {
    const digits = cnpjRaw.replace(/\D/g, "");

    if (!validateCNPJ(digits)) {
      setLookupError("CNPJ inválido. Verifique os dígitos informados.");
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!response.ok) {
        if (response.status === 404) {
          setLookupError("CNPJ não encontrado na Receita Federal.");
        } else {
          setLookupError("Erro ao consultar a Receita Federal. Tente novamente.");
        }
        return;
      }

      const data: BrasilAPIResponse = await response.json();

      const enderecoParts = [
        data.logradouro,
        data.numero,
        data.complemento,
        data.bairro,
      ].filter(Boolean);

      form.setValue("razaoSocial", data.razao_social || "");
      form.setValue("nome", data.nome_fantasia || data.razao_social || "");
      form.setValue("fantasia", data.nome_fantasia || "");
      form.setValue("cidade", data.municipio || "");
      form.setValue("uf", data.uf || "");
      form.setValue("cep", data.cep ? data.cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : "");
      form.setValue("endereco", enderecoParts.join(", ") || "");

      const cnaeParts = [data.cnae_fiscal, data.cnae_fiscal_descricao].filter(Boolean);
      form.setValue("cnae", cnaeParts.join(" – ") || "");
      form.setValue("situacaoCadastral", data.situacao_cadastral || "");
      form.setValue("capitalSocial", data.capital_social ?? 0);
      form.setValue("dataAbertura", data.data_inicio_atividade || "");

      const qsaMapped = (data.qsa || []).map((p) => ({
        nome: p.nome_socio,
        qualificacao: p.qualificacao_socio || null,
        dataEntrada: p.data_entrada_sociedade || null,
      }));
      setQsaPartners(data.qsa || []);
      form.setValue("qsa", qsaMapped);

      toast({
        title: "Dados preenchidos",
        description: `Dados de ${data.razao_social} carregados com sucesso.`,
      });
    } catch {
      setLookupError("Erro de conexão ao consultar a Receita Federal.");
    } finally {
      setIsLookingUp(false);
    }
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    createClinic.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          toast({
            title: "Clínica cadastrada",
            description: "A clínica foi cadastrada com sucesso.",
          });
          setLocation(`/admin/clinicas/${data.id}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Erro ao cadastrar",
            description: "Ocorreu um erro ao tentar cadastrar a clínica.",
          });
        },
      }
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/admin/clinicas">
          <Button variant="outline" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="new-clinic-title">
            Nova Clínica
          </h1>
          <p className="text-muted-foreground">
            Cadastre uma nova clínica na plataforma.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Consulta por CNPJ</CardTitle>
              <CardDescription>
                Informe o CNPJ e clique em "Buscar na Receita" para preencher automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 items-end">
                <FormField
                  control={form.control}
                  name="cnpj"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>CNPJ</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00.000.000/0000-00"
                          value={cnpjRaw}
                          onChange={(e) => handleCnpjChange(e.target.value)}
                          data-testid="input-cnpj"
                          {...{ ref: field.ref }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLookup}
                  disabled={isLookingUp || !cnpjRaw}
                  data-testid="btn-lookup-cnpj"
                >
                  {isLookingUp ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  Buscar na Receita
                </Button>
              </div>

              {lookupError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{lookupError}</AlertDescription>
                </Alert>
              )}

              {qsaPartners.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">QSA — Quadro de Sócios e Administradores</p>
                  <div className="flex flex-wrap gap-2">
                    {qsaPartners.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {p.nome_socio} · {p.qualificacao_socio}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
              <CardDescription>Dados principais da clínica e documentação.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Clínica</FormLabel>
                    <FormControl>
                      <Input placeholder="Clínica Exemplo" {...field} data-testid="input-nome" />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="Exemplo Saúde" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="Exemplo Clínica Médica LTDA" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="86.30-5-04 – Atividades de fisioterapia" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="ATIVA" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="AAAA-MM-DD" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contato & Localização</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="responsavel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome do responsável" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input type="email" placeholder="contato@clinica.com.br" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="(00) 00000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cep"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input placeholder="00000-000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endereco"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua Exemplo, 100, Bairro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="São Paulo" {...field} />
                      </FormControl>
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
                      <FormControl>
                        <Input placeholder="SP" maxLength={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plano & Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="plano"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plano Contratado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-plano">
                          <SelectValue placeholder="Selecione um plano" />
                        </SelectTrigger>
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
              <FormField
                control={form.control}
                name="diaVencimento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dia de Vencimento</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="valorImplantacao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor de Implantação (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
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
                    <FormLabel>Valor Recorrente / MRR (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Link href="/admin/clinicas">
              <Button variant="outline" type="button">Cancelar</Button>
            </Link>
            <Button type="submit" disabled={createClinic.isPending} data-testid="btn-submit-clinic">
              {createClinic.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Clínica
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
