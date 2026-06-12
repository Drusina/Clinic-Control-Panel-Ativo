import React, { useState } from "react";
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
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  Building,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Upload,
  Plus,
  Mail,
  Activity,
  FileBox,
  MapPin,
  ClipboardList
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const NAV_GROUPS = [
  { id: "visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: Rocket,
    modules: [
      { id: "kickoff", label: "Kickoff", icon: Rocket },
      { id: "diagnostico", label: "Diagnóstico 360°", icon: Stethoscope },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    icon: Activity,
    modules: [
      { id: "delegacao", label: "Delegação", icon: Share2 },
      { id: "riscos", label: "Mapa de Riscos", icon: ShieldAlert },
      { id: "plano", label: "Plano de Ação", icon: ListChecks },
      { id: "processos", label: "Processos", icon: Workflow },
    ],
  },
  {
    id: "documentacao",
    label: "Documentação",
    icon: FileBox,
    modules: [
      { id: "documentos", label: "Documentos", icon: FileText },
      { id: "evidencias", label: "Evidências", icon: Paperclip },
    ],
  },
  {
    id: "pessoas",
    label: "Pessoas & Sistemas",
    icon: Users,
    modules: [
      { id: "equipe", label: "Equipe Interna", icon: Users },
      { id: "rede", label: "Rede Externa", icon: Building2 },
      { id: "sistemas", label: "Sistemas e Acessos", icon: KeyRound },
    ],
  },
];

export function TopoSegmentado() {
  const [activeGroup, setActiveGroup] = useState("operacao");
  const activeGroupData = NAV_GROUPS.find((g) => g.id === activeGroup);

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* GLOBAL CHROME - Slim Dark Top Bar */}
      <header className="h-14 bg-[#1e293b] text-white flex items-center justify-between px-6 shrink-0 z-20 shadow-sm relative">
        <div className="flex items-center gap-6">
          {/* Logo */}
          <div className="font-bold text-xl tracking-tight flex items-center gap-2">
            <div className="size-6 rounded bg-blue-500 flex items-center justify-center">
              <Activity className="size-4 text-white" />
            </div>
            IONEX<span className="text-blue-400 font-light">360</span>
          </div>

          <div className="h-6 w-px bg-slate-700 mx-2" />

          {/* Clinic Switcher */}
          <button className="flex items-center gap-3 hover:bg-slate-800 px-3 py-1.5 rounded-md transition-colors text-sm text-slate-200 group">
            <Building className="size-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <span className="font-medium text-white truncate max-w-[200px]">Clínica Vida Plena</span>
            <ChevronDown className="size-4 text-slate-400" />
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 mr-2">
            <button className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 size-2 bg-blue-500 rounded-full ring-2 ring-[#1e293b]"></span>
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
              <Settings className="size-4" />
            </button>
          </div>
          <div className="h-6 w-px bg-slate-700" />
          <div className="flex items-center gap-3 ml-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium leading-none">Dra. Carla</span>
              <span className="text-xs text-slate-400">Gestor</span>
            </div>
            <Avatar className="size-8 border border-slate-700">
              <AvatarFallback className="bg-slate-800 text-slate-300 text-xs">CM</AvatarFallback>
            </Avatar>
          </div>
          <button className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-full transition-colors ml-2">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      {/* TWO-LEVEL HORIZONTAL NAV */}
      <div className="bg-white border-b border-slate-200 z-10 sticky top-0 shadow-sm">
        {/* Top Level: Section Groups */}
        <div className="px-6 flex items-center gap-1 overflow-x-auto no-scrollbar pt-2">
          {NAV_GROUPS.map((group) => {
            const isActive = activeGroup === group.id;
            return (
              <button
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative whitespace-nowrap
                  ${
                    isActive
                      ? "text-blue-600"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-md"
                  }
                `}
              >
                <group.icon className={`size-4 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {group.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Secondary Level: Pills (only show if active group has modules) */}
        {activeGroupData?.modules && (
          <div className="bg-slate-50/80 px-6 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar border-t border-slate-100">
            {activeGroupData.modules.map((mod) => (
              <button
                key={mod.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shadow-sm"
              >
                <mod.icon className="size-3.5 text-slate-500" />
                {mod.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DASHBOARD CONTENT */}
      <ScrollArea className="flex-1">
        <main className="p-8 max-w-[1280px] mx-auto w-full space-y-6">
          
          {/* Clinic Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  Clínica Vida Plena
                </h1>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Em Implantação</Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">Plano Ouro</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><ClipboardList className="size-3.5" /> CNPJ 12.345.678/0001-90</span>
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> Belo Horizonte/MG</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm">
                <Plus className="size-4 mr-2" />
                Nova Ação
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Main Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Implantação Progress */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                      <Rocket className="size-5 text-blue-600" />
                      Progresso da Implantação
                    </CardTitle>
                    <span className="text-sm font-medium text-slate-600">40% concluído</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-slate-900">Etapa 4 de 10</span>
                      <span className="text-slate-500">Diagnóstico concluído</span>
                    </div>
                    <Progress value={40} className="h-2 bg-slate-100" />
                    
                    <div className="flex items-center justify-between pt-4">
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-900 text-center">Cadastro</span>
                      </div>
                      <div className="h-px bg-slate-200 flex-1 mx-2"></div>
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-900 text-center">Kickoff</span>
                      </div>
                      <div className="h-px bg-slate-200 flex-1 mx-2"></div>
                      <div className="flex flex-col items-center gap-2 flex-1">
                        <div className="size-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                          <CheckCircle2 className="size-4" />
                        </div>
                        <span className="text-xs font-medium text-slate-900 text-center">Diagnóstico</span>
                      </div>
                      <div className="h-px bg-slate-200 flex-1 mx-2"></div>
                      <div className="flex flex-col items-center gap-2 flex-1 relative">
                        <div className="size-6 rounded-full bg-blue-50 border-2 border-blue-600 text-blue-600 flex items-center justify-center relative z-10 ring-4 ring-white">
                          <div className="size-2 bg-blue-600 rounded-full" />
                        </div>
                        <span className="text-xs font-medium text-blue-700 text-center">Plano de Ação</span>
                      </div>
                      <div className="h-px bg-slate-100 flex-1 mx-2"></div>
                      <div className="flex flex-col items-center gap-2 flex-1 opacity-50">
                        <div className="size-6 rounded-full bg-slate-100 border border-slate-300 text-slate-400 flex items-center justify-center">
                          <span className="text-xs">5</span>
                        </div>
                        <span className="text-xs font-medium text-slate-500 text-center">Auditoria</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="shadow-sm border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <Share2 className="size-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Delegação</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-slate-900">12</span>
                        <span className="text-sm text-slate-500">abertas</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 w-fit px-2 py-0.5 rounded-md">
                        <Clock className="size-3" />
                        3 atrasadas
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <ShieldAlert className="size-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Mapa de Riscos</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-slate-900">5</span>
                        <span className="text-sm text-slate-500">ativos</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 w-fit px-2 py-0.5 rounded-md">
                        <AlertTriangle className="size-3" />
                        2 críticos
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <ListChecks className="size-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Plano de Ação</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-slate-900">8</span>
                        <span className="text-sm text-slate-500">tarefas</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 w-fit px-2 py-0.5 rounded-md">
                        <Activity className="size-3" />
                        3 em andamento
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                      <FileText className="size-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-slate-500 mb-1">Documentos</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-slate-900">24</span>
                        <span className="text-sm text-slate-500">total</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 w-fit px-2 py-0.5 rounded-md">
                        <Clock className="size-3" />
                        3 vencendo em 30 dias
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>

            {/* Right Column (1/3) */}
            <div className="space-y-6">
              
              {/* Pendências Alerts */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bell className="size-4 text-slate-500" />
                    Pendências
                    <Badge className="ml-auto bg-red-100 text-red-700 hover:bg-red-100 border-0">4</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    <div className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="mt-0.5 size-2 rounded-full bg-red-500 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900">2 delegações atrasadas há +5 dias</p>
                        <p className="text-xs text-slate-500">Operação &bull; Delegação</p>
                      </div>
                    </div>
                    <div className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="mt-0.5 size-2 rounded-full bg-amber-500 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900">Documento 'Contrato Social' vence em 8 dias</p>
                        <p className="text-xs text-slate-500">Documentação &bull; Vencimentos</p>
                      </div>
                    </div>
                    <div className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="mt-0.5 size-2 rounded-full bg-blue-500 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900">Diagnóstico 360° aguardando validação</p>
                        <p className="text-xs text-slate-500">Onboarding &bull; Diagnóstico</p>
                      </div>
                    </div>
                    <div className="p-4 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="mt-0.5 size-2 rounded-full bg-red-500 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-900">1 risco crítico sem plano de ação</p>
                        <p className="text-xs text-slate-500">Operação &bull; Mapa de Riscos</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Rocket className="size-4 text-slate-500" />
                    Atalhos Rápidos
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-auto py-3 px-2 flex flex-col items-center gap-2 justify-center text-xs font-medium hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                      <Stethoscope className="size-4" />
                      Abrir Diagnóstico
                    </Button>
                    <Button variant="outline" className="h-auto py-3 px-2 flex flex-col items-center gap-2 justify-center text-xs font-medium hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                      <Share2 className="size-4" />
                      Nova delegação
                    </Button>
                    <Button variant="outline" className="h-auto py-3 px-2 flex flex-col items-center gap-2 justify-center text-xs font-medium hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                      <Upload className="size-4" />
                      Upload de doc
                    </Button>
                    <Button variant="outline" className="h-auto py-3 px-2 flex flex-col items-center gap-2 justify-center text-xs font-medium hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200">
                      <ListChecks className="size-4" />
                      Ver plano de ação
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Card */}
              <Card className="shadow-sm border-slate-200 bg-slate-50/50">
                <CardContent className="p-5 flex items-start gap-4">
                  <Avatar className="size-10 border border-slate-200">
                    <AvatarFallback className="bg-slate-200 text-slate-700 font-medium">CM</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Dra. Carla Mendes</h4>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Responsável</Badge>
                    </div>
                    <p className="text-xs text-slate-500">carla@vidaplena.com.br</p>
                    <p className="text-xs text-slate-500">(31) 98888-1234</p>
                    <Button variant="secondary" size="sm" className="w-full mt-3 h-8 text-xs bg-white border border-slate-200 hover:bg-slate-100 shadow-sm">
                      <Mail className="size-3 mr-2" />
                      Enviar mensagem
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </main>
      </ScrollArea>
    </div>
  );
}
