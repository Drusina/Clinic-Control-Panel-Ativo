import { useState, useEffect } from "react";
import type { Clinic } from "@workspace/api-client-react";
import { TRILHA_TOTAL } from "@workspace/trilha";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building, Mail, Phone, MapPin, User, Calendar, Wand2, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getStoredToken } from "@/hooks/use-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SeedResult {
  delegacoes: number;
  risks: number;
  actions: number;
}

interface IcsStatus {
  delegacoes: number;
  risks: number;
  actions: number;
  seeded: boolean;
}

export default function OverviewTab({ clinic }: { clinic: Clinic }) {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState<SeedResult | null>(null);
  const [icsStatus, setIcsStatus] = useState<IcsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getStoredToken();
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    setLoadingStatus(true);
    fetch(`${BASE}/api/clinics/${clinic.id}/ics-status`, { headers: authHeaders })
      .then((r) => r.ok ? r.json() : null)
      .then((data: IcsStatus | null) => {
        if (data) setIcsStatus(data);
      })
      .catch(() => {})
      .finally(() => setLoadingStatus(false));
  }, [clinic.id]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  async function handleSeed() {
    setSeeding(true);
    const token = getStoredToken();
    const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const [delRes, riskRes, actionRes] = await Promise.all([
        fetch(`${BASE}/api/clinics/${clinic.id}/delegacoes/seed`, { method: "POST", headers: authHeaders }),
        fetch(`${BASE}/api/clinics/${clinic.id}/risks/seed`, { method: "POST", headers: authHeaders }),
        fetch(`${BASE}/api/clinics/${clinic.id}/actions/seed`, { method: "POST", headers: authHeaders }),
      ]);

      if (!delRes.ok || !riskRes.ok || !actionRes.ok) {
        throw new Error("Uma ou mais requisições falharam.");
      }

      const [delData, riskData, actionData] = await Promise.all([
        delRes.json(),
        riskRes.json(),
        actionRes.json(),
      ]);

      const result: SeedResult = {
        delegacoes: delData.created ?? 0,
        risks: riskData.created ?? 0,
        actions: actionData.created ?? 0,
      };

      setSeeded(result);

      const total = result.delegacoes + result.risks + result.actions;
      if (total === 0) {
        toast({
          title: "Dados já inicializados",
          description: "Esta clínica já possui todos os dados ICS padrão.",
        });
      } else {
        toast({
          title: "Dados ICS inicializados com sucesso",
          description: `${result.delegacoes} delegações, ${result.risks} riscos e ${result.actions} ações foram criados.`,
        });
        await queryClient.invalidateQueries();
      }

      fetch(`${BASE}/api/clinics/${clinic.id}/ics-status`, { headers: authHeaders })
        .then((r) => r.ok ? r.json() : null)
        .then((data: IcsStatus | null) => { if (data) setIcsStatus(data); })
        .catch(() => {});
    } catch {
      toast({
        title: "Erro ao inicializar dados",
        description: "Não foi possível concluir a inicialização. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="md:col-span-3 border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Dados ICS
              {!loadingStatus && icsStatus?.seeded && (
                <Badge
                  variant="secondary"
                  className="ml-1 gap-1 bg-green-100 text-green-700 border-green-200"
                  data-testid="badge-ics-seeded"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Inicializados
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {icsStatus?.seeded
                ? `${icsStatus.delegacoes} delegações · ${icsStatus.risks} riscos · ${icsStatus.actions} ações já carregados para esta clínica.`
                : "Pré-carrega 7 delegações por pilar, 8 riscos operacionais e 9 ações no Kanban — conforme a metodologia ICS. Seguro repetir: não duplica registros já existentes."}
            </CardDescription>
          </div>
          {!icsStatus?.seeded && (
            <Button
              onClick={handleSeed}
              disabled={seeding || loadingStatus}
              data-testid="btn-seed-ics"
              className="shrink-0"
            >
              {seeding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inicializando…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Inicializar dados ICS
                </>
              )}
            </Button>
          )}
        </CardHeader>
        {seeded !== null && (
          <CardContent>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <strong>{seeded.delegacoes}</strong> delegações criadas
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <strong>{seeded.risks}</strong> riscos criados
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <strong>{seeded.actions}</strong> ações criadas
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Progresso de Implantação</CardTitle>
          <CardDescription>Acompanhamento das etapas de onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Etapa Atual: {clinic.etapa}/{TRILHA_TOTAL}</span>
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
