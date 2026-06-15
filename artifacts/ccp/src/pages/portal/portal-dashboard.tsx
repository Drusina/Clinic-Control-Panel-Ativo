import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetClinic, getGetClinicQueryKey } from "@workspace/api-client-react";
import { getStoredToken, useMyClinics } from "@/hooks/use-auth";
import { ClinicLogo } from "@/components/clinic-logo";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Rocket,
  Stethoscope,
  Share2,
  ShieldAlert,
  ListChecks,
  Workflow,
  FileText,
  Paperclip,
  Users,
  Building2,
  KeyRound,
  Activity,
  ArrowRight,
  MapPin,
  Upload,
  Plus,
  AlertCircle,
  CircleAlert,
  CheckCircle2,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface IcsStatus {
  delegacoes: number;
  risks: number;
  actions: number;
  seeded: boolean;
}

interface Pendencia {
  key: string;
  label: string;
  secao?: string;
}

type IconType = typeof LayoutDashboard;

interface ModuleDef {
  secao: string;
  title: string;
  description: string;
  icon: IconType;
  metric?: (ics: IcsStatus) => string | null;
}

interface ModuleGroup {
  label: string;
  modules: ModuleDef[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Onboarding",
    modules: [
      {
        secao: "kickoff",
        title: "Kickoff",
        description: "Apresentação e alinhamento inicial",
        icon: Rocket,
      },
      {
        secao: "diagnostico",
        title: "Diagnóstico 360°",
        description: "Avaliação de maturidade da clínica",
        icon: Stethoscope,
      },
    ],
  },
  {
    label: "Operação",
    modules: [
      {
        secao: "delegacao",
        title: "Delegação",
        description: "Respostas e delegação do diagnóstico",
        icon: Share2,
        metric: (ics) => (ics.seeded ? `${ics.delegacoes} delegações` : null),
      },
      {
        secao: "riscos",
        title: "Mapa de Riscos",
        description: "Riscos identificados e prioridades",
        icon: ShieldAlert,
        metric: (ics) => (ics.seeded ? `${ics.risks} riscos` : null),
      },
      {
        secao: "acao",
        title: "Plano de Ação",
        description: "Kanban de ações e tarefas",
        icon: ListChecks,
        metric: (ics) => (ics.seeded ? `${ics.actions} ações` : null),
      },
      {
        secao: "processos",
        title: "Processos",
        description: "Fluxos e POPs da operação",
        icon: Workflow,
      },
    ],
  },
  {
    label: "Documentação",
    modules: [
      {
        secao: "documentos",
        title: "Documentos",
        description: "Gestão de documentos gerais",
        icon: FileText,
      },
      {
        secao: "evidencias",
        title: "Evidências",
        description: "Anexos e comprovantes por pilar",
        icon: Paperclip,
      },
    ],
  },
  {
    label: "Pessoas & Sistemas",
    modules: [
      {
        secao: "equipe",
        title: "Equipe Interna",
        description: "Membros e permissões",
        icon: Users,
      },
      {
        secao: "rede-externa",
        title: "Rede Externa",
        description: "Parceiros e fornecedores",
        icon: Building2,
      },
      {
        secao: "sistemas-acessos",
        title: "Sistemas e Acessos",
        description: "Credenciais e softwares",
        icon: KeyRound,
      },
    ],
  },
];

const SHORTCUTS: { secao: string; label: string; icon: IconType }[] = [
  { secao: "diagnostico", label: "Abrir Diagnóstico", icon: Stethoscope },
  { secao: "delegacao", label: "Nova delegação", icon: Plus },
  { secao: "documentos", label: "Enviar documento", icon: Upload },
  { secao: "acao", label: "Ver plano de ação", icon: ListChecks },
];

function ModuleCard({
  clinicId,
  module,
  ics,
}: {
  clinicId: string;
  module: ModuleDef;
  ics: IcsStatus | null;
}) {
  const Icon = module.icon;
  const metric = ics && module.metric ? module.metric(ics) : null;
  return (
    <Link
      href={`/portal/clinica/${clinicId}/${module.secao}`}
      className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
      data-testid={`module-card-${module.secao}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
        {module.title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
      {metric && (
        <div className="mt-3">
          <Badge variant="secondary" className="text-[11px] font-medium">
            {metric}
          </Badge>
        </div>
      )}
    </Link>
  );
}

export default function PortalDashboard({ clinicId }: { clinicId: string }) {
  const { data: clinic } = useGetClinic(clinicId, {
    query: { enabled: !!clinicId, queryKey: getGetClinicQueryKey(clinicId) },
  });
  const { data: myClinics } = useMyClinics();
  const card = myClinics?.clinics.find((c) => c.id === clinicId) ?? null;

  const [ics, setIcs] = useState<IcsStatus | null>(null);
  const [icsLoaded, setIcsLoaded] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    const token = getStoredToken();
    const headers: HeadersInit = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    let cancelled = false;
    fetch(`${BASE}/api/clinics/${clinicId}/ics-status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: IcsStatus | null) => {
        if (cancelled) return;
        if (data) setIcs(data);
        setIcsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setIcsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const nome = clinic?.nome ?? card?.fantasia ?? card?.nome ?? "Clínica";
  const progresso = card?.progresso ?? 0;
  const etapa = card?.etapa ?? null;

  const pendencias = useMemo<Pendencia[]>(() => {
    const list: Pendencia[] = [];
    if (icsLoaded && ics) {
      if (!ics.seeded) {
        list.push({
          key: "diagnostico",
          label: "Diagnóstico ainda não iniciado",
          secao: "diagnostico",
        });
      } else {
        if (ics.delegacoes === 0)
          list.push({
            key: "delegacao",
            label: "Nenhuma delegação criada",
            secao: "delegacao",
          });
        if (ics.risks === 0)
          list.push({
            key: "riscos",
            label: "Nenhum risco mapeado",
            secao: "riscos",
          });
        if (ics.actions === 0)
          list.push({
            key: "acao",
            label: "Plano de ação sem tarefas",
            secao: "acao",
          });
      }
    }
    if (progresso < 100) {
      list.push({
        key: "implantacao",
        label: `Implantação ${progresso}% concluída`,
        secao: "kickoff",
      });
    }
    return list;
  }, [ics, icsLoaded, progresso]);

  return (
    <div className="flex flex-col gap-8">
      {/* Resumo da clínica */}
      <section className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          <ClinicLogo
            clinicId={clinicId}
            logoUrl={clinic?.logoUrl ?? card?.logoUrl}
            name={nome}
            className="h-full w-full p-2"
            fallback={<Building2 className="h-8 w-8 text-muted-foreground" />}
          />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-2xl font-semibold tracking-tight text-foreground"
              data-testid="painel-clinic-name"
            >
              {nome}
            </h1>
            {clinic?.status && (
              <Badge variant="outline" className="capitalize">
                {clinic.status}
              </Badge>
            )}
            {clinic?.plano && (
              <Badge variant="secondary" className="capitalize">
                Plano {clinic.plano}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {clinic?.cnpj && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> {clinic.cnpj}
              </span>
            )}
            {(clinic?.cidade || clinic?.uf) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {clinic?.cidade}
                {clinic?.uf ? `/${clinic.uf}` : ""}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 md:w-[340px]"
          data-testid="painel-progresso"
        >
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-foreground">{etapa ?? "Progresso da implantação"}</span>
            <span className="text-primary">{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-2" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12">
        {/* Hub de módulos */}
        <div className="flex flex-col gap-6 xl:col-span-8">
          <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight text-foreground">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            Hub de Módulos
          </h2>
          {MODULE_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.modules.map((module) => (
                  <ModuleCard
                    key={module.secao}
                    clinicId={clinicId}
                    module={module}
                    ics={ics}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Coluna de apoio */}
        <div className="flex flex-col gap-6 xl:col-span-4">
          <Card data-testid="painel-pendencias">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-primary" />
                Pendências
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendencias.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {pendencias.map((p) => {
                    const inner = (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2 text-foreground">
                          <CircleAlert className="h-4 w-4 shrink-0 text-amber-600" />
                          {p.label}
                        </span>
                        {p.secao && (
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                    );
                    return p.secao ? (
                      <Link
                        key={p.key}
                        href={`/portal/clinica/${clinicId}/${p.secao}`}
                        className="block transition-opacity hover:opacity-80"
                        data-testid={`pendencia-${p.key}`}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div key={p.key} data-testid={`pendencia-${p.key}`}>
                        {inner}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Nenhuma pendência no momento.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Atalhos rápidos</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {SHORTCUTS.map((s) => {
                const Icon = s.icon;
                return (
                  <Link key={s.label} href={`/portal/clinica/${clinicId}/${s.secao}`}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {s.label}
                    </Button>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card data-testid="painel-ics-status">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Status do ICS
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ics?.seeded ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Delegações</span>
                    <span className="font-medium">{ics.delegacoes}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Riscos</span>
                    <span className="font-medium">{ics.risks}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ações</span>
                    <span className="font-medium">{ics.actions}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Dados operacionais ainda não carregados para esta clínica.
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="painel-contato-principal">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4 text-primary" />
                Contato principal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clinic?.responsavel || clinic?.email || clinic?.whatsapp ? (
                <div className="flex flex-col gap-3 text-sm">
                  {clinic?.responsavel && (
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {clinic.responsavel}
                      </span>
                      {clinic?.cargo && (
                        <span className="text-xs text-muted-foreground">
                          {clinic.cargo}
                        </span>
                      )}
                    </div>
                  )}
                  {clinic?.email && (
                    <a
                      href={`mailto:${clinic.email}`}
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{clinic.email}</span>
                    </a>
                  )}
                  {clinic?.whatsapp && (
                    <a
                      href={`https://wa.me/${clinic.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{clinic.whatsapp}</span>
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum contato principal cadastrado.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
