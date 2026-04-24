import { Clinic } from "@workspace/api-client-react/src/generated/api.schemas";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Building, Mail, Phone, MapPin, User, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function OverviewTab({ clinic }: { clinic: Clinic }) {
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
      value
    );

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Progresso de Implantação</CardTitle>
          <CardDescription>Acompanhamento das etapas de onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Etapa Atual: {clinic.etapa}/10</span>
            <span>{clinic.progresso}% Concluído</span>
          </div>
          <Progress value={clinic.progresso} className="h-4" />
        </CardContent>
      </Card>

      <Card className="md:row-span-2">
        <CardHeader>
          <CardTitle>Contato Principal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{clinic.responsavel || "Não informado"}</span>
          </div>
          {clinic.cargo && (
            <div className="flex items-center gap-3">
              <span className="h-4 w-4" />
              <span className="text-sm text-muted-foreground">{clinic.cargo}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{clinic.email || "Não informado"}</span>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{clinic.whatsapp || "Não informado"}</span>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Informações Cadastrais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Building className="h-3 w-3" /> Razão Social</span>
            <p className="text-sm font-medium">{clinic.razaoSocial || "-"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Localização</span>
            <p className="text-sm font-medium">{clinic.cidade}/{clinic.uf} {clinic.cep ? `- ${clinic.cep}` : ""}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Endereço</span>
            <p className="text-sm font-medium">{clinic.endereco || "-"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Cliente desde</span>
            <p className="text-sm font-medium">{format(new Date(clinic.createdAt), "dd/MM/yyyy", { locale: ptBR })}</p>
          </div>
        </CardContent>
      </Card>
      
      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Detalhes Financeiros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-4">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Valor de Implantação</span>
            <p className="text-lg font-bold">{clinic.valorImplantacao ? formatCurrency(clinic.valorImplantacao) : "-"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Valor Recorrente</span>
            <p className="text-lg font-bold">{clinic.valorRecorrente ? formatCurrency(clinic.valorRecorrente) : "-"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Forma de Pagamento</span>
            <p className="text-sm font-medium uppercase">{clinic.formaPagamento || "-"}</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Vencimento</span>
            <p className="text-sm font-medium">Dia {clinic.diaVencimento || "-"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
