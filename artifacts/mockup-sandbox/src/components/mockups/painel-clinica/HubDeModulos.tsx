import React from "react";
import { 
  Bell, 
  Settings, 
  Search, 
  ChevronDown, 
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
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Upload,
  Mail,
  ArrowRight
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function HubDeModulos() {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* GLOBAL CHROME - Slim Dark Top Bar */}
      <header className="h-14 bg-slate-900 text-slate-100 flex items-center justify-between px-6 shrink-0 border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="font-bold text-lg tracking-tight text-white flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-xs">I</div>
            IONEX360
          </div>
          
          <div className="h-6 w-px bg-slate-700 mx-2" />
          
          <Button variant="ghost" className="text-slate-200 hover:text-white hover:bg-slate-800 h-9 px-3 flex items-center gap-2 -ml-2 rounded-md">
            <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">VP</div>
            <span className="font-medium text-sm">Clínica Vida Plena</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </div>

        <div className="flex-1 max-w-md mx-8">
          <button className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 hover:border-slate-600 rounded-md h-9 px-3 flex items-center justify-between transition-colors text-sm">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span>Ir para...</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300">⌘</kbd>
              <kbd className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300">K</kbd>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-white hover:bg-slate-800 relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-slate-900"></span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notificações (3)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-300 hover:text-white hover:bg-slate-800">
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preferências</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <div className="h-6 w-px bg-slate-700 mx-2" />

          <Avatar className="h-8 w-8 border border-slate-700 ml-2 cursor-pointer hover:ring-2 ring-blue-500 transition-all">
            <AvatarFallback className="bg-slate-800 text-slate-300 text-xs font-medium">CM</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-[1280px] mx-auto p-6 md:p-8 flex flex-col gap-8">
        
        {/* TOP COMPACT SUMMARY */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Clínica Vida Plena</h1>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Em Implantação</Badge>
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200">Plano Ouro</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" /> CNPJ 12.345.678/0001-90</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5"><Share2 className="w-4 h-4 text-slate-400" /> Belo Horizonte/MG</span>
            </div>
          </div>

          <div className="w-full md:w-[400px] flex flex-col gap-2 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-slate-700">Etapa 4 de 10 — Diagnóstico concluído</span>
              <span className="text-blue-600">40%</span>
            </div>
            <Progress value={40} className="h-2 bg-slate-200" />
            <div className="flex items-center gap-1 mt-1">
              <div className="flex-1 h-1 rounded-full bg-blue-500"></div>
              <div className="flex-1 h-1 rounded-full bg-blue-500"></div>
              <div className="flex-1 h-1 rounded-full bg-blue-500"></div>
              <div className="flex-1 h-1 rounded-full bg-blue-200"></div>
              <div className="flex-1 h-1 rounded-full bg-slate-200"></div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COL: MODULE HUB GRID (Span 8) */}
          <div className="xl:col-span-8 flex flex-col gap-8">
            <div>
              <h2 className="text-lg font-medium text-slate-900 mb-4 tracking-tight flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-blue-600" />
                Hub de Módulos
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Section: Visão Geral */}
                <div className="col-span-full mb-2 mt-4 flex items-center gap-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Visão Geral</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <ModuleCard 
                  icon={LayoutDashboard} 
                  title="Visão Geral" 
                  active={true}
                  description="Painel principal"
                  status={<Badge variant="default" className="bg-blue-600 hover:bg-blue-600">Atual</Badge>}
                />

                {/* Section: Onboarding */}
                <div className="col-span-full mb-2 mt-4 flex items-center gap-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Onboarding</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <ModuleCard 
                  icon={Rocket} 
                  title="Kickoff" 
                  description="Apresentação inicial"
                  status={<span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Concluído</span>}
                />
                <ModuleCard 
                  icon={Stethoscope} 
                  title="Diagnóstico 360°" 
                  description="Avaliação de maturidade"
                  status={<span className="text-xs font-medium text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Aguardando validação</span>}
                />

                {/* Section: Operação */}
                <div className="col-span-full mb-2 mt-4 flex items-center gap-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Operação</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <ModuleCard 
                  icon={Share2} 
                  title="Delegação" 
                  metric="12 abertas"
                  alert="3 atrasadas"
                  iconColor="text-blue-500"
                />
                <ModuleCard 
                  icon={ShieldAlert} 
                  title="Mapa de Riscos" 
                  metric="5 ativos"
                  alert="2 críticos"
                  iconColor="text-rose-500"
                />
                <ModuleCard 
                  icon={ListChecks} 
                  title="Plano de Ação" 
                  metric="8 tarefas"
                  status={<span className="text-xs font-medium text-blue-600">3 em andamento</span>}
                  iconColor="text-blue-500"
                />
                <ModuleCard 
                  icon={Workflow} 
                  title="Processos" 
                  description="Fluxos e POPs"
                />

                {/* Section: Documentação */}
                <div className="col-span-full mb-2 mt-4 flex items-center gap-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Documentação</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <ModuleCard 
                  icon={FileText} 
                  title="Documentos" 
                  metric="24 total"
                  alert="3 vencendo em 30d"
                  iconColor="text-amber-500"
                />
                <ModuleCard 
                  icon={Paperclip} 
                  title="Evidências" 
                  description="Anexos e comprovantes"
                />

                {/* Section: Pessoas & Sistemas */}
                <div className="col-span-full mb-2 mt-4 flex items-center gap-2">
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pessoas & Sistemas</span>
                  <div className="h-px bg-slate-200 flex-1"></div>
                </div>

                <ModuleCard 
                  icon={Users} 
                  title="Equipe Interna" 
                  description="Membros e permissões"
                />
                <ModuleCard 
                  icon={Building2} 
                  title="Rede Externa" 
                  description="Parceiros e fornecedores"
                />
                <ModuleCard 
                  icon={KeyRound} 
                  title="Sistemas e Acessos" 
                  description="Credenciais e softwares"
                />

              </div>
            </div>
          </div>

          {/* RIGHT COL: SUPPORTING PANELS (Span 4) */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            
            {/* Pendências */}
            <Card className="border-rose-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-rose-500 w-full" />
              <CardHeader className="pb-3 pt-5">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-900">
                  <AlertCircle className="w-5 h-5 text-rose-500" />
                  Pendências
                  <Badge variant="secondary" className="ml-auto bg-rose-100 text-rose-700 hover:bg-rose-100">4</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="flex flex-col">
                  <div className="px-6 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer group">
                    <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">2 delegações atrasadas há +5 dias</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">Ir para Delegação <ArrowRight className="w-3 h-3" /></p>
                    </div>
                  </div>
                  <div className="px-6 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer group">
                    <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Documento 'Contrato Social' vence em 8 dias</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">Ir para Documentos <ArrowRight className="w-3 h-3" /></p>
                    </div>
                  </div>
                  <div className="px-6 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer group">
                    <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Diagnóstico 360° aguardando validação</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">Ir para Diagnóstico <ArrowRight className="w-3 h-3" /></p>
                    </div>
                  </div>
                  <div className="px-6 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3 cursor-pointer group">
                    <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 shrink-0 group-hover:scale-125 transition-transform" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">1 risco crítico sem plano de ação</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">Ir para Mapa de Riscos <ArrowRight className="w-3 h-3" /></p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Atalhos Rápidos */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Atalhos Rápidos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" className="w-full justify-start h-10 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium">
                  <Rocket className="w-4 h-4 mr-2 text-blue-600" /> Abrir Diagnóstico
                </Button>
                <Button variant="outline" className="w-full justify-start h-10 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium">
                  <Plus className="w-4 h-4 mr-2 text-slate-500" /> Nova delegação
                </Button>
                <Button variant="outline" className="w-full justify-start h-10 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium">
                  <Upload className="w-4 h-4 mr-2 text-slate-500" /> Upload de documento
                </Button>
                <Button variant="outline" className="w-full justify-start h-10 border-slate-200 hover:bg-slate-50 text-slate-700 font-medium">
                  <ListChecks className="w-4 h-4 mr-2 text-slate-500" /> Ver plano de ação
                </Button>
              </CardContent>
            </Card>

            {/* Contato Principal */}
            <Card className="shadow-sm border-slate-200 bg-gradient-to-b from-white to-slate-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">Contato Principal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <Avatar className="h-10 w-10 border border-slate-200">
                    <AvatarFallback className="bg-blue-50 text-blue-700 font-medium">CM</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-slate-900">Dra. Carla Mendes</span>
                    <span className="text-xs font-medium text-slate-500 mb-2">Responsável</span>
                    <span className="text-sm text-slate-600">carla@vidaplena.com.br</span>
                    <span className="text-sm text-slate-600 mb-4">(31) 98888-1234</span>
                    <Button size="sm" className="w-full bg-slate-900 hover:bg-slate-800 text-white">
                      <Mail className="w-4 h-4 mr-2" /> Enviar mensagem
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

      </main>
    </div>
  );
}

// Module Card Component
function ModuleCard({ 
  icon: Icon, 
  title, 
  description, 
  metric, 
  alert, 
  status,
  active = false,
  iconColor = "text-slate-500"
}: { 
  icon: any, 
  title: string, 
  description?: string, 
  metric?: string, 
  alert?: string, 
  status?: React.ReactNode,
  active?: boolean,
  iconColor?: string
}) {
  return (
    <div className={`group relative bg-white rounded-xl border ${active ? 'border-blue-500 ring-1 ring-blue-500 shadow-md' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'} p-5 transition-all cursor-pointer overflow-hidden flex flex-col h-full`}>
      {active && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50/50 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
      )}
      
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 ' + iconColor + ' group-hover:bg-blue-50 group-hover:text-blue-600'} transition-colors`}>
          <Icon className="w-5 h-5" />
        </div>
        {status && (
          <div className="ml-auto">
            {status}
          </div>
        )}
      </div>
      
      <div className="flex-1 flex flex-col justify-end relative z-10">
        <h3 className={`font-semibold ${active ? 'text-blue-900' : 'text-slate-900 group-hover:text-blue-700'} transition-colors`}>{title}</h3>
        
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
        
        {(metric || alert) && (
          <div className="mt-3 flex items-center flex-wrap gap-2">
            {metric && <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-[11px] px-1.5 py-0 font-medium">{metric}</Badge>}
            {alert && <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50 text-[11px] px-1.5 py-0 font-medium">{alert}</Badge>}
          </div>
        )}
      </div>
    </div>
  );
}