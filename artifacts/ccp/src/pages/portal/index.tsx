import { useMemo } from "react";
import { Link, Redirect } from "wouter";
import {
  Building2,
  ClipboardList,
  Users,
  ShieldAlert,
  KanbanSquare,
  GitFork,
  Image as ImageIcon,
  FileText,
  BarChart3,
  Bell,
  Stethoscope,
  ArrowRight,
  MapPin,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  useMyClinics,
  getActiveClinicId,
  type MyClinicCard,
} from "@/hooks/use-auth";

function resolveActive(clinics: MyClinicCard[]): MyClinicCard | null {
  const stored = getActiveClinicId();
  if (stored) {
    const hit = clinics.find((c) => c.id === stored);
    if (hit) return hit;
  }
  // Clinic-first: only auto-resolve when there is exactly one clinic. With
  // 2+ clinics and no valid selection we return null so the inline chooser
  // below prompts the manager — never silently default to the first clinic,
  // which would surface the wrong clinic's overview during a client session.
  return clinics.length === 1 ? clinics[0] : null;
}

const MODULE_TILES: Array<{
  name: string;
  description: string;
  icon: typeof Stethoscope;
  href: (clinicId: string) => string;
}> = [
  {
    name: "Diagnóstico 360°",
    description: "Responda e acompanhe o diagnóstico da clínica.",
    icon: ClipboardList,
    href: () => "/portal/diagnostico/select",
  },
  {
    name: "Delegação",
    description: "Distribua perguntas do diagnóstico por pilar.",
    icon: Users,
    href: (id) => `/portal/delegacao/${id}`,
  },
  {
    name: "Mapa de Riscos",
    description: "Visualize a matriz 5x5 e os riscos críticos.",
    icon: ShieldAlert,
    href: (id) => `/portal/riscos/${id}`,
  },
  {
    name: "Plano de Ação",
    description: "Acompanhe o Kanban de ações da clínica.",
    icon: KanbanSquare,
    href: (id) => `/portal/acao/${id}`,
  },
  {
    name: "Processos",
    description: "Mapeie e acompanhe processos internos.",
    icon: GitFork,
    href: (id) => `/portal/processos/${id}`,
  },
  {
    name: "Evidências",
    description: "Anexos e provas operacionais.",
    icon: ImageIcon,
    href: (id) => `/portal/evidencias/${id}`,
  },
  {
    name: "Documentos",
    description: "Contratos, certificados e arquivos da clínica.",
    icon: FileText,
    href: (id) => `/portal/documentos/${id}`,
  },
  {
    name: "Equipe Interna",
    description: "Membros da equipe da clínica.",
    icon: Users,
    href: (id) => `/portal/equipe/${id}`,
  },
  {
    name: "Rede Externa",
    description: "Parceiros, fornecedores e contatos externos.",
    icon: BarChart3,
    href: (id) => `/portal/rede-externa/${id}`,
  },
];

export default function PortalHome() {
  const { data, isLoading } = useMyClinics();
  const clinics = data?.clinics ?? [];

  const active = useMemo(() => resolveActive(clinics), [clinics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (clinics.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Sem clínicas vinculadas</CardTitle>
            <CardDescription>
              Seu acesso à plataforma ainda não foi habilitado em nenhuma
              clínica. Solicite o convite ao responsável da sua clínica.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Clinic-first: a manager with 2+ clinics and no active selection is sent
  // to the single, dedicated chooser at /me/clinicas instead of listing all
  // their clinic names here — so no clinic list ever surfaces on /portal
  // during a client-facing session. (clinics.length === 0 is handled above;
  // single-clinic managers resolve an active clinic and never reach here.)
  if (!active) {
    return <Redirect to="/me/clinicas" />;
  }

  const cidade = [active.cidade, active.uf].filter(Boolean).join(" / ");

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-3xl font-bold tracking-tight"
          data-testid="portal-home-title"
        >
          Visão Geral
        </h1>
        <p className="text-muted-foreground mt-1">
          Bem-vindo ao Portal do Gestor. Aqui está o resumo da clínica ativa.
        </p>
      </div>

      <Card data-testid="portal-active-clinic-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {active.fantasia || active.nome}
                </CardTitle>
                {active.fantasia && active.fantasia !== active.nome && (
                  <CardDescription className="mt-0.5">
                    {active.nome}
                  </CardDescription>
                )}
                {cidade && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                    <MapPin className="h-3 w-3" />
                    <span>{cidade}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {active.status && (
                <Badge
                  variant={
                    active.status === "ativa" ? "default" : "secondary"
                  }
                  className="capitalize"
                >
                  {active.status}
                </Badge>
              )}
              {active.plano && (
                <Badge variant="outline" className="capitalize">
                  {active.plano}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        {active.etapa && (
          <CardContent>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">{active.etapa}</span>
              <span className="font-medium text-foreground">
                {active.progresso}%
              </span>
            </div>
            <Progress value={active.progresso} className="h-2" />
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/portal/clinica">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Stethoscope className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">
                    Detalhes da clínica
                  </CardTitle>
                  <CardDescription>
                    Documentos, equipe, rede externa, sistemas e acessos.
                  </CardDescription>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/portal/notificacoes">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">Notificações</CardTitle>
                  <CardDescription>
                    Alertas, atualizações e confirmações da clínica.
                  </CardDescription>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODULE_TILES.map((tile) => (
            <Link key={tile.name} href={tile.href(active.id)}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                      <tile.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm leading-tight">
                        {tile.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {tile.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
